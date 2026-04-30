/**
 * upload-pdf.js — Rep el PDF i el desa a Netlify Blobs (V2, chunked)
 *
 * POST /api/upload-pdf
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 * Body (single,  ≤ 3 MB): { action:'single',   filename, fileBase64, sizeBytes }
 * Body (chunk):            { action:'chunk',    uploadId, chunkIndex, totalChunks, filename, data }
 * Body (finalize):         { action:'finalize', uploadId, totalChunks, filename, sizeBytes }
 */

import crypto       from 'node:crypto';
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token-Payload',
};

const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHUNK_BYTES =  3 * 1024 * 1024; // 3 MB per chunk → ~4 MB base64, sota el límit de 6 MB de Netlify

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

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Body invàlid' }, { status: 400, headers: CORS }); }

  const { action = 'single' } = body;

  try {
    if (action === 'chunk')    return await handleChunk(body);
    if (action === 'finalize') return await handleFinalize(body);
    return await handleSingle(body);
  } catch (err) {
    console.error('[upload-pdf]', err);
    return Response.json({ error: 'Error intern', detail: err.message }, { status: 500, headers: CORS });
  }
};

// ── Upload únic (≤ 3 MB) ─────────────────────────────────────────────────────
async function handleSingle({ filename = 'carta.pdf', fileBase64 = '', sizeBytes = 0 }) {
  if (!fileBase64) return Response.json({ error: 'Falta el contingut del fitxer' }, { status: 400, headers: CORS });
  if (sizeBytes > MAX_TOTAL_BYTES) return Response.json({ error: 'Arxiu massa gran (màx. 10 MB)' }, { status: 400, headers: CORS });

  const buf = Buffer.from(fileBase64, 'base64');
  if (!buf.length) return Response.json({ error: 'Arxiu buit' }, { status: 400, headers: CORS });

  const store = getStore({ name: 'uploads', consistency: 'strong' });
  await store.set('carta.pdf', buf, {
    metadata: { contentType: 'application/pdf', uploadedAt: new Date().toISOString() }
  });
  await store.setJSON('carta.meta', {
    originalName: filename,
    sizeBytes:    buf.length,
    sizeMB:       (buf.length / (1024 * 1024)).toFixed(2),
    updatedAt:    new Date().toISOString(),
  });

  return Response.json({ ok: true }, { headers: CORS });
}

// ── Pujar un chunk ───────────────────────────────────────────────────────────
async function handleChunk({ uploadId, chunkIndex, totalChunks, data }) {
  if (!uploadId || chunkIndex == null || !totalChunks || !data) {
    return Response.json({ error: 'Dades de chunk incompletes' }, { status: 400, headers: CORS });
  }

  const buf = Buffer.from(data, 'base64');
  if (buf.length > MAX_CHUNK_BYTES) {
    return Response.json({ error: 'Chunk massa gran' }, { status: 400, headers: CORS });
  }

  const store = getStore({ name: 'uploads', consistency: 'strong' });
  await store.set(`tmp-${uploadId}-${chunkIndex}`, buf);

  return Response.json({ ok: true, chunkIndex }, { headers: CORS });
}

// ── Finalitzar: ajuntar chunks i desar el PDF ────────────────────────────────
async function handleFinalize({ uploadId, totalChunks, filename = 'carta.pdf', sizeBytes = 0 }) {
  if (!uploadId || !totalChunks) {
    return Response.json({ error: 'Dades de finalització incompletes' }, { status: 400, headers: CORS });
  }

  const store  = getStore({ name: 'uploads', consistency: 'strong' });
  const chunks = [];
  let   total  = 0;

  for (let i = 0; i < totalChunks; i++) {
    const ab = await store.get(`tmp-${uploadId}-${i}`, { type: 'arrayBuffer' });
    if (!ab) {
      await cleanChunks(store, uploadId, totalChunks);
      return Response.json({ error: `Chunk ${i} no trobat. Torna a intentar-ho.` }, { status: 400, headers: CORS });
    }
    const buf = Buffer.from(ab);
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) {
      await cleanChunks(store, uploadId, totalChunks);
      return Response.json({ error: 'Arxiu massa gran (màx. 10 MB)' }, { status: 400, headers: CORS });
    }
    chunks.push(buf);
  }

  const final = Buffer.concat(chunks);
  await store.set('carta.pdf', final, {
    metadata: { contentType: 'application/pdf', uploadedAt: new Date().toISOString() }
  });
  await store.setJSON('carta.meta', {
    originalName: filename,
    sizeBytes:    final.length,
    sizeMB:       (final.length / (1024 * 1024)).toFixed(2),
    updatedAt:    new Date().toISOString(),
  });

  await cleanChunks(store, uploadId, totalChunks);

  return Response.json({ ok: true }, { headers: CORS });
}

async function cleanChunks(store, uploadId, totalChunks) {
  await Promise.all(
    Array.from({ length: totalChunks }, (_, i) =>
      store.delete(`tmp-${uploadId}-${i}`).catch(() => {})
    )
  );
}
