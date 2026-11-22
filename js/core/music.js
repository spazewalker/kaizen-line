// Music theory helpers + guitar chord shapes. Shared by guitar, singing, song lab.
// No DOM use: safe in workers.

export const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export const SOLFEGE = ['Do','Di','Re','Ri','Mi','Fa','Fi','So','Si','La','Li','Ti'];
/** Standard tuning, low E to high e, as MIDI numbers. String index 0 = low E. */
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

export const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);
export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
export const pc = m => ((Math.round(m) % 12) + 12) % 12;
/** 'C4' style name. flats=true uses Db etc. */
export function noteName(midi, flats = false) {
  const r = Math.round(midi);
  return (flats ? FLAT : SHARP)[pc(r)] + (Math.floor(r / 12) - 1);
}
export const pcName = (p, flats = false) => (flats ? FLAT : SHARP)[((p % 12) + 12) % 12];
export function nameToPc(n) {
  const i = SHARP.indexOf(n); if (i >= 0) return i;
  const j = FLAT.indexOf(n); if (j >= 0) return j;
  const alias = { 'E#': 5, 'B#': 0, Fb: 4, Cb: 11 };
  return alias[n] ?? -1;
}
/** 'C4' -> 60 */
export function nameToMidi(s) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(s);
  if (!m) return NaN;
  return nameToPc(m[1]) + (+m[2] + 1) * 12;
}

// ---------- chords ----------
export const CHORD_TYPES = {
  '':     [0, 4, 7],
  'm':    [0, 3, 7],
  '7':    [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7':   [0, 3, 7, 10],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  'dim':  [0, 3, 6],
  'aug':  [0, 4, 8],
  '5':    [0, 7],
  'add9': [0, 2, 4, 7],
  '6':    [0, 4, 7, 9],
  'm6':   [0, 3, 7, 9],
  '9':    [0, 2, 4, 7, 10],
  'dim7': [0, 3, 6, 9],
  'm7b5': [0, 3, 6, 10],
};
const TYPE_ALIASES = { min: 'm', '-': 'm', M7: 'maj7', 'Δ': 'maj7', sus: 'sus4', 'ø': 'm7b5', '°': 'dim', maj: '' };

/** Parse 'F#m7/C#' -> {root:6, type:'m7', bass:1, pcs:[...], name} or null */
export function parseChord(name) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec((name || '').trim());
  if (!m) return null;
  const root = nameToPc(m[1]);
  let type = m[2] || '';
  type = TYPE_ALIASES[type] ?? type;
  if (!(type in CHORD_TYPES)) return null;
  const bass = m[3] ? nameToPc(m[3]) : root;
  const pcs = CHORD_TYPES[type].map(i => (root + i) % 12);
  return { root, type, bass, pcs, name: m[1] + type + (m[3] ? '/' + m[3] : '') };
}
export const chordName = (root, type = '', flats = false) => pcName(root, flats) + type;
export function transposeChord(name, semis, flats = false) {
  const c = parseChord(name); if (!c) return name;
  const r = chordName(c.root + semis, c.type, flats);
  return c.bass !== c.root ? r + '/' + pcName(c.bass + semis, flats) : r;
}
/** Reduce to a beginner-friendly chord: maj, m, 7, or 5 only; drops slash bass. */
export function simplifyChord(name, level = 1) {
  const c = parseChord(name); if (!c) return name;
  const keep = level >= 2 ? ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', '5'] : ['', 'm'];
  let t = c.type;
  if (!keep.includes(t)) {
    t = ['m', 'm7', 'm6', 'dim', 'm7b5', 'dim7'].includes(t) ? 'm' : '';
    if (level >= 2 && c.type === '9') t = '7';
  }
  return pcName(c.root, false) + t;
}

