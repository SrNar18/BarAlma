/**
 * upload-pdf.js — Pujada del PDF de la carta
 *
 * Emmagatzema el PDF a Netlify Blobs (persistent entre deploys).
 *
 * POST /api/upload-pdf
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload retornat per /api/login>
 * Body (JSON):
 *   { "pdf": "<base64>", "filename": "carta.pdf" }
 *
 * Límit pràctic: ~4 MB de PDF (≈5.3 MB en base64 < límit de 6 MB de Netlify Functions)
 */

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token-Payload',
};

// ── Verificació del token ────────────────────────────────────────────────────
function verifyToken(token, payload) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !token || !payload) return false;

  // Comprovar expiració
  const parts  = payload.split(':');
  const expiry = parseInt(parts[parts.length - 1], 10);
  if (isNaN(expiry) || Date.now() > expiry) return false;

  // Verificar HMAC
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(token.padEnd(64, '0').slice(0, 64));
    const b = Buffer.from(expected.padEnd(64, '0').slice(0, 64));
    return token.length === expected.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Mètode no permès' }) };
  }

  // Autenticació
  const authHeader = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const payload    = (event.headers['x-token-payload'] || '').trim();

  if (!verifyToken(authHeader, payload)) {
    return {
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Sessió invàlida o expirada. Torna a iniciar sessió.' }),
    };
  }

  // Llegir body
  let pdfBase64, filename;
  try {
    ({ pdf: pdfBase64, filename } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON invàlid' }) };
  }

  if (!pdfBase64) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Cap fitxer rebut' }) };
  }

  // Decodificar PDF
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');

  // Validar que és un PDF real (magic bytes %PDF)
  if (pdfBuffer.slice(0, 4).toString('ascii') !== '%PDF') {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'El fitxer no és un PDF vàlid' }),
    };
  }

  // Comprovar mida (màxim 4 MB)
  const MAX_BYTES = 4 * 1024 * 1024;
  if (pdfBuffer.length > MAX_BYTES) {
    return {
      statusCode: 413,
      headers: HEADERS,
      body: JSON.stringify({
        error: `El PDF és massa gran (${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB). Màxim 4 MB.`,
      }),
    };
  }

  // Desar a Netlify Blobs
  const updatedAt = new Date().toISOString();
  const sizeMB    = (pdfBuffer.length / 1024 / 1024).toFixed(2);

  try {
    const store = getStore('uploads');
    await store.set('carta.pdf', pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        originalName: filename || 'carta.pdf',
        updatedAt,
        sizeMB,
        sizeBytes: pdfBuffer.length,
      },
    });
  } catch (err) {
    console.error('[upload-pdf] Error Netlify Blobs:', err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Error desant el PDF. Torna-ho a intentar.' }),
    };
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      success: true,
      message: 'Carta publicada correctament ✓',
      sizeMB,
      updatedAt,
    }),
  };
};
