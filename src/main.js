import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/manrope';
import './styles.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { World } from './scene/World.js';
import { clamp } from './scene/utils.js';
import { projects, chapters, brand } from './data/content.js';
import {
  renderProjects,
  renderChips,
  fillZoneSelect,
  fillProjectSelect,
  renderAmenities,
  renderStats,
  renderQuotes,
  renderFaq,
  renderChapters,
} from './ui/render.js';
import { splitWords, splitPlain, grainTexture, initCursor, initMagnetic, initTilt } from './ui/effects.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => innerWidth < 861;
const lowPower = isNarrow() || (navigator.hardwareConcurrency || 8) <= 4;

/* --------------------------------------------------------------- content */

document.documentElement.style.setProperty('--grain', grainTexture());
renderProjects($('#projects-track'));
renderChips($('#zone-chips'));
fillZoneSelect($('#finder-zone'));
fillProjectSelect($('#f-project'));
renderAmenities($('#amenity-grid'));
renderStats($('#stats'));
renderQuotes($('#quotes'), $('#quotes-nav'));
renderFaq($('#faq-list'));
renderChapters($('.hud__chapters'));
$('#year').textContent = new Date().getFullYear();

/* --------------------------------------------------------------- 3D world */

let world = null;
try {
  world = new World($('#webgl'), { lowPower });
} catch (err) {
  console.warn('WebGL unavailable, falling back to static backdrop.', err);
  document.body.classList.add('no-webgl');
}

/* --------------------------------------------------------------- scrolling */

const lenis = new Lenis({
  duration: 1.4,
  smoothWheel: !reduceMotion,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const menuBtn = $('.nav__burger');
const menu = $('#mobile-menu');
const setMenu = (open) => {
  menuBtn.setAttribute('aria-expanded', open);
  menu.hidden = !open;
  open ? lenis.stop() : lenis.start();
};
menuBtn.addEventListener('click', () => setMenu(menu.hidden));

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  if (!menu.hidden) setMenu(false);
  const offset = target.id === 'masterplan' ? innerHeight * 0.5 : 0;
  lenis.scrollTo(target, { offset, duration: reduceMotion ? 0 : 2.4 });
});

/* --------------------------------------------------------------- camera timeline */

// Each keyframe is tied to a point in the page; the camera glides along a spline between them.
const KEYFRAMES = [
  { sel: '#hero', at: 'start', pos: [0, 78, 250], tgt: [0, 32, -150], night: 0, build: 0.15, plan: 0 },
  { sel: '#intro', at: 'center', pos: [36, 12, 134], tgt: [0, 7, 96], night: 0.03, build: 0.2, plan: 0 },
  { sel: '#projects', at: 'start', pos: [8, 10, 74], tgt: [-2, 5, -40], night: 0.05, build: 0.3, plan: 0 },
  { sel: '#projects', at: 'end', pos: [-160, 64, 96], tgt: [-20, 0, -30], night: 0.08, build: 0.4, plan: 0 },
  { sel: '#masterplan', at: 'start', pos: [-66, 320, 178], tgt: [-66, 0, 18], night: 0.08, build: 0.45, plan: 1,
    portrait: { pos: [0, 330, 170], tgt: [0, 0, 30] } },
  { sel: '#masterplan', at: 'end', pos: [-66, 320, 178], tgt: [-66, 0, 18], night: 0.1, build: 0.5, plan: 1,
    portrait: { pos: [0, 330, 170], tgt: [0, 0, 30] } },
  { sel: '#amenities', at: 'center', pos: [4, 19, 38], tgt: [-28, 3, -4], night: 0.2, build: 1, plan: 0 },
  { sel: '#trust', at: 'center', pos: [128, 46, -54], tgt: [0, 2, -8], night: 0.52, build: 1, plan: 0 },
  { sel: '#emi', at: 'center', pos: [72, 15, 82], tgt: [8, 4, 18], night: 0.8, build: 1, plan: 0 },
  { sel: '#voices', at: 'center', pos: [-118, 28, 142], tgt: [0, 5, 0], night: 1, build: 1, plan: 0 },
  { sel: '#contact', at: 'end', pos: [0, 108, 268], tgt: [0, 4, -70], night: 1, build: 1, plan: 0 },
];

