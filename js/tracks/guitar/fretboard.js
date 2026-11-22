// Shared guitar UI pieces: horizontal fretboard, live mic HUD, rhythm pattern strip, stylesheet loader.
import { OPEN_STRINGS, STRING_NAMES, noteName } from '../../core/music.js';
import { settings } from '../../core/store.js';
import { esc } from '../../core/ui.js';

export function useGuitarCss() {
  if (!document.querySelector('link[data-css=gt]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'css/guitar.css'; l.dataset.css = 'gt';
    document.head.append(l);
  }
}

export const noteNameOf = (s, f) => noteName(OPEN_STRINGS[s] + f).replace(/\d+$/, '');
const INLAY = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1 };

/**
 * Horizontal fretboard (like looking down at the neck). High e on top, low E at the bottom (tab order).
 * @param {object} o frets (last fret shown), from (first fret, default 0 = open), marks [{s,f,cls,label}], tappable
 * Buttons have data-s (0 = low E) and data-f.
 */
export function fretboardHTML({ from = 0, frets = 5, marks = [], tappable = false, names = true } = {}) {
  const lh = settings.get().leftHanded;
  const cols = [];
  for (let f = from; f <= frets; f++) cols.push(f);
  const mk = new Map(marks.map(m => [`${m.s}:${m.f}`, m]));
  let h = `<div class="gt-board ${lh ? 'lh' : ''}" style="--cols:${cols.length}" role="${tappable ? 'grid' : 'img'}" aria-label="Fretboard">`;
  for (let s = 5; s >= 0; s--) {
    h += `<div class="gt-row">${names ? `<span class="gt-sname">${STRING_NAMES[s]}</span>` : ''}`;
    for (const f of cols) {
      const m = mk.get(`${s}:${f}`);
      const tag = tappable ? 'button' : 'span';
      h += `<${tag} class="gt-cell ${f === 0 ? 'open' : ''} ${m ? 'mk ' + (m.cls || '') : ''}" data-s="${s}" data-f="${f}" ${tappable ? `aria-label="${STRING_NAMES[s]} string fret ${f}"` : ''}><i class="gt-str" style="--w:${1 + (5 - s) * 0.35}px"></i>${m ? `<b>${esc(m.label ?? '')}</b>` : ''}</${tag}>`;
    }
    h += '</div>';
  }
  h += `<div class="gt-row gt-nums">${names ? '<span class="gt-sname"></span>' : ''}${cols.map(f => `<span class="gt-fnum">${f === 0 ? '' : f}${INLAY[f] ? `<i class="inlay${INLAY[f] === 2 ? ' dbl' : ''}"></i>` : ''}</span>`).join('')}</div></div>`;
  return h;
}

/** Small live mic HUD: level bar + text. Returns {el, update(frameOrNull, text)} */
export function micHud() {
  const el = document.createElement('div');
  el.className = 'gt-hud';
  el.innerHTML = '<span class="gt-mic" aria-hidden="true"></span><div class="gt-lvl"><b></b></div><span class="gt-hudtxt">Listening…</span>';
  const b = el.querySelector('b'), tx = el.querySelector('.gt-hudtxt');
  return {
    el,
    level(rms, gate) { b.style.width = Math.min(100, rms / Math.max(0.02, gate * 6) * 100) + '%'; b.classList.toggle('hot', rms > gate); },
    text(t) { tx.textContent = t; },
  };
}

/** Rhythm pattern strip. pattern: string of 'D','U','.' (8 slots = one 4/4 bar of eighths). */
export function patternHTML(p, { active = -1, labels = true } = {}) {
  const slots = [...p];
  const per = slots.length === 6 ? 2 : 2;
  return `<div class="gt-pat" style="--n:${slots.length}">${slots.map((c, i) => `<span class="gt-slot ${c === 'D' ? 'd' : c === 'U' ? 'u' : ''} ${i === active ? 'cur' : ''}" data-i="${i}">${c === 'D' ? '↓' : c === 'U' ? '↑' : ''}${labels ? `<small>${i % per ? '&amp;' : i / per + 1}</small>` : ''}</span>`).join('')}</div>`;
}

/** Fret-tap chord builder grid (vertical, like a chord chart). Returns html; buttons data-s/data-f, nut data-n. */
export function builderHTML(f, { frets = 5 } = {}) {
  const lh = settings.get().leftHanded;
  const order = lh ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
  let h = `<div class="gt-build">`;
  for (const s of order) h += `<button class="gt-nut" data-n="${s}" aria-label="${STRING_NAMES[s]} string open or muted">${f[s] < 0 ? '×' : f[s] === 0 ? '○' : ''}</button>`;
  for (let r = 1; r <= frets; r++) for (const s of order) h += `<button class="gt-bf ${f[s] === r ? 'on' : ''}" data-s="${s}" data-f="${r}" aria-label="${STRING_NAMES[s]} string fret ${r}"><i></i></button>`;
  h += order.map(s => `<span class="gt-bl">${STRING_NAMES[s]}</span>`).join('') + '</div>';
  return h;
}

// Canvas needs real colors; CSS variables here use light-dark(), so resolve them through a probe element.
const _cc = new Map(); let _ccT = 0;
export function col(v) {
  const now = performance.now();
  if (now - _ccT > 1000) { _cc.clear(); _ccT = now; }
  if (!_cc.has(v)) {
    const d = document.createElement('i');
    d.style.cssText = `display:none;color:var(${v})`;
    (document.getElementById('app') || document.body).append(d);
    _cc.set(v, getComputedStyle(d).color || '#888');
    d.remove();
  }
  return _cc.get(v);
}
