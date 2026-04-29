/**
 * serve-carta.js — Serveix el PDF de la carta des de Netlify Blobs
 *
 * Accessible via: /carta.pdf  (redireccionat per netlify.toml)
 * No requereix autenticació (és públic).
 */

const { createStore } = require('./_blobs');

exports.handler = async function (event) {
  try {
    const store  = createStore('uploads');
    const result = await store.getWithMetadata('carta.pdf', { type: 'arrayBuffer' });

    if (!result || !result.data) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8"/>
  <title>Carta no disponible · Alma Bar Restaurant</title>
  <style>
    body { background:#0a0a0a; color:#ede6d8; font-family:sans-serif;
           display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; margin:0; text-align:center; }
    h1 { color:#c9a14a; font-size:1.4rem; margin-bottom:12px; }
    p  { color:#888; font-size:0.9rem; }
    a  { color:#c9a14a; text-decoration:none; margin-top:20px; display:inline-block; }
  </style>
</head>
<body>
  <h1>Carta no disponible</h1>
  <p>El PDF de la carta encara no s'ha publicat.<br/>Torna a intentar-ho en uns moments.</p>
  <a href="/">← Tornar a la pàgina principal</a>
</body>
</html>`,
      };
    }

    const buffer = Buffer.from(result.data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="carta-alma-bar-restaurant.pdf"',
        'Content-Length':      String(buffer.length),
        'Cache-Control':       'public, max-age=300, stale-while-revalidate=3600',
      },
      body:            buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('[serve-carta] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8"/>
  <title>Error · Alma Bar Restaurant</title>
  <style>
    body { background:#0a0a0a; color:#ede6d8; font-family:sans-serif;
           display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; margin:0; text-align:center; }
    h1 { color:#c9a14a; font-size:1.4rem; margin-bottom:12px; }
    p  { color:#888; font-size:0.9rem; }
    a  { color:#c9a14a; text-decoration:none; margin-top:20px; display:inline-block; }
  </style>
</head>
<body>
  <h1>Error temporal</h1>
  <p>No s'ha pogut carregar la carta. Torna a intentar-ho en uns moments.</p>
  <a href="/">← Tornar a la pàgina principal</a>
</body>
</html>`,
    };
  }
};
