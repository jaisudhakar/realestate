import { projects, zones, amenities, stats, testimonials, faqs, chapters } from '../data/content.js';
import { mulberry32 } from '../scene/utils.js';

const ICONS = {
  gate: 'M3 21V9l9-6 9 6v12M7 21v-8h10v8M12 13v8',
  road: 'M8 3 4 21M16 3l4 18M12 4v3M12 10v3M12 16v3',
  lamp: 'M9 21h6M12 21V7a4 4 0 0 1 4-4h2M18 3v4M16 7h4M18 9.5v1.5',
  tree: 'M12 22v-6M12 2 5 12h4l-3 4h12l-3-4h4z',
  pool: 'M2 19c2 0 2-1.5 4-1.5S8 19 10 19s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M7 15V5a2 2 0 0 1 4 0M13 15V5a2 2 0 0 1 4 0M7 9h6M7 12h6',
  park: 'M3 21h18M6 21V10M18 21V10M4 10h16M9 10v6h6v-6M12 3v3',
  drop: 'M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11zM9.5 14a2.5 2.5 0 0 0 2.5 2.5',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A generated "aerial site plan" illustration for each project card.
function siteArt(p, i) {
  const r = mulberry32(1000 + i * 77);
  const [a, b] = p.palette;
  const id = `g${i}`;
  let plots = '';
  const roadsX = [120, 300];
  const roadsY = [100, 200];
  for (let y = 20; y < 300; y += 26) {
    for (let x = 14; x < 440; x += 22) {
      if (roadsX.some((rx) => Math.abs(x + 9 - rx) < 18) || roadsY.some((ry) => Math.abs(y + 10 - ry) < 16)) continue;
      const v = r();
      const fill = v < 0.45 ? `fill="${a}" fill-opacity="0.32"` : v < 0.6 ? `fill="${a}" fill-opacity="0.12"` : 'fill="none"';
      plots += `<rect x="${x}" y="${y}" width="18" height="21" rx="1.5" ${fill} stroke="${a}" stroke-opacity="0.55" stroke-width="0.8"/>`;
    }
  }
  let trees = '';
  for (let t = 0; t < 34; t++) {
    const onX = r() < 0.5;
    const cx = onX ? roadsX[Math.floor(r() * 2)] + (r() < 0.5 ? -12 : 12) : r() * 440;
    const cy = onX ? r() * 300 : roadsY[Math.floor(r() * 2)] + (r() < 0.5 ? -11 : 11);
    trees += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(3 + r() * 3).toFixed(1)}" fill="#1e3b22" fill-opacity="0.9"/>`;
  }
  return `
  <svg viewBox="0 0 440 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Site plan illustration of ${esc(p.name)}">
    <defs>
      <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#07090c"/>
      </linearGradient>
      <radialGradient id="${id}sun" cx="0.82" cy="0.12" r="0.75">
        <stop offset="0" stop-color="${a}" stop-opacity="0.75"/><stop offset="1" stop-color="${a}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${id}fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#07090c" stop-opacity="0"/><stop offset="1" stop-color="#07090c" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="440" height="300" fill="url(#${id}bg)"/>
    <g opacity="0.95">${plots}</g>
    ${roadsX.map((x) => `<rect x="${x - 7}" y="0" width="14" height="300" fill="#0d0f12" fill-opacity="0.7"/>`).join('')}
    ${roadsY.map((y) => `<rect x="0" y="${y - 6}" width="440" height="12" fill="#0d0f12" fill-opacity="0.7"/>`).join('')}
    ${roadsX.map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="300" stroke="${a}" stroke-opacity="0.5" stroke-dasharray="6 6"/>`).join('')}
    ${trees}
    <rect width="440" height="300" fill="url(#${id}sun)"/>
    <rect width="440" height="300" fill="url(#${id}fade)"/>
  </svg>`;
}

export function renderProjects(track) {
  track.innerHTML = projects
    .map(
      (p, i) => `
    <article class="card" data-zone="${p.zone}" data-price="${p.priceFrom}" data-tilt>
      <div class="card__art">
        ${siteArt(p, i)}
        <span class="card__tag">${esc(p.tag)}</span>
        <span class="card__approvals">${p.approvals.map((x) => `<span>${x}</span>`).join('')}</span>
      </div>
      <div class="card__body">
        <p class="card__loc">${esc(p.locality)}, Coimbatore</p>
        <h3 class="card__name">${esc(p.name)}</h3>
        <dl class="card__meta">
          <div><dt>Plot sizes</dt><dd>${esc(p.sizes.replace(' sq.ft', ''))}</dd></div>
          <div><dt>Plots</dt><dd>${p.plots}</dd></div>
          <div><dt>Extent</dt><dd>${p.acres} acres</dd></div>
        </dl>
        <ul class="card__list">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        <div class="card__foot">
          <p class="card__price"><small>Starting from</small><strong>₹${p.priceFrom} L*</strong></p>
          <a href="#contact" class="btn btn--ghost" data-project="${p.id}" data-cursor="Enquire">Enquire</a>
        </div>
      </div>
    </article>`
    )
    .join('');
}

export function renderChips(el) {
  el.innerHTML = zones
    .map((z, i) => `<button class="chip" role="tab" data-zone="${z.id}" aria-selected="${i === 0}">${z.label}</button>`)
    .join('');
}

export function fillZoneSelect(el) {
  el.innerHTML = zones.map((z) => `<option value="${z.id}">${z.label}</option>`).join('');
}

export function fillProjectSelect(el) {
  el.innerHTML =
    `<option value="" disabled selected>Select a project</option>` +
    projects.map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.locality)}</option>`).join('');
}

export function renderAmenities(el) {
  el.innerHTML = amenities
    .map(
      (a) => `
    <article class="amenity" data-stagger>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[a.icon]}" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.text)}</p>
    </article>`
    )
    .join('');
}

export function renderStats(el) {
  el.innerHTML = stats
    .map(
      (s) => `
    <div class="stat" data-stagger>
      <div class="stat__value"><span data-count="${s.value}" data-decimals="${s.decimals ?? 0}">0</span>${s.suffix}</div>
      <div class="stat__label">${esc(s.label)}</div>
    </div>`
    )
    .join('');
}

export function renderQuotes(el, nav) {
  el.innerHTML = testimonials
    .map(
      (t, i) => `
    <blockquote class="quote${i === 0 ? ' is-active' : ''}" id="quote-${i}">
      <p>${esc(t.quote)}</p>
      <footer><cite>${esc(t.name)}</cite><span>${esc(t.meta)}</span></footer>
    </blockquote>`
    )
    .join('');
  nav.innerHTML = testimonials
    .map((t, i) => `<button role="tab" aria-controls="quote-${i}" aria-selected="${i === 0}" aria-label="Testimonial ${i + 1}"><i></i></button>`)
    .join('');
}

export function renderFaq(el) {
  el.innerHTML = faqs
    .map(
      (f, i) => `
    <div class="faq-item">
      <button aria-expanded="false" aria-controls="faq-${i}" id="faq-q-${i}">${esc(f.q)}<i aria-hidden="true"></i></button>
      <div class="faq-item__panel" id="faq-${i}" role="region" aria-labelledby="faq-q-${i}"><p>${esc(f.a)}</p></div>
    </div>`
    )
    .join('');
}

export function renderChapters(el) {
  el.innerHTML = chapters.map((c, i) => `<li data-id="${c.id}">${String(i + 1).padStart(2, '0')} ${c.label}</li>`).join('');
}
