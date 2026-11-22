// Guitar mic engine: notes, chords, strums. Shared by games, the chord highway, the note highway and the tuner.
//
//   const ear = await new GuitarEar().start();   // opens the mic, measures room noise for ~0.5 s
//   ear.on(f => ...)        // every animation frame: {t, rms, pitch, midi, chroma, onset}
//   ear.onStrum(s => ...)   // confirmed strum/pluck attacks: {t (latency-compensated ctx time), rawT, strength}
//   ear.chordScore('Em')    // 0..1 how well the last ~0.3 s matches the chord
//   ear.stop()
//
// Times: `rawT` = AudioContext time the sound reached the analyser. `t` = rawT - settings.latencyMs,
// i.e. the time the player actually played (comparable to scheduled metronome times).
import { mic, micLoop } from '../../core/mic.js';
import { getCtx } from '../../core/audio.js';
import { PitchDetector, PitchSmoother } from '../../core/pitch.js';
import { dbToMag, chromaFromMag, matchChord, rankChords, chordVocab } from '../../core/chroma.js';
import { parseChord, shapeFor, OPEN_STRINGS, STRING_NAMES, pcName, noteName } from '../../core/music.js';
import { settings } from '../../core/store.js';

export const FFT_SIZE = 8192;
const BLOCK = 256;
export const STRING_LABEL = ['low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'high e (1st)'];

export class GuitarEar {
  constructor({ pitchMax = 1400 } = {}) {
    this.subs = new Set(); this.strumSubs = new Set();
    this.frames = []; this.pitchMax = pitchMax; this.on_ = false;
  }

  /** Opens the mic. Throws (friendly message) if the mic is unavailable. */
  async start() {
    await mic.acquire({ fftSize: FFT_SIZE });
    this.sr = mic.sampleRate; this.n = mic.fftSize;
    this.pd = new PitchDetector(4096, this.sr);
    this.sm = new PitchSmoother(5);
    this.mag = new Float32Array(this.n / 2);
    this.lat = (settings.get().latencyMs || 0) / 1000;
    this.noise = 0.003; this.hpNoise = 1e-6;
    this.calib = []; this.hpCalib = [];
    this.calibUntil = getCtx().currentTime + 0.5;
    this.env = 0; this.lastT = null; this.lastOnset = -9;
    this.pending = []; // onsets waiting for confirmation
    this.blocks = [];  // recent {rawT, e} hp-energy blocks (1.5 s)
    this.on_ = true;
    this.stopLoop = micLoop((m, t) => this._frame(m, t));
    return this;
  }
  stop() { if (!this.on_) return; this.on_ = false; if (this.stopLoop) this.stopLoop(); mic.release(); }
  get active() { return this.on_; }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  onStrum(fn) { this.strumSubs.add(fn); return () => this.strumSubs.delete(fn); }
  /** RMS level that counts as "sound" (above the room noise). */
  get gate() { return Math.max(0.005, this.noise * 3); }
  get calibrating() { return getCtx().currentTime < this.calibUntil; }

  _frame(m, t) {
    const buf = m.time();
    const L = buf.length;
    let ss = 0;
    for (let i = L - 2048; i < L; i++) ss += buf[i] * buf[i];
    const rms = Math.sqrt(ss / 2048);
    this._onsets(buf, t);
    if (t < this.calibUntil) {
      this.calib.push(rms);
      const s = this.calib.slice().sort((a, b) => a - b);
      this.noise = s[s.length >> 1];
    }
    let pitch = { freq: 0, midi: 0, clarity: 0 };
    if (rms > this.gate) pitch = this.pd.detect(buf, { minF: 70, maxF: this.pitchMax, rmsMin: this.gate * 0.8, k: 0.88, minClarity: 0.75 });
    const midi = this.sm.push(pitch.freq ? pitch.midi : 0);
    let chroma = null, mag = null;
    if (rms > this.gate * 1.2) {
      mag = dbToMag(m.spectrumDb(), new Float32Array(this.n / 2));
      chroma = chromaFromMag(mag, this.sr, this.n, { fmin: 75, fmax: 1500 });
    }
    const f = { t: t - this.lat, rawT: t, rms, pitch, midi, chroma, mag };
    this.frames.push(f);
    while (this.frames.length && this.frames[0].rawT < t - 1.5) this.frames.shift();
    for (const old of this.frames) { if (old.rawT < t - 0.7) old.mag = null; else break; }
    this._confirm(t);
    this.subs.forEach(fn => fn(f));
  }

  // High-passed block energy on the newest samples -> onset candidates with ~5 ms resolution.
  _onsets(buf, t) {
    const L = buf.length;
    // index in this buffer of the first sample not yet processed
    let start = this.lastEnd == null ? L - 2048 : Math.round(L - (t - this.lastEnd) * this.sr);
    start = Math.max(1, Math.min(L, start));
    if (L - start > L - 2) start = 1;
    let b = start;
    for (; b + BLOCK <= L; b += BLOCK) {
      let e = 0;
      for (let i = b; i < b + BLOCK; i++) { const d = buf[i] - buf[i - 1]; e += d * d; }
      e /= BLOCK;
      const rawT = t - (L - (b + BLOCK)) / this.sr;
      this.blocks.push({ rawT, e });
      if (t < this.calibUntil) {
        this.hpCalib.push(e);
        const s = this.hpCalib.slice().sort((x, y) => x - y);
        this.hpNoise = Math.max(1e-7, s[Math.floor(s.length * 0.7)] || 1e-7);
        this.env = this.env * 0.9 + e * 0.1;
        continue;
      }
      const thr = Math.max(this.hpNoise * 12, this.env * 3.2);
      if (e > thr && rawT - this.lastOnset > 0.07) {
        this.lastOnset = rawT;
        this.pending.push({ rawT, peak: e, before: this.env });
        this.env = e;
      } else {
        this.env = this.env * 0.93 + e * 0.07;
        // track the peak of the attack just after an onset
        const p = this.pending[this.pending.length - 1];
        if (p && rawT - p.rawT < 0.03 && e > p.peak) p.peak = e;
      }
    }
    this.lastEnd = t - (L - b) / this.sr;
    while (this.blocks.length && this.blocks[0].rawT < t - 1.5) this.blocks.shift();
  }

  // A strum keeps ringing; a metronome click or a tap on the body dies within ~40 ms.
  _confirm(t) {
    while (this.pending.length && t - this.pending[0].rawT > 0.11) {
      const p = this.pending.shift();
      const tail = this.blocks.filter(b => b.rawT > p.rawT + 0.05 && b.rawT <= p.rawT + 0.1);
      const mean = tail.reduce((a, b) => a + b.e, 0) / Math.max(1, tail.length);
      const rmsTail = this.frames.filter(f => f.rawT > p.rawT + 0.04 && f.rawT <= p.rawT + 0.11);
      const lvl = rmsTail.reduce((a, f) => a + f.rms, 0) / Math.max(1, rmsTail.length);
      const ok = mean > Math.max(p.before * 1.3, p.peak * 0.008, this.hpNoise * 8) && lvl > this.gate * 1.5;
      if (ok) {
        const s = { t: p.rawT - this.lat, rawT: p.rawT, strength: Math.sqrt(p.peak) };
        this.strumSubs.forEach(fn => fn(s));
      }
    }
  }

  /** Average chroma of frames in [rawT0, rawT1] (AudioContext times, uncompensated). */
  chromaBetween(rawT0, rawT1) {
    const fr = this.frames.filter(f => f.chroma && f.rawT >= rawT0 && f.rawT <= rawT1);
    if (!fr.length) return null;
    const c = new Float32Array(12);
    fr.forEach(f => { for (let i = 0; i < 12; i++) c[i] += f.chroma[i] * f.rms; });
    let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, c[i]);
    if (mx > 0) for (let i = 0; i < 12; i++) c[i] /= mx;
    return c;
  }
  /** Average linear magnitude spectrum of frames in [rawT0, rawT1]. */
  magBetween(rawT0, rawT1) {
    const fr = this.frames.filter(f => f.mag && f.rawT >= rawT0 && f.rawT <= rawT1);
    if (!fr.length) return null;
    const m = new Float32Array(this.n / 2);
    fr.forEach(f => { for (let i = 0; i < m.length; i++) m[i] += f.mag[i]; });
    return m;
  }
  /** Full judgement of the sound in a window against a chord. {score, ok, hint, strings} */
  judgeWindow(rawT0, rawT1, name, thr = CHORD_OK, onsetRawT = null) {
    if (onsetRawT != null) {
      // judge both the plain sound and the "new energy" after the strum; a re-strum of the same chord
      // only shows in the plain sound, a change from a ringing chord only shows clearly in the new energy.
      const a = this.judgeWindow(rawT0, rawT1, name, thr, null), b = this._judgeNew(rawT0, rawT1, name, thr, onsetRawT);
      return b.score > a.score ? b : a;
    }
    return this._judgeNew(rawT0, rawT1, name, thr, null);
  }
  _judgeNew(rawT0, rawT1, name, thr, onsetRawT) {
    let m = this.magBetween(rawT0, rawT1), c = null;
    if (m && onsetRawT != null) {
      // remove what was already ringing before the strum (previous chord, open strings)
      const nAfter = this.frames.filter(f => f.mag && f.rawT >= rawT0 && f.rawT <= rawT1).length;
      const pre = this.frames.filter(f => f.mag && f.rawT >= onsetRawT - 0.12 && f.rawT < onsetRawT - 0.005);
      if (pre.length) {
        const b = new Float32Array(m.length);
        pre.forEach(f => { for (let i = 0; i < b.length; i++) b[i] += f.mag[i]; });
        const k = nAfter / pre.length * 0.8;
        for (let i = 0; i < m.length; i++) m[i] = Math.max(0, m[i] - b[i] * k);
      }
      c = chromaFromMag(m, this.sr, this.n, { fmin: 75, fmax: 1500 });
      let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, c[i]);
      if (!mx) c = null;
    } else c = this.chromaBetween(rawT0, rawT1);
    if (!c || !m) return { score: 0, ok: false, hint: 'I do not hear the guitar yet. Strum a bit louder, or move closer.', strings: [] };
    const r = judgeChord(c, m, this.sr, this.n, name);
    return { ...r, ok: r.score >= thr };
  }
  /** Recent sound (last `win` s) against a chord. */
  chordNow(name, win = 0.3) { const t = getCtx().currentTime; return this.judgeWindow(t - win, t, name); }
  chordScore(name, win = 0.3) { return this.chordNow(name, win).score; }
  recentChroma(win = 0.3) { const t = getCtx().currentTime; return this.chromaBetween(t - win, t); }
  /** Wait `delay` s after a strum, then judge it. Resolves {score, ok, hint, strings}. */
  judgeStrum(strum, name, { delay = 0.32, thr = CHORD_OK } = {}) {
    return new Promise(res => {
      const wait = strum.rawT + delay - getCtx().currentTime;
      setTimeout(() => res(this.judgeWindow(strum.rawT + 0.05, strum.rawT + delay, name, thr, strum.rawT)), Math.max(0, wait * 1000) + 25);
    });
  }
  /** Best guess of the chord ringing now, from a vocabulary of names. */
  guessChord(vocab = MONITOR_VOCAB, win = 0.35) {
    const t = getCtx().currentTime, c = this.chromaBetween(t - win, t), m = this.magBetween(t - win, t);
    if (!c || !m) return null;
    const r = vocab.map(n => ({ name: n, score: judgeChord(c, m, this.sr, this.n, n).score })).sort((a, b) => b.score - a.score);
    return r[0].score >= CHORD_OK ? { ...r[0], second: r[1] } : null;
  }
  /** Is a specific pitch sounding now? true when the smoothed pitch is within `tol` semitones (octave-tolerant if asked). */
  hears(midi, { tol = 0.6, octave = false } = {}) {
    const f = this.frames[this.frames.length - 1];
    if (!f || !f.midi) return false;
    const d = f.midi - midi;
    if (Math.abs(d) <= tol) return true;
    return octave && (Math.abs(d - 12) <= tol || Math.abs(d + 12) <= tol);
  }
  /** Latest stable pitch (MIDI float) or 0. */
  get midi() { const f = this.frames[this.frames.length - 1]; return f ? f.midi : 0; }
  get level() { const f = this.frames[this.frames.length - 1]; return f ? f.rms : 0; }
}

