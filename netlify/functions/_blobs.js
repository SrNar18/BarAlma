/**
 * _blobs.js — Helper per inicialitzar Netlify Blobs
 *
 * Intenta auto-configuració (via NETLIFY_BLOBS_CONTEXT).
 * Si no hi és, usa SITE_ID + NETLIFY_BLOBS_TOKEN (variable manual).
 */

const { getStore } = require('@netlify/blobs');

function createStore(name) {
  // Auto-configuració: el runtime de Netlify injecta NETLIFY_BLOBS_CONTEXT
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    return getStore(name);
  }

  // Configuració manual: SITE_ID és automàtic, NETLIFY_BLOBS_TOKEN cal afegir-lo
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    throw new Error(
      'Netlify Blobs no configurat. ' +
      'Afegeix NETLIFY_BLOBS_TOKEN com a variable d\'entorn al tauler de Netlify. ' +
      'SITE_ID=' + (siteID || 'MISSING') + ' TOKEN=' + (token ? 'OK' : 'MISSING')
    );
  }

  return getStore({ name, siteID, token });
}

module.exports = { createStore };
