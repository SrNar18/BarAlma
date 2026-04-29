/**
 * carta-status.js — Retorna l'estat actual del PDF de la carta
 *
 * GET /api/carta-status
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 */

const crypto          = require('crypto');
const { createStore } = require('./_blobs');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
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

  const token   = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const payload = (event.headers['x-token-payload'] || '').trim();

  if (!verifyToken(token, payload)) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'No autoritzat' }) };
  }

  try {
    const store = createStore('uploads');
    const meta  = await store.get('carta.meta', { type: 'json' });

    if (!meta) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ exists: false }),
      };
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        exists:       true,
        sizeMB:       meta.sizeMB       || '—',
        sizeBytes:    meta.sizeBytes    || 0,
        updatedAt:    meta.updatedAt    || null,
        originalName: meta.originalName || 'carta.pdf',
      }),
    };
  } catch (err) {
    console.error('[carta-status] Error:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        error:  'Error consultant l\'estat',
        detail: err.message || String(err),
      }),
    };
  }
};