// ---------- guitar shapes ----------
// frets per string low E -> high e; -1 = muted, 0 = open. fingers optional (1-4, 'T' thumb, 0 open).
export const OPEN_SHAPES = {
  'C':     { f: [-1, 3, 2, 0, 1, 0], fi: [0, 3, 2, 0, 1, 0] },
  'Cmaj7': { f: [-1, 3, 2, 0, 0, 0], fi: [0, 3, 2, 0, 0, 0] },
  'C7':    { f: [-1, 3, 2, 3, 1, 0], fi: [0, 3, 2, 4, 1, 0] },
  'Cadd9': { f: [-1, 3, 2, 0, 3, 0], fi: [0, 2, 1, 0, 3, 0] },
  'D':     { f: [-1, -1, 0, 2, 3, 2], fi: [0, 0, 0, 1, 3, 2] },
  'Dm':    { f: [-1, -1, 0, 2, 3, 1], fi: [0, 0, 0, 2, 3, 1] },
  'D7':    { f: [-1, -1, 0, 2, 1, 2], fi: [0, 0, 0, 2, 1, 3] },
  'Dm7':   { f: [-1, -1, 0, 2, 1, 1], fi: [0, 0, 0, 2, 1, 1] },
  'Dmaj7': { f: [-1, -1, 0, 2, 2, 2], fi: [0, 0, 0, 1, 1, 1] },
  'Dsus2': { f: [-1, -1, 0, 2, 3, 0], fi: [0, 0, 0, 1, 3, 0] },
  'Dsus4': { f: [-1, -1, 0, 2, 3, 3], fi: [0, 0, 0, 1, 3, 4] },
  'E':     { f: [0, 2, 2, 1, 0, 0], fi: [0, 2, 3, 1, 0, 0] },
  'Em':    { f: [0, 2, 2, 0, 0, 0], fi: [0, 2, 3, 0, 0, 0] },
  'E7':    { f: [0, 2, 0, 1, 0, 0], fi: [0, 2, 0, 1, 0, 0] },
  'Em7':   { f: [0, 2, 0, 0, 0, 0], fi: [0, 2, 0, 0, 0, 0] },
  'Esus4': { f: [0, 2, 2, 2, 0, 0], fi: [0, 2, 3, 4, 0, 0] },
  'E5':    { f: [0, 2, 2, -1, -1, -1], fi: [0, 1, 2, 0, 0, 0] },
  'F':     { f: [1, 3, 3, 2, 1, 1], fi: [1, 3, 4, 2, 1, 1], barre: 1 },
  'Fmaj7': { f: [-1, -1, 3, 2, 1, 0], fi: [0, 0, 3, 2, 1, 0] },
  'G':     { f: [3, 2, 0, 0, 0, 3], fi: [2, 1, 0, 0, 0, 3] },
  'G7':    { f: [3, 2, 0, 0, 0, 1], fi: [3, 2, 0, 0, 0, 1] },
  'Gsus4': { f: [3, 3, 0, 0, 1, 3], fi: [2, 3, 0, 0, 1, 4] },
  'G5':    { f: [3, 5, 5, -1, -1, -1], fi: [1, 3, 4, 0, 0, 0] },
  'A':     { f: [-1, 0, 2, 2, 2, 0], fi: [0, 0, 1, 2, 3, 0] },
  'Am':    { f: [-1, 0, 2, 2, 1, 0], fi: [0, 0, 2, 3, 1, 0] },
  'A7':    { f: [-1, 0, 2, 0, 2, 0], fi: [0, 0, 2, 0, 3, 0] },
  'Am7':   { f: [-1, 0, 2, 0, 1, 0], fi: [0, 0, 2, 0, 1, 0] },
  'Amaj7': { f: [-1, 0, 2, 1, 2, 0], fi: [0, 0, 2, 1, 3, 0] },
  'Asus2': { f: [-1, 0, 2, 2, 0, 0], fi: [0, 0, 1, 2, 0, 0] },
  'Asus4': { f: [-1, 0, 2, 2, 3, 0], fi: [0, 0, 1, 2, 3, 0] },
  'A5':    { f: [-1, 0, 2, 2, -1, -1], fi: [0, 0, 1, 2, 0, 0] },
  'B7':    { f: [-1, 2, 1, 2, 0, 2], fi: [0, 2, 1, 3, 0, 4] },
  'Bm':    { f: [-1, 2, 4, 4, 3, 2], fi: [0, 1, 3, 4, 2, 1], barre: 2 },
  'D5':    { f: [-1, -1, 0, 2, 3, -1], fi: [0, 0, 0, 1, 2, 0] },
};
// Movable barre templates relative to the root fret.
const E_SHAPE = { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, -99, -99, -99], maj7: [0, -99, 1, 1, 0, -99] };
const A_SHAPE = { '': [-99, 0, 2, 2, 2, 0], m: [-99, 0, 2, 2, 1, 0], '7': [-99, 0, 2, 0, 2, 0], m7: [-99, 0, 2, 0, 1, 0], sus4: [-99, 0, 2, 2, 3, 0], sus2: [-99, 0, 2, 2, 0, 0], maj7: [-99, 0, 2, 1, 2, 0], '5': [-99, 0, 2, 2, -99, -99] };

