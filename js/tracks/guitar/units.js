// Guitar curriculum: 26 stations, beginner to first songs and licks.
import { chordSVG } from '../../core/ui.js';
import { pluck, strum, unlock } from '../../core/audio.js';
import { OPEN_STRINGS, shapeFor } from '../../core/music.js';
import { fretboardHTML, patternHTML } from './fretboard.js';
import { checkCard, patternCard } from './games.js';
import { mountTuner } from './tuner.js';
import { melodyPiece } from './songs.js';

const strumBtns = names => `<div class="row tight gt-btnrow">${names.map(n => `<button class="play" data-strum="${n}">${n}</button>`).join('')}</div>`;
const midiSeq = id => melodyPiece(id).notes.map(n => OPEN_STRINGS[n.s] + n.f);
const known = chords => ({ settings }) => { const k = new Set(settings.get().knownChords || []); chords.forEach(c => k.add(c)); settings.set({ knownChords: [...k] }); };

function chordCard(name, how, extra = '') {
  const sh = shapeFor(name);
  return {
    title: `Meet ${name}`,
    html: `<div class="gt-chordcard">${chordSVG(name, { size: 190 })}<div><p>${how}</p>
      <div class="row tight gt-btnrow"><button class="play" data-strum="${name}">Strum</button><button class="play" data-arp="${name}">One string at a time</button></div>
      <p class="muted small">Numbers in the dots = which finger: 1 index, 2 middle, 3 ring, 4 little. ${sh && sh.f.includes(-1) ? '× = do not play that string.' : ''}</p>${extra}</div></div>`,
  };
}
const melodyCard = (title, id, text) => ({ title, html: `<p>${text}</p><div class="row tight"><button class="play" data-seq="${midiSeq(id).join(',')}" data-gap="0.42">Hear the melody</button></div>` });

const guitarSVG = `<svg viewBox="0 0 420 150" class="gt-parts" role="img" aria-label="Guitar parts: head with tuning pegs, neck with frets, body with sound hole and bridge">
  <rect x="8" y="58" width="46" height="34" rx="8" class="p-head"/>${[0, 1, 2].map(i => `<circle cx="${18 + i * 13}" cy="52" r="5" class="p-peg"/><circle cx="${18 + i * 13}" cy="98" r="5" class="p-peg"/>`).join('')}
  <rect x="54" y="64" width="190" height="22" class="p-neck"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${62 + i * 23}" y1="64" x2="${62 + i * 23}" y2="86" class="p-fret"/>`).join('')}
  <ellipse cx="300" cy="75" rx="62" ry="58" class="p-body"/><ellipse cx="370" cy="75" rx="44" ry="50" class="p-body"/><circle cx="292" cy="75" r="20" class="p-hole"/><rect x="352" y="62" width="10" height="26" rx="3" class="p-bridge"/>
  ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="30" y1="${67 + i * 3.2}" x2="357" y2="${67 + i * 3.2}" class="p-str"/>`).join('')}
  <text x="10" y="128" class="p-lbl">head + pegs</text><text x="110" y="120" class="p-lbl">neck + frets</text><text x="262" y="146" class="p-lbl">sound hole</text><text x="340" y="22" class="p-lbl">bridge</text></svg>`;

function detuneCard() {
  return {
    title: 'Why tune first',
    html: `<p>Listen to the same chord twice. First in tune, then out of tune.</p><div class="row"><button class="btn primary" data-in>In tune</button><button class="btn ghost" data-out>Out of tune</button></div>
      <p>Out of tune sounds sour, even when your fingers are perfect. Guitars go out of tune every day. Tune each time you play: it takes one minute.</p>`,
    mount(el) {
      const f = shapeFor('G').f, off = [0.35, -0.3, 0.2, -0.45, 0.3, -0.25];
      el.querySelector('[data-in]').onclick = () => { unlock(); strum(f); };
      el.querySelector('[data-out]').onclick = () => { unlock(); f.forEach((v, i) => pluck(OPEN_STRINGS[i] + v + off[i], { at: i * 0.03, vel: 0.22 })); };
    },
  };
}
function tunerCard() {
  return {
    title: 'Tune your guitar now', requireDone: true,
    html: '<p>Pluck one string at a time. Watch the needle. Tighten if it is left (flat), loosen if it is right (sharp). Each string gets a ✓ when it is in tune.</p><div class="gt-tunercard"></div><button class="btn ghost sm" data-skip>Skip (my guitar is in tune)</button>',
    mount(el, ctx) {
      let cl = null, gone = false;
      el.querySelector('[data-skip]').onclick = () => ctx.done();
      el.querySelector('.gt-tunercard').innerHTML = '<button class="btn primary" data-t>Open the tuner</button>';
      el.querySelector('[data-t]').onclick = () => mountTuner(el.querySelector('.gt-tunercard'), { compact: true, onAllTuned: () => ctx.done() }).then(c => { if (gone) c(); else cl = c; });
      return () => { gone = true; if (cl) cl(); };
    },
  };
}
const openStrings = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];

