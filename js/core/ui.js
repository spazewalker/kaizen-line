// UI helpers shared by every track. Plain DOM, no framework.
import { mic } from './mic.js';
import { shapeFor, STRING_NAMES } from './music.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rnd = n => Math.floor(Math.random() * n);
export const pick = a => a[rnd(a.length)];
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Create an element from an HTML string (single root). */
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/** Toast message at the bottom of the screen. */
export function toast(msg, ms = 2400) {
  const host = $('#toast');
  const t = el(`<div class="toast" role="status">${esc(msg)}</div>`);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

/**
 * Modal dialog. buttons: [{label, value, primary}] -> resolves with value.
 */
export function modal({ title, html = '', buttons = [{ label: 'OK', value: true, primary: true }] }) {
  return new Promise(res => {
    const m = el(`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div class="modal-body">${html}</div><div class="row">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : 'ghost'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div></div>`);
    document.body.appendChild(m);
    m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { m.remove(); res(buttons[+b.dataset.i].value); } });
    $('button.primary', m)?.focus();
  });
}

/**
 * Shows a mic permission card in `stage` and waits for the user to allow the mic.
 * Resolves true when the mic is open, false if the user picks "skip".
 * @param {HTMLElement} stage
 * @param {object} o why: sentence about what the game listens for; allowSkip: show a skip button
 */
export function micGate(stage, { why = 'This exercise listens to you through the microphone.', allowSkip = false, tips = '' } = {}) {
  if (mic.active) return Promise.resolve(true);
  return new Promise(res => {
    stage.innerHTML = `<div class="card center micgate">
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><rect x="22" y="6" width="20" height="34" rx="10" fill="currentColor"/><path d="M14 30a18 18 0 0 0 36 0M32 48v10M22 58h20" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/></svg>
      <h2>Let the app listen</h2><p>${why}</p>${tips ? `<p class="muted">${tips}</p>` : ''}
      <button class="btn primary big" data-go>Allow microphone</button>
      ${allowSkip ? '<button class="btn ghost" data-skip>Play without the mic</button>' : ''}
      <p class="err" hidden></p></div>`;
    stage.querySelector('[data-go]').onclick = async () => {
      try { await mic.acquire(); res(true); } catch (e) { const p = stage.querySelector('.err'); p.hidden = false; p.textContent = e.message; }
    };
    const sk = stage.querySelector('[data-skip]'); if (sk) sk.onclick = () => res(false);
  });
}

