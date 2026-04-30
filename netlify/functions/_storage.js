/**
 * _storage.js — Helper per a Supabase Storage
 *
 * Variables d'entorn necessàries (panel Netlify):
 *   SUPABASE_URL  → https://<id>.supabase.co
 *   SUPABASE_KEY  → service_role key (Settings → API)
 *
 * Bucket de Supabase: "carta" (públic)
 */

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL o SUPABASE_KEY no configurats al panell de Netlify');
  return { url, key };
}

async function uploadPDF(pdfBuffer) {
  const { url, key } = cfg();
  const resp = await fetch(`${url}/storage/v1/object/carta/carta.pdf`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/pdf',
      'x-upsert':      'true',
    },
    body: pdfBuffer,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase upload error ${resp.status}: ${text}`);
  }
}

async function uploadMeta(meta) {
  const { url, key } = cfg();
  const resp = await fetch(`${url}/storage/v1/object/carta/carta.meta.json`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'x-upsert':      'true',
    },
    body: JSON.stringify(meta),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase meta error ${resp.status}: ${text}`);
  }
}

async function getMeta() {
  const { url, key } = cfg();
  const resp = await fetch(`${url}/storage/v1/object/carta/carta.meta.json`, {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Supabase getMeta error ${resp.status}`);
  return resp.json();
}

function getPDFUrl() {
  const { url } = cfg();
  return `${url}/storage/v1/object/public/carta/carta.pdf`;
}

module.exports = { uploadPDF, uploadMeta, getMeta, getPDFUrl };
