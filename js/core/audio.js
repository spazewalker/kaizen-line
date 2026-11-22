// Audio engine. One AudioContext for the whole app.
// iPad/iPhone notes:
//  - Web Audio is silenced by the ring/silent switch unless the audio session is "playback".
//    We set navigator.audioSession.type (Safari 16.4+) and also start a looping silent <audio>
//    element on first touch, which moves iOS to the playback category.
//  - The context must be resumed inside a user gesture. unlock() is wired to every pointerdown.
import { OPEN_STRINGS, shapeFor, parseChord } from './music.js';

let ctx = null, master = null, comp = null;
const listeners = new Set();

export function getCtx() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    ctx = new C({ latencyHint: 'interactive' });
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    ctx.onstatechange = () => listeners.forEach(f => f(ctx.state));
  }
  return ctx;
}
export const out = () => (getCtx(), master);
export const now = () => getCtx().currentTime;
export const onState = f => { listeners.add(f); return () => listeners.delete(f); };
export const state = () => (ctx ? ctx.state : 'none');

/** WAV blob from mono float samples. */
export function wavBlob(samples, sr) {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

let silentEl = null;
export function setSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* not supported */ }
}
/** Call inside any user gesture. Safe to call often. */
export async function unlock() {
  const c = getCtx();
  setSession('playback');
  if (!silentEl) {
    silentEl = new Audio(URL.createObjectURL(wavBlob(new Float32Array(4410), 44100)));
    silentEl.loop = true;
    silentEl.setAttribute('playsinline', '');
    silentEl.volume = 0.01;
  }
  if (silentEl.paused) silentEl.play().catch(() => {});
  if (c.state !== 'running') { try { await c.resume(); } catch (e) { /* retried on next gesture */ } }
  // a 1-sample buffer through the graph finishes the iOS unlock
  try {
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch (e) { /* ignore */ }
  return c.state;
}
if (typeof document !== 'undefined') {
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (!ctx || ctx.state !== 'running' || (silentEl && silentEl.paused)) unlock(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx) ctx.resume().catch(() => {}); });
}

// ---------- synth voices ----------
const midiHz = m => 440 * 2 ** ((m - 69) / 12);
let pianoWave = null;
function piano() {
  if (!pianoWave) {
    const c = getCtx(), n = 12, re = new Float32Array(n), im = new Float32Array(n);
    const amps = [0, 1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05, 0.03, 0.02, 0.015, 0.01];
    for (let i = 1; i < n; i++) im[i] = amps[i];
    pianoWave = c.createPeriodicWave(re, im);
  }
  return pianoWave;
}
/**
 * Play a pitched tone.
 * @param {number} midi
 * @param {object} o at (s from now), dur (s), gain, voice: 'piano'|'sine'|'triangle'|'organ', dest
 * @returns {{stop:Function}}
 */
export function tone(midi, o = {}) {
  const { at = 0, dur = 0.6, gain = 0.32, voice = 'piano', dest } = o;
  const c = getCtx(), t = c.currentTime + at;
  const osc = c.createOscillator(), g = c.createGain();
  if (voice === 'piano') osc.setPeriodicWave(piano()); else osc.type = voice === 'organ' ? 'square' : voice;
  osc.frequency.value = midiHz(midi);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = voice === 'organ' ? 1800 : 5000;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  if (voice === 'piano') g.gain.setTargetAtTime(gain * 0.45, t + 0.02, 0.25);
  g.gain.setValueAtTime(voice === 'piano' ? gain * 0.45 : gain, t + Math.max(0.03, dur - 0.06));
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(lp).connect(g).connect(dest || out());
  osc.start(t); osc.stop(t + dur + 0.05);
  return { stop: () => { try { g.gain.cancelScheduledValues(0); g.gain.setTargetAtTime(0, c.currentTime, 0.02); osc.stop(c.currentTime + 0.1); } catch (e) { /* already stopped */ } } };
}
/** Play notes in sequence. notes: midi numbers or {m, dur}. gap = seconds per note. */
export function playSeq(notes, { gap = 0.5, at = 0, dur, ...o } = {}) {
  let t = at;
  for (const n of notes) {
    const m = typeof n === 'number' ? n : n.m, d = typeof n === 'number' ? (dur || gap * 0.9) : n.dur;
    if (m != null && m > 0) tone(m, { ...o, at: t, dur: d });
    t += typeof n === 'number' ? gap : (n.dur + (n.rest || 0));
  }
  return t - at;
}

