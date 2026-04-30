/**
 * login.js — Autenticació de l'admin (Netlify Functions V2)
 *
 * Variables d'entorn necessàries:
 *   ADMIN_USER    → nom d'usuari
 *   ADMIN_PASS    → contrasenya
 *   ADMIN_SECRET  → clau per signar tokens
 *
 * POST /api/login
 * Body: { username, password }
 */

import crypto from 'node:crypto';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST')    return Response.json({ error: 'Mètode no permès' }, { status: 405, headers: CORS });

  let username, password;
  try {
    ({ username, password } = await req.json());
  } catch {
    return Response.json({ error: 'JSON invàlid' }, { status: 400, headers: CORS });
  }

  const ADMIN_USER   = process.env.ADMIN_USER;
  const ADMIN_PASS   = process.env.ADMIN_PASS;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_SECRET) {
    return Response.json({ error: 'Servidor mal configurat. Contacta amb el desenvolupador.' }, { status: 500, headers: CORS });
  }

  const pad = (s) => (s || '').padEnd(128, '\0').slice(0, 128);
  let ok = false;
  try {
    const userOk = crypto.timingSafeEqual(Buffer.from(pad(username)), Buffer.from(pad(ADMIN_USER)));
    const passOk = crypto.timingSafeEqual(Buffer.from(pad(password)), Buffer.from(pad(ADMIN_PASS)));
    ok = userOk && passOk;
  } catch { ok = false; }

  if (!ok) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    return Response.json({ error: 'Usuari o contrasenya incorrectes' }, { status: 401, headers: CORS });
  }

  const expiry  = Date.now() + 4 * 60 * 60 * 1000;
  const payload = `${username}:${expiry}`;
  const token   = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');

  return Response.json({ token, payload }, { headers: CORS });
};
