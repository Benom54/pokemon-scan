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

  // Barre de stock pour les produits scellés (quantite dénombrable, contrairement
  // aux cartes qui sont uniques). Jauge d'urgence plafonnée visuellement à 10
  // exemplaires — pas un vrai "vendu / stock initial" (cette donnée n'existe pas
  // en base), juste un indicateur du niveau de stock actuel.
  function buildStockBarHtml(quantite, isSoldOut) {
    const qty = Number(quantite) || 0;

    if (isSoldOut || qty <= 0) {
      return `<div class="stock-block"><div class="stock-row"><span class="stock-text out">Rupture de stock</span></div><div class="stock-bar-track"><div class="stock-bar-fill out" style="width:100%;"></div></div></div>`;
    }

    const pct = Math.min(qty, 10) / 10 * 100;
    let level, text, sub;
    if (qty === 1) {
      level = 'critical'; text = 'Dernier exemplaire !'; sub = '1 restant';
    } else if (qty <= 4) {
      level = 'low'; text = `Plus que ${qty} en stock`; sub = 'dépêche-toi';
    } else {
      level = 'healthy'; text = 'En stock'; sub = `${qty} exemplaires`;
    }

    return `<div class="stock-block"><div class="stock-row"><span class="stock-text ${level}">${text}</span><span class="stock-sub">${sub}</span></div><div class="stock-bar-track"><div class="stock-bar-fill ${level}" style="width:${pct}%;"></div></div></div>`;
  }

  // Petit gardien de page côté client pour gestion/ et scan/ : ce n'est PAS une
  // vraie sécurité (le code reste lisible dans la source, un hash SHA-256 peut
  // être craqué hors-ligne) — la vraie protection reste la clé service_role
  // qu'il faut de toute façon saisir à la main pour agir sur la base. Ce gardien
  // sert juste à éviter qu'un visiteur curieux tombe sur l'interface d'admin.
  async function requirePagePassword(expectedHashHex, sessionKey) {
    if (typeof window === 'undefined') return; // ne s'applique qu'au navigateur

    if (sessionStorage.getItem(sessionKey) === 'ok') {
      document.body.style.visibility = 'visible';
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.visibility = 'visible'; // le body reste caché (voir <style> de la page), l'overlay doit rester lisible
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;z-index:99999;background:#0e1116;display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;">
        <div style="width:280px;text-align:center;">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#eef1f5;margin-bottom:14px;">Accès restreint</div>
          <input type="password" id="pagePasswordInput" placeholder="Mot de passe" style="width:100%;background:#171b24;border:1px solid #262c38;border-radius:8px;color:#eef1f5;padding:10px 12px;font-size:13.5px;box-sizing:border-box;margin-bottom:10px;">
          <button type="button" id="pagePasswordBtn" style="width:100%;background:#c9a15a;border:1px solid #c9a15a;color:#0e1116;padding:10px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Entrer</button>
          <div id="pagePasswordMsg" style="color:#e0838a;font-size:12px;margin-top:10px;min-height:16px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    async function sha256Hex(text) {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return new Promise((resolve) => {
      const input = overlay.querySelector('#pagePasswordInput');
      const btn = overlay.querySelector('#pagePasswordBtn');
      const msg = overlay.querySelector('#pagePasswordMsg');

      async function tryUnlock() {
        const hash = await sha256Hex(input.value);
        if (hash === expectedHashHex) {
          sessionStorage.setItem(sessionKey, 'ok');
          document.body.style.visibility = 'visible';
          overlay.remove();
          resolve();
        } else {
          msg.textContent = 'Mot de passe incorrect.';
          input.value = '';
          input.focus();
        }
      }

      btn.addEventListener('click', tryUnlock);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
      input.focus();
    });
  }

  const api = { SUPABASE_URL, SUPABASE_ANON_KEY, CONTACT_EMAIL, escapeHtml, withExt, slugify, requirePagePassword, buildStockBarHtml };

  if (typeof module !== 'undefined' && module.exports) {
    // Node (CommonJS) — importé depuis generate-cards.mjs
    module.exports = api;
  } else {
    // Navigateur — expose chaque clé comme variable globale
    Object.assign(global, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