function barreFrom(tpl, rootFret) {
  return tpl.map(v => (v <= -99 ? -1 : v + rootFret));
}
/**
 * Best playable shape for a chord name.
 * @returns {{f:number[], fi?:number[], barre?:number, name:string, open:boolean, difficulty:number}|null}
 */
export function shapeFor(name) {
  const c = parseChord(name); if (!c) return null;
  const base = c.name.split('/')[0];
  const flatBase = pcName(c.root, true) + c.type;
  const sharpBase = pcName(c.root) + c.type;
  const o = OPEN_SHAPES[sharpBase] || OPEN_SHAPES[flatBase];
  if (o) return { ...o, name: base, open: !o.barre, difficulty: o.barre ? 3 : (['F', 'Bm', 'B7'].includes(base) ? 2 : 1) };
  const cands = [];
  const type = c.type in E_SHAPE || c.type in A_SHAPE ? c.type : (simplifyChord(name, 2).replace(/^[A-G][#b]?/, ''));
  if (E_SHAPE[type]) { const fr = (c.root - 4 + 12) % 12 || 12; if (fr <= 9) cands.push({ f: barreFrom(E_SHAPE[type], fr === 12 ? 0 : fr), barre: fr === 12 ? 0 : fr }); }
  if (A_SHAPE[type]) { const fr = (c.root - 9 + 12) % 12 || 12; if (fr <= 9) cands.push({ f: barreFrom(A_SHAPE[type], fr === 12 ? 0 : fr), barre: fr === 12 ? 0 : fr }); }
  if (!cands.length) return null;
  cands.sort((p, q) => p.barre - q.barre);
  const s = cands[0];
  return { ...s, name: base, open: false, difficulty: 3 };
}
/** MIDI notes of a fret shape (muted strings skipped). */
export const shapeMidis = (f, capo = 0) => f.map((v, i) => (v < 0 ? null : OPEN_STRINGS[i] + v + capo)).filter(v => v !== null);

/** Chords a beginner can play as open shapes. */
export const EASY_CHORDS = ['C', 'D', 'Dm', 'E', 'Em', 'G', 'A', 'Am', 'A7', 'D7', 'E7', 'G7', 'C7', 'Em7', 'Am7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4', 'Cadd9', 'B7', 'F'];

/**
 * Find the capo position that makes a song's chords easiest.
 * @param {string[]} names chords as they sound
 * @param {Set<string>|string[]} known chords the player already knows (shape names)
 * @returns {{capo:number, shapes:string[], score:number}[]} best first
 */
export function capoOptions(names, known = EASY_CHORDS) {
  const K = new Set(known);
  const uniq = [...new Set(names)];
  const out = [];
  for (let capo = 0; capo <= 7; capo++) {
    let score = 0;
    const shapes = uniq.map(n => {
      const s = transposeChord(n, -capo);
      const simple = simplifyChord(s, 2);
      const sh = shapeFor(s);
      if (K.has(s)) score += 3; else if (K.has(simple)) score += 2; else if (sh && sh.open) score += 1; else score -= 2;
      return s;
    });
    out.push({ capo, shapes, score: score - capo * 0.15 });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- keys & scales ----------
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Krumhansl key profiles, for key finding from a pitch-class histogram. */
export const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
/** @returns {{tonic:number, mode:'major'|'minor', score:number, name:string}} */
export function findKey(hist) {
  let best = null;
  const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(da * db || 1);
  };
  for (let t = 0; t < 12; t++) {
    for (const [mode, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]]) {
      const rot = prof.map((_, i) => prof[(i - t + 12) % 12]);
      const s = corr(hist, rot);
      if (!best || s > best.score) best = { tonic: t, mode, score: s };
    }
  }
  best.name = pcName(best.tonic, [5, 10, 3, 8, 1].includes(best.tonic)) + (best.mode === 'minor' ? ' minor' : ' major');
  return best;
}
export const scaleMidis = (tonicMidi, steps = MAJOR, octaves = 1) => {
  const out = [];
  for (let o = 0; o < octaves; o++) for (const s of steps) out.push(tonicMidi + 12 * o + s);
  out.push(tonicMidi + 12 * octaves);
  return out;
};
