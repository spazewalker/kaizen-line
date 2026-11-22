// Public-domain melodies and vocal exercises.
// Notation: "C4:1 D4:.5 r:1" = note:beats (r = rest). Written in C around C4; the app transposes to the singer's range.
import { nameToMidi, MAJOR } from '../../core/music.js';
import { fitShift } from './score.js';

export const SONGS = {
  twinkle: { title: 'Twinkle Twinkle Little Star', bpm: 92, origin: 'French folk tune (1761), public domain',
    m: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
  frere: { title: 'Frère Jacques', bpm: 96, origin: 'French round (18th c.), public domain',
    m: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
  mary: { title: 'Mary Had a Little Lamb', bpm: 100, origin: 'American nursery tune (1830s), public domain',
    m: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
  row: { title: 'Row, Row, Row Your Boat', bpm: 88, origin: 'American round (1852), public domain',
    m: 'C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3' },
  ode: { title: 'Ode to Joy', bpm: 100, origin: 'Beethoven, Symphony No. 9 (1824), public domain',
    m: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' },
  auld: { title: 'Auld Lang Syne', bpm: 84, beats: 4, origin: 'Scottish folk melody (1788), public domain',
    m: 'G3 C4:1.5 C4:.5 C4 E4 D4:1.5 C4:.5 D4 E4:.5 D4:.5 C4:1.5 C4:.5 E4 G4 A4:3 A4 G4:1.5 E4:.5 E4 C4 D4:1.5 C4:.5 D4 E4:.5 D4:.5 C4:1.5 A3:.5 A3 G3 C4:3' },
  grace: { title: 'Amazing Grace', bpm: 80, beats: 3, origin: 'Hymn tune "New Britain" (1829), public domain',
    m: 'G3 C4:2 E4:.5 C4:.5 E4:2 D4 C4:2 A3 G3:2 G3 C4:2 E4:.5 C4:.5 E4:2 D4 G4:3 r:1 E4 G4:1.5 E4:.5 G4:.5 E4:.5 C4:2 G3 A3:1.5 C4:.5 C4:.5 A3:.5 G3:2 G3 C4:2 E4:.5 C4:.5 E4:2 D4 C4:3' },
  sakura: { title: 'Sakura Sakura', bpm: 72, origin: 'Japanese folk song (Edo period), public domain',
    m: 'A4 A4 B4:2 A4 A4 B4:2 A4 B4 C5 B4 A4 B4:.5 A4:.5 F4:2 E4 C4 E4 F4 E4 E4:.5 C4:.5 B3:2 A4 B4 C5 B4 A4 B4:.5 A4:.5 F4:2 E4 C4 E4 F4 E4 E4:.5 C4:.5 B3:2 A4 A4 B4:2 A4 A4 B4:2 E4 F4 B4:.5 A4:.5 F4 E4:3' },
};

/** Song anchors for intervals (first two notes of a well-known public-domain tune, ascending). */
export const INTERVALS = {
  1: { name: 'Minor 2nd', short: 'm2', anchor: 'the Jaws-style "dun-dun" (two notes very close)' },
  2: { name: 'Major 2nd', short: 'M2', anchor: '"Frère Jacques" (Frè-re)', seq: 'frere' },
  3: { name: 'Minor 3rd', short: 'm3', anchor: '"Greensleeves" (A-las) — a sad little lift' },
  4: { name: 'Major 3rd', short: 'M3', anchor: '"Oh When the Saints" (Oh when)' },
  5: { name: 'Perfect 4th', short: 'P4', anchor: '"Amazing Grace" (A-ma) and "Here Comes the Bride"' },
  7: { name: 'Perfect 5th', short: 'P5', anchor: '"Twinkle Twinkle" (twin-kle → lit-tle: C up to G)' },
  9: { name: 'Major 6th', short: 'M6', anchor: '"My Bonnie Lies over the Ocean" (My Bon-)' },
  12: { name: 'Octave', short: 'P8', anchor: 'the same note, high and low — men and women singing "together"' },
};

/** Parse notation to [{t, dur, midi}] in seconds. */
export function parseMelody(str, bpm = 90) {
  const spb = 60 / bpm, out = [];
  let t = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, b] = tok.split(':');
    const beats = b ? parseFloat(b) : 1;
    if (n !== 'r') out.push({ t, dur: beats * spb * 0.94, midi: nameToMidi(n), beats });
    t += beats * spb;
  }
  return out;
}
/** Song -> session notes in the singer's range. */
export function songNotes(id, { low, high, lead = 0 } = {}) {
  const s = SONGS[id];
  const notes = parseMelody(s.m, s.bpm);
  const sh = fitShift(notes.map(n => n.midi), low, high);
  return notes.map(n => ({ ...n, t: n.t + lead, midi: n.midi + sh }));
}

// ---------- exercises (scale degrees, semitones from tonic) ----------
// d: degrees in semitones; b: beats per note (number or array)
export const EXERCISES = {
  one:    { title: 'One long note', d: [0, 0, 0], b: 2, bpm: 80 },
  dorem:  { title: 'Do Re Mi Re Do', d: [0, 2, 4, 2, 0], b: [1, 1, 2, 1, 2], bpm: 84 },
  scale5: { title: 'Five-note scale', d: [0, 2, 4, 5, 7, 5, 4, 2, 0], b: [1, 1, 1, 1, 2, 1, 1, 1, 2], bpm: 88 },
  scale8: { title: 'Major scale up and down', d: [...MAJOR, 12, 11, 9, 7, 5, 4, 2, 0], b: [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2], bpm: 84 },
  steps:  { title: 'Steps', d: [0, 2, 4, 2, 4, 5, 4, 2, 0], b: 1, bpm: 88 },
  leaps:  { title: 'Leaps', d: [0, 4, 0, 7, 0, 12, 7, 4, 0], b: [1, 1, 1, 1, 1, 2, 1, 1, 2], bpm: 76 },
  thirds: { title: 'Thirds', d: [0, 4, 2, 5, 4, 7, 5, 4, 2, 0], b: 1, bpm: 84 },
  arp:    { title: 'Do Mi So Do', d: [0, 4, 7, 12, 7, 4, 0], b: [1, 1, 1, 2, 1, 1, 2], bpm: 80 },
  arpm:   { title: 'Minor arpeggio', d: [0, 3, 7, 12, 7, 3, 0], b: [1, 1, 1, 2, 1, 1, 2], bpm: 80 },
  rhythm1:{ title: 'On the beat', d: [0, 0, 4, 4, 7, 7, 4], b: [1, .5, .5, 1, .5, .5, 2], bpm: 90 },
  rhythm2:{ title: 'Off the beat', d: [0, 2, 4, 4, 2, 0], b: [.5, 1, .5, 1, .5, 2.5], bpm: 84, gaps: [0, 0, 0, .5, 0, 0] },
  fifths: { title: 'Fifth jumps', d: [0, 7, 0, 7, 5, 4, 2, 0], b: [1, 1, 1, 1, 1, 1, 1, 2], bpm: 80 },
  octave: { title: 'Octave leap', d: [0, 12, 11, 12, 7, 4, 0], b: [1, 2, 1, 1, 1, 1, 2], bpm: 76 },
};

/**
 * Build exercise notes, repeated in `keys` keys rising by `step` semitones (classic warm-up), all in range.
 * @returns {{notes, tonics:number[], bpm}}
 */
export function exerciseNotes(id, { low, high, keys = 1, step = 1, lead = 0 } = {}) {
  const ex = EXERCISES[id], spb = 60 / ex.bpm, span = Math.max(...ex.d) - Math.min(...ex.d);
  const room = Math.max(0, high - low - span);
  const k = Math.min(keys, Math.floor(room / step) + 1);
  // start the first key low-ish so it can rise
  const first = low + Math.max(0, Math.floor((room - (k - 1) * step) / 2)) - Math.min(...ex.d);
  const notes = [], tonics = [];
  let t = lead;
  for (let r = 0; r < k; r++) {
    const tonic = first + r * step; tonics.push(tonic);
    ex.d.forEach((d, i) => {
      const beats = Array.isArray(ex.b) ? ex.b[i] : ex.b;
      const gap = ex.gaps ? ex.gaps[i] * spb : 0;
      t += gap;
      notes.push({ t, dur: beats * spb * 0.92, midi: tonic + d, beats });
      t += beats * spb;
    });
    t += 2 * spb; // breath between keys
  }
  return { notes, tonics, bpm: ex.bpm };
}

/** Comfortable tonic for a set of degrees inside the range (centred). */
export function tonicFor(degrees, low, high) {
  const lo = Math.min(...degrees), hi = Math.max(...degrees);
  return Math.round((low + high) / 2 - (lo + hi) / 2);
}