/** A sustained tone you can retune live (for "slide to match" games). */
export function holdTone(midi, { gain = 0.25, voice = 'triangle' } = {}) {
  const c = getCtx(), osc = c.createOscillator(), g = c.createGain();
  osc.type = voice; osc.frequency.value = midiHz(midi);
  g.gain.value = 0; g.gain.setTargetAtTime(gain, c.currentTime, 0.02);
  osc.connect(g).connect(out()); osc.start();
  return {
    set(m) { osc.frequency.setTargetAtTime(midiHz(m), c.currentTime, 0.015); },
    stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.04); osc.stop(c.currentTime + 0.3); },
  };
}

// ---------- guitar (Karplus-Strong with body filter) ----------
const ksCache = new Map();
function ksBuffer(midi) {
  if (ksCache.has(midi)) return ksCache.get(midi);
  const c = getCtx(), sr = c.sampleRate, f = midiHz(midi), len = Math.floor(sr * 2.4);
  const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / f)), r = new Float32Array(N);
  for (let i = 0; i < N; i++) r[i] = Math.random() * 2 - 1;
  // soften the pluck
  for (let k = 0; k < 2; k++) for (let i = 1; i < N; i++) r[i] = 0.5 * (r[i] + r[i - 1]);
  const decay = midi < 50 ? 0.4992 : midi < 60 ? 0.4988 : 0.4982;
  let p = 0;
  for (let i = 0; i < len; i++) {
    const nx = (p + 1) % N, v = r[p];
    r[p] = decay * (r[p] + r[nx]);
    d[i] = v; p = nx;
  }
  ksCache.set(midi, b);
  return b;
}
let body = null;
function guitarBus() {
  if (!body) {
    const c = getCtx();
    body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1; body.gain.value = 5;
    const hs = c.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 3500; hs.gain.value = -6;
    body.connect(hs).connect(out());
  }
  return body;
}
/** Pluck one MIDI note with a guitar tone. */
export function pluck(midi, { at = 0, vel = 0.3, dest } = {}) {
  const c = getCtx(), s = c.createBufferSource(), g = c.createGain();
  s.buffer = ksBuffer(Math.round(midi));
  s.detune.value = (midi - Math.round(midi)) * 100;
  g.gain.value = vel;
  s.connect(g).connect(dest || guitarBus());
  s.start(c.currentTime + at);
  return s;
}
/**
 * Strum a fret shape (6 values, -1 muted) or a chord name.
 * @param {number[]|string} shape
 * @param {object} o at, up (upstroke), vel, spread (s between strings), capo, mute (short chop)
 */
export function strum(shape, o = {}) {
  const { at = 0, up = false, vel = 0.24, spread, capo = 0, dest, mute = false } = o;
  const f = typeof shape === 'string' ? (shapeFor(shape) || { f: [-1, -1, -1, -1, -1, -1] }).f : shape;
  const order = up ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
  const sp = spread ?? (up ? 0.022 : 0.03);
  let k = 0;
  const srcs = [];
  for (const s of order) {
    if (f[s] < 0) continue;
    if (up && k >= 4) break; // upstrokes hit mostly the thin strings
    srcs.push(pluck(OPEN_STRINGS[s] + f[s] + capo, { at: at + k * sp, vel: (up ? vel * 0.7 : vel) * (1 - k * 0.04), dest }));
    k++;
  }
  if (mute) srcs.forEach(s => { try { s.stop(getCtx().currentTime + at + 0.09); } catch (e) { /* ignore */ } });
  return srcs;
}
/** Arpeggiate a chord shape slowly, string by string (for lessons). */
export function arpeggio(shape, { gap = 0.28, at = 0 } = {}) {
  const f = typeof shape === 'string' ? shapeFor(shape).f : shape;
  let k = 0;
  f.forEach((v, s) => { if (v >= 0) pluck(OPEN_STRINGS[s] + v, { at: at + gap * k++, vel: 0.3 }); });
}

