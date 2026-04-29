/**
 * confirm-upload.js — Confirma la pujada directa del PDF i desa la metadada
 *
 * POST /api/confirm-upload
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 *   Content-Type:     application/json
 * Body: { filename: string, sizeBytes: number }
 *
 * Response: { ok: true }
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

  let filename, sizeBytes;
  try {
    const body = JSON.parse(event.body || '{}');
    filename   = body.filename  || 'carta.pdf';
    sizeBytes  = parseInt(body.sizeBytes, 10) || 0;
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Body invàlid' }) };
  }

  // Validate reasonable size (10 MB max)
  if (sizeBytes > 10 * 1024 * 1024) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arxiu massa gran (màx. 10 MB)' }) };
  }

  try {
    const store  = getStore('uploads');
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    // Store metadata as a small JSON blob
    await store.setJSON('carta.meta', {
      originalName: filename,
      sizeBytes,
      sizeMB,
      updatedAt: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('[confirm-upload] Error:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Error desant la metadada' }),
    };
  }
};
