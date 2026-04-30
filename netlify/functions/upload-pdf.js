/**
 * upload-pdf.js — Rep el PDF i el desa a Netlify Blobs (V2)
 *
 * POST /api/upload-pdf
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 * Body: { filename, fileBase64, sizeBytes }
 */

import crypto     from 'node:crypto';
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token-Payload',
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

function verifyToken(token, payload) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !token || !payload) return false;
  const parts  = payload.split(':');
  const expiry = parseInt(parts[parts.length - 1], 10);
  if (isNaN(expiry) || Date.now() > expiry) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch { return false; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST')    return Response.json({ error: 'Mètode no permès' }, { status: 405, headers: CORS });

  const token   = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  const payload = (req.headers.get('x-token-payload') || '').trim();

  if (!verifyToken(token, payload)) {
    return Response.json({ error: 'No autoritzat' }, { status: 401, headers: CORS });
  }

  let filename, fileBase64, sizeBytes;
  try {
    ({ filename = 'carta.pdf', fileBase64 = '', sizeBytes = 0 } = await req.json());
  } catch {
    return Response.json({ error: 'Body invàlid' }, { status: 400, headers: CORS });
  }

  if (!fileBase64) return Response.json({ error: 'Falta el contingut del fitxer' }, { status: 400, headers: CORS });
  if (sizeBytes > MAX_BYTES) return Response.json({ error: 'Arxiu massa gran (màx. 4 MB)' }, { status: 400, headers: CORS });

  try {
    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    if (pdfBuffer.length > MAX_BYTES) return Response.json({ error: 'Arxiu massa gran (màx. 4 MB)' }, { status: 400, headers: CORS });

    const store  = getStore({ name: 'uploads', consistency: 'strong' });
    const sizeMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);

    await store.set('carta.pdf', pdfBuffer, {
      metadata: { contentType: 'application/pdf', uploadedAt: new Date().toISOString() }
    });
    await store.setJSON('carta.meta', {
      originalName: filename,
      sizeBytes:    pdfBuffer.length,
      sizeMB,
      updatedAt:    new Date().toISOString(),
    });

    return Response.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error('[upload-pdf]', err);
    return Response.json({ error: 'Error desant el PDF', detail: err.message }, { status: 500, headers: CORS });
  }
};
