// Pure scoring + range helpers (testable in node).
import { foldCents } from './voice.js';

/**
 * Accumulate one voice frame into the note it falls in.
 * notes: [{t, dur, midi, _n, _good, _great}] sorted by t. songT = frame time in song seconds.
 * Unvoiced frames inside a note count as misses. The first `attack` seconds of a note are ignored.
 * @returns the note that was updated (or null) and the cents error (or null)
 */
export function scoreFrame(notes, songT, midi, { octaveAgnostic = false, attack = 0.08, tol = 50, great = 25, from = 0 } = {}) {
  for (let i = from; i < notes.length; i++) {
    const n = notes[i];
    if (n.t > songT) break;
    if (songT < n.t + attack || songT > n.t + n.dur) continue;
    n._n = (n._n || 0) + 1;
    if (!midi) return { note: n, cents: null };
    let c = 100 * (midi - n.midi);
    if (octaveAgnostic) c = foldCents(c);
    if (Math.abs(c) <= tol) n._good = (n._good || 0) + 1;
    if (Math.abs(c) <= great) n._great = (n._great || 0) + 1;
    n._sum = (n._sum || 0) + c; n._v = (n._v || 0) + 1;
    return { note: n, cents: c };
  }
  return null;
}
/** Final hit fraction for a note (0..1), or null if it got no frames. */
export const noteHit = n => (n._n ? (n._good || 0) / n._n : null);
/** Mean cents error of voiced frames (negative = flat). */
export const noteBias = n => (n._v ? n._sum / n._v : null);
export function resetNote(n) { delete n._n; delete n._good; delete n._great; delete n._sum; delete n._v; delete n.hit; }

/** Summary over notes that received frames. */
export function summarize(notes) {
  const scored = notes.filter(n => n._n > 2);
  const hits = scored.map(noteHit);
  const acc = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 0;
  const biases = scored.map(noteBias).filter(b => b != null);
  const bias = biases.length ? biases.reduce((a, b) => a + b, 0) / biases.length : 0;
  return { acc, count: scored.length, bias };
}

/**
 * Semitone shift that puts a set of MIDI notes inside [low, high], centred.
 * octavesOnly: only shift by whole octaves (when singing with an original recording).
 */
export function fitShift(midis, low, high, { octavesOnly = false } = {}) {
  if (!midis.length) return 0;
  const lo = Math.min(...midis), hi = Math.max(...midis);
  const centre = (low + high) / 2, mid = (lo + hi) / 2;
  if (octavesOnly) return Math.round((centre - mid) / 12) * 12;
  let s = Math.round(centre - mid);
  if (hi - lo <= high - low) s = Math.max(low - lo, Math.min(high - hi, s));
  return s;
}

/**
 * Estimate a comfortable range from voiced frames [{m|midi, stab}].
 * Uses steady frames only (stab < 60 cents) and robust percentiles.
 */
export function estimateRange(lowFrames, highFrames) {
  const steady = f => f.map(x => ({ m: x.m ?? x.midi, stab: x.stab })).filter(x => x.m > 0 && x.stab < 60).map(x => x.m).sort((a, b) => a - b);
  const L = steady(lowFrames), H = steady(highFrames);
  if (L.length < 10 || H.length < 10) return null;
  const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
  const low = Math.round(pct(L, 0.08)), high = Math.round(pct(H, 0.92));
  return { low, high, span: high - low };
}

/** Gentle voice type label from a range. */
export function voiceType(low, high) {
  const mid = (low + high) / 2;
  if (mid < 52.5) return 'bass';
  if (mid < 57) return 'baritone';
  if (mid < 61) return 'tenor';
  if (mid < 66) return 'alto (or a high tenor)';
  return 'soprano (or a very high voice)';
}
