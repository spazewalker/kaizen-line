// Song analysis pipeline. DOM-free: runs in a module Worker, on the main thread (fallback) and in node tests.
// Input: mono Float32Array at 22050 Hz. Output: tempo, beats, bar phase, chords, key, melody notes, sections.
import { FFT, hann } from '../core/fft.js';
import { chromaFromMag } from '../core/chroma.js';
import { pcName, findKey } from '../core/music.js';

export const SR = 22050;
export const VERSION = 3;
const STAGES = [['Finding the beat', 0.12], ['Tracking beats', 0.06], ['Listening for chords', 0.22], ['Naming chords', 0.06], ['Following the melody', 0.46], ['Finding sections', 0.08]];

/** Short-time magnitude spectra, frame by frame, via callback (keeps memory low). */
async function stft(x, n, hop, fn, tick) {
  const fft = FFT.get(n), w = hann(n), re = new Float64Array(n), im = new Float64Array(n), mag = new Float32Array(n / 2);
  const T = Math.max(1, Math.floor((x.length - n) / hop) + 1);
  for (let i = 0; i < T; i++) {
    const o = i * hop;
    for (let k = 0; k < n; k++) { const v = x[o + k]; re[k] = (v === undefined ? 0 : v) * w[k]; im[k] = 0; }
    fft.transform(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    fn(mag, i);
    if (tick && (i & 255) === 255) await tick(i / T);
  }
  return T;
}

const mean = a => { let s = 0; for (const v of a) s += v; return s / (a.length || 1); };
const median = a => { const s = Array.from(a).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

// ---------------------------------------------------------------- onsets + tempo + beats
export async function onsetEnvelope(x, sr, tick) {
  const n = 2048, hop = 512;
  let prev = null; const env = [];
  const kmax = Math.floor(8000 * n / sr);
  await stft(x, n, hop, mag => {
    const L = new Float32Array(kmax);
    for (let k = 0; k < kmax; k++) L[k] = Math.log1p(100 * mag[k]);
    let f = 0;
    if (prev) for (let k = 1; k < kmax; k++) { const d = L[k] - Math.max(prev[k], prev[k - 1] || 0, prev[k + 1] || 0); if (d > 0) f += d; }
    env.push(f); prev = L;
  }, tick);
  // detrend: subtract local mean (~0.4 s), half-wave rectify, normalise
  const fps = sr / hop, W = Math.round(0.2 * fps), o = new Float32Array(env.length);
  let acc = 0; const pre = [0]; for (const v of env) pre.push(acc += v);
  for (let i = 0; i < env.length; i++) {
    const a = Math.max(0, i - W), b = Math.min(env.length, i + W + 1);
    o[i] = Math.max(0, env[i] - (pre[b] - pre[a]) / (b - a));
  }
  let sd = Math.sqrt(mean(Array.from(o, v => v * v))) || 1;
  for (let i = 0; i < o.length; i++) o[i] /= sd;
  // frame i compares window i with i-1: the attack is centred near the start of window i + n/2
  return { o, fps, t0: (n / 2) / sr - hop / sr * 0.5 + 0.028 };
}

export function estimateTempo(o, fps, { center = 110, minBpm = 50, maxBpm = 210 } = {}) {
  const Lmin = Math.floor(fps * 60 / maxBpm), Lmax = Math.ceil(fps * 60 / minBpm);
  const N = o.length, ac = new Float32Array(Lmax + 2);
  for (let L = Lmin - 1; L <= Lmax + 1; L++) { let s = 0; for (let i = L; i < N; i++) s += o[i] * o[i - L]; ac[L] = s / (N - L); }
  const acAt = l => { const a = Math.floor(l), f = l - a; return a + 1 <= Lmax + 1 ? ac[a] * (1 - f) + ac[a + 1] * f : 0; };
  let best = null;
  for (let L = Lmin; L <= Lmax; L++) {
    const bpm = 60 * fps / L;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / center) / 0.8) ** 2);
    // support from the half-period (eighth notes) and double period (half notes)
    const s = (ac[L] + 0.35 * acAt(L / 2) + 0.35 * acAt(2 * L)) * prior;
    if (!best || s > best.s) best = { L, s };
  }
  const L = best.L, a = ac[L - 1], b = ac[L], c = ac[L + 1], den = a - 2 * b + c;
  const lag = L + (den < 0 ? 0.5 * (a - c) / den : 0);
  return { bpm: 60 * fps / lag, lag };
}