/** Score needed to accept a chord. Tuned with synthetic strums (see tests/guitar_dsp_test.py). */
export const CHORD_OK = 0.72;
export const MONITOR_VOCAB = ['C', 'D', 'Dm', 'E', 'Em', 'F', 'G', 'A', 'Am', 'B7', 'E7', 'A7', 'D7', 'G7', 'Bm', 'C7', 'Fmaj7'];

const hzOf = m => 440 * 2 ** ((m - 69) / 12);
function peakNear(mag, f, sr, n, cents = 35) {
  // strongest true spectral peak whose interpolated frequency is within ±cents of f
  const lo = f * 2 ** (-cents / 1200), hi = f * 2 ** (cents / 1200);
  const k0 = Math.max(2, Math.floor(lo * n / sr) - 1), k1 = Math.min(mag.length - 2, Math.ceil(hi * n / sr) + 1);
  let mx = 0;
  for (let k = k0; k <= k1; k++) {
    const b = mag[k];
    if (b <= mag[k - 1] || b < mag[k + 1]) continue;
    const a = mag[k - 1], c = mag[k + 1], den = a - 2 * b + c;
    const p = den !== 0 ? 0.5 * (a - c) / den : 0;
    const fk = (k + p) * sr / n;
    if (fk >= lo && fk <= hi) mx = Math.max(mx, b - 0.25 * (a - c) * p);
  }
  return mx;
}
/** True if `midi` is (close to) a harmonic 2..8 of any lower note in `others`. */
function isOvertone(midi, others) {
  return others.some(o => {
    if (o >= midi - 0.5) return false;
    const ratio = 2 ** ((midi - o) / 12), h = Math.round(ratio);
    return h >= 2 && h <= 8 && Math.abs(1200 * Math.log2(ratio / h)) < 30;
  });
}
/**
 * Shape-aware chord judgement.
 * Combines pitch-class match with a per-string check: each string whose note is not an overtone of a lower string
 * must show its own fundamental, and must not be beaten by the fret next to it (wrong fret).
 * Strings that should be muted must not ring.
 * @returns {{score:number, hint:string, strings:{s:number, state:'ok'|'quiet'|'wrongfret'|'unknown'|'shouldmute'}[]}}
 */
