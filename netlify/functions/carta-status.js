/**
 * carta-status.js — Estat del PDF de la carta (Netlify Functions V2)
 *
 * GET /api/carta-status
 * Headers:
 *   Authorization:    Bearer <token>
 *   X-Token-Payload:  <payload>
 */

import crypto       from 'node:crypto';
import { getStore } from '@netlify/blobs';

const CORS = {
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
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch { return false; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const token   = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  const payload = (req.headers.get('x-token-payload') || '').trim();

  if (!verifyToken(token, payload)) {
    return Response.json({ error: 'No autoritzat' }, { status: 401, headers: CORS });
  }

  try {
    const store = getStore({ name: 'uploads', consistency: 'strong' });
    const meta  = await store.get('carta.meta', { type: 'json' });

    if (!meta) return Response.json({ exists: false }, { headers: CORS });

    return Response.json({
      exists:       true,
      sizeMB:       meta.sizeMB       || '—',
      sizeBytes:    meta.sizeBytes    || 0,
      updatedAt:    meta.updatedAt    || null,
      originalName: meta.originalName || 'carta.pdf',
    }, { headers: CORS });

  } catch (err) {
    console.error('[carta-status]', err);
    return Response.json({ error: 'Error consultant l\'estat', detail: err.message }, { status: 500, headers: CORS });
  }
};