/** Ellis (2007) dynamic-programming beat tracker. Returns beat frame indexes. */
export function trackBeats(o, period, tight = 100) {
  const N = o.length, P = period;
  // local score: onset smoothed with a gaussian of width P/32
  const sd = Math.max(1, P / 32), R = Math.ceil(3 * sd), g = [];
  for (let k = -R; k <= R; k++) g.push(Math.exp(-0.5 * (k / sd) ** 2));
  const loc = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < N) s += o[j] * g[k + R]; } loc[i] = s; }
  const cum = new Float32Array(N), back = new Int32Array(N).fill(-1);
  const lo = Math.round(P / 2), hi = Math.round(2 * P);
  const pen = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) pen[d] = -tight * Math.log(d / P) ** 2;
  for (let i = 0; i < N; i++) {
    let bv = -Infinity, bj = -1;
    for (let d = lo; d <= hi; d++) { const j = i - d; if (j < 0) break; const v = cum[j] + pen[d]; if (v > bv) { bv = v; bj = j; } }
    cum[i] = loc[i] + (bj >= 0 ? Math.max(0, bv) : 0);
    back[i] = bv > 0 ? bj : -1;
  }
  // last beat: highest local max of cum in the final 2 periods that is strong enough
  let end = N - 1, bestv = -Infinity;
  for (let i = Math.max(1, N - Math.round(2 * P)); i < N - 1; i++) if (cum[i] >= cum[i - 1] && cum[i] >= cum[i + 1] && cum[i] > bestv) { bestv = cum[i]; end = i; }
  const beats = [];
  for (let i = end; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  // trim weak beats at both ends (silence / fade)
  const lv = beats.map(b => loc[b]), thr = 0.25 * median(lv);
  let s = 0, e = beats.length - 1;
  while (s < e && lv[s] < thr) s++;
  while (e > s && lv[e] < thr) e--;
  return beats.slice(s, e + 1);
}

// ---------------------------------------------------------------- chroma frames
export async function chromaFrames(x, sr, tick) {
  const n = 4096, hop = 1024, T = Math.max(1, Math.floor((x.length - n) / hop) + 1);
  const chroma = new Float32Array(T * 12), bass = new Float32Array(T * 12), energy = new Float32Array(T);
  await stft(x, n, hop, (mag, i) => {
    const c = chromaFromMag(mag, sr, n, { fmin: 100, fmax: 2200 });
    chroma.set(c, i * 12);
    // bass: strongest peaks 40-170 Hz, by pitch class
    let e = 0;
    const k0 = Math.floor(40 * n / sr), k1 = Math.ceil(170 * n / sr);
    for (let k = k0; k <= k1; k++) {
      const b = mag[k];
      if (b > mag[k - 1] && b >= mag[k + 1]) {
        const a = mag[k - 1], d = mag[k + 1], den = a - 2 * b + d, p = den ? 0.5 * (a - d) / den : 0;
        const m = 69 + 12 * Math.log2((k + p) * sr / n / 440), r = Math.round(m);
        if (Math.abs(m - r) < 0.35) bass[i * 12 + ((r % 12) + 12) % 12] += b * b;
      }
    }
    for (let k = 4; k < n / 4; k++) e += mag[k] * mag[k];
    energy[i] = Math.sqrt(e);
    let bm = 0; for (let p = 0; p < 12; p++) bm = Math.max(bm, bass[i * 12 + p]);
    if (bm > 0) for (let p = 0; p < 12; p++) bass[i * 12 + p] /= bm;
  }, tick);
  return { n, hop, sr, T, chroma, bass, energy, t0: n / 2 / sr };
}

