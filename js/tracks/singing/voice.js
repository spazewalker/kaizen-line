// Voice listening engine for the singing track.
// VoiceTracker: pure processing (testable in node). VoiceListener: wraps the shared mic.
import { PitchDetector } from '../../core/pitch.js';

const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/** Fold a cents difference into -600..600 (ignore octave). */
export const foldCents = c => ((((c + 600) % 1200) + 1200) % 1200) - 600;

export class VoiceTracker {
  /**
   * @param {number} sr sample rate
   * @param {object} o minF/maxF Hz, rmsGate (silence), smooth (median frames), stabWin (s)
   */
  constructor(sr, o = {}) {
    this.sr = sr;
    this.o = { minF: 65, maxF: 1100, rmsGate: 0.012, smooth: 5, stabWin: 0.6, ...o };
    this.pd = new PitchDetector(2048, sr);
    this.raw = [];      // recent raw midi (0 = unvoiced) for median
    this.recent = [];   // {t, m} voiced, for stability
    this.last = 0;      // last accepted midi
    this.lastT = -1;
    this.voiced = false;
    this.unvoicedFrames = 0;
    this.onsetT = null;
  }
  reset() { this.raw = []; this.recent = []; this.last = 0; this.voiced = false; this.unvoicedFrames = 0; this.onsetT = null; }

  /**
   * Process one analysis frame.
   * @param {Float32Array} buf time-domain samples (last 2048 used)
   * @param {number} t time (s) this frame represents (already latency-compensated by caller)
   * @returns {{t:number, midi:number, raw:number, rms:number, clarity:number, voiced:boolean, onset:boolean, stab:number}}
   *  midi = smoothed fractional MIDI or 0; stab = std-dev in cents over the last stabWin seconds (Infinity if too few)
   */
  process(buf, t) {
    const o = this.o;
    const r = this.pd.detect(buf, { minF: o.minF, maxF: o.maxF, k: 0.86, rmsMin: o.rmsGate, minClarity: 0.72 });
    let m = r.freq ? r.midi : 0;
    // Octave-error guard: a sudden exact-octave jump with modest clarity is usually a detector error.
    if (m && this.last && t - this.lastT < 0.15) {
      const d = m - this.last;
      if (Math.abs(Math.abs(d) - 12) < 0.7 && r.clarity < 0.95) m -= Math.sign(d) * 12;
    }
    this.raw.push(m);
    if (this.raw.length > o.smooth) this.raw.shift();
    const v = this.raw.filter(x => x > 0);
    let sm = 0;
    if (m && v.length >= Math.ceil(o.smooth / 2)) {
      sm = median(v);
      // stay responsive on slides: if the newest value moved far from the median, trust it
      if (Math.abs(m - sm) > 1.5 && this.raw.slice(-2).every(x => x > 0 && Math.abs(x - m) < 0.8)) sm = m;
    }
    let onset = false;
    if (sm) {
      if (!this.voiced) { onset = true; this.onsetT = t; }
      this.voiced = true; this.unvoicedFrames = 0;
      this.last = sm; this.lastT = t;
      this.recent.push({ t, m: sm });
    } else {
      this.unvoicedFrames++;
      if (this.unvoicedFrames > 3) { this.voiced = false; }
    }
    while (this.recent.length && this.recent[0].t < t - o.stabWin) this.recent.shift();
    let stab = Infinity;
    if (this.recent.length >= 6) {
      const mean = this.recent.reduce((a, b) => a + b.m, 0) / this.recent.length;
      stab = 100 * Math.sqrt(this.recent.reduce((a, b) => a + (b.m - mean) ** 2, 0) / this.recent.length);
    }
    return { t, midi: sm, raw: r.freq ? r.midi : 0, rms: r.rms, clarity: r.clarity, voiced: !!sm, onset, stab };
  }
}

/**
 * Live listener on the shared mic. Call start() after mic.acquire() (use ui.micGate first).
 * Frame times are AudioContext seconds, shifted back by the calibrated latency and half the window,
 * so they line up with the time the singer actually produced the sound.
 */
export class VoiceListener {
  constructor(o = {}) { this.o = o; this.cbs = []; this.stopFn = null; this.state = null; }
  async start() {
    const [{ mic, micLoop }, { settings }, { getCtx }] = await Promise.all([import('../../core/mic.js'), import('../../core/store.js'), import('../../core/audio.js')]);
    if (!mic.active) await mic.acquire();
    const sr = mic.sampleRate;
    this.tracker = new VoiceTracker(sr, this.o);
    this.lat = (settings.get().latencyMs || 0) / 1000;
    this.ctx = getCtx();
    this.stopFn = micLoop((m, now) => {
      const s = this.tracker.process(m.time(), now - this.lat - 1024 / sr);
      s.now = now;
      this.state = s;
      for (const f of this.cbs) f(s);
    });
    return this;
  }
  on(f) { this.cbs.push(f); return this; }
  stop() { if (this.stopFn) this.stopFn(); this.stopFn = null; this.cbs = []; }
}

/** Human hint for a cents error. */
export function hintFor(cents) {
  const a = Math.abs(cents);
  if (a <= 25) return { text: 'Spot on', cls: 'good', dir: 0 };
  if (a <= 50) return { text: cents < 0 ? 'A bit flat, go up' : 'A bit sharp, go down', cls: 'close', dir: cents < 0 ? 1 : -1 };
  if (a <= 150) return { text: cents < 0 ? 'Too low, go up' : 'Too high, go down', cls: 'off', dir: cents < 0 ? 1 : -1 };
  return { text: cents < 0 ? 'Much too low, go up a lot' : 'Much too high, go down a lot', cls: 'off', dir: cents < 0 ? 1 : -1 };
}
