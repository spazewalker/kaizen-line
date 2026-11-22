// Built-in practice material. Only traditional / public-domain songs and original exercises.
// Chord songs: one chord name per bar ('-' = same as before). Melodies: [string, fret, beats] with
// strings 0 = low E ... 5 = high e.

export const CHORD_SONGS = {
  loop4: { title: 'Four-chord loop (exercise)', bpm: 76, bpb: 4, key: 'G major', bars: 'Em C G D Em C G D'.split(' '), note: 'Original practice loop' },
  emam: { title: 'Em and Am swap (exercise)', bpm: 70, bpb: 4, bars: 'Em Em Am Am Em Em Am Em'.split(' '), note: 'Original practice loop' },
  ead: { title: 'E · A · D blues walk (exercise)', bpm: 80, bpb: 4, key: 'E', bars: 'E E E E A A E E D A E E'.split(' '), note: '12-bar pattern (traditional form)' },
  gcd: { title: 'G · C · D campfire (exercise)', bpm: 80, bpb: 4, key: 'G major', bars: 'G G C C G G D D G G C C D D G G'.split(' '), note: 'Original practice loop' },
  amazing: { title: 'Amazing Grace', bpm: 84, bpb: 3, key: 'G major', bars: 'G G C G G G D D G G C G G D G G'.split(' '), note: 'Traditional hymn (public domain), simplified chords' },
  auld: { title: 'Auld Lang Syne', bpm: 84, bpb: 4, key: 'G major', bars: 'G D G C G D C D G D G C G D G G'.split(' '), note: 'Traditional Scottish (public domain), simplified chords' },
  rising: { title: 'House of the Rising Sun', bpm: 100, bpb: 3, key: 'A minor', bars: 'Am C D Fmaj7 Am C E E Am C D Fmaj7 Am E Am E'.split(' '), note: 'Traditional folk (public domain). Uses Fmaj7, the easy F.' },
  risingF: { title: 'House of the Rising Sun (with F barre)', bpm: 100, bpb: 3, key: 'A minor', bars: 'Am C D F Am C E E Am C D F Am E Am E'.split(' '), note: 'Traditional folk (public domain)' },
  scarborough: { title: 'Scarborough Fair', bpm: 96, bpb: 3, key: 'A minor (Dorian)', bars: 'Am Am G Am C Am D Am Am C C G Am G Am Am'.split(' '), note: 'Traditional English ballad (public domain), simplified chords' },
  greensleeves: { title: 'Greensleeves', bpm: 96, bpb: 3, key: 'A minor', bars: 'Am C G Em Am Fmaj7 E E Am C G Em Am E Am Am'.split(' '), note: 'Traditional English (public domain), simplified chords' },
  shenandoah: { title: 'Shenandoah', bpm: 72, bpb: 4, key: 'G major', bars: 'G G C G Em C G G D Em C G C G D G'.split(' '), note: 'Traditional American folk (public domain), simplified chords' },
  sevenths: { title: 'Seventh-chord shuffle (exercise)', bpm: 80, bpb: 4, key: 'A', bars: 'A7 A7 D7 D7 A7 A7 E7 E7 D7 D7 A7 E7'.split(' '), note: 'Original 12-bar exercise' },
  barre: { title: 'C to F barre (exercise)', bpm: 66, bpb: 4, key: 'C major', bars: 'C C F F C C F F Am Am F G C C F C'.split(' '), note: 'Original practice loop' },
  bminor: { title: 'Bm drill (exercise)', bpm: 70, bpb: 4, key: 'D major', bars: 'D D Bm Bm G G A A D D Bm Bm G A D D'.split(' '), note: 'Original practice loop' },
  power: { title: 'Power chord rock (exercise)', bpm: 96, bpb: 4, key: 'E', bars: 'E5 E5 G5 A5 E5 E5 D5 A5'.split(' '), note: 'Original practice loop' },
};

/** Convert a bar list into a session for startChordSession. Consecutive equal bars merge into one block. */
export function songSession(id, { bpm } = {}) {
  const s = CHORD_SONGS[id];
  const B = bpm || s.bpm, spb = 60 / B, bar = s.bpb * spb;
  const chords = [];
  s.bars.forEach((n, i) => {
    const name = n === '-' ? chords[chords.length - 1].name : n;
    const last = chords[chords.length - 1];
    if (last && last.name === name) last.dur += bar;
    else chords.push({ t: i * bar, dur: bar, name });
  });
  const beats = [];
  for (let i = 0; i <= s.bars.length * s.bpb; i++) beats.push(+(i * spb).toFixed(4));
  const sections = [];
  for (let i = 0; i < s.bars.length; i += 4) sections.push({ name: `Bars ${i + 1}–${Math.min(s.bars.length, i + 4)}`, t0: i * bar, t1: Math.min(s.bars.length, i + 4) * bar });
  return { title: s.title, bpm: B, beatsPerBar: s.bpb, beats, chords, capo: 0, key: s.key, sections };
}