/** Horizontal progress bar html. v 0..1 */
export const bar = (v, color = 'var(--trk)') => `<div class="bar"><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%;background:${color}"></b></div>`;
export const stars = n => `<span class="stars" aria-label="${n} of 3 stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;

/**
 * Chord chart SVG.
 * @param {string|{f:number[],fi?:number[],barre?:number,name?:string}} chord  name or shape
 * @param {object} o size (px width), showFingers, highlight: array of string indexes to ring
 */
export function chordSVG(chord, { size = 150, showFingers = true, label = true } = {}) {
  const sh = typeof chord === 'string' ? shapeFor(chord) : chord;
  if (!sh) return `<div class="muted">No chart for ${esc(chord)}</div>`;
  const name = typeof chord === 'string' ? chord : (sh.name || '');
  const played = sh.f.filter(v => v > 0);
  const lo = played.length ? Math.min(...played) : 1, hi = played.length ? Math.max(...played) : 1;
  const start = hi <= 4 ? 1 : lo; // first fret shown
  const W = 150, H = 185, x = i => 22 + i * 21.2, y = j => 42 + j * 30;
  let s = `<svg class="chordsvg" viewBox="0 0 ${W} ${H}" width="${size}" role="img" aria-label="${esc(name)} chord chart">`;
  if (label && name) s += `<text x="${W / 2}" y="14" text-anchor="middle" class="cname">${esc(name)}</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${x(i)}" y1="${y(0)}" x2="${x(i)}" y2="${y(4)}" class="str" stroke-width="${1.6 - i * 0.12}"/>`;
  for (let j = 0; j <= 4; j++) s += `<line x1="${x(0)}" y1="${y(j)}" x2="${x(5)}" y2="${y(j)}" class="fr" stroke-width="${j === 0 && start === 1 ? 6 : 1.4}"/>`;
  if (start > 1) s += `<text x="4" y="${y(0) + 20}" class="fnum">${start}</text>`;
  sh.f.forEach((v, i) => { if (v <= 0) s += `<text x="${x(i)}" y="${y(0) - 7}" text-anchor="middle" class="oc">${v < 0 ? '×' : '○'}</text>`; });
  if (sh.barre && sh.barre >= start) {
    const bs = sh.f.findIndex(v => v === sh.barre), be = 5 - [...sh.f].reverse().findIndex(v => v === sh.barre);
    if (be > bs) s += `<rect x="${x(bs) - 9}" y="${y(sh.barre - start) + 6}" width="${x(be) - x(bs) + 18}" height="18" rx="9" class="dotc"/>`;
  }
  sh.f.forEach((v, i) => {
    if (v > 0) {
      const cy = y(v - start) + 15;
      s += `<circle cx="${x(i)}" cy="${cy}" r="9" class="dotc"/>`;
      if (showFingers && sh.fi && sh.fi[i]) s += `<text x="${x(i)}" y="${cy + 4.5}" text-anchor="middle" class="fing">${sh.fi[i]}</text>`;
    }
  });
  STRING_NAMES.forEach((n, i) => { s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="sn">${n}</text>`; });
  return s + '</svg>';
}

/** Result screen after a game or session. Returns a promise that resolves when the user taps continue. */
export function resultScreen(stage, { title = 'Done', score = 0, lines = [], cta = 'Continue', extra = '' }) {
  return new Promise(res => {
    const p = Math.round(score * 100);
    const msg = p >= 90 ? 'Excellent!' : p >= 70 ? 'Nice work.' : p >= 45 ? 'Good practice. It gets easier each time.' : 'Good start. Repeat it tomorrow and watch it climb.';
    stage.innerHTML = `<div class="card center result"><div class="bignum">${p}%</div><h2>${esc(title)}</h2><p>${msg}</p>${lines.map(l => `<p class="muted">${l}</p>`).join('')}${extra}<button class="btn primary big" data-c>${esc(cta)}</button></div>`;
    stage.querySelector('[data-c]').onclick = () => res();
  });
}

/** Big centered countdown (3,2,1) inside an element. */
export async function countdown(elm, n = 3) {
  for (let i = n; i > 0; i--) { elm.innerHTML = `<div class="count">${i}</div>`; await sleep(700); }
  elm.innerHTML = '';
}

/** Draw-loop helper with automatic stop. */
export function loop(fn) {
  let on = true, raf = 0, last = performance.now();
  const step = t => { if (!on) return; const dt = Math.min(0.1, (t - last) / 1000); last = t; fn(dt, t); raf = requestAnimationFrame(step); };
  raf = requestAnimationFrame(step);
  return () => { on = false; cancelAnimationFrame(raf); };
}

/** Make a canvas fill its parent at device pixel ratio. Returns {cv, g, w, h, resize}. */
export function fitCanvas(parent) {
  const cv = document.createElement('canvas'); parent.appendChild(cv);
  const g = cv.getContext('2d');
  const o = { cv, g, w: 0, h: 0 };
  o.resize = () => {
    const r = parent.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    o.w = r.width; o.h = r.height;
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    g.setTransform(d, 0, 0, d, 0, 0);
  };
  o.resize();
  const ro = new ResizeObserver(() => o.resize()); ro.observe(parent);
  o.destroy = () => ro.disconnect();
  return o;
}

/** Read a CSS variable from :root (for canvas colors). */
/** Resolved CSS colour of a variable (handles light-dark()), safe for canvas fillStyle. */
let probe = null;
export function cssVar(name, elm = document.documentElement) {
  const raw = getComputedStyle(elm).getPropertyValue(name).trim();
  if (!raw || !/light-dark|var\(|color-mix/.test(raw)) return raw;
  if (!probe) { probe = document.createElement('i'); probe.style.display = 'none'; document.body.appendChild(probe); }
  probe.style.color = raw;
  (elm === document.documentElement ? document.body : elm).appendChild(probe);
  return getComputedStyle(probe).color || raw;
}