export const UNITS = [
  { id: 'gt-01', title: 'Meet your guitar', sub: 'Parts, posture, six strings', minutes: 8, learns: [0, 1, 2, 3, 4, 5].map(i => `gt:string:${i}`), steps: [
    { type: 'lesson', cards: [
      { title: 'Listen: where you are going', html: `<p>These are three chords: G, C and D. In a few weeks your hands will play them, and songs with them.</p>${strumBtns(['G', 'C', 'D', 'Em'])}<p>Every station here works the same way: listen, learn one small thing, then play games. The app listens to your guitar and tells you what to fix.</p>` },
      { title: 'The parts', html: `${guitarSVG}<ul><li><b>Pegs</b> on the head tune the strings.</li><li><b>Frets</b> are the metal bars on the neck. "Fret 3" = the space before the 3rd bar.</li><li>You strum over the <b>sound hole</b>.</li></ul>` },
      { title: 'Sit like a player', html: '<ul><li>Sit on a chair without arms. Put the guitar on your right leg (left leg if you play left-handed).</li><li>Hold the body close. The neck points a little up.</li><li>Your fretting thumb rests behind the neck, not over it.</li><li>Relax your shoulders. Tension makes you slow and tired.</li></ul>', tip: 'Short and often beats long and rare. 10 minutes a day is enough.' },
      { title: 'Hold the pick', html: '<p>Hold the pick between your thumb pad and the side of your index finger. Only a small tip shows.</p><p>Hold it firm, but not tight. No pick? Use the side of your thumb. That is fine for now.</p>' },
      { title: 'Six strings, low to high', html: `<p>Tap each string to hear it. The thickest string sounds lowest.</p>${fretboardHTML({ frets: 3 })}<div class="row tight gt-btnrow">${['E', 'A', 'D', 'G', 'B', 'e'].map((n, i) => `<button class="play" data-pluck="${OPEN_STRINGS[i]}">${n}</button>`).join('')}</div><p>Remember: <b>E</b>ddie <b>A</b>te <b>D</b>ynamite, <b>G</b>ood <b>B</b>ye <b>E</b>ddie. Strings are also numbered: 6 = low E (thickest), 1 = high e (thinnest).</p>` },
    ] },
    { type: 'game', game: 'names', args: { n: 10, mode: 'name' } },
    { type: 'game', game: 'names', args: { n: 10 } },
  ] },
  { id: 'gt-02', title: 'Tune up', sub: 'The tuner listens to you', minutes: 8, steps: [
    { type: 'lesson', cards: [detuneCard(),
      { title: 'How the pegs work', html: '<ul><li>Tighter string = higher note. Looser string = lower note.</li><li>Turn slowly, a little at a time. Pluck again after each turn.</li><li>If you are far off, tune a bit below the note, then come up to it. Strings hold better that way.</li></ul>' },
      tunerCard()] },
    { type: 'game', game: 'notehunt', args: { notes: openStrings, n: 6, play: true } },
    { type: 'game', game: 'names', args: { n: 8, mode: 'hear' } },
  ] },
  { id: 'gt-03', title: 'Your first notes', sub: 'Fretting on the e and B strings', minutes: 10, learns: ['gt:note:5:0', 'gt:note:5:1', 'gt:note:5:3', 'gt:note:4:0', 'gt:note:4:1', 'gt:note:4:3'], steps: [
    { type: 'lesson', cards: [
      { title: 'Press right behind the fret', html: `<p>Use the very tip of your finger. Press just behind the metal fret, not in the middle of the space.</p>${fretboardHTML({ frets: 4, marks: [{ s: 5, f: 1, label: '1' }, { s: 5, f: 3, label: '3' }] })}<div class="row tight gt-btnrow"><button class="play" data-pluck="64">open e</button><button class="play" data-pluck="65">fret 1</button><button class="play" data-pluck="67">fret 3</button></div>`, tip: 'Buzz? Press closer to the fret, or a bit harder. Fingertips get tough in about two weeks.' },
      { title: 'One finger per fret', html: '<p>Fret 1 = finger 1 (index). Fret 2 = finger 2. Fret 3 = finger 3 (ring). This keeps your hand in one place.</p><p>Notes on the high e string: open = E, fret 1 = F, fret 3 = G.<br>On the B string: open = B, fret 1 = C, fret 3 = D.</p><div class="row tight gt-btnrow"><button class="play" data-pluck="59">B</button><button class="play" data-pluck="60">C</button><button class="play" data-pluck="62">D</button><button class="play" data-pluck="64">E</button><button class="play" data-pluck="65">F</button><button class="play" data-pluck="67">G</button></div>' },
      { title: 'Read the note highway', html: '<p>In the next game, notes slide along the six strings, like guitar tab. The top line is the thin high e string. The number in each note is the fret. 0 = open.</p><p>Tap <b>Listen first</b> to hear it. "Wait for me" stops until you play each note.</p>' },
    ] },
    { type: 'game', game: 'notehunt', args: { notes: [[5, 0], [5, 1], [5, 3], [4, 0], [4, 1], [4, 3]], n: 8 } },
    { type: 'game', game: 'riff', args: { piece: 'ewalk' } },
    { type: 'game', game: 'riff', args: { piece: 'bwalk' } },
  ] },
  { id: 'gt-04', title: 'First melody', sub: 'Twinkle, Twinkle', minutes: 10, learns: ['gt:note:5:5'], steps: [
    { type: 'lesson', cards: [
      melodyCard('Listen first', 'twinkle', 'You know this tune. You will play it on two strings: B and high e.'),
      { title: 'The notes', html: `${fretboardHTML({ frets: 5, marks: [{ s: 4, f: 1, label: 'C' }, { s: 4, f: 3, label: 'D' }, { s: 5, f: 0, label: 'E' }, { s: 5, f: 1, label: 'F' }, { s: 5, f: 3, label: 'G' }, { s: 5, f: 5, label: 'A' }] })}<p>New note: A, fret 5 on the high e. Use your little finger, or slide finger 3 up.</p>` },
    ] },
    { type: 'game', game: 'riff', args: { piece: 'twostring' } },
    { type: 'game', game: 'riff', args: { piece: 'twinkle' } },
    { type: 'game', game: 'notehunt', args: { notes: [[4, 1], [4, 3], [5, 0], [5, 1], [5, 3], [5, 5]], n: 8 } },
  ] },
  { id: 'gt-05', title: 'Two more tunes', sub: 'Mary · Frère Jacques', minutes: 10, learns: ['gt:note:3:0'], steps: [
    { type: 'lesson', cards: [melodyCard('Mary Had a Little Lamb', 'mary', 'Only three notes: E, D and C. Listen, then hum it once.'), melodyCard('Frère Jacques', 'frere', 'This one uses a low G: the open G string. It also has faster notes. Use "Wait for me" first.')] },
    { type: 'game', game: 'riff', args: { piece: 'mary' } },
    { type: 'game', game: 'riff', args: { piece: 'frere' } },
    { type: 'game', game: 'notehunt', args: { notes: [[3, 0], [4, 1], [4, 3], [5, 0], [5, 3]], n: 6, play: true } },
  ] },
  { id: 'gt-06', title: 'Ode to Joy', sub: 'Beethoven on two strings', minutes: 10, steps: [
    { type: 'lesson', cards: [melodyCard('Listen first', 'ode', 'Beethoven wrote this. It moves step by step, so your fingers barely move.'), { title: 'Dotted rhythm', html: '<p>Near the end of each line, one note is longer (1½ beats) and the next is short (½ beat). Hum it: "da-a da DAA".</p>' }] },
    { type: 'game', game: 'riff', args: { piece: 'ode', wait: true } },
    { type: 'game', game: 'riff', args: { piece: 'ode', wait: false, speed: 0.7 } },
  ] },
  { id: 'gt-07', title: 'Your first chord: Em', sub: 'Read a chord chart', minutes: 10, learns: ['gt:chord:Em'], onComplete: known(['Em']), steps: [
    { type: 'lesson', cards: [
      { title: 'Listen: a chord', html: `<p>A chord = several strings at once. Hear E minor (Em). It sounds a little sad.</p>${strumBtns(['Em'])}` },
      { title: 'How to read a chord chart', html: `<div class="gt-chordcard">${chordSVG('Em', { size: 170 })}<ul><li>A chord chart is the neck standing up. Low E string on the left.</li><li>Horizontal lines are frets. The thick top line is the nut.</li><li>Dots = fingers. ○ = play the string open. × = do not play it.</li></ul></div>` },
      chordCard('Em', 'Fingers 2 and 3 on the 2nd fret of the A and D strings. Strum all six strings.'),
      checkCard('Em'),
    ] },
    { type: 'game', game: 'build', args: { chords: ['Em'] } },
    { type: 'game', game: 'strings', args: { chords: ['Em'] } },
    { type: 'game', game: 'check', args: { chords: ['Em'], reps: 3 } },
  ] },
  { id: 'gt-08', title: 'Am and E', sub: 'One shape, two chords', minutes: 12, learns: ['gt:chord:Am', 'gt:chord:E'], onComplete: known(['Am', 'E']), steps: [
    { type: 'lesson', cards: [
      chordCard('E', 'E is Em plus finger 1 on the G string, 1st fret. One finger turns sad into happy. Hear both:', strumBtns(['Em', 'E'])),
      chordCard('Am', 'Take the E shape and move it one string toward the floor. Do not play the low E string.'),
      checkCard('Am'),
    ] },
    { type: 'game', game: 'build', args: { chords: ['E', 'Am'] } },
    { type: 'game', game: 'check', args: { chords: ['Am', 'E', 'Em'], reps: 1 } },
    { type: 'game', game: 'quiz', args: { chords: ['Em', 'E', 'Am'], n: 6 } },
  ] },
  { id: 'gt-09', title: 'Steady strumming', sub: 'Down strokes on the beat', minutes: 10, learns: ['gt:pattern:D.D.D.D.'], steps: [
    { type: 'lesson', cards: [
      patternCard('Down, down, down, down', 'D.D.D.D.', 72, 'Em', '<p>Strum down on each beat. Count out loud: 1, 2, 3, 4.</p><p>Move from the wrist and elbow, like shaking water off your hand. Keep the strum loose.</p>'),
      { title: 'Change without stopping', html: '<p>The beat never waits. When it is time to change chord, lift your fingers on beat 4 and land on the new shape for beat 1. A few open strings in between is fine.</p>' },
    ] },
    { type: 'game', game: 'strum', args: { pattern: 'D.D.D.D.', bpm: 66, chords: ['Em'], bars: 4 } },
    { type: 'game', game: 'strum', args: { pattern: 'D.D.D.D.', bpm: 70, chords: ['Em', 'Am'], bars: 4 } },
    { type: 'game', game: 'song', args: { song: 'emam', speed: 0.8 } },
  ] },
  { id: 'gt-10', title: 'A and D', sub: 'Plus your first blues', minutes: 12, learns: ['gt:chord:A', 'gt:chord:D'], onComplete: known(['A', 'D']), steps: [
    { type: 'lesson', cards: [
      chordCard('A', 'Fingers 1, 2 and 3 side by side on the 2nd fret. Squeeze them in. Skip the low E.'),
      chordCard('D', 'A small triangle on the 3 thin strings. Play only the 4 thinnest strings.'),
      checkCard('D'),
      { title: 'The 12-bar blues', html: '<p>E, A and D make a classic blues pattern. It is 12 bars long. Thousands of songs use it.</p><div class="row tight gt-btnrow"><button class="play" data-strum="E">E</button><button class="play" data-strum="A">A</button><button class="play" data-strum="D">D</button></div>' },
    ] },
    { type: 'game', game: 'build', args: { chords: ['A', 'D'] } },
    { type: 'game', game: 'check', args: { chords: ['A', 'D'], reps: 2 } },
    { type: 'game', game: 'song', args: { song: 'ead' } },
  ] },
  { id: 'gt-11', title: 'G and C', sub: 'The campfire chords', minutes: 12, learns: ['gt:chord:G', 'gt:chord:C'], onComplete: known(['G', 'C']), steps: [
    { type: 'lesson', cards: [
      chordCard('G', 'A wide shape. Fingers 1 and 2 on the low strings, finger 3 on the high e, 3rd fret. All six strings ring.'),
      chordCard('C', 'A staircase: fingers 3, 2, 1 go down the frets. Skip the low E. Arch your fingers so the open strings ring.'),
      checkCard('C'),
    ] },
    { type: 'game', game: 'build', args: { chords: ['G', 'C'] } },
    { type: 'game', game: 'check', args: { chords: ['G', 'C'], reps: 2 } },
    { type: 'game', game: 'song', args: { song: 'gcd' } },
  ] },
  { id: 'gt-12', title: 'One-minute changes', sub: 'The fastest way to get better', minutes: 10, steps: [
    { type: 'lesson', cards: [
      { title: 'Why chord changes matter', html: '<p>Slow chord changes stop most beginners. The fix is simple: practise only the change.</p><p>Pick two chords. Switch between them for one minute. Count the clean changes. Do it every day and write down your best.</p>', tip: 'The app counts for you and keeps your personal best for each pair.' },
      { title: 'How to change fast', html: '<ul><li>Look at the next shape before you move.</li><li>Lift all fingers together, land them together, like a stamp.</li><li>Keep fingers close to the strings.</li><li>Find "anchor" fingers that stay or slide (G to C keeps nothing, but A to D keeps finger 1 close).</li></ul>' },
    ] },
    { type: 'game', game: 'switch', args: { a: 'Em', b: 'Am', target: 20 } },
    { type: 'game', game: 'switch', args: { a: 'A', b: 'D', target: 18 } },
    { type: 'game', game: 'switch', args: { a: 'G', b: 'C', target: 15 } },
  ] },
  { id: 'gt-13', title: 'Reading rhythm', sub: 'Quarters and eighths', minutes: 10, learns: ['gt:pattern:DUDUDUDU'], steps: [
    { type: 'lesson', cards: [
      patternCard('Quarter notes', 'D.D.D.D.', 76, 'G', '<p>One strum per beat. Count "1, 2, 3, 4".</p>'),
      patternCard('Eighth notes', 'DUDUDUDU', 66, 'G', '<p>Two strums per beat: down on the number, up on the "and". Count "1 & 2 & 3 & 4 &".</p>'),
      { title: 'The hand never stops', html: '<p>Your strumming hand moves down on every number and up on every "&", all the time. When the pattern has a gap, you just miss the strings. This keeps you on time.</p>' },
    ] },
    { type: 'game', game: 'echo', args: { patterns: ['D.D.D.D.', 'DUDUD.D.', 'D.D.DUDU', 'DUDUDUDU'] } },
    { type: 'game', game: 'strum', args: { pattern: 'DUDUDUDU', bpm: 60, chords: ['G'], bars: 4 } },
  ] },
  { id: 'gt-14', title: 'The folk strum', sub: 'Down, down-up, up-down-up', minutes: 12, learns: ['gt:pattern:D.DU.UDU'], steps: [
    { type: 'lesson', cards: [
      patternCard('The pattern', 'D.DU.UDU', 76, 'G', '<p>Down, down-up, up-down-up. Count "1, 2 &, & 4 &". On beat 3 your hand goes down but misses the strings.</p>'),
      patternCard('Slow it down', 'D.DU.UDU', 56, 'C', '<p>Play it slowly first. Speed comes by itself.</p>'),
    ] },
    { type: 'game', game: 'strum', args: { pattern: 'D.DU.UDU', bpm: 56, chords: ['G'], bars: 4 } },
    { type: 'game', game: 'echo', args: { patterns: ['D.DU.UDU', 'D.D.DUDU', 'D.DU.UDU', 'D.DUDUD.'] } },
    { type: 'game', game: 'song', args: { song: 'loop4', speed: 0.8 } },
  ] },
  { id: 'gt-15', title: 'D minor and your ear', sub: 'Hear major vs minor', minutes: 10, learns: ['gt:chord:Dm'], onComplete: known(['Dm']), steps: [
    { type: 'lesson', cards: [
      { title: 'Bright vs sad', html: `<p>Major chords sound bright. Minor chords sound sad. Only one note is different.</p><div class="grid2">${['E', 'Em', 'A', 'Am', 'D', 'Dm'].map(n => `<button class="play" data-strum="${n}">${n}</button>`).join('')}</div>` },
      chordCard('Dm', 'Like D, but finger 1 drops to the 1st fret of the high e. Hear how sad it gets.'),
    ] },
    { type: 'game', game: 'ear', args: { mode: 'mm', n: 10 } },
    { type: 'game', game: 'build', args: { chords: ['Dm'] } },
    { type: 'game', game: 'check', args: { chords: ['Dm', 'D'], reps: 2 } },
  ] },
  { id: 'gt-16', title: 'Song: Amazing Grace', sub: 'G · C · D in 3/4 time', minutes: 12, steps: [
    { type: 'lesson', cards: [
      patternCard('Waltz time', 'D.D.D.', 84, 'G', '<p>This song counts in 3: "1, 2, 3". Strum harder on 1.</p>'),
      { title: 'The chords', html: `<div class="row">${['G', 'C', 'D'].map(n => chordSVG(n, { size: 110 })).join('')}</div><p>Traditional hymn, public domain. Sing or hum the tune while you strum: it helps you feel the chord changes.</p>` },
    ] },
    { type: 'game', game: 'strum', args: { pattern: 'D.D.D.', bpm: 84, chords: ['G', 'C'], bars: 4 } },
    { type: 'game', game: 'song', args: { song: 'amazing', speed: 0.8 } },
  ] },
  { id: 'gt-17', title: 'Seventh chords', sub: 'E7 · A7 · D7 — the blues sound', minutes: 12, learns: ['gt:chord:E7', 'gt:chord:A7', 'gt:chord:D7'], onComplete: known(['E7', 'A7', 'D7']), steps: [
    { type: 'lesson', cards: [
      { title: 'Listen: the 7 sound', html: `<p>A 7th chord adds one note. It sounds bluesy and wants to move on.</p><div class="grid2">${['E', 'E7', 'A', 'A7', 'D', 'D7'].map(n => `<button class="play" data-strum="${n}">${n}</button>`).join('')}</div>` },
      chordCard('E7', 'E with finger 3 lifted: easier than E!'),
      chordCard('A7', 'A with the G string open.'),
      chordCard('D7', 'A small upside-down triangle. Four thin strings only.'),
    ] },
    { type: 'game', game: 'build', args: { chords: ['E7', 'A7', 'D7'] } },
    { type: 'game', game: 'quiz', args: { chords: ['E7', 'A7', 'D7', 'E', 'A', 'D'], n: 8 } },
    { type: 'game', game: 'song', args: { song: 'sevenths', speed: 0.8 } },
  ] },
  { id: 'gt-18', title: 'G7, C7 and B7', sub: 'More color', minutes: 12, learns: ['gt:chord:G7', 'gt:chord:C7', 'gt:chord:B7'], onComplete: known(['G7', 'C7', 'B7']), steps: [
    { type: 'lesson', cards: [chordCard('G7', 'Like G, but finger 1 plays the 1st fret of the high e.'), chordCard('C7', 'C plus your little finger on the G string, 3rd fret.'), chordCard('B7', 'Four fingers. It leads home to Em in many songs.', strumBtns(['B7', 'Em'])), checkCard('B7')] },
    { type: 'game', game: 'build', args: { chords: ['G7', 'C7', 'B7'] } },
    { type: 'game', game: 'check', args: { chords: ['G7', 'B7'], reps: 2 } },
    { type: 'game', game: 'switch', args: { a: 'Em', b: 'B7', target: 12 } },
  ] },
  { id: 'gt-19', title: 'Song: Auld Lang Syne', sub: 'G · D · C · Em', minutes: 10, steps: [
    { type: 'lesson', cards: [{ title: 'The song', html: `<p>Traditional Scottish song, public domain. Four chords you know.</p><div class="row">${['G', 'D', 'C', 'Em'].map(n => chordSVG(n, { size: 100 })).join('')}</div><p>The hardest change is G → D. Warm it up first.</p>` }] },
    { type: 'game', game: 'switch', args: { a: 'G', b: 'D', target: 16 } },
    { type: 'game', game: 'song', args: { song: 'auld', speed: 0.8 } },
  ] },
  { id: 'gt-20', title: 'House of the Rising Sun', sub: 'Am · C · D · Fmaj7 · E', minutes: 14, learns: ['gt:chord:Fmaj7'], onComplete: known(['Fmaj7']), steps: [
    { type: 'lesson', cards: [
      chordCard('Fmaj7', 'The easy F. Three fingers, top four strings. Later you will learn the full F barre.'),
      { title: 'The song', html: `<p>Traditional folk song, public domain. It counts in 3 and loops through six chords.</p><div class="row">${['Am', 'C', 'D', 'Fmaj7', 'E'].map(n => chordSVG(n, { size: 90, showFingers: false })).join('')}</div><p>Try picking one string at a time instead of strumming: bass string first, then the thin strings.</p>` },
    ] },
    { type: 'game', game: 'build', args: { chords: ['Fmaj7'] } },
    { type: 'game', game: 'check', args: { chords: ['Fmaj7', 'Am'], reps: 2 } },
    { type: 'game', game: 'song', args: { song: 'rising', speed: 0.75 } },
  ] },
  { id: 'gt-21', title: 'The F barre chord', sub: 'The boss level', minutes: 14, learns: ['gt:chord:F'], onComplete: known(['F']), steps: [
    { type: 'lesson', cards: [
      chordCard('F', 'Finger 1 lies flat across all six strings at fret 1 (a "barre"). The other fingers make an E shape on top.'),
      { title: 'Barre tips', html: '<ul><li>Roll finger 1 slightly onto its bony side.</li><li>Thumb low behind the neck, opposite finger 2.</li><li>Pull back with your arm a little, do not just squeeze.</li><li>Check string by string. Fix one buzz at a time.</li></ul>', tip: 'Everyone finds F hard. One minute a day. It usually clicks in two to three weeks.' },
    ] },
    { type: 'game', game: 'build', args: { chords: ['F'] } },
    { type: 'game', game: 'strings', args: { chords: ['F'] } },
    { type: 'game', game: 'switch', args: { a: 'C', b: 'F', target: 10 } },
    { type: 'game', game: 'song', args: { song: 'barre', speed: 0.7 } },
  ] },
  { id: 'gt-22', title: 'B minor', sub: 'A barre on fret 2', minutes: 12, learns: ['gt:chord:Bm'], onComplete: known(['Bm']), steps: [
    { type: 'lesson', cards: [chordCard('Bm', 'Barre fret 2 with finger 1 (skip the low E). Fingers 3 and 4 on fret 4, finger 2 on fret 3. It is the Am shape moved up two frets.'), checkCard('Bm')] },
    { type: 'game', game: 'build', args: { chords: ['Bm'] } },
    { type: 'game', game: 'strings', args: { chords: ['Bm'] } },
    { type: 'game', game: 'song', args: { song: 'bminor', speed: 0.75 } },
  ] },
  { id: 'gt-23', title: 'Power chords', sub: 'Rock sound + palm muting', minutes: 12, learns: ['gt:chord:E5', 'gt:chord:A5', 'gt:chord:G5'], onComplete: known(['E5', 'A5', 'G5', 'D5']), steps: [
    { type: 'lesson', cards: [
      { title: 'Two notes, big sound', html: `<p>A power chord has only the root and the fifth. No major or minor: just power.</p><div class="row">${['E5', 'A5', 'G5'].map(n => chordSVG(n, { size: 110 })).join('')}</div>${strumBtns(['E5', 'A5', 'G5', 'D5'])}` },
      { title: 'Palm muting', html: '<p>Rest the side of your picking hand on the strings, right at the bridge. Strum: the sound becomes short and chunky. Move a bit away from the bridge if the notes die completely.</p><div class="row tight"><button class="play" data-x>Hear palm-muted E5</button></div>', mount(el) { el.querySelector('[data-x]').onclick = () => { unlock(); for (let i = 0; i < 8; i++) strum('E5', { at: i * 0.22, mute: true, vel: 0.3 }); }; } },
    ] },
    { type: 'game', game: 'riff', args: { piece: 'power' } },
    { type: 'game', game: 'check', args: { chords: ['E5', 'A5', 'G5'], reps: 1 } },
    { type: 'game', game: 'song', args: { song: 'power', speed: 0.8 } },
  ] },
  { id: 'gt-24', title: 'Minor pentatonic', sub: 'Box 1 in A — the solo scale', minutes: 12, learns: [[0, 5], [0, 8], [1, 5], [1, 7], [2, 5], [2, 7], [3, 5], [3, 7], [4, 5], [4, 8], [5, 5], [5, 8]].map(([s, f]) => `gt:note:${s}:${f}`), steps: [
    { type: 'lesson', cards: [
      { title: 'The solo scale', html: `<p>Most rock and blues solos use this 5-note scale. Box 1 sits at fret 5.</p>${fretboardHTML({ from: 4, frets: 9, marks: [[0, 5], [0, 8], [1, 5], [1, 7], [2, 5], [2, 7], [3, 5], [3, 7], [4, 5], [4, 8], [5, 5], [5, 8]].map(([s, f]) => ({ s, f, label: f === 5 && (s === 0 || s === 5) || (s === 2 && f === 7) ? 'A' : '', cls: f === 5 && (s === 0 || s === 5) || (s === 2 && f === 7) ? 'root' : '' })) })}<div class="row tight"><button class="play" data-seq="${midiSeq('penta').join(',')}" data-gap="0.3">Hear the scale</button></div><p>Finger 1 plays fret 5, fingers 3 or 4 play frets 7 and 8. The A notes are the "home" notes.</p>` },
    ] },
    { type: 'game', game: 'riff', args: { piece: 'penta' } },
    { type: 'game', game: 'notehunt', args: { notes: [[0, 5], [0, 8], [1, 5], [1, 7], [2, 5], [2, 7], [3, 5], [3, 7], [4, 5], [4, 8], [5, 5], [5, 8]], n: 8, frets: 9 } },
  ] },
  { id: 'gt-25', title: 'Your first licks', sub: 'Call and answer', minutes: 12, steps: [
    { type: 'lesson', cards: [
      { title: 'Licks = short phrases', html: `<p>A lick is a short musical phrase, like a sentence. Lick 1 asks a question, lick 2 answers it.</p><div class="row tight"><button class="play" data-seq="${midiSeq('lick1').join(',')}" data-gap="0.35">Lick 1</button><button class="play" data-seq="${midiSeq('lick2').join(',')}" data-gap="0.35">Lick 2</button><button class="play" data-seq="${midiSeq('lick3').join(',')}" data-gap="0.35">Lick 3</button></div>` },
      { title: 'Make it sing', html: '<p>Let the last note of each lick ring. Space between phrases is music too.</p>' },
    ] },
    { type: 'game', game: 'riff', args: { piece: 'lick1' } },
    { type: 'game', game: 'riff', args: { piece: 'lick2' } },
    { type: 'game', game: 'riff', args: { piece: 'lick3' } },
  ] },
  { id: 'gt-26', title: 'Folk song finale', sub: 'Scarborough Fair · Greensleeves · Shenandoah', minutes: 15, steps: [
    { type: 'lesson', cards: [{ title: 'Three classic songs', html: '<p>Three traditional songs (public domain). You know every chord now. Use "Wait for me" first, then turn it off and play in time.</p><p class="muted small">Chords are simplified. Want more? Upload any song in Song Lab and practise it the same way.</p>' }] },
    { type: 'game', game: 'song', args: { song: 'scarborough', speed: 0.8 } },
    { type: 'game', game: 'song', args: { song: 'greensleeves', speed: 0.8 } },
    { type: 'game', game: 'song', args: { song: 'shenandoah', speed: 0.8 } },
  ] },
];
