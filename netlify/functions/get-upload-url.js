/**
 * get-upload-url.js — Retorna una URL pre-signada per pujar el PDF de la carta
 *
 * POST /api/get-upload-url
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 *
 * Response: { uploadUrl: string }
 */

const crypto   = require('crypto');
const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token-Payload',
};

function verifyToken(token, payload) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !token || !payload) return false;
  const parts  = payload.split(':');
  const expiry = parseInt(parts[parts.length - 1], 10);
  if (isNaN(expiry) || Date.now() > expiry) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(token.padEnd(64, '0').slice(0, 64));
    const b = Buffer.from(expected.padEnd(64, '0').slice(0, 64));
    return token.length === expected.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Mètode no permès' }) };
  }

  const token   = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const payload = (event.headers['x-token-payload'] || '').trim();

  if (!verifyToken(token, payload)) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'No autoritzat' }) };
  }

  try {
    const store     = getStore('uploads');
    const uploadUrl = await store.getSignedUploadURL('carta.pdf', { expiry: 300 }); // 5 min

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ uploadUrl }),
    };
  } catch (err) {
    console.error('[get-upload-url] Error:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'No s\'ha pogut generar la URL de pujada' }),
    };
  }
};