export function judgeChord(chroma, mag, sr, n, name) {
  const sh = shapeFor(name);
  const pcScore = matchChord(chroma, name);
  if (!sh) return { score: pcScore, hint: '', strings: [] };
  const strs = chordStrings(name);
  const amps = strs.map(x => peakNear(mag, hzOf(x.midi), sr, n));
  const maxA = Math.max(1e-9, ...amps);
  const mids = strs.map(x => x.midi);
  const report = [];
  let distinct = 0, good = 0;
  strs.forEach((x, k) => {
    if (isOvertone(x.midi, mids.filter(m => m !== x.midi))) { report.push({ s: x.s, state: 'unknown' }); return; }
    distinct++;
    const a = amps[k];
    const nb = Math.max(peakNear(mag, hzOf(x.midi + 1), sr, n), peakNear(mag, hzOf(x.midi - 1), sr, n));
    const nbIsChordTone = mids.some(m => Math.abs(m - (x.midi + 1)) < 0.5 || Math.abs(m - (x.midi - 1)) < 0.5 || isOvertone(x.midi + 1, mids) || isOvertone(x.midi - 1, mids));
    let state = 'ok';
    if (a < 0.08 * maxA) state = 'quiet';
    if (!nbIsChordTone && nb > a * 1.6 && nb > 0.12 * maxA) state = 'wrongfret';
    if (state === 'ok') good++;
    report.push({ s: x.s, state });
  });
  let penalty = 0;
  sh.f.forEach((fr, i) => {
    if (fr >= 0) return;
    const m = OPEN_STRINGS[i];
    if (isOvertone(m, mids) || mids.some(x => Math.abs(x - m) < 0.5)) return;
    if (peakNear(mag, hzOf(m), sr, n) > 0.35 * maxA) { penalty += 0.2; report.push({ s: i, state: 'shouldmute' }); }
  });
  const tones = distinct ? good / distinct : pcScore;
  const score = Math.max(0, Math.min(1, 0.4 * pcScore + 0.6 * tones - Math.min(0.4, penalty)));
  return { score, hint: score >= CHORD_OK ? '' : diagnose(chroma, name, report), strings: report };
}

