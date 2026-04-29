/**
 * login.js — Autenticació de l'admin
 *
 * Variables d'entorn necessàries al panell de Netlify:
 *   ADMIN_USER    → nom d'usuari de l'admin
 *   ADMIN_PASS    → contrasenya de l'admin
 *   ADMIN_SECRET  → clau secreta per signar tokens (qualsevol string llarg i aleatori)
 *
 * POST /api/login
 * Body: { "username": "...", "password": "..." }
 */

const crypto = require('crypto');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function (event) {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Mètode no permès' }) };
  }

  // Llegir cos de la petició
  let username, password;
  try {
    ({ username, password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON invàlid' }) };
  }

  // Comprovar variables d'entorn
  const ADMIN_USER   = process.env.ADMIN_USER;
  const ADMIN_PASS   = process.env.ADMIN_PASS;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_SECRET) {
    console.error('[login] Variables ADMIN_USER / ADMIN_PASS / ADMIN_SECRET no configurades');
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Servidor mal configurat. Contacta amb el desenvolupador.' }),
    };
  }

  // Comparació en temps constant (evita timing attacks)
  const pad = (s) => (s || '').padEnd(128, '\0').slice(0, 128);
  let userOk = false;
  let passOk = false;
  try {
    userOk = crypto.timingSafeEqual(Buffer.from(pad(username)), Buffer.from(pad(ADMIN_USER)));
    passOk = crypto.timingSafeEqual(Buffer.from(pad(password)), Buffer.from(pad(ADMIN_PASS)));
  } catch {
    userOk = false;
    passOk = false;
  }

  if (!userOk || !passOk) {
    // Retard anti-brute-force
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    return {
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Usuari o contrasenya incorrectes' }),
    };
  }

  // Generar token HMAC: username + expiry (4 hores)
  const expiry  = Date.now() + 4 * 60 * 60 * 1000;
  const payload = `${username}:${expiry}`;
  const token   = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ token, payload }),
  };
};