// [string, fret, beats]
const C4 = [4, 1], D4 = [4, 3], E4 = [5, 0], F4 = [5, 1], G4 = [5, 3], A4 = [5, 5], B3 = [4, 0];
const m = (seq, beats = 1) => seq.map(x => Array.isArray(x[0]) ? [...x[0], x[1]] : [...x, beats]);

export const MELODIES = {
  ewalk: { title: 'High e walk (exercise)', bpm: 66, notes: m([[5, 0], [5, 1], [5, 3], [5, 1], [5, 0], [5, 1], [5, 3], [[5, 0], 2]]) },
  bwalk: { title: 'B string walk (exercise)', bpm: 66, notes: m([[4, 0], [4, 1], [4, 3], [4, 1], [4, 0], [4, 3], [4, 1], [[4, 0], 2]]) },
  twostring: { title: 'Two-string climb (exercise)', bpm: 66, notes: m([C4, D4, E4, F4, G4, F4, E4, D4, [C4, 2]]) },
  twinkle: { title: 'Twinkle, Twinkle, Little Star', bpm: 80, notes: m([C4, C4, G4, G4, A4, A4, [G4, 2], F4, F4, E4, E4, D4, D4, [C4, 2], G4, G4, F4, F4, E4, E4, [D4, 2], G4, G4, F4, F4, E4, E4, [D4, 2], C4, C4, G4, G4, A4, A4, [G4, 2], F4, F4, E4, E4, D4, D4, [C4, 2]]) },
  mary: { title: 'Mary Had a Little Lamb', bpm: 84, notes: m([E4, D4, C4, D4, E4, E4, [E4, 2], D4, D4, [D4, 2], E4, G4, [G4, 2], E4, D4, C4, D4, E4, E4, E4, E4, D4, D4, E4, D4, [C4, 4]]) },
  frere: { title: 'Frère Jacques', bpm: 84, notes: m([C4, D4, E4, C4, C4, D4, E4, C4, E4, F4, [G4, 2], E4, F4, [G4, 2], [G4, 0.5], [A4, 0.5], [G4, 0.5], [F4, 0.5], E4, C4, [G4, 0.5], [A4, 0.5], [G4, 0.5], [F4, 0.5], E4, C4, C4, [[3, 0], 1], [C4, 2], C4, [[3, 0], 1], [C4, 2]]) },
  ode: { title: 'Ode to Joy (Beethoven)', bpm: 88, notes: m([E4, E4, F4, G4, G4, F4, E4, D4, C4, C4, D4, E4, [E4, 1.5], [D4, 0.5], [D4, 2], E4, E4, F4, G4, G4, F4, E4, D4, C4, C4, D4, E4, [D4, 1.5], [C4, 0.5], [C4, 2]]) },
  lowriff: { title: 'Low string riff (original)', bpm: 84, notes: m([[0, 0], [0, 0], [0, 3], [0, 0], [1, 0], [1, 2], [0, 3], [[0, 0], 2], [0, 0], [0, 0], [0, 3], [0, 0], [1, 2], [1, 0], [[0, 3], 2]]) },
  power: { title: 'Root notes for power chords (original)', bpm: 80, notes: m([[[0, 0], 2], [[0, 3], 2], [[0, 5], 2], [[0, 0], 2], [[1, 0], 2], [[1, 3], 2], [[1, 5], 2], [[0, 0], 2]]) },
  penta: { title: 'A minor pentatonic, box 1', bpm: 72, notes: m([[0, 5], [0, 8], [1, 5], [1, 7], [2, 5], [2, 7], [3, 5], [3, 7], [4, 5], [4, 8], [5, 5], [5, 8], [5, 5], [4, 8], [4, 5], [3, 7], [3, 5], [2, 7], [2, 5], [1, 7], [1, 5], [0, 8], [[0, 5], 2]]) },
  lick1: { title: 'Lick 1: the call (original)', bpm: 76, notes: m([[5, 8], [5, 5], [4, 8], [4, 5], [3, 7], [[3, 5], 2], [2, 7], [[2, 5], 3]]) },
  lick2: { title: 'Lick 2: the answer (original)', bpm: 76, notes: m([[2, 5], [2, 7], [3, 5], [3, 7], [[4, 5], 2], [3, 7], [[3, 5], 3]]) },
  lick3: { title: 'Lick 3: bend-free blues (original)', bpm: 80, notes: m([[3, 7], [3, 5], [2, 7], [[2, 5], 1.5], [[1, 7], 0.5], [1, 5], [[2, 7], 2], [[1, 5], 2]]) },
};
/** Piece for startNoteHighway: notes with beat positions. */
export function melodyPiece(id) {
  const s = MELODIES[id];
  let b = 0;
  const notes = s.notes.map(([st, f, d]) => { const n = { b, d, s: st, f }; b += d; return n; });
  return { title: s.title, bpm: s.bpm, bpb: 4, notes };
}
