// Chroma (pitch-class energy) + chord matching. For live mic chord checks and offline song analysis.
import { parseChord, CHORD_TYPES, pcName } from './music.js';

/**
 * Chroma vector from a linear magnitude spectrum using spectral peaks.
 * @param {Float32Array} mag  linear magnitudes, length n/2
 * @param {number} sr sample rate
 * @param {number} n FFT size
 * @returns {Float32Array} 12 values, normalised so max = 1 (all zero if silent)
 */
export function chromaFromMag(mag, sr, n, { fmin = 70, fmax = 2400, floor = 0 } = {}) {
  const c = new Float32Array(12);
  const k0 = Math.max(2, Math.floor(fmin * n / sr)), k1 = Math.min(mag.length - 2, Math.ceil(fmax * n / sr));
  // adaptive floor: median-ish of the band to ignore noise
  let sum = 0;
  for (let k = k0; k <= k1; k++) sum += mag[k];
  const mean = sum / Math.max(1, k1 - k0 + 1);
  const thr = Math.max(floor, mean * 1.5);
  const peaks = [];
  for (let k = k0; k <= k1; k++) {
    const b = mag[k];
    if (b <= thr || b < mag[k - 1] || b < mag[k + 1]) continue;
    const a = mag[k - 1], d = mag[k + 1];
    const den = a - 2 * b + d;
    const p = den !== 0 ? 0.5 * (a - d) / den : 0;
    const f = (k + p) * sr / n;
    peaks.push({ f, amp: b - thr, midi: 69 + 12 * Math.log2(f / 440) });
  }
  // Harmonic suppression: a peak at 3x, 5x, 6x or 7x a stronger lower peak is mostly an overtone,
  // and would add a false fifth / major third to the chroma.
  for (const q of peaks) {
    let w = 1;
    for (const h of [3, 5, 6, 7]) {
      const target = q.midi - 12 * Math.log2(h);
      const base = peaks.find(o => o !== q && Math.abs(o.midi - target) < 0.3 && o.amp > q.amp * 0.3);
      if (base) { w *= 0.2; break; }
    }
    const r = Math.round(q.midi), dev = Math.abs(q.midi - r);
    if (dev > 0.4) continue;
    const lw = q.f < 330 ? 1.3 : q.f < 700 ? 1 : 0.75;
    c[((r % 12) + 12) % 12] += Math.sqrt(q.amp) * (1 - dev * 2) * lw * w;
  }
  let mx = 0;
  for (let i = 0; i < 12; i++) mx = Math.max(mx, c[i]);
  if (mx > 0) for (let i = 0; i < 12; i++) c[i] /= mx;
  return c;
}

/** Convert analyser dB data (getFloatFrequencyData) to linear magnitude. */
export function dbToMag(db, out) {
  const m = out || new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) m[i] = db[i] <= -140 ? 0 : 10 ** (db[i] / 20);
  return m;
}

/** Template for a set of pitch classes; root weighted higher, small weight on root harmonics. */
export function chordTemplate(pcs, root = pcs[0]) {
  const t = new Float32Array(12);
  pcs.forEach((p, i) => { t[p] = i === 0 ? 1 : 0.85; });
  t[root] = 1;
  return t;
}
export function cosine(a, b) {
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += a[i] * b[i]; da += a[i] * a[i]; db += b[i] * b[i]; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

/**
 * How well a chroma matches a named chord. 0..1.
 * Penalises strong energy outside the chord.
 */
export function matchChord(chroma, name) {
  const c = parseChord(name); if (!c) return 0;
  const inS = new Set(c.pcs);
  let inE = 0, outE = 0;
  for (let i = 0; i < 12; i++) (inS.has(i) ? (inE += chroma[i]) : (outE += chroma[i]));
  const cov = c.pcs.filter(p => chroma[p] > 0.25).length / c.pcs.length;
  const purity = inE / (inE + outE || 1);
  return Math.max(0, Math.min(1, 0.55 * purity + 0.45 * cov));
}

/** Default vocabulary for chord recognition: 24 major/minor triads (+ optional 7ths). */
export function chordVocab(withSevenths = false) {
  const types = withSevenths ? ['', 'm', '7', 'm7', 'maj7'] : ['', 'm'];
  const v = [];
  for (let r = 0; r < 12; r++) for (const t of types) {
    const pcs = CHORD_TYPES[t].map(i => (r + i) % 12);
    v.push({ name: pcName(r, [3, 8, 10].includes(r)) + t, pcs, tpl: chordTemplate(pcs, r) });
  }
  return v;
}

/** Rank chords for a chroma vector. @returns {{name:string, score:number}[]} */
export function rankChords(chroma, vocab = chordVocab()) {
  return vocab.map(v => ({ name: v.name, score: cosine(chroma, v.tpl) })).sort((a, b) => b.score - a.score);
}
