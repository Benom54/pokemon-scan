// ============================================================
// Config partagée Retrocarte
// ============================================================
// Un SEUL endroit à modifier si tu changes de projet Supabase,
// de clé anon, ou d'adresse email de contact.
//
// Utilisation côté navigateur (avant ton <script> principal) :
//   <script src="/assets/config.js"></script>
//   -> expose SUPABASE_URL, SUPABASE_ANON_KEY, CONTACT_EMAIL,
//      escapeHtml(), slugify(), withExt() comme variables globales
//
// Utilisation côté Node (scripts/generate-cards.mjs) :
//   import config from '../assets/config.js';
//   const { SUPABASE_URL, SUPABASE_ANON_KEY, escapeHtml, withExt } = config;
// ============================================================

(function (global) {
  const SUPABASE_URL = 'https://izfusafzbekuezqitzsp.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_NYWtmqeLH0CMygyhM2R7Yw_ACYqyBCe';

  // TODO: remplace par ta vraie adresse email avant mise en prod —
  // c'est elle qui reçoit les commandes via le bouton "Valider ma commande".
  const CONTACT_EMAIL = 'ton-email@exemple.com';

  function escapeHtml(str) {
    return (str ?? '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function withExt(url) {
    if (!url) return url;
    return /\.(png|webp|jpe?g)$/i.test(url) ? url : `${url}.png`;
  }

  function slugify(str) {
    return (str || '')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const api = { SUPABASE_URL, SUPABASE_ANON_KEY, CONTACT_EMAIL, escapeHtml, withExt, slugify };

  if (typeof module !== 'undefined' && module.exports) {
    // Node (CommonJS) — importé depuis generate-cards.mjs
    module.exports = api;
  } else {
    // Navigateur — expose chaque clé comme variable globale
    Object.assign(global, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
