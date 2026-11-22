// Canvas components: scrolling pitch lanes (SingStar / Yousician style) and a vertical pitch meter.
import { fitCanvas } from '../../core/ui.js';
import { noteName, SHARP } from '../../core/music.js';
import { noteHit } from './score.js';

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
};
export function palette() {
  const d = isDark();
  return d ? {
    bg: '#1c1f2d', rowA: '#20243380', rowKey: 'rgba(240,180,74,.08)', grid: '#2f3447', gridC: '#4a5070', label: '#a4a2ad', ink: '#f1ece3',
    note: '#e7a93c', noteDim: 'rgba(231,169,60,.35)', now: '#ff7a66', ok: '#5fd69a', close: '#f0d24a', bad: '#ff7a66', trailDim: 'rgba(241,236,227,.35)',
  } : {
    bg: '#ffffff', rowA: '#faf7f1', rowKey: 'rgba(176,101,10,.07)', grid: '#ece7de', gridC: '#d2cbbe', label: '#66656e', ink: '#1b1c22',
    note: '#b0650a', noteDim: 'rgba(176,101,10,.3)', now: '#d93a26', ok: '#17804a', close: '#c99a00', bad: '#c0321f', trailDim: 'rgba(27,28,34,.3)',
  };
}
export const accColor = (P, cents) => cents == null ? P.trailDim : Math.abs(cents) <= 25 ? P.ok : Math.abs(cents) <= 50 ? P.close : P.bad;

/**
 * Scrolling pitch lanes.
 *  - x = time (now line at nowFrac of width), y = pitch (higher = up)
 *  - target bars, the singer's trail, hit bursts, hint arrow
 */
