// Song Lab data layer: decode, analysis (worker or main-thread fallback), library in IndexedDB,
// and helpers that turn analysis + user edits into chord / melody sessions.
import { idb } from '../core/idb.js';
import { decodeFile } from '../core/audio.js';
import { transposeChord, simplifyChord, capoOptions, EASY_CHORDS, parseChord, pcName } from '../core/music.js';
import { SR, VERSION, analyze, chordsForGrid, segments, gridBpm, keyUsesFlats, rootName } from './analysis.js';

export const MAX_MINUTES = 15;

// ---------------------------------------------------------------- decoding
/** Decode any audio blob to mono Float32 at 22050 Hz. Prefers decoding straight to 22050 Hz (less memory on iPad). */
export async function decodeMono(blob) {
  const ab = await blob.arrayBuffer();
  let buf = null;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OAC) {
    try {
      const oc = new OAC(1, 1, SR);
      buf = await new Promise((res, rej) => { const p = oc.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); });
    } catch (e) { buf = null; }
  }
  if (!buf) buf = await decodeFile({ arrayBuffer: async () => ab });
  const n = buf.length, ch = buf.numberOfChannels;
  let x = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
  if (Math.abs(buf.sampleRate - SR) > 1) x = resample(x, buf.sampleRate, SR);
  return { samples: x, duration: x.length / SR };
}

/** Windowed-sinc resampler (used only when the browser could not decode at 22050 Hz). */
export function resample(x, from, to) {
  const r = from / to, n = Math.floor(x.length / r), y = new Float32Array(n), taps = 12, fc = 0.45 / Math.max(1, r);
  for (let i = 0; i < n; i++) {
    const c = i * r, ci = Math.floor(c); let s = 0, ws = 0;
    for (let k = -taps; k <= taps; k++) {
      const j = ci + k; if (j < 0 || j >= x.length) continue;
      const d = j - c, w = (d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d)) * (0.5 + 0.5 * Math.cos(Math.PI * d / (taps + 1)));
      s += x[j] * w; ws += w;
    }
    y[i] = s / (ws || 1);
  }
  return y;
}

/** Waveform overview: n buckets of peak absolute amplitude. */
export function peaks(x, n = 800) {
  const out = new Float32Array(n), step = x.length / n;
  for (let b = 0; b < n; b++) {
    let m = 0; const a = Math.floor(b * step), e = Math.min(x.length, Math.floor((b + 1) * step));
    for (let i = a; i < e; i += 4) { const v = Math.abs(x[i]); if (v > m) m = v; }
    out[b] = m;
  }
  let mx = 0; for (const v of out) mx = Math.max(mx, v);
  if (mx > 0) for (let i = 0; i < n; i++) out[i] /= mx;
  return out;
}