let anchors = [];
let portraitMode = null;

function buildFrames() {
  const portrait = innerWidth / innerHeight < 0.8;
  if (portrait === portraitMode || !world) return;
  portraitMode = portrait;
  world.setKeyframes(
    KEYFRAMES.map((k) => {
      let pos = k.pos;
      let tgt = k.tgt;
      if (portrait) {
        if (k.portrait) ({ pos, tgt } = k.portrait);
        else pos = pos.map((v, i) => tgt[i] + (v - tgt[i]) * 1.3);
      }
      return { pos, tgt, night: k.night, build: k.build, plan: k.plan };
    })
  );
}

function computeAnchors() {
  const vh = innerHeight;
  const max = ScrollTrigger.maxScroll(window);
  let prev = -1;
  anchors = KEYFRAMES.map((k, i) => {
    const el = $(k.sel);
    const box = el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    const r = box.getBoundingClientRect();
    const top = r.top + scrollY;
    let y = k.at === 'start' ? top : k.at === 'end' ? top + r.height - vh : top + r.height / 2 - vh / 2;
    if (i === 0) y = 0;
    if (i === KEYFRAMES.length - 1) y = max;
    y = clamp(y, 0, max);
    if (y <= prev) y = prev + 1;
    prev = y;
    return y;
  });
}

function progressAt(y) {
  const n = anchors.length;
  if (!n) return 0;
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < n - 1; i++) {
    if (y < anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  }
  return n - 1;
}

/* --------------------------------------------------------------- HUD */

const hudTime = $('.hud__time');
const hudPhase = $('.hud__phase');
const hudBar = $('.hud__progress span');
const chapterEls = $$('.hud__chapters li');
const navLinks = $$('.nav__links a');
let activeChapter = '';

function setChapter(id) {
  if (id === activeChapter) return;
  activeChapter = id;
  const c = chapters.find((x) => x.id === id);
  chapterEls.forEach((li) => li.classList.toggle('is-active', li.dataset.id === id));
  navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
  if (c) hudTime.textContent = c.time;
}

function phaseLabel(n) {
  return n < 0.25 ? 'Golden hour' : n < 0.6 ? 'Dusk' : n < 0.88 ? 'Twilight' : 'Night';
}

/* --------------------------------------------------------------- masterplan */

const tooltip = $('#mp-tooltip');
const cursor = initCursor();
const pointer = { x: -1, y: -1, target: null, moved: false };
let mpActive = false;
let pickFrame = 0;
const STATUS_LABEL = { available: 'Available', booked: 'Booked', sold: 'Sold' };
const STATUS_COLOR = { available: '#5fd39a', booked: '#f0b14a', sold: '#9a9284' };
const flagship = projects[0];

const overUI = (t) => !!t?.closest?.('.mp-panel, .nav, .fab, .mobile-menu, .hud');

function plotPrice(p) {
  const premium = p.corner ? 1.08 : 1;
  const lakhs = (p.sqft * flagship.ratePerSqft * premium) / 1e5;
  return `₹${lakhs.toFixed(1)} L`;
}

