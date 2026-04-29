/**
 * upload-pdf.js — OBSOLET
 *
 * Aquest endpoint ha estat substituït pel flux de URL pre-signada:
 *   POST /api/get-upload-url  → obté URL de pujada directa
 *   PUT  <uploadUrl>          → puja el fitxer directament a Netlify Blobs
 *   POST /api/confirm-upload  → confirma i desa metadada
 *
 * Retorna 410 Gone per a qualsevol petició.
 */

exports.handler = async function () {
  return {
    statusCode: 410,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Aquest endpoint ja no existeix. Utilitza /api/get-upload-url i /api/confirm-upload.',
    }),
  };
};