export class Lanes {
  constructor(parent, o = {}) {
    this.o = { pxPerSec: 150, nowFrac: 0.3, low: 48, high: 67, keyTonic: null, mode: 'major', labelAll: false, ...o };
    this.c = fitCanvas(parent);
    this.notes = [];
    this.trail = [];
    this.parts = [];
    this.time = 0;
    this.cur = null; // {midi, cents}
    this.hint = '';
    this.setRange(this.o.low, this.o.high);
  }
  setRange(low, high) {
    const pad = 2.5;
    this.lo = Math.floor(low - pad); this.hi = Math.ceil(high + pad);
    if (this.hi - this.lo < 10) { const m = (this.hi + this.lo) / 2; this.lo = Math.floor(m - 5); this.hi = Math.ceil(m + 5); }
  }
  setNotes(notes, fit = true) {
    this.notes = notes;
    if (fit && notes.length) { const ms = notes.map(n => n.midi); this.setRange(Math.min(...ms), Math.max(...ms)); }
  }
  y(m) { const { h } = this.c, top = 14, bot = 14; return top + (this.hi - m) / (this.hi - this.lo) * (h - top - bot); }
  x(t) { return this.c.w * this.o.nowFrac + (t - this.time) * this.o.pxPerSec; }
  /** add a trail point. cents relative to the current target (null = no target) */
  push(t, midi, cents) {
    this.trail.push({ t, m: midi, c: cents });
    const cut = this.time - (this.c.w * this.o.nowFrac) / this.o.pxPerSec - 1;
    while (this.trail.length && this.trail[0].t < cut) this.trail.shift();
  }
  clearTrail() { this.trail = []; }
  burst(t, midi, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
      this.parts.push({ x: this.x(t), y: this.y(midi), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.7, color });
    }
  }
  draw(dt = 1 / 60) {
    const { g, w, h } = this.c, P = palette(), o = this.o;
    if (!w || !h) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = P.bg; g.fillRect(0, 0, w, h);
    const rowH = (h - 28) / (this.hi - this.lo);
    const inKey = m => {
      if (o.keyTonic == null) return false;
      const d = (((m - o.keyTonic) % 12) + 12) % 12;
      return (o.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).includes(d);
    };
    // rows
    g.font = `700 ${Math.max(10, Math.min(13, rowH * 0.8))}px "M PLUS Rounded 1c", system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let m = this.lo; m <= this.hi; m++) {
      const y = this.y(m);
      if (inKey(m)) { g.fillStyle = P.rowKey; g.fillRect(0, y - rowH / 2, w, rowH); }
      const nat = !SHARP[((m % 12) + 12) % 12].includes('#');
      g.strokeStyle = m % 12 === 0 ? P.gridC : P.grid; g.lineWidth = m % 12 === 0 ? 1.5 : 1;
      if (nat || o.labelAll) { g.beginPath(); g.moveTo(34, y); g.lineTo(w, y); g.stroke(); }
      if ((nat && rowH > 7) || (o.labelAll && rowH > 11)) { g.fillStyle = P.label; g.fillText(noteName(m), 4, y); }
    }
    // now line
    const nx = w * o.nowFrac;
    g.strokeStyle = P.now; g.lineWidth = 2; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(nx, 6); g.lineTo(nx, h - 6); g.stroke(); g.globalAlpha = 1;
    // notes (clipped so they never cover the note labels)
    g.save(); g.beginPath(); g.rect(32, 0, w - 32, h); g.clip();
    const bh = Math.max(8, Math.min(22, rowH * 0.8));
    for (const n of this.notes) {
      const x0 = this.x(n.t), x1 = this.x(n.t + n.dur);
      if (x1 < 30 || x0 > w) continue;
      const y = this.y(n.midi), active = this.time >= n.t && this.time <= n.t + n.dur;
      const hit = n.hit != null ? n.hit : (this.time > n.t + n.dur ? noteHit(n) : null);
      g.fillStyle = hit != null ? (hit >= 0.7 ? P.ok : hit >= 0.4 ? P.close : P.bad) : (active ? P.note : P.noteDim);
      if (hit != null) g.globalAlpha = 0.55;
      roundRect(g, Math.max(30, x0), y - bh / 2, Math.max(4, x1 - Math.max(30, x0)), bh, bh / 2);
      g.fill(); g.globalAlpha = 1;
      if (active) { g.strokeStyle = P.note; g.lineWidth = 2; roundRect(g, Math.max(30, x0) - 2, y - bh / 2 - 2, x1 - Math.max(30, x0) + 4, bh + 4, bh / 2 + 2); g.stroke(); }
      if (n.label && x0 > 30) { g.fillStyle = P.ink; g.fillText(n.label, x0 + 4, y - bh); }
    }
    // trail
    g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      if (!a.m || !b.m || b.t - a.t > 0.12 || Math.abs(a.m - b.m) > 2) continue;
      g.strokeStyle = accColor(P, b.c);
      g.beginPath(); g.moveTo(this.x(a.t), this.y(a.m)); g.lineTo(this.x(b.t), this.y(b.m)); g.stroke();
    }
    g.restore();
    // current pitch dot + hint arrow
    if (this.cur && this.cur.midi) {
      const y = this.y(Math.max(this.lo, Math.min(this.hi, this.cur.midi))), col = accColor(P, this.cur.cents);
      g.fillStyle = col; g.beginPath(); g.arc(nx, y, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = P.bg; g.lineWidth = 2; g.stroke();
      if (this.cur.cents != null && Math.abs(this.cur.cents) > 25) {
        const up = this.cur.cents < 0, ay = y + (up ? -20 : 20);
        g.fillStyle = col; g.beginPath(); g.moveTo(nx, ay + (up ? -10 : 10)); g.lineTo(nx - 8, ay); g.lineTo(nx + 8, ay); g.closePath(); g.fill();
      }
    }
    // particles
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
      g.globalAlpha = Math.max(0, p.life / 0.7); g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter(p => p.life > 0);
  }
  destroy() { this.c.destroy(); this.c.cv.remove(); }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export { roundRect };

/**
 * Vertical pitch meter around one target note: band, the singer's marker and a short scrolling trail.
 * window = semitones shown above and below the target.
 */
export class Meter {
  constructor(parent, { window = 5, tol = 50 } = {}) {
    this.c = fitCanvas(parent); this.win = window; this.tol = tol;
    this.target = 60; this.hist = []; this.fill = 0; this.label = '';
  }
  setTarget(m, label = noteName(m)) { this.target = m; this.label = label; this.hist = []; }
  push(midi) { this.hist.push(midi || 0); if (this.hist.length > 120) this.hist.shift(); }
  draw() {
    const { g, w, h } = this.c, P = palette();
    if (!w || !h) return;
    g.clearRect(0, 0, w, h); g.fillStyle = P.bg; g.fillRect(0, 0, w, h);
    const y = m => h / 2 - (m - this.target) / this.win * (h / 2 - 16);
    g.font = '700 12px "M PLUS Rounded 1c", system-ui'; g.textBaseline = 'middle';
    for (let k = -this.win; k <= this.win; k++) {
      const m = this.target + k, yy = y(m);
      g.strokeStyle = k === 0 ? P.gridC : P.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(40, yy); g.lineTo(w, yy); g.stroke();
      g.fillStyle = P.label; g.fillText(noteName(m), 4, yy);
    }
    // tolerance band
    const bt = y(this.target + this.tol / 100), bb = y(this.target - this.tol / 100);
    g.fillStyle = P.ok; g.globalAlpha = 0.18; g.fillRect(40, bt, w - 40, bb - bt); g.globalAlpha = 1;
    g.strokeStyle = P.ok; g.lineWidth = 3; g.beginPath(); g.moveTo(40, y(this.target)); g.lineTo(w, y(this.target)); g.stroke();
    // trail (right = now)
    const n = this.hist.length, step = (w - 60) / 120;
    g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a = this.hist[i - 1], b = this.hist[i];
      if (!a || !b || Math.abs(a - b) > 2) continue;
      const cl = v => Math.max(this.target - this.win - 0.5, Math.min(this.target + this.win + 0.5, v));
      g.strokeStyle = accColor(P, 100 * (b - this.target));
      g.beginPath(); g.moveTo(w - 20 - (n - i) * step - step, y(cl(a))); g.lineTo(w - 20 - (n - i) * step, y(cl(b))); g.stroke();
    }
    const last = this.hist[n - 1];
    if (last) {
      const cents = 100 * (last - this.target), yy = y(Math.max(this.target - this.win - 0.5, Math.min(this.target + this.win + 0.5, last)));
      g.fillStyle = accColor(P, cents); g.beginPath(); g.arc(w - 20, yy, 11, 0, Math.PI * 2); g.fill();
    }
  }
  destroy() { this.c.destroy(); this.c.cv.remove(); }
}