/**
 * Explain why a strum did not match: which chord tones are missing and which strings make them,
 * plus any strong note that does not belong to the chord.
 */
export function diagnose(chroma, name, report = []) {
  const c = parseChord(name), sh = shapeFor(name);
  if (!c || !sh) return '';
  const out = [];
  for (const r of report) {
    if (r.state === 'quiet') out.push(`The ${STRING_LABEL[r.s]} string is not ringing. Press it with your fingertip, close to the fret.`);
    else if (r.state === 'wrongfret') out.push(`The ${STRING_LABEL[r.s]} string sounds one fret off. Check that finger.`);
    else if (r.state === 'shouldmute') out.push(`Do not play the ${STRING_LABEL[r.s]} string in ${name}.`);
  }
  if (out.length) return out.slice(0, 2).join(' ');
  const missing = c.pcs.filter(p => chroma[p] < 0.22);
  for (const p of missing) {
    const strs = sh.f.map((fr, i) => (fr >= 0 && (OPEN_STRINGS[i] + fr) % 12 === p ? i : -1)).filter(i => i >= 0);
    if (strs.length === 1) out.push(`The ${STRING_LABEL[strs[0]]} string is not ringing. Press it with the tip of your finger, close to the fret.`);
    else if (strs.length) out.push(`I do not hear ${pcName(p)}. Check the ${strs.map(i => STRING_NAMES[i]).join(' and ')} strings.`);
  }
  const inC = new Set(c.pcs);
  const extra = [];
  for (let p = 0; p < 12; p++) if (!inC.has(p) && chroma[p] > 0.6) extra.push(p);
  if (extra.length) {
    const muted = sh.f.map((fr, i) => (fr < 0 ? i : -1)).filter(i => i >= 0);
    const openBad = extra.map(p => muted.find(i => OPEN_STRINGS[i] % 12 === p)).filter(i => i != null);
    if (openBad.length) out.push(`Do not play the ${openBad.map(i => STRING_LABEL[i]).join(' or ')} string in ${name}.`);
    else out.push(`I hear ${extra.map(p => pcName(p)).join(', ')}, which is not in ${name}. A finger may be on the wrong fret or touching the next string.`);
  }
  if (!out.length) out.push(`Close, but not clean. Strum all the strings of ${name} and let them ring.`);
  return out.slice(0, 2).join(' ');
}

/** Sounding MIDI notes of a chord shape, with the string index. */
export function chordStrings(name) {
  const sh = shapeFor(name); if (!sh) return [];
  return sh.f.map((fr, i) => (fr < 0 ? null : { s: i, f: fr, midi: OPEN_STRINGS[i] + fr })).filter(Boolean);
}
export const noteOf = (s, f) => OPEN_STRINGS[s] + f;
export const noteLabel = (s, f) => noteName(OPEN_STRINGS[s] + f).replace(/\d+$/, '');

/** Ask for the mic inside a stage with ui.micGate; returns a started GuitarEar or null (player chose no mic). */
export async function openEar(stage, gate, opts = {}) {
  const ok = await gate(stage, {
    why: opts.why || 'Play your real guitar. The app listens and tells you how it sounds.',
    tips: opts.tips || 'Tip: put the iPad 30–60 cm from the guitar. Headphones help when a song plays.',
    allowSkip: opts.allowSkip !== false,
  });
  if (!ok) return null;
  try { return await new GuitarEar(opts).start(); } catch (e) { return null; }
}

export { rankChords, chordVocab };