function initMasterplan() {
  if (!world) {
    $('#mp-panel .mp-panel__hint').textContent = 'The interactive 3D masterplan needs WebGL, which is unavailable in this browser.';
    return;
  }
  if (!matchMedia('(hover: hover)').matches) {
    $('#mp-panel .mp-panel__hint').lastChild.textContent = ' Tap any plot on the layout to see its size, facing and price.';
  }
  const plots = world.site.plots;
  const counts = { available: 0, booked: 0, sold: 0 };
  plots.forEach((p) => counts[p.status]++);
  $('#mp-legend').innerHTML = Object.entries(counts)
    .map(([k, v]) => `<li><b>${v}</b><span style="color:${STATUS_COLOR[k]}"><i></i><em style="color:var(--ink-2);font-style:normal">${STATUS_LABEL[k]}</em></span></li>`)
    .join('');
  const jump = $('#mp-jump');
  jump.innerHTML =
    '<option value="">Choose a plot…</option>' +
    plots
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.status === 'available')
      .map(({ p, i }) => `<option value="${i}">${p.id} · ${p.sqft.toLocaleString('en-IN')} sq.ft · ${p.facing} facing</option>`)
      .join('');
  jump.addEventListener('change', () => jump.value !== '' && selectPlot(+jump.value));

  ScrollTrigger.create({
    trigger: '#masterplan',
    start: 'top 30%',
    end: 'bottom 70%',
    onToggle: (self) => {
      mpActive = self.isActive;
      document.body.classList.toggle('is-plan', mpActive);
      if (!mpActive) {
        world.setHovered(-1);
        tooltip.hidden = true;
        cursor?.setPlot(false);
      }
    },
  });

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.target = e.target;
    pointer.moved = true;
  });

  window.addEventListener('click', (e) => {
    if (!mpActive || world.state.plan < 0.6 || overUI(e.target) || e.target.closest('a, button, select, input')) return;
    const i = world.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (i >= 0) selectPlot(i);
  });

  $('#pc-enquire').addEventListener('click', () => {
    const p = plots[world.selected];
    if (!p) return;
    $('#f-project').value = flagship.id;
    $('#f-plot').value = p.id;
    lenis.scrollTo('#contact', { duration: 2.4 });
  });
}

