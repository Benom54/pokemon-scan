// Génère une page HTML statique par carte, avec le vrai contenu déjà présent
// (titre, meta description, H1, photos, prix...) pour que les outils SEO qui ne
// lisent que le HTML brut voient un contenu réel, pas une coquille vide.
//
// Utilisation : node generate-cards.mjs
// (lancé automatiquement par le workflow GitHub Actions .github/workflows/generate-cards.yml)

import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://izfusafzbekuezqitzsp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NYWtmqeLH0CMygyhM2R7Yw_ACYqyBCe';
const SERIES_LOGO_OVERRIDES = {}; // garder en phase avec la même constante dans index.html si un jour modifiée

const OUTPUT_ROOT = path.join(process.cwd(), 'carte-pokemon');
const TEMPLATE_PATH = path.join(OUTPUT_ROOT, 'index.html');

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

async function main() {
  const [cardsResp, discountResp] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/cartes?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.discount_percent&select=value`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    })
  ]);

  if (!cardsResp.ok) throw new Error('Erreur Supabase (cartes) : ' + (await cardsResp.text()));
  const cards = await cardsResp.json();

  let discountPercent = 0;
  if (discountResp.ok) {
    const rows = await discountResp.json();
    if (rows.length > 0) discountPercent = parseInt(rows[0].value, 10) || 0;
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Le bloc exact affiché avant que le JS charge la vraie carte, utilisé comme repère de remplacement
  const loadingBlockStart = template.indexOf('<div id="content">');
  const mainCloseIndex = template.indexOf('</main>');
  const loadingBlock = template.slice(loadingBlockStart, mainCloseIndex);

  let generated = 0;
  const slugsSeen = new Set();

  for (const c of cards) {
    const folderName = c.slug || `id-${c.id}`;
    slugsSeen.add(folderName);

    const numberSet = [c.card_number, c.set_name].filter(Boolean).join(' · ');
    const titleParts = [c.name, numberSet, c.condition].filter(Boolean);
    const title = `${titleParts.join(' — ')} | Retrocarte`;
    const description = `Acheter Pokémon ${c.name} ${c.card_number || ''} de la série ${c.set_name || ''}. Livraison gratuite.`
      .replace(/\s+/g, ' ').trim();

    const isSoldOut = c.status === 'vendue';
    const isRare = !!(c.holo || c.graded || c.first_edition);

    let priceHtml;
    if (c.price != null) {
      if (discountPercent > 0) {
        const discounted = c.price * (1 - discountPercent / 100);
        priceHtml = `<span class="price-original">${Number(c.price).toFixed(2)} €</span><span class="price-discounted">${discounted.toFixed(2)} €</span>`;
      } else {
        priceHtml = `${Number(c.price).toFixed(2)} €`;
      }
    } else {
      priceHtml = 'Prix sur demande';
    }

    const badges = [
      c.first_edition ? '<span class="badge">1ère édition</span>' : '',
      c.stamp ? '<span class="badge">Stamp</span>' : '',
      c.holo ? '<span class="badge">Holo</span>' : '',
      (c.graded && c.grade != null) ? `<span class="badge">Gradée ${escapeHtml(String(c.grade))}</span>` : '',
      c.condition ? `<span class="badge cond">${escapeHtml(c.condition)}</span>` : ''
    ].join('');

    const photos = [];
    if (c.photo_url) photos.push(`<div class="photo-frame" id="mainPhotoFrame"><img src="${escapeHtml(c.photo_url)}" alt="Recto"><div class="photo-label">Recto</div></div>`);
    if (c.photo_back_url) photos.push(`<div><img src="${escapeHtml(c.photo_back_url)}" alt="Verso"><div class="photo-label">Verso</div></div>`);
    if (photos.length === 0 && c.image_url) photos.push(`<div class="photo-frame" id="mainPhotoFrame"><img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.name)}"><div class="photo-label">Illustration officielle</div></div>`);

    const seriesLogo = SERIES_LOGO_OVERRIDES[c.series_id] || (c.series_logo ? withExt(c.series_logo) : null);

    const cardPanelHtml = `<div id="content"><div class="card-panel ${isRare && !isSoldOut ? 'rare-halo' : ''}">
      <div class="photos">${photos.join('')}</div>
      <div class="info-col">
        <div class="badges">${badges}${isSoldOut ? '<span class="badge sold">Rupture de stock</span>' : ''}</div>
        <div class="meta">${escapeHtml(numberSet)}</div>
        ${c.series_name ? `
          <div class="series-row">
            ${seriesLogo ? `<img src="${escapeHtml(seriesLogo)}" alt="">` : ''}
            <span>${escapeHtml(c.series_name)}</span>
          </div>
        ` : ''}
        <div class="price-block price mono">${priceHtml}</div>
        ${isSoldOut
          ? `<div class="cta cta-disabled">Indisponible — déjà vendue</div>`
          : `<button type="button" class="cta" id="cartToggleBtn" data-id="${escapeHtml(c.id)}">Ajouter au panier</button>`}
      </div>
    </div></div>
    `;

    let html = template;
    html = html.replace('<title>Carte Pokémon — Retrocarte</title>', `<title>${escapeHtml(title)}</title>`);
    html = html.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escapeHtml(description)}">`
    );
    html = html.replace(
      '<h1 id="pageH1">Fiche carte Pokémon — Retrocarte</h1>',
      `<h1 id="pageH1">${escapeHtml(titleParts.join(' — '))}</h1>`
    );
    html = html.split(loadingBlock).join(cardPanelHtml);

    const outDir = path.join(OUTPUT_ROOT, folderName);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
    generated++;
  }

  console.log(`${generated} page(s) carte générée(s) dans carte-pokemon/{slug}/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