/** Average frame chroma inside each beat interval. beats: seconds. */
export function beatSync(F, beats, end) {
  const out = [];
  const ft = i => F.t0 + i * F.hop / F.sr;
  for (let b = 0; b < beats.length; b++) {
    const s = beats[b], e = b + 1 < beats.length ? beats[b + 1] : Math.min(end, s + (beats[b] - (beats[b - 1] ?? s - 0.5)));
    const d = e - s, a = s + 0.1 * d, z = e - 0.1 * d;
    let i0 = Math.max(0, Math.ceil((a - F.t0) * F.sr / F.hop)), i1 = Math.min(F.T - 1, Math.floor((z - F.t0) * F.sr / F.hop));
    if (i1 < i0) { i0 = i1 = Math.max(0, Math.min(F.T - 1, Math.round(((s + e) / 2 - F.t0) * F.sr / F.hop))); }
    const c = new Float32Array(12), bs = new Float32Array(12);
    let wsum = 0, en = 0;
    for (let i = i0; i <= i1; i++) {
      const w = Math.sqrt(F.energy[i]) + 1e-6; wsum += w; en += F.energy[i];
      for (let p = 0; p < 12; p++) { c[p] += F.chroma[i * 12 + p] * w; bs[p] += F.bass[i * 12 + p] * w; }
    }
    for (let p = 0; p < 12; p++) { c[p] /= wsum; bs[p] /= wsum; }
    out.push({ c, bass: bs, energy: en / (i1 - i0 + 1), t: s, ft: ft(i0) });
  }
  return out;
}

