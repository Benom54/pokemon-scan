// Génère une page HTML statique par carte, avec le vrai contenu déjà présent
// (titre, meta description, H1, photos, prix...) pour que les outils SEO qui ne
// lisent que le HTML brut voient un contenu réel, pas une coquille vide.
//
// Utilisation : node generate-cards.mjs
// (lancé automatiquement par le workflow GitHub Actions .github/workflows/generate-cards.yml)

import fs from 'fs';
import path from 'path';
import config from '../assets/config.js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, escapeHtml, withExt, buildStockBarHtml } = config;
const SERIES_LOGO_OVERRIDES = {}; // garder en phase avec la même constante dans index.html si un jour modifiée

const OUTPUT_ROOT = path.join(process.cwd(), 'carte-pokemon');
const TEMPLATE_PATH = path.join(OUTPUT_ROOT, 'index.html');

const SCELLE_OUTPUT_ROOT = path.join(process.cwd(), 'produit-scelle');
const SCELLE_TEMPLATE_PATH = path.join(SCELLE_OUTPUT_ROOT, 'index.html');

// Bloc JSON-LD schema.org/Product — aide Google à afficher prix/disponibilité
// directement dans les résultats de recherche (rich snippets).
function buildProductJsonLd({ name, description, url, image, price, isSoldOut, sku }) {
  const product = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name,
    description,
    sku: String(sku),
    url,
  };
  if (image) product.image = [image];
  if (price != null) {
    product.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: Number(price).toFixed(2),
      availability: isSoldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
    };
  }
  return `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
}

function buildTrustBarHtml(settingsMap) {
  const items = [
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6a6 6 0 0 0-6 6v3l-1.5 2.5A1 1 0 0 0 5.4 19H12a6 6 0 0 0 0-12z"/><circle cx="9" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="15" cy="12" r=".6" fill="currentColor"/></svg>',
      title: settingsMap.trust1_title || 'Réponse rapide',
      text: settingsMap.trust1_text || 'Sous 24h, du lundi au samedi'
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5"/></svg>',
      title: settingsMap.trust2_title || 'Authenticité garantie',
      text: settingsMap.trust2_text || 'Chaque carte vérifiée à la main'
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
      title: settingsMap.trust3_title || 'Satisfait ou remboursé',
      text: settingsMap.trust3_text || "14 jours pour changer d'avis"
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="7" width="14" height="10" rx="1"/><path d="M15 10h3l4 4v3h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/></svg>',
      title: settingsMap.trust4_title || 'Envoi soigné',
      text: settingsMap.trust4_text || 'Protection premium, sous 24-48h'
    }
  ];
  return `
    <div class="trust-bar">
      ${items.map(i => `
        <div class="trust-item">
          <div class="trust-icon">${i.icon}</div>
          <div class="trust-text"><b>${escapeHtml(i.title)}</b><span>${escapeHtml(i.text)}</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

async function main() {
  const [cardsResp, settingsResp] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/cartes?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/settings?select=key,value`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    })
  ]);

  if (!cardsResp.ok) throw new Error('Erreur Supabase (cartes) : ' + (await cardsResp.text()));
  const cards = await cardsResp.json();

  let discountPercent = 0;
  let breadcrumbText = '← Retour au catalogue';
  let cardDescriptionTemplate = 'Découvre la sublime carte {nom}, Pokémon de la série {serie}, actuellement disponible.';
  let sealedDescriptionTemplate = 'Découvre {nom}, un {type} de la série {serie}, actuellement disponible.';
  let settingsMap = {};
  if (settingsResp.ok) {
    const rows = await settingsResp.json();
    rows.forEach(r => { settingsMap[r.key] = r.value; });
    if (settingsMap.discount_percent != null) discountPercent = parseInt(settingsMap.discount_percent, 10) || 0;
    if (settingsMap.breadcrumb_text) breadcrumbText = settingsMap.breadcrumb_text;
    if (settingsMap.card_description_template) cardDescriptionTemplate = settingsMap.card_description_template;
    if (settingsMap.sealed_description_template) sealedDescriptionTemplate = settingsMap.sealed_description_template;
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
    let effectivePrice = c.price != null ? Number(c.price) : null;
    if (c.price != null) {
      if (discountPercent > 0) {
        const discounted = c.price * (1 - discountPercent / 100);
        effectivePrice = discounted;
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

    const autoDescription = cardDescriptionTemplate
      .replace(/\{nom\}/g, c.name || '')
      .replace(/\{numero\}/g, c.card_number || '')
      .replace(/\{serie\}/g, c.set_name || c.series_name || '')
      .replace(/\{etat\}/g, c.condition || '');
    const descriptionHtml = `
    <div class="card-description">
      <p>${escapeHtml(autoDescription).replace(/\n/g, '<br>')}</p>
      ${c.tcgdex_description ? `<p>${escapeHtml(c.tcgdex_description)}</p>` : ''}
    </div>`;

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
        ${descriptionHtml}
        <div class="price-block price mono">${priceHtml}</div>
        ${isSoldOut
          ? `<div class="cta cta-disabled">Indisponible — déjà vendue</div>`
          : `<button type="button" class="cta" id="cartToggleBtn" data-id="${escapeHtml(c.id)}">Ajouter au panier</button>`}
      </div>
    </div>
    ${buildTrustBarHtml(settingsMap)}
    </div>
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
    html = html.replace(
      '<div class="breadcrumb"><a href="/">← Retour au catalogue</a></div>',
      `<div class="breadcrumb"><a href="/">${escapeHtml(breadcrumbText)}</a></div>`
    );
    const cardCanonicalUrl = `https://retrocarte.com/carte-pokemon/${folderName}/`;
    html = html.replace(
      '<!-- JSON_LD_PLACEHOLDER -->',
      buildProductJsonLd({
        name: c.name,
        description,
        url: cardCanonicalUrl,
        image: c.image_url || null,
        price: effectivePrice,
        isSoldOut,
        sku: c.id,
      })
    );
    html = html.split(loadingBlock).join(cardPanelHtml);

    const outDir = path.join(OUTPUT_ROOT, folderName);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
    generated++;
  }

  console.log(`${generated} page(s) carte générée(s) dans carte-pokemon/{slug}/`);

  // ============================================================
  // Produits scellés (Display, ETB, Blisters...) — meme principe
  // ============================================================
  const scelleSlugsSeen = new Set();
  const scelleResp = await fetch(`${SUPABASE_URL}/rest/v1/produits_scelles?select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });

  if (scelleResp.ok) {
    const scelleTemplate = fs.readFileSync(SCELLE_TEMPLATE_PATH, 'utf8');
    const scelleLoadingStart = scelleTemplate.indexOf('<div id="content">');
    const scelleMainClose = scelleTemplate.indexOf('</main>');
    const scelleLoadingBlock = scelleTemplate.slice(scelleLoadingStart, scelleMainClose);

    const produits = await scelleResp.json();
    let scelleGenerated = 0;

    for (const p of produits) {
      const folderName = p.slug || `id-${p.id}`;
      scelleSlugsSeen.add(folderName);

      const meta = [p.type, p.series_name].filter(Boolean).join(' · ');
      const titleParts = [p.nom, meta].filter(Boolean);
      const title = `${titleParts.join(' — ')} | Retrocarte`;
      const description = `Acheter ${p.nom}${p.type ? ' (' + p.type + ')' : ''}${p.series_name ? ' de la série ' + p.series_name : ''}. Livraison gratuite.`
        .replace(/\s+/g, ' ').trim();

      const isSoldOut = p.status === 'vendue' || (p.quantite != null && p.quantite <= 0);

      let priceHtml;
      let effectivePrice = p.prix != null ? Number(p.prix) : null;
      if (p.prix != null) {
        if (discountPercent > 0) {
          const discounted = p.prix * (1 - discountPercent / 100);
          effectivePrice = discounted;
          priceHtml = `<span class="price-original">${Number(p.prix).toFixed(2)} €</span><span class="price-discounted">${discounted.toFixed(2)} €</span>`;
        } else {
          priceHtml = `${Number(p.prix).toFixed(2)} €`;
        }
      } else {
        priceHtml = 'Prix sur demande';
      }

      const badges = p.type ? `<span class="badge">${escapeHtml(p.type)}</span>` : '';
      const photos = p.image_url ? `<div class="photo-frame" id="mainPhotoFrame"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.nom)}"><div class="photo-label">Photo du produit</div></div>` : '';

      const sealedAutoDescription = sealedDescriptionTemplate
        .replace(/\{nom\}/g, p.nom || '')
        .replace(/\{type\}/g, p.type || '')
        .replace(/\{serie\}/g, p.series_name || '');
      const sealedDescriptionHtml = `
      <div class="card-description">
        <p>${escapeHtml(sealedAutoDescription).replace(/\n/g, '<br>')}</p>
        ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
      </div>`;

      const scellePanelHtml = `<div id="content"><div class="card-panel">
      <div class="photos">${photos}</div>
      <div class="info-col">
        <div class="badges">${badges}${isSoldOut ? '<span class="badge sold">Rupture de stock</span>' : ''}</div>
        <div class="meta">${escapeHtml(meta)}</div>
        ${sealedDescriptionHtml}
        <div class="price-block price mono">${priceHtml}</div>
        ${buildStockBarHtml(p.quantite, isSoldOut)}
        ${isSoldOut
          ? `<div class="cta cta-disabled">Indisponible — déjà vendu</div>`
          : `<button type="button" class="cta" id="cartToggleBtn" data-id="${escapeHtml(p.id)}">Ajouter au panier</button>`}
      </div>
    </div>
    ${buildTrustBarHtml(settingsMap)}
    </div>
    `;

      let html = scelleTemplate;
      html = html.replace('<title>Produit scellé — Retrocarte</title>', `<title>${escapeHtml(title)}</title>`);
      html = html.replace(
        /<meta name="description" content="[^"]*">/,
        `<meta name="description" content="${escapeHtml(description)}">`
      );
      html = html.replace(
        '<h1 id="pageH1">Fiche produit scellé — Retrocarte</h1>',
        `<h1 id="pageH1">${escapeHtml(titleParts.join(' — '))}</h1>`
      );
      html = html.replace(
        '<div class="breadcrumb"><a href="/">← Retour au catalogue</a></div>',
        `<div class="breadcrumb"><a href="/">${escapeHtml(breadcrumbText)}</a></div>`
      );
      const scelleCanonicalUrl = `https://retrocarte.com/produit-scelle/${folderName}/`;
      html = html.replace(
        '<!-- JSON_LD_PLACEHOLDER -->',
        buildProductJsonLd({
          name: p.nom,
          description,
          url: scelleCanonicalUrl,
          image: p.image_url || null,
          price: effectivePrice,
          isSoldOut,
          sku: p.id,
        })
      );
      html = html.split(scelleLoadingBlock).join(scellePanelHtml);

      const outDir = path.join(SCELLE_OUTPUT_ROOT, folderName);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
      scelleGenerated++;
    }

    console.log(`${scelleGenerated} page(s) produit scellé générée(s) dans produit-scelle/{slug}/`);
  } else {
    console.warn('Impossible de récupérer les produits scellés (table absente ou erreur) — étape ignorée.');
  }

  // ============================================================
  // Sitemap : accueil, page de rachat, et toutes les fiches carte
  // ============================================================
  const siteRoot = process.cwd();
  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    { loc: 'https://retrocarte.com/', priority: '1.0' },
    { loc: 'https://retrocarte.com/rachat-de-cartes-pokemon/', priority: '0.8' }
  ];
  const cardUrls = [...slugsSeen].map(slug => ({
    loc: `https://retrocarte.com/carte-pokemon/${slug}/`,
    priority: '0.6'
  }));
  const scelleUrls = [...scelleSlugsSeen].map(slug => ({
    loc: `https://retrocarte.com/produit-scelle/${slug}/`,
    priority: '0.6'
  }));

  const allUrls = [...staticUrls, ...cardUrls, ...scelleUrls];
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(siteRoot, 'sitemap.xml'), sitemapXml, 'utf8');

  // robots.txt : autorise l'exploration publique, bloque les outils d'administration
  const robotsTxt = `User-agent: *
Disallow: /scan/
Disallow: /gestion/
Disallow: /panier/
Allow: /

Sitemap: https://retrocarte.com/sitemap.xml
`;
  fs.writeFileSync(path.join(siteRoot, 'robots.txt'), robotsTxt, 'utf8');

  // .nojekyll : evite que GitHub tente de traiter le site avec Jekyll (inutile ici, et plus lent
  // a mesure que le nombre de pages generees augmente)
  fs.writeFileSync(path.join(siteRoot, '.nojekyll'), '', 'utf8');

  console.log(`sitemap.xml généré avec ${allUrls.length} URL(s), robots.txt mis à jour.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