// ---------------------------------------------------------------- analysis runner
let workerOk = null; // null = unknown
async function canUseWorker() {
  if (workerOk !== null) return workerOk;
  workerOk = await new Promise(res => {
    let w;
    try { w = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' }); } catch (e) { res(false); return; }
    const to = setTimeout(() => { w.terminate(); res(false); }, 4000);
    w.onmessage = e => { if (e.data && e.data.pong) { clearTimeout(to); w.terminate(); res(true); } };
    w.onerror = () => { clearTimeout(to); w.terminate(); res(false); };
    w.postMessage({ ping: 1 });
  });
  return workerOk;
}

/** Analyze samples; onProgress({stage,p}). Uses a module worker when available. */
export async function runAnalysis(samples, onProgress = () => {}) {
  if (await canUseWorker()) {
    return new Promise((res, rej) => {
      const w = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => {
        const d = e.data;
        if (d.progress) onProgress(d.progress);
        else if (d.result) { w.terminate(); res(d.result); }
        else if (d.error) { w.terminate(); rej(new Error(d.error)); }
      };
      w.onerror = e => { w.terminate(); rej(new Error(e.message || 'Analysis worker failed')); };
      w.postMessage({ id: 1, samples, sr: SR }, [samples.buffer]);
    });
  }
  // Fallback: main thread, yielding to the UI regularly.
  let lastYield = performance.now();
  const tick = () => (performance.now() - lastYield > 30 ? new Promise(r => setTimeout(() => { lastYield = performance.now(); r(); }, 0)) : Promise.resolve());
  return analyze(samples, SR, { onProgress, tick });
}

// ---------------------------------------------------------------- library
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const lib = {
  async list() { return ((await idb.all('songs')) || []).sort((a, b) => b.added - a.added); },
  get: id => idb.get('songs', id),
  save: meta => idb.set('songs', meta.id, meta),
  analysis: id => idb.get('analysis', id),
  async blob(id) { const b = await idb.get('blobs', id); return b ? new Blob([b.buf], { type: b.type || 'audio/mpeg' }) : null; },
  async add(blob, title, extra = {}) {
    const id = uid();
    await idb.set('blobs', id, { buf: await blob.arrayBuffer(), type: blob.type || 'audio/mpeg' });
    const meta = { id, title: title || 'Untitled song', size: blob.size, type: blob.type, added: Date.now(), status: 'new', edits: {}, simplify: 0, transpose: 0, capo: null, gridShift: 0, ...extra };
    await idb.set('songs', id, meta);
    return meta;
  },
  async remove(id) { await Promise.all([idb.del('songs', id), idb.del('blobs', id), idb.del('analysis', id)]); },
};

// Jobs survive navigation inside the app: the UI subscribes to progress.
const jobs = new Map();
export const jobState = id => jobs.get(id) || null;
export function subscribe(id, fn) { const j = jobs.get(id); if (!j) return () => {}; j.subs.add(fn); return () => j.subs.delete(fn); }

/** Decode + analyze a stored song. Resolves with updated meta. */
export function analyzeSong(id) {
  if (jobs.has(id)) return jobs.get(id).promise;
  const job = { stage: 'Opening the file', p: 0, subs: new Set() };
  const emit = () => job.subs.forEach(f => { try { f(job); } catch (e) { console.error(e); } });
  job.promise = (async () => {
    const meta = await lib.get(id);
    try {
      meta.status = 'analyzing'; await lib.save(meta); emit();
      const blob = await lib.blob(id);
      const { samples, duration } = await decodeMono(blob);
      if (duration > MAX_MINUTES * 60) throw new Error(`Songs up to ${MAX_MINUTES} minutes are supported. This one is ${Math.round(duration / 60)} minutes.`);
      if (duration < 8) throw new Error('This file is too short to analyze (under 8 seconds).');
      meta.duration = duration; meta.peaks = peaks(samples);
      job.stage = 'Starting analysis'; job.p = 0.02; emit();
      const r = await runAnalysis(samples, p => { job.stage = p.stage; job.p = 0.02 + 0.98 * p.p; emit(); });
      await idb.set('analysis', id, r);
      Object.assign(meta, { status: 'ready', bpm: r.bpm, key: r.key.name, version: VERSION, grid: null, edits: {}, phase: null, error: null });
      await lib.save(meta);
      job.stage = 'Done'; job.p = 1; emit();
      return meta;
    } catch (e) {
      console.error(e);
      meta.status = 'error'; meta.error = e.message || String(e); await lib.save(meta);
      job.error = meta.error; emit();
      throw e;
    } finally { setTimeout(() => jobs.delete(id), 50); }
  })();
  jobs.set(id, job);
  job.promise.catch(() => {});
  return job.promise;
}

// ---------------------------------------------------------------- song model (analysis + edits)
/**
 * Current view of a song: beats, phase, per-beat chord names (sounding, edits applied, before transpose/simplify).
 */
export function model(meta, an) {
  const g = meta.grid;
  const shift = meta.gridShift || 0;
  const beats = (g ? g.beats : an.beats).map(b => +(b + shift).toFixed(4));
  const base = g ? g.beatChords : an.beatChords;
  const phase = meta.phase != null ? meta.phase : (g ? g.phase : an.phase);
  const key = g?.key || an.key;
  const raw = base.map((c, i) => (meta.edits && meta.edits[i]) || c);
  const bpm = g ? g.bpm : an.bpm;
  return { beats, phase, raw, key, bpm, duration: an.duration };
}
const flatKey = key => keyUsesFlats(key);
/** Chord name for display / practice: transpose then simplify. */
export function shown(name, meta, key) {
  if (!name || name === 'N') return 'N';
  let n = meta.transpose ? transposeChord(name, meta.transpose, flatKey(transposedKey(key, meta.transpose))) : name;
  if (meta.simplify) n = simplifyChord(n, 1);
  // respell to the key's sharps/flats
  const p = parseChord(n); if (p) n = rootName(p.root, flatKey(transposedKey(key, meta.transpose || 0))) + p.type;
  return n;
}
export function transposedKey(key, semis) {
  const tonic = ((key.tonic + (semis || 0)) % 12 + 12) % 12;
  const k = { tonic, mode: key.mode };
  k.name = pcName(tonic, flatKey(k)) + (key.mode === 'minor' ? ' minor' : ' major');
  return k;
}
export function displayChords(meta, M) { return M.raw.map(c => shown(c, meta, M.key)); }

export function capoChoices(meta, M, known = []) {
  const names = displayChords(meta, M).filter(n => n !== 'N');
  return capoOptions(names, [...new Set([...EASY_CHORDS, ...known])]).slice(0, 4);
}

/** Re-derive chords for a new beat grid (after halve/double/tap tempo). Clears per-beat edits. */
export function regrid(meta, an, beats) {
  const r = chordsForGrid(an.frames, beats, an.duration, 4);
  meta.grid = { beats, beatChords: r.beatChords, phase: r.phase, key: r.key, bpm: gridBpm(beats) || meta.bpm };
  meta.edits = {}; meta.phase = null; meta.gridShift = 0;
  return meta;
}
export function halveGrid(beats) { return beats.filter((_, i) => i % 2 === 0); }
export function doubleGrid(beats) {
  const out = [];
  beats.forEach((b, i) => { out.push(b); if (i + 1 < beats.length) out.push(+((b + beats[i + 1]) / 2).toFixed(4)); });
  return out;
}
/** Uniform grid from tapped times (seconds in the song). */
export function gridFromTaps(taps, duration) {
  if (taps.length < 4) return null;
  const iv = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const p0 = iv[iv.length >> 1];
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  taps.forEach(t => { const k = Math.round((t - taps[0]) / p0); n++; sx += k; sy += t; sxx += k * k; sxy += k * t; });
  const P = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - P * sx) / n;
  if (!(P > 0.25 && P < 2)) return null;
  const beats = []; let t = a - Math.floor(a / P) * P;
  for (; t < duration - 0.05; t += P) beats.push(+t.toFixed(4));
  return beats;
}