// ---------------------------------------------------------------- chords (HMM)
const TYPES = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]]];
export const STATES = (() => {
  const s = [];
  for (let r = 0; r < 12; r++) for (const [t, iv] of TYPES) {
    const tpl = new Float32Array(12);
    iv.forEach((v, i) => { tpl[(r + v) % 12] = i === 0 ? 1 : i === 3 ? 0.7 : 0.85; });
    s.push({ root: r, type: t, pcs: iv.map(v => (r + v) % 12), tpl });
  }
  s.push({ root: -1, type: 'N', pcs: [], tpl: null });
  return s;
})();
function cos12(a, b) { let n = 0, x = 0, y = 0; for (let i = 0; i < 12; i++) { n += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? n / Math.sqrt(x * y) : 0; }

/** Emission score of each state for one beat. */
function emissions(B, quiet) {
  return STATES.map(S => {
    if (!S.tpl) return quiet ? 0.95 : 0.35;
    let s = cos12(B.c, S.tpl);
    // bass on the root strongly supports the chord; bass on a non-chord tone argues against it
    let bmax = 0, barg = 0; for (let p = 0; p < 12; p++) if (B.bass[p] > bmax) { bmax = B.bass[p]; barg = p; }
    if (bmax > 0) s += barg === S.root ? 0.1 : S.pcs.includes(barg) ? 0.02 : -0.06;
    if (S.type === '7' || S.type === 'm7') {
      const sev = B.c[S.pcs[3]];
      s -= sev > 0.55 ? 0.005 : 0.06;    // only pick a 7th when the 7th is clearly there
    }
    return s;
  });
}

/**
 * Viterbi decode over beats. phase = index of first downbeat (0..bpb-1).
 * @returns {number[]} state index per beat
 */
export function decodeChords(sync, phase = 0, bpb = 4) {
  const T = sync.length, K = STATES.length; if (!T) return [];
  const eMed = median(sync.map(b => b.energy)) || 1;
  const beta = 30;
  const E = sync.map(B => emissions(B, B.energy < 0.08 * eMed).map(v => beta * v));
  let dp = Float64Array.from(E[0]);
  const bp = [];
  for (let t = 1; t < T; t++) {
    const pos = ((t - phase) % bpb + bpb) % bpb;
    const stay = pos === 0 ? 0.55 : pos === bpb / 2 ? 0.85 : 0.97;
    const ls = Math.log(stay), lc = Math.log((1 - stay) / (K - 1));
    let bi = 0; for (let k = 1; k < K; k++) if (dp[k] > dp[bi]) bi = k;
    const nd = new Float64Array(K), back = new Int16Array(K);
    for (let k = 0; k < K; k++) {
      const vs = dp[k] + ls, vc = dp[bi] + lc;
      if (vs >= vc || bi === k) { nd[k] = vs + E[t][k]; back[k] = k; } else { nd[k] = vc + E[t][k]; back[k] = bi; }
    }
    bp.push(back); dp = nd;
  }
  let k = 0; for (let j = 1; j < K; j++) if (dp[j] > dp[k]) k = j;
  const path = new Array(T); path[T - 1] = k;
  for (let t = T - 1; t > 0; t--) { k = bp[t - 1][k]; path[t - 1] = k; }
  // minimum duration: a lone beat becomes its better-scoring neighbour
  for (let t = 1; t < T - 1; t++) {
    if (path[t] !== path[t - 1] && path[t] !== path[t + 1]) {
      const a = path[t - 1], b = path[t + 1];
      path[t] = E[t][a] >= E[t][b] ? a : b;
    }
  }
  return path;
}

/** Bar phase: where chord changes cluster. */
export function barPhase(changes, bpb = 4) {
  const c = new Float32Array(bpb);
  changes.forEach((v, i) => { c[i % bpb] += v; });
  let p = 0; for (let i = 1; i < bpb; i++) if (c[i] > c[p]) p = i;
  return p;
}

/** Guitar-friendly root spelling: Bb, Eb, Ab, C#, F# by default; full flats in flat keys. */
const GTR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const rootName = (pc, flats) => (flats ? pcName(pc, true) : GTR[((pc % 12) + 12) % 12]);
export function stateName(k, flats) { const S = STATES[k]; return S.root < 0 ? 'N' : rootName(S.root, flats) + S.type; }
const FLAT_KEYS = { major: [5, 10, 3, 8, 1, 6], minor: [2, 7, 0, 5, 10, 3] };
export const keyUsesFlats = key => (FLAT_KEYS[key.mode] || []).includes(key.tonic);

/** Chords from frame chroma on a given beat grid (re-run after the user edits the grid). */
export function chordsForGrid(F, beats, duration, bpb = 4, phaseHint) {
  const sync = beatSync(F, beats, duration);
  let phase = phaseHint;
  if (phase == null) {
    const d = sync.map((b, i) => (i ? 1 - cos12(b.c, sync[i - 1].c) : 0));
    phase = barPhase(d, bpb);
  }
  let path = decodeChords(sync, phase, bpb);
  if (phaseHint == null) {
    const ch = path.map((k, i) => (i && k !== path[i - 1] ? 1 : 0));
    const p2 = barPhase(ch, bpb);
    if (p2 !== phase) { phase = p2; path = decodeChords(sync, phase, bpb); }
  }
  const hist = new Float32Array(12);
  sync.forEach(b => { for (let p = 0; p < 12; p++) hist[p] += b.c[p] * Math.sqrt(b.energy) + 0.5 * b.bass[p] * Math.sqrt(b.energy); });
  const key = findKey(Array.from(hist));
  const flats = keyUsesFlats(key);
  const beatChords = path.map(k => stateName(k, flats));
  return { beatChords, phase, key: { tonic: key.tonic, mode: key.mode, name: key.name }, sync };
}

/** Merge per-beat chord names into segments {t,dur,name,beat}. */
export function segments(beats, beatChords, duration) {
  const out = [];
  for (let i = 0; i < beats.length; i++) {
    const name = beatChords[i];
    if (out.length && out[out.length - 1].name === name) continue;
    out.push({ t: beats[i], name, beat: i });
  }
  out.forEach((s, i) => {
    const nb = i + 1 < out.length ? out[i + 1].beat : beats.length;
    const end = nb < beats.length ? beats[nb] : Math.min(duration, beats[beats.length - 1] + (beats[beats.length - 1] - (beats[beats.length - 2] ?? beats[beats.length - 1] - 0.5)));
    s.dur = Math.max(0.05, end - s.t);
  });
  return out;
}

// ---------------------------------------------------------------- melody
const M_LO = 40, M_HI = 84, STEP = 10, NB = (M_HI - M_LO) * 100 / STEP + 1;
export async function melody(x, sr, tick) {
  const n = 2048, hop = 320, fps = sr / hop;
  const K = 5, cands = []; // per frame: [{bin, s}]
  const harmW = [1, 0.8, 0.64, 0.51, 0.41, 0.33, 0.26, 0.21];
  const sal = new Float32Array(NB), sal1 = new Float32Array(NB);
  const k0 = Math.floor(70 * n / sr), k1 = Math.floor(5000 * n / sr);
  let frameMax = [];
  await stft(x, n, hop, mag => {
    sal.fill(0); sal1.fill(0);
    // spectral peaks
    const peaks = [];
    let mx = 0; for (let k = k0; k <= k1; k++) if (mag[k] > mx) mx = mag[k];
    const thr = mx * 0.02;
    for (let k = k0; k <= k1; k++) {
      const b = mag[k]; if (b < thr || b < mag[k - 1] || b < mag[k + 1]) continue;
      const a = mag[k - 1], d = mag[k + 1], den = a - 2 * b + d, p = den ? 0.5 * (a - d) / den : 0;
      peaks.push({ f: (k + p) * sr / n, a: Math.sqrt(b) });
    }
    peaks.sort((p, q) => q.a - p.a); peaks.length = Math.min(peaks.length, 40);
    for (const pk of peaks) {
      for (let h = 1; h <= 8; h++) {
        const f0 = pk.f / h, m = 69 + 12 * Math.log2(f0 / 440);
        if (m < M_LO - 0.5 || m > M_HI + 0.5) continue;
        const c = (m - M_LO) * 100 / STEP, ci = Math.round(c);
        for (let d = -4; d <= 4; d++) {
          const j = ci + d; if (j < 0 || j >= NB) continue;
          const dist = Math.abs(j - c) * STEP; if (dist > 45) continue;
          const add = pk.a * harmW[h - 1] * Math.cos(dist / 45 * Math.PI / 2) ** 2;
          sal[j] += add; if (h === 1) sal1[j] += add;
        }
      }
    }
    // register prior: melodies sit above the bass
    const out = [];
    for (let j = 1; j < NB - 1; j++) {
      const m = M_LO + j * STEP / 100;
      // a sung note has a real fundamental; subharmonic ghosts mostly do not
      const fund = sal[j] > 0 ? Math.min(1, 3 * sal1[j] / sal[j]) : 0;
      const v = sal[j] * (m < 50 ? 0.45 : m < 55 ? 0.8 : 1) * (0.4 + 0.6 * fund);
      if (v > 0 && sal[j] >= sal[j - 1] && sal[j] >= sal[j + 1]) out.push({ bin: j, s: v });
    }
    out.sort((p, q) => q.s - p.s); out.length = Math.min(out.length, K);
    cands.push(out); frameMax.push(out.length ? out[0].s : 0);
  }, tick);
  // normalise
  const sorted = frameMax.slice().sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  // Viterbi over K candidates + unvoiced
  const T = cands.length, UV = K, lam = 0.35, sw = 1.2, uvE = Math.log(0.30);
  let prev = new Float64Array(K + 1).fill(-1e9), prevBins = [];
  prev[UV] = 0;
  const back = [];
  for (let t = 0; t < T; t++) {
    const C = cands[t], cur = new Float64Array(K + 1).fill(-1e9), bk = new Int8Array(K + 1).fill(UV);
    for (let k = 0; k <= K; k++) {
      let e;
      if (k === UV) e = uvE; else if (k < C.length) e = Math.log(Math.min(1.5, C[k].s / p95) + 1e-4); else continue;
      let best = -1e18, bj = UV;
      for (let j = 0; j <= K; j++) {
        if (prev[j] <= -1e9) continue;
        let tr;
        if (j === UV && k === UV) tr = 0;
        else if (j === UV || k === UV) tr = -sw;
        else { const ds = Math.abs(C[k].bin - prevBins[j].bin) * STEP / 100; tr = -lam * Math.min(ds, 12) - (ds > 0.6 ? 1.0 : 0); }
        const v = prev[j] + tr; if (v > best) { best = v; bj = j; }
      }
      cur[k] = best + e; bk[k] = bj;
    }
    back.push(bk); prev = cur; prevBins = C;
  }
  let k = 0; for (let j = 1; j <= K; j++) if (prev[j] > prev[k]) k = j;
  const pitch = new Float32Array(T), conf = new Float32Array(T);
  for (let t = T - 1; t >= 0; t--) {
    if (k !== UV && cands[t][k]) { pitch[t] = M_LO + cands[t][k].bin * STEP / 100; conf[t] = Math.min(1, cands[t][k].s / p95); }
    k = back[t][k];
  }
  const t0 = (n / 2) / sr;
  return { pitch, conf, fps, t0, notes: foldOctaves(segmentNotes(pitch, conf, fps, t0)) };
}

export function segmentNotes(pitch, conf, fps, t0) {
  const notes = []; let cur = null;
  const close = () => {
    if (!cur) return;
    const ps = cur.ps.slice().sort((a, b) => a - b), m = ps[ps.length >> 1];
    const dur = cur.ps.length / fps;
    if (dur >= 0.09) notes.push({ t: +(t0 + cur.i / fps).toFixed(3), dur: +dur.toFixed(3), midi: Math.round(m), conf: +(cur.c / cur.ps.length).toFixed(2) });
    cur = null;
  };
  for (let i = 0; i < pitch.length; i++) {
    const p = pitch[i];
    if (!p) { close(); continue; }
    if (cur) {
      const ref = cur.ps.slice(-6).sort((a, b) => a - b)[Math.min(2, cur.ps.slice(-6).length - 1)];
      if (Math.abs(p - ref) > 0.7) {
        // only split if the new pitch holds for 3 frames
        let hold = 0; for (let j = i; j < Math.min(pitch.length, i + 3); j++) if (pitch[j] && Math.abs(pitch[j] - p) < 0.5) hold++;
        if (hold >= 3) close();
      }
    }
    if (!cur) cur = { i, ps: [], c: 0 };
    cur.ps.push(p); cur.c += conf[i];
  }
  close();
  // merge same-pitch notes split by a tiny gap
  const out = [];
  for (const nt of notes) {
    const l = out[out.length - 1];
    if (l && l.midi === nt.midi && nt.t - (l.t + l.dur) < 0.05) { l.dur = +(nt.t + nt.dur - l.t).toFixed(3); } else out.push(nt);
  }
  return out;
}

// ---------------------------------------------------------------- sections
export function sections(sync, beats, phase, duration, bpb = 4) {
  const bars = [];
  for (let i = phase; i + bpb <= sync.length; i += bpb) {
    const v = new Float32Array(12 * bpb);
    for (let j = 0; j < bpb; j++) v.set(sync[i + j].c, j * 12);
    bars.push({ v, beat: i });
  }
  const B = bars.length;
  if (B < 8) return [{ name: 'A', t0: beats[0] || 0, t1: duration, bar: 0 }];
  const cosv = (a, b) => { let n = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { n += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? n / Math.sqrt(x * y) : 0; };
  const S = Array.from({ length: B }, (_, i) => Float32Array.from({ length: B }, (_, j) => cosv(bars[i].v, bars[j].v)));
  const L = 4, nov = new Float32Array(B);
  for (let i = L; i <= B - L; i++) {
    let s = 0;
    for (let a = -L; a < L; a++) for (let b = -L; b < L; b++) {
      const sign = (a < 0) === (b < 0) ? 1 : -1;
      const w = Math.exp(-0.5 * (((a + 0.5) / L) ** 2 + ((b + 0.5) / L) ** 2) * 2);
      s += sign * w * S[i + a][i + b];
    }
    nov[i] = s;
  }
  const nv = Array.from(nov), m = mean(nv), sd = Math.sqrt(mean(nv.map(v => (v - m) ** 2)));
  const bounds = [0];
  for (let i = 1; i < B - 1; i++) {
    if (nov[i] > m + 0.5 * sd && nov[i] >= nov[i - 1] && nov[i] >= nov[i + 1] && i - bounds[bounds.length - 1] >= 4) bounds.push(i);
  }
  // songs move in 4- and 8-bar phrases: snap boundaries that are within a bar of a 4-bar line
  const snapped = [...new Set(bounds.map(b => (Math.abs(b - Math.round(b / 4) * 4) <= 1 ? Math.round(b / 4) * 4 : b)))].sort((a, b) => a - b)
    .filter((b, i, a) => b < B && (i === 0 || b - a[i - 1] >= 4));
  const segs = snapped.map((b, i) => ({ b0: b, b1: i + 1 < snapped.length ? snapped[i + 1] : B }));
  // label: reuse an earlier letter when the bars line up
  const labels = [];
  segs.forEach((sg, i) => {
    let lab = null;
    for (let j = 0; j < i && !lab; j++) {
      const o = segs[j], len = Math.min(sg.b1 - sg.b0, o.b1 - o.b0);
      let s = 0; for (let k = 0; k < len; k++) s += S[sg.b0 + k][o.b0 + k];
      if (s / len > 0.88) lab = labels[j];
    }
    labels.push(lab || String.fromCharCode(65 + new Set(labels).size));
  });
  return segs.map((sg, i) => ({
    name: labels[i], bar: sg.b0,
    t0: +(sg.b0 === 0 ? 0 : beats[bars[sg.b0].beat]).toFixed(3),
    t1: +(i + 1 < segs.length ? beats[bars[segs[i + 1].b0].beat] : duration).toFixed(3),
  }));
}

/** Tempo from a robust linear fit of beat time vs beat index (sub-frame precise). */
export function gridBpm(beats) {
  if (beats.length < 4) return 0;
  const iv = beats.slice(1).map((b, i) => b - beats[i]), med = median(iv);
  // fit only over runs where the spacing is regular (skips dropped / doubled beats)
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
  for (let i = 0; i < beats.length; i++) {
    if (i > 0) { const r = iv[i - 1] / med; k += Math.max(1, Math.round(r)); if (Math.abs(r - Math.round(r)) > 0.25) continue; }
    n++; sx += k; sy += beats[i]; sxx += k * k; sxy += k * beats[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope > 0 ? +(60 / slope).toFixed(2) : 0;
}

/** Fold notes that jump an octave away from the local melodic contour (typical pitch-tracker error). */
export function foldOctaves(notes) {
  const out = notes.map(n => ({ ...n }));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      const nb = out.slice(Math.max(0, i - 4), i + 5).filter((_, j, a) => a[j] !== out[i]).map(n => n.midi).sort((a, b) => a - b);
      if (!nb.length) continue;
      const med = nb[nb.length >> 1];
      while (out[i].midi - med > 9) out[i].midi -= 12;
      while (med - out[i].midi > 9) out[i].midi += 12;
    }
  }
  return out;
}

// ---------------------------------------------------------------- full pipeline
/**
 * @param {Float32Array} x mono samples at `sr` (22050 recommended)
 * @param {number} sr
 * @param {{onProgress?:(p:{stage:string,p:number})=>void, tick?:()=>Promise<void>}} opts
 */
export async function analyze(x, sr, opts = {}) {
  const t0 = Date.now();
  const report = opts.onProgress || (() => {});
  let base = 0;
  const stage = i => { const [name, w] = STAGES[i]; const b = base; base += w; report({ stage: name, p: b }); return async f => { report({ stage: name, p: b + w * f }); if (opts.tick) await opts.tick(); }; };
  const duration = x.length / sr;

  let tk = stage(0);
  const { o, fps, t0: ot } = await onsetEnvelope(x, sr, tk);
  const tempo = estimateTempo(o, fps);
  tk = stage(1);
  let bf = trackBeats(o, tempo.lag);
  let beats = bf.map(i => +(ot + i / fps).toFixed(4));
  // refine tempo from the beat grid (median spacing, robust to a few misses)
  const bpm = gridBpm(beats) || tempo.bpm;
  await tk(1);

  tk = stage(2);
  const F = await chromaFrames(x, sr, tk);
  tk = stage(3);
  const ch = chordsForGrid(F, beats, duration);
  await tk(1);

  tk = stage(4);
  const mel = opts.skipMelody ? { notes: [] } : await melody(x, sr, tk);

  tk = stage(5);
  const secs = sections(ch.sync, beats, ch.phase, duration);
  await tk(1);
  report({ stage: 'Done', p: 1 });
  return {
    version: VERSION, duration, sr,
    bpm: +bpm.toFixed(2), beatsPerBar: 4, phase: ch.phase, beats,
    beatChords: ch.beatChords, chords: segments(beats, ch.beatChords, duration),
    key: ch.key, melody: mel.notes, sections: secs,
    frames: { n: F.n, hop: F.hop, sr: F.sr, T: F.T, t0: F.t0, chroma: F.chroma, bass: F.bass, energy: F.energy },
    ms: Date.now() - t0,
  };
}
