/**
 * serve-carta.js — Serveix el PDF de la carta des de Netlify Blobs (V2)
 *
 * GET /carta.pdf
 * Públic, sense autenticació.
 */

import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store  = getStore({ name: 'uploads', consistency: 'strong' });
    const result = await store.get('carta.pdf', { type: 'arrayBuffer' });

    if (!result || result.byteLength === 0) {
      return new Response(notFoundPage(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response(result, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="carta-alma-bar-restaurant.pdf"',
        'Content-Length':      String(result.byteLength),
        'Cache-Control':       'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[serve-carta]', err);
    return new Response(errorPage(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
};

function notFoundPage() {
  return `<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8"/>
<title>Carta no disponible · Alma Bar Restaurant</title>
<style>body{background:#0a0a0a;color:#ede6d8;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}h1{color:#c9a14a;font-size:1.4rem;margin-bottom:12px}p{color:#888;font-size:.9rem}a{color:#c9a14a;text-decoration:none;margin-top:20px;display:inline-block}</style>
</head><body><h1>Carta no disponible</h1><p>El PDF de la carta encara no s'ha publicat.</p><a href="/">← Tornar a la pàgina principal</a></body></html>`;
}

function errorPage() {
  return `<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8"/>
<title>Error · Alma Bar Restaurant</title>
<style>body{background:#0a0a0a;color:#ede6d8;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}h1{color:#c9a14a;font-size:1.4rem;margin-bottom:12px}p{color:#888;font-size:.9rem}a{color:#c9a14a;text-decoration:none;margin-top:20px;display:inline-block}</style>
</head><body><h1>Error temporal</h1><p>No s'ha pogut carregar la carta. Torna a intentar-ho.</p><a href="/">← Tornar a la pàgina principal</a></body></html>`;
}