// ---------------------------------------------------------------- sessions
function inRange(t, d, r) { return !r || (t + d > r.t0 && t < r.t1); }
export function chordSession(meta, an, M, { sectionIndex = null, audioUrl, known = [] } = {}) {
  const names = displayChords(meta, M);
  const sec = sectionIndex != null ? an.sections[sectionIndex] : null;
  const range = sec ? { t0: sec.t0, t1: sec.t1 } : null;
  const capo = meta.capo != null ? meta.capo : (capoChoices(meta, M, known)[0]?.capo || 0);
  const segs = segments(M.beats, names, M.duration).filter(s => s.name !== 'N' && inRange(s.t, s.dur, range))
    .map(s => ({ t: +s.t.toFixed(3), dur: +s.dur.toFixed(3), name: s.name }));
  const key = transposedKey(M.key, meta.transpose || 0);
  return {
    title: meta.title + (sec ? ` · ${sec.name}` : ''),
    audioUrl: meta.transpose ? undefined : audioUrl,
    bpm: M.bpm, beatsPerBar: 4,
    beats: M.beats.filter(b => !range || (b >= range.t0 - 0.01 && b < range.t1)),
    downbeat: M.phase,
    chords: segs, capo, key: key.name,
    sections: an.sections.map(s => ({ name: s.name, t0: s.t0, t1: s.t1 })),
    range,
  };
}
export function singSession(meta, an, M, { sectionIndex = null, audioUrl } = {}) {
  const sec = sectionIndex != null ? an.sections[sectionIndex] : null;
  const range = sec ? { t0: sec.t0, t1: sec.t1 } : null;
  const notes = an.melody.filter(n => n.conf == null || n.conf >= 0.15).filter(n => inRange(n.t, n.dur, range))
    .map(n => ({ t: n.t, dur: n.dur, midi: n.midi + (meta.transpose || 0), conf: n.conf }));
  return {
    title: meta.title + (sec ? ` · ${sec.name}` : ''),
    audioUrl: meta.transpose ? undefined : audioUrl,
    bpm: M.bpm, notes, key: transposedKey(M.key, meta.transpose || 0).name, transpose: 0, range,
  };
}
