/**
 * upload-pdf.js — Rep el PDF de la carta i el desa a Netlify Blobs
 *
 * POST /api/upload-pdf
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 *   Content-Type:     application/json
 * Body: { filename: string, fileBase64: string, sizeBytes: number }
 *
 * Response: { ok: true }
 */

const crypto          = require('crypto');
const { createStore } = require('./_blobs');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token-Payload',
};

const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4 MB

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

  let filename, fileBase64, sizeBytes;
  try {
    const body = JSON.parse(event.body || '{}');
    filename   = body.filename   || 'carta.pdf';
    fileBase64 = body.fileBase64 || '';
    sizeBytes  = parseInt(body.sizeBytes, 10) || 0;
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Body invàlid' }) };
  }

  if (!fileBase64) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Falta el contingut del fitxer' }) };
  }

  if (sizeBytes > MAX_PDF_BYTES) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Arxiu massa gran (màx. 4 MB)' }),
    };
  }

  try {
    const pdfBuffer = Buffer.from(fileBase64, 'base64');

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Arxiu massa gran (màx. 4 MB)' }),
      };
    }

    const store  = createStore('uploads');
    const sizeMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);

    await store.set('carta.pdf', pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
    });

    await store.setJSON('carta.meta', {
      originalName: filename,
      sizeBytes:    pdfBuffer.length,
      sizeMB,
      updatedAt:    new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('[upload-pdf] Error:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        error:  'Error desant el PDF',
        detail: err.message || String(err),
      }),
    };
  }
};