function selectPlot(i) {
  const p = world.site.plots[i];
  world.select(i);
  const card = $('#plot-card');
  card.hidden = false;
  $('#pc-id').textContent = p.id;
  const st = $('#pc-status');
  st.textContent = STATUS_LABEL[p.status];
  st.dataset.s = p.status;
  $('#pc-area').textContent = `${p.sqft.toLocaleString('en-IN')} sq.ft`;
  $('#pc-dims').textContent = p.dims;
  $('#pc-facing').textContent = `${p.facing}${p.corner ? ' · Corner' : ''}`;
  $('#pc-price').textContent = p.status === 'sold' ? 'Sold out' : plotPrice(p);
  $('#pc-enquire').disabled = p.status === 'sold';
  $('#pc-enquire').textContent = p.status === 'sold' ? 'This plot is sold' : 'Enquire about this plot';
  gsap.fromTo(card, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
}

function updatePicking() {
  if (!world || !mpActive) return;
  if (++pickFrame % 2) return;
  if (pointer.x < 0 || overUI(pointer.target) || world.state.plan < 0.6) {
    world.setHovered(-1);
    tooltip.hidden = true;
    cursor?.setPlot(false);
    return;
  }
  const i = world.pick((pointer.x / innerWidth) * 2 - 1, -(pointer.y / innerHeight) * 2 + 1);
  world.setHovered(i);
  cursor?.setPlot(i >= 0);
  if (i < 0) {
    tooltip.hidden = true;
    return;
  }
  const p = world.site.plots[i];
  tooltip.hidden = false;
  tooltip.innerHTML = `<b>${p.id}</b><i style="background:${STATUS_COLOR[p.status]}"></i>${STATUS_LABEL[p.status]} · ${p.sqft.toLocaleString('en-IN')} sq.ft`;
  tooltip.style.left = `${pointer.x}px`;
  tooltip.style.top = `${pointer.y}px`;
}

/* --------------------------------------------------------------- render loop */

let lastPhase = '';
gsap.ticker.add(() => {
  const y = lenis.scroll;
  const limit = lenis.limit || 1;
  hudBar.style.transform = `scaleX(${clamp(y / limit)})`;
  if (!world) return;
  world.setProgress(progressAt(y));
  world.update();
  updatePicking();
  const phase = phaseLabel(world.state.night);
  if (phase !== lastPhase) hudPhase.textContent = lastPhase = phase;
});

window.addEventListener('pointermove', (e) => {
  world?.setMouse((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
window.addEventListener('resize', () => {
  world?.resize();
  buildFrames();
});

/* --------------------------------------------------------------- scroll animations */

function setupScrollAnimations() {
  // Letterbox bars retract as you leave the opening shot
  document.body.classList.add('letterbox-on');
  gsap.to('.letterbox', {
    scaleY: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (s) => document.body.classList.toggle('letterbox-on', s.progress < 0.5),
    },
  });
  gsap.to('.hero__inner, .hero__scroll', {
    yPercent: -40,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 20%', scrub: true },
  });

  // Headline word reveals
  $$('[data-split]').forEach((el) => {
    if (el.closest('#hero')) return;
    const words = splitWords(el);
    gsap.from(words, {
      yPercent: 115,
      rotate: 4,
      duration: 1.3,
      ease: 'expo.out',
      stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  $$('[data-reveal]').forEach((el) => {
    if (el.closest('#hero')) return;
    gsap.from(el, {
      y: 50,
      opacity: 0,
      duration: 1.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // Manifesto: words light up as you read
  $$('[data-words]').forEach((el) => {
    const words = splitPlain(el);
    gsap.to(words, {
      opacity: 1,
      stagger: 0.1,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 42%', scrub: true },
    });
  });

  // Marquee reacts to scroll velocity
  const marquee = gsap.to('.marquee__track', { xPercent: -50, repeat: -1, duration: 30, ease: 'none' });
  let velocity = 0;
  lenis.on('scroll', (l) => (velocity = l.velocity));
  gsap.ticker.add(() => {
    velocity *= 0.92;
    const ts = marquee.timeScale();
    marquee.timeScale(ts + (1 + Math.min(Math.abs(velocity) * 0.3, 7) - ts) * 0.1);
  });

  // Horizontal project gallery (desktop)
  const mm = gsap.matchMedia();
  mm.add('(min-width: 861px)', () => {
    const track = $('#projects-track');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track.parentElement).paddingLeft) * 2);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '#projects',
        start: 'top top',
        end: () => `+=${dist() + innerHeight * 0.6}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
  });
  gsap.from('.card', {
    y: 90,
    opacity: 0,
    duration: 1.4,
    ease: 'expo.out',
    stagger: 0.08,
    scrollTrigger: { trigger: '#projects', start: 'top 70%' },
  });

  gsap.from('.amenity', {
    y: 40,
    opacity: 0,
    duration: 1,
    ease: 'power3.out',
    stagger: 0.07,
    scrollTrigger: { trigger: '#amenity-grid', start: 'top 82%' },
  });

  // Counters
  $$('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = +el.dataset.decimals;
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () =>
        gsap.to(o, {
          v: target,
          duration: 2.6,
          ease: 'power2.out',
          onUpdate: () => (el.textContent = o.v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })),
        }),
    });
  });
  gsap.from('.stat', {
    y: 40,
    opacity: 0,
    duration: 1.2,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: { trigger: '#stats', start: 'top 85%' },
  });

  // Chapter tracking
  chapters.forEach((c) => {
    ScrollTrigger.create({
      trigger: `#${c.id}`,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (s) => s.isActive && setChapter(c.id),
    });
  });

  // Nav: hide on the way down, return on the way up
  const nav = $('#nav');
  lenis.on('scroll', ({ scroll, direction }) => {
    nav.classList.toggle('is-solid', scroll > 60);
    nav.classList.toggle('is-hidden', direction === 1 && scroll > innerHeight * 0.6 && menu.hidden);
  });

  ScrollTrigger.addEventListener('refresh', computeAnchors);
  ScrollTrigger.refresh();
}

/* --------------------------------------------------------------- filters */

let zoneFilter = 'all';
let budgetFilter = 0;
function applyFilter() {
  let shown = 0;
  $$('.card').forEach((c) => {
    const ok = (zoneFilter === 'all' || c.dataset.zone === zoneFilter) && (!budgetFilter || +c.dataset.price <= budgetFilter);
    c.classList.toggle('is-hidden', !ok);
    if (ok) shown++;
  });
  $('#projects-empty').hidden = shown > 0;
  $$('.chip').forEach((ch) => ch.setAttribute('aria-selected', ch.dataset.zone === zoneFilter));
  gsap.set('#projects-track', { x: 0 });
  ScrollTrigger.refresh();
  gsap.fromTo('.card:not(.is-hidden)', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.8, ease: 'power3.out' });
}
$('#zone-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  zoneFilter = chip.dataset.zone;
  applyFilter();
});
$('#finder').addEventListener('submit', (e) => {
  e.preventDefault();
  zoneFilter = $('#finder-zone').value;
  budgetFilter = +$('#finder-budget').value;
  applyFilter();
  lenis.scrollTo('#projects', { duration: 2.2 });
});
$('#projects-track').addEventListener('click', (e) => {
  const b = e.target.closest('[data-project]');
  if (b) $('#f-project').value = b.dataset.project;
});

/* --------------------------------------------------------------- EMI */

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const lakh = (v) => `₹${(v / 1e5).toFixed(v >= 1e7 ? 0 : 1)} L`;
function updateEmi() {
  const price = +$('#emi-price').value;
  const down = +$('#emi-down').value;
  const rate = +$('#emi-rate').value;
  const years = +$('#emi-years').value;
  const P = price * 1e5 * (1 - down / 100);
  const r = rate / 1200;
  const n = years * 12;
  const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  $('#emi-price-out').textContent = `₹${price} L`;
  $('#emi-down-out').textContent = `${down}%`;
  $('#emi-rate-out').textContent = `${rate.toFixed(1)}%`;
  $('#emi-years-out').textContent = `${years} yrs`;
  $('#emi-value').textContent = inr(emi);
  $('#emi-meta').textContent = `Loan ${lakh(P)} · Total interest ${lakh(emi * n - P)}`;
  $$('#emi-form input[type=range]').forEach((inp) => {
    inp.style.setProperty('--p', `${((inp.value - inp.min) / (inp.max - inp.min)) * 100}%`);
  });
}
$('#emi-form').addEventListener('input', updateEmi);
$('#emi-form').addEventListener('submit', (e) => e.preventDefault());
updateEmi();

/* --------------------------------------------------------------- testimonials */

const quotes = $$('.quote');
const qButtons = $$('#quotes-nav button');
let qIndex = 0;
let qTimer;
function showQuote(i) {
  const prev = quotes[qIndex];
  qIndex = (i + quotes.length) % quotes.length;
  const next = quotes[qIndex];
  if (prev !== next) {
    gsap.to(prev, { opacity: 0, y: -20, filter: 'blur(6px)', duration: 0.6, ease: 'power2.in', onComplete: () => prev.classList.remove('is-active') });
    gsap.fromTo(next, { opacity: 0, y: 30, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, delay: 0.5, ease: 'power3.out', onStart: () => next.classList.add('is-active') });
  }
  qButtons.forEach((b, k) => {
    b.setAttribute('aria-selected', k === qIndex);
    const bar = b.querySelector('i');
    gsap.killTweensOf(bar);
    gsap.set(bar, { scaleX: k < qIndex ? 1 : 0 });
  });
  const bar = qButtons[qIndex].querySelector('i');
  clearTimeout(qTimer);
  if (!reduceMotion) {
    gsap.to(bar, { scaleX: 1, duration: 7, ease: 'none' });
    qTimer = setTimeout(() => showQuote(qIndex + 1), 7000);
  } else gsap.set(bar, { scaleX: 1 });
}
qButtons.forEach((b, i) => b.addEventListener('click', () => showQuote(i)));

/* --------------------------------------------------------------- FAQ */

$('#faq-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !open);
  gsap.to(btn.nextElementSibling, {
    height: open ? 0 : 'auto',
    duration: 0.7,
    ease: 'power3.inOut',
    onComplete: () => ScrollTrigger.refresh(),
  });
});

/* --------------------------------------------------------------- contact form */

const form = $('#contact-form');
const note = $('#form-note');
const dateInput = $('#f-date');
const today = new Date();
dateInput.min = today.toISOString().slice(0, 10);
dateInput.value = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errors = [];
  const mark = (id, bad) => $(`#${id}`).closest('.field').classList.toggle('is-invalid', bad);
  const phoneDigits = (data.phone || '').replace(/\D/g, '');
  mark('f-name', (data.name || '').trim().length < 2) && errors.push('name');
  mark('f-phone', phoneDigits.length < 10) && errors.push('phone');
  mark('f-project', !data.project) && errors.push('project');
  mark('f-date', !data.date || data.date < dateInput.min) && errors.push('date');
  if (errors.length) {
    note.classList.add('is-error');
    note.textContent = 'Please check the highlighted fields.';
    return;
  }
  const project = projects.find((p) => p.id === data.project);
  const msg = `Hi ${brand.name}, I'd like to visit ${project.name}${data.plot ? ` (plot ${data.plot})` : ''} on ${data.date}. — ${data.name.trim()}, ${data.phone}`;
  note.classList.remove('is-error');
  note.innerHTML = `Thank you, ${data.name.trim().split(' ')[0]}! We'll call you shortly to confirm your visit. <a class="link" target="_blank" rel="noopener" href="https://wa.me/${brand.whatsapp}?text=${encodeURIComponent(msg)}">Confirm on WhatsApp →</a>`;
  // TODO: POST `data` to your CRM / form backend here.
  form.reset();
  dateInput.value = data.date;
});

/* --------------------------------------------------------------- boot sequence */

function heroIntro() {
  const words = splitWords($('.hero__title'));
  const tl = gsap.timeline();
  tl.from(words, { yPercent: 120, rotate: 5, duration: 1.6, ease: 'expo.out', stagger: 0.07 }, 0.9)
    .from('#hero [data-reveal]', { y: 40, opacity: 0, duration: 1.4, ease: 'power3.out', stagger: 0.12 }, 1.3)
    .from('.nav', { yPercent: -100, opacity: 0, duration: 1.2, ease: 'power3.out' }, 0.5)
    .to('.hud', { opacity: 1, duration: 1.5 }, 1.8);
  return tl;
}

function boot() {
  buildFrames();
  initMasterplan();
  initMagnetic();
  initTilt($('#projects-track'));
  setupScrollAnimations();
  showQuote(0);

  // Warm up shaders so the first frames after the curtain are smooth
  if (world) {
    world.renderer.compile(world.scene, world.camera);
    world.update();
  }

  const counter = $('.loader__count');
  const bar = $('.loader__bar span');
  const o = { v: 0 };
  gsap
    .timeline()
    .to(o, {
      v: 100,
      duration: reduceMotion ? 0.3 : 2.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        counter.textContent = Math.round(o.v);
        bar.style.transform = `scaleX(${o.v / 100})`;
      },
    })
    .to('.loader__inner', { y: -30, opacity: 0, duration: 0.8, ease: 'power3.in' }, '+=0.15')
    .to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.4, ease: 'expo.inOut' }, '-=0.2')
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis.start();
      if (world) gsap.to(world, { intro: 0, duration: reduceMotion ? 0.01 : 5, ease: 'power2.inOut' });
      heroIntro();
    }, '-=1.2')
    .add(() => $('#loader').remove());
}

if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot);
