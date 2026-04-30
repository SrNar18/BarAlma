/**
 * serve-carta.js — Redirigeix al PDF públic de Supabase Storage
 *
 * Accessible via: /carta.pdf  (redireccionat per netlify.toml)
 * No requereix autenticació (és públic).
 */

const { getPDFUrl } = require('./_storage');

exports.handler = async function () {
  try {
    const pdfUrl = getPDFUrl();

    return {
      statusCode: 302,
      headers: {
        'Location':      pdfUrl,
        'Cache-Control': 'public, max-age=300',
      },
      body: '',
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
  <h1>Carta no disponible</h1>
  <p>El PDF de la carta encara no s'ha publicat.<br/>Torna a intentar-ho en uns moments.</p>
  <a href="/">← Tornar a la pàgina principal</a>
</body>
</html>`,
    };
  }
};