// ---------- percussion ----------
function blip(t, f, type, vol, len, dest) {
  const c = getCtx(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(dest || out()); o.start(t); o.stop(t + len + 0.02);
}
/** Metronome click at absolute context time t. accent = first beat of bar. */
export const click = (t, accent = false, dest) => blip(t, accent ? 1750 : 1200, 'square', accent ? 0.16 : 0.1, 0.035, dest);
export const woodblock = (t, dest) => blip(t, 820, 'triangle', 0.5, 0.09, dest);

/**
 * Look-ahead metronome on the audio clock.
 * onBeat(beatIndex, time) is called slightly before each beat time (use `time` for scheduling/visuals).
 */
export class Metronome {
  constructor({ bpm = 80, beatsPerBar = 4, sound = true, dest } = {}) { Object.assign(this, { bpm, beatsPerBar, sound, dest }); this.cbs = []; }
  onBeat(f) { this.cbs.push(f); return this; }
  get spb() { return 60 / this.bpm; }
  /** Start at absolute context time (default: 0.15 s from now). Returns start time. */
  start(t0) {
    const c = getCtx();
    this.t0 = t0 ?? c.currentTime + 0.15;
    this.next = 0;
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();
    return this.t0;
  }
  _tick() {
    const c = getCtx();
    while (this.t0 + this.next * this.spb < c.currentTime + 0.12) {
      const t = this.t0 + this.next * this.spb;
      if (this.sound) click(t, this.next % this.beatsPerBar === 0, this.dest);
      this.cbs.forEach(f => f(this.next, t));
      this.next++;
    }
  }
  /** Beat position (float) at context time t. */
  beatAt(t) { return (t - this.t0) / this.spb; }
  stop() { clearInterval(this.timer); }
}

// ---------- clips (recorded / generated speech) ----------
const clipCache = new Map();
/**
 * Play an audio file (e.g. Japanese speech). Uses <audio> so iOS plays it even on silent,
 * and so slow playback keeps its pitch.
 * @returns {Promise<void>} resolves when playback ends
 */
export function playClip(url, { rate = 1, volume = 1 } = {}) {
  let el = clipCache.get(url);
  if (!el) { el = new Audio(url); el.preload = 'auto'; el.setAttribute('playsinline', ''); clipCache.set(url, el); }
  try { el.pause(); el.currentTime = 0; } catch (e) { /* not loaded yet */ }
  el.playbackRate = rate; el.preservesPitch = true; el.webkitPreservesPitch = true; el.volume = volume;
  return new Promise(res => {
    const done = () => { el.removeEventListener('ended', done); el.removeEventListener('error', done); res(); };
    el.addEventListener('ended', done); el.addEventListener('error', done);
    el.play().catch(done);
  });
}
/** Preload a list of clip URLs (fire and forget). */
export function preloadClips(urls) {
  urls.forEach(u => { if (!clipCache.has(u)) { const el = new Audio(); el.preload = 'auto'; el.src = u; el.setAttribute('playsinline', ''); clipCache.set(u, el); } });
}
/** Decode a user file (song upload) into an AudioBuffer. */
export async function decodeFile(file) {
  const ab = await file.arrayBuffer();
  const c = getCtx();
  return await new Promise((res, rej) => {
    const p = c.decodeAudioData(ab, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}

/** Quick self-test used by Settings > Sound check. */
export async function soundCheck() {
  await unlock();
  playSeq([60, 64, 67, 72], { gap: 0.18, dur: 0.3 });
  return getCtx().state;
}
