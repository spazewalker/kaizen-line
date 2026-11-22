// Singing curriculum: 22 stations. Lesson buttons are built at show time so they sit in the singer's range.
import { noteName } from '../../core/music.js';
import { SONGS, INTERVALS, EXERCISES, songNotes } from './songs.js';
import { R } from './games.js';
import { hearAll, voiceCheck, breathe } from './mounts.js';

const nn = m => noteName(m);
const btn = (attrs, label) => `<button class="play" ${attrs}>${label}</button>`;
const tone = (m, label = nn(m), dur) => btn(`data-tone="${m}"${dur ? ` data-dur="${dur}"` : ''}`, label);
const seq = (ms, label, gap = 0.5) => btn(`data-seq="${ms.join(',')}" data-gap="${gap}"`, label);
const row = (...b) => `<div class="row tight" style="margin:10px 0">${b.join('')}</div>`;
const tonicMid = (span = 7) => { const { l, h } = R(); return Math.round((l + h) / 2 - span / 2); };
const songSeq = (id, n = 8) => { const { l, h } = R(); const ns = songNotes(id, { low: l, high: h }).slice(0, n); return `data-seq="${ns.map(x => x.midi).join(',')}" data-gap="${(60 / SONGS[id].bpm).toFixed(2)}"`; };
const ivBtn = (iv, label) => { const t = tonicMid(iv); return seq([t, t + iv], label || `${INTERVALS[iv].name}: ${nn(t)} → ${nn(t + iv)}`, 0.7); };

/** card helper: html may be a function (evaluated when the card is shown) */
const C = (title, html, extra = {}) => ({ title, get html() { return typeof html === 'function' ? html() : html; }, ...extra });
const L = (...cards) => ({ type: 'lesson', cards });
const G = (game, args = {}, title) => ({ type: 'game', game, args, ...(title ? { title } : {}) });

export const UNITS = [
  { id: 'sg-01', title: 'High and low', sub: 'What pitch is', minutes: 8, learns: ['sg:skill:ear'], steps: [
    L(C('Your voice is an instrument', () => { const { l, h, c } = R(); return `<p>Every note has a <b>pitch</b>: how high or low it sounds. Singing in tune means your pitch lands on the same note as the music.</p>
        <p>Listen to three notes:</p>${row(tone(l, 'Low'), tone(c, 'Middle'), tone(h, 'High'))}
        <p>Hum each one quietly after you hear it. Low notes buzz in your chest. High notes buzz more in your face and head.</p>`; }, { mount: hearAll, requireDone: true }),
      C('Up and down', () => { const t = tonicMid(7); return `<p>Melodies move up and down, like a line on a graph.</p>${row(seq([t, t + 4, t + 7, t + 12], 'Going up'), seq([t + 12, t + 7, t + 4, t], 'Going down'), seq([t, t + 7, t + 2, t + 5], 'Up and down'))}
        <p>Move your hand while you listen: up for higher, down for lower. Linking sound to movement trains the ear fast.</p>`; }, { mount: hearAll, requireDone: true }),
      C('Close notes are hard', () => { const t = tonicMid(1); return `<p>Big jumps are easy to hear. Small steps are harder. The smallest step in Western music is a <b>half step</b> (a semitone).</p>${row(seq([t, t + 7], 'Big jump'), seq([t, t + 2], 'Whole step'), seq([t, t + 1], 'Half step'))}
        <p>In the game, the notes start far apart and get closer as you climb.</p>`; }, { mount: hearAll, requireDone: true })),
    G('elevator', { gap: 5, floors: 8, srs: 'sg:skill:ear' }),
    G('slideMatch', { rounds: 4, spread: 'mid' }),
  ] },
  { id: 'sg-02', title: 'Breath and posture', sub: 'The engine of your voice', minutes: 10, learns: ['sg:skill:breath'], steps: [
    L(C('Stand like a singer', `<ul><li>Feet hip-width apart, knees soft.</li><li>Tall spine, as if a string pulls up the top of your head.</li><li>Shoulders down and relaxed. Chin level, not up.</li><li>Jaw loose. Tongue resting behind the bottom teeth.</li></ul><p>A relaxed body gives a free voice. Tension anywhere (shoulders, jaw, neck) makes notes thin and wobbly.</p>`),
      C('Breathe low', `<p>Put one hand on your belly and one on your chest. Breathe in through the nose. The <b>belly</b> hand should move out. The chest hand stays almost still.</p><p>This is low (diaphragm) breathing. It gives you more air and steadier notes than lifting the chest.</p><p>Follow the circle for three calm breaths:</p>`, { mount: breathe, requireDone: true }),
      C('Let the air out slowly', `<p>Singing is controlled breathing out. Practise it with a long, even <b>"sss"</b> like a slow tyre leak.</p><p>Keep the belly coming in slowly. Do not let the air burst out at the start.</p><p class="muted">Goal for a beginner: 12–15 seconds. Trained singers reach 30+.</p>`)),
    G('breath', { mode: 'sss', target: 12, srs: 'sg:skill:breath' }),
    G('breath', { mode: 'hum', target: 10 }, 'Long hum'),
  ] },
  { id: 'sg-03', title: 'Your first pitch match', sub: 'See your voice live', minutes: 10, learns: ['sg:skill:match'], steps: [
    L(C('Meet your voice line', `<p>When you sing, the app draws your pitch as a line. Higher notes go up the screen. Try it: sing any comfortable note on "ah" for 2 seconds.</p>`, { mount: voiceCheck(() => ({ secs: 2, range: [R().l - 4, R().h + 4], say: 'Sing "ah" on any note' })), requireDone: true }),
      C('How to match a note', () => `<ol class="sg-steps"><li>Listen to the note. Hear it in your head.</li><li>Hum it quietly first.</li><li>Ask: am I above or below? Slide your voice slowly toward it.</li><li>When you match, it feels smooth, like two sounds melting into one.</li></ol>${row(tone(R().c, 'Play a note'))}`),
      C('Try one', `<p>Sing the note you hear. Keep the dot in the band for a moment. The arrow tells you to go up or down.</p>`, { mount: voiceCheck(() => ({ target: R().c, hold: 1, say: 'Match the note' })), requireDone: true })),
    G('matchNote', { rounds: 5, spread: 'narrow', tol: 60, srs: 'sg:skill:match' }),
    G('matchNote', { rounds: 5, spread: 'mid' }, 'Pitch match: wider'),
  ] },
  { id: 'sg-04', title: 'Sirens', sub: 'Glide through your range', minutes: 9, learns: ['sg:skill:siren'], steps: [
    L(C('The siren warm-up', `<p>A siren is a smooth glide from low to high and back, like an ambulance. Singers use it every day to warm up and connect low and high notes.</p><p>Use "ooo", "ng" (as in "sing"), or a lip trill ("brrr"). These are easy on the voice.</p>`),
      C('Try a siren', `<p>Glide up and down slowly. Cover at least 6 semitones. Watch your line rise and fall.</p>`, { mount: voiceCheck(() => ({ span: 6, range: [R().l - 3, R().h + 3], say: 'Glide on "ooo"', win: 'Smooth siren!' })), requireDone: true }),
      C('Tips', `<ul><li>No jumps: glide like a slide, not stairs.</li><li>At the top, get lighter, not louder.</li><li>If it cracks, that is normal. Go back and glide through that spot more softly.</li></ul>`)),
    G('slalom', { amp: 3, period: 8, every: 1.7, gap: 2, gates: 14, srs: 'sg:skill:siren' }, 'Siren slalom: gentle'),
    G('slalom', { amp: 5, period: 6, every: 1.4, gap: 1.6, gates: 18 }, 'Siren slalom: full range'),
  ] },
  { id: 'sg-05', title: 'Hold a steady note', sub: 'No wobble', minutes: 9, learns: ['sg:skill:steady'], steps: [
    L(C('Why steady matters', `<p>A note that drifts or shakes sounds out of tune even if it starts right. Steadiness comes from steady <b>air</b>, not from a tight throat.</p><p>The app measures your <b>wobble</b> in cents (1/100 of a semitone). Under 20 cents sounds steady to most ears.</p>`),
      C('Practise', `<p>Sing one note for 3 seconds. Keep the air flowing evenly, like the long "sss".</p>`, { mount: voiceCheck(() => ({ target: R().c, hold: 2.5, say: 'Hold it steady' })), requireDone: true })),
    G('balloon', { secs: 3, srs: 'sg:skill:steady' }, 'Steady balloon: 3 seconds'),
    G('balloon', { secs: 5, wobble: 20 }, 'Steady balloon: 5 seconds'),
  ] },
  { id: 'sg-06', title: 'Notes across your range', sub: 'Low, middle, high', minutes: 9, learns: ['sg:skill:wide'], steps: [
    L(C('Your whole range', () => { const { l, h } = R(); return `<p>Your saved comfortable range is <b>${nn(l)} to ${nn(h)}</b>. If you have not done it yet, run the Vocal range tool later so the app fits you exactly.</p>${row(tone(l, 'Lowest'), tone(Math.round((l + h) / 2), 'Middle'), tone(h, 'Highest'))}<p>Low notes: relaxed, a little more air. High notes: lighter, not louder.</p>`; }, { mount: hearAll, requireDone: true })),
    G('matchNote', { rounds: 7, spread: 'full', srs: 'sg:skill:wide' }, 'Pitch match: whole range'),
    G('elevator', { gap: 2, floors: 8 }, 'Pitch elevator: close notes'),
  ] },
  { id: 'sg-07', title: 'Do, Re, Mi', sub: 'The first three steps', minutes: 9, learns: ['sg:scale:dorem'], steps: [
    L(C('Solfege', () => { const t = tonicMid(4); return `<p>Singers name scale steps <b>Do Re Mi Fa So La Ti Do</b>. Do is home. Every key has its own Do, so the names work in any key.</p>${row(tone(t, 'Do'), tone(t + 2, 'Re'), tone(t + 4, 'Mi'))}${row(seq([t, t + 2, t + 4, t + 2, t], 'Do Re Mi Re Do'))}<p>Sing along with the last button twice.</p>`; }, { mount: hearAll, requireDone: true })),
    G('singAlong', { ex: 'dorem', keys: 3 }, 'Sing: Do Re Mi Re Do'),
    G('echo', { pool: [0, 2, 4], len: 3, max: 5, rounds: 4, srs: 'sg:scale:dorem' }, 'Echo: Do Re Mi'),
  ] },
  { id: 'sg-08', title: 'The major scale', sub: 'Eight steps up and down', minutes: 12, learns: ['sg:scale:major'], steps: [
    L(C('Climbing the ladder', () => { const t = tonicMid(12); return `<p>The major scale has 8 notes. Most steps are whole steps. Two are half steps: <b>Mi–Fa</b> and <b>Ti–Do</b>. Those feel "tight".</p>${row(seq([t, t + 2, t + 4, t + 5, t + 7], 'Do to So'), seq([t, t + 2, t + 4, t + 5, t + 7, t + 9, t + 11, t + 12], 'Full scale'))}${row(seq([t + 4, t + 5], 'Mi–Fa'), seq([t + 11, t + 12], 'Ti–Do'))}`; }, { mount: hearAll, requireDone: true }),
      C('Ti wants to go home', () => { const t = tonicMid(12); return `<p>Each step has a feeling. Ti feels unfinished. It pulls up to Do. So feels strong and open. Mi feels warm.</p>${row(seq([t, t + 2, t + 4, t + 5, t + 7, t + 9, t + 11], 'Stop on Ti…'), tone(t + 12, '…resolve to Do'))}`; }, { mount: hearAll, requireDone: true })),
    G('singAlong', { ex: 'scale5', keys: 3 }, 'Sing: five-note scale'),
    G('singAlong', { ex: 'scale8' }, 'Sing: the full scale'),
    G('degreeQuiz', { pool: [0, 2, 4, 5, 7], srs: 'sg:scale:major' }, 'Solfege ear'),
  ] },
  { id: 'sg-09', title: 'Steps and leaps', sub: 'Next door or skip', minutes: 9, learns: ['sg:interval:2'], steps: [
    L(C('Two ways to move', () => { const t = tonicMid(7); return `<p>A <b>step</b> moves to the next note of the scale. A <b>leap</b> skips notes. Steps are easy to sing. Leaps need you to hear the target first.</p>${row(seq([t, t + 2, t + 4], 'Steps'), seq([t, t + 4, t + 7], 'Leaps'), seq([t, t + 7, t], 'Big leap'))}<p>Trick for leaps: hum the notes in between silently in your head, then jump.</p>`; }, { mount: hearAll, requireDone: true })),
    G('singAlong', { ex: 'steps' }, 'Sing: steps'),
    G('singAlong', { ex: 'leaps' }, 'Sing: leaps'),
    G('intervalQuiz', { set: [2, 7], n: 8 }, 'Step or leap?'),
  ] },
  { id: 'sg-10', title: 'Thirds', sub: 'Happy and sad', minutes: 11, learns: ['sg:interval:3', 'sg:interval:4'], steps: [
    L(C('The major third', () => `<p>A <b>major third</b> is 4 half steps: Do to Mi. It sounds bright and happy.</p>${row(ivBtn(4))}<p>Song anchor: the first two notes of <b>"Oh When the Saints"</b> ("Oh when…").</p>`, { mount: hearAll, requireDone: true }),
      C('The minor third', () => `<p>A <b>minor third</b> is 3 half steps. It sounds darker, a bit sad.</p>${row(ivBtn(3))}<p>Song anchor: <b>"Greensleeves"</b> ("A-las…"). Also the "na-na na-na" playground taunt.</p>${row(ivBtn(4, 'Major again'), ivBtn(3, 'Minor again'))}`, { mount: hearAll, requireDone: true })),
    G('intervalQuiz', { set: [3, 4], n: 10 }, 'Major or minor third?'),
    G('intervalJump', { set: [4, 3], rounds: 6 }, 'Sing the thirds'),
    G('singAlong', { ex: 'thirds' }, 'Sing: thirds pattern'),
  ] },
  { id: 'sg-11', title: 'Fourths and fifths', sub: 'Strong and open', minutes: 11, learns: ['sg:interval:5', 'sg:interval:7'], steps: [
    L(C('The perfect fifth', () => `<p>A <b>perfect fifth</b> is 7 half steps: Do to So. It sounds strong and open.</p>${row(ivBtn(7))}<p>Song anchor: <b>"Twinkle Twinkle"</b>: "twin-kle" to "lit-tle".</p>${row(btn(songSeq('twinkle', 4), 'Twinkle, twinkle'))}`, { mount: hearAll, requireDone: true }),
      C('The perfect fourth', () => `<p>A <b>perfect fourth</b> is 5 half steps: Do to Fa. It sounds like a call.</p>${row(ivBtn(5))}<p>Song anchor: <b>"Amazing Grace"</b>: "A-ma…". Also "Here Comes the Bride".</p>${row(btn(songSeq('grace', 3), 'A-ma-zing'))}`, { mount: hearAll, requireDone: true })),
    G('intervalQuiz', { set: [5, 7], n: 10 }, 'Fourth or fifth?'),
    G('intervalJump', { set: [7, 5], rounds: 6 }, 'Sing the jump'),
    G('singAlong', { ex: 'fifths' }, 'Sing: fifth jumps'),
  ] },
  { id: 'sg-12', title: 'The octave', sub: 'Same note, higher', minutes: 9, learns: ['sg:interval:12'], steps: [
    L(C('Same name, double speed', () => `<p>An <b>octave</b> is 12 half steps. The top note has the same name and vibrates exactly twice as fast. The two notes blend so well they almost sound like one.</p>${row(ivBtn(12))}<p>When men and women sing "the same" melody, they are usually an octave apart. That is why the app has an "any octave counts" switch for songs.</p>`, { mount: hearAll, requireDone: true })),
    G('intervalQuiz', { set: [12, 7, 5], n: 9 }, 'Octave, fifth or fourth?'),
    G('intervalJump', { set: [12], rounds: 4 }, 'Sing the octave'),
  ] },
  { id: 'sg-13', title: 'Arpeggios', sub: 'Do Mi So Do', minutes: 10, learns: ['sg:skill:arp'], steps: [
    L(C('Chords, one note at a time', () => { const t = tonicMid(12); return `<p>An <b>arpeggio</b> sings the notes of a chord one by one. Do Mi So Do is the major chord. It trains thirds and fifths together.</p>${row(seq([t, t + 4, t + 7, t + 12, t + 7, t + 4, t], 'Major arpeggio', 0.45), seq([t, t + 3, t + 7, t + 12, t + 7, t + 3, t], 'Minor arpeggio', 0.45))}`; }, { mount: hearAll, requireDone: true })),
    G('singAlong', { ex: 'arp', keys: 3 }, 'Sing: major arpeggio'),
    G('singAlong', { ex: 'arpm', keys: 2 }, 'Sing: minor arpeggio'),
    G('echo', { pool: [0, 4, 7, 12], len: 3, max: 5, rounds: 4, srs: 'sg:skill:arp' }, 'Echo: chord tones'),
  ] },
  { id: 'sg-14', title: 'Melody echo', sub: 'Call and response', minutes: 10, learns: ['sg:skill:echo'], steps: [
    L(C('Listen, remember, sing', `<p>Call and response is how people learned songs for thousands of years. The app sings a short tune. You sing it straight back.</p><ul><li>Listen to the whole phrase before you sing.</li><li>Notice the shape: does it go up, down, or both?</li><li>Notice the last note: it often lands on Do.</li></ul>`)),
    G('echo', { pool: [0, 2, 4, 5, 7], len: 3, max: 6, rounds: 6, srs: 'sg:skill:echo' }),
    G('echo', { pool: [0, 2, 4, 5, 7, 9], len: 4, max: 7, rounds: 5, rhythm: true }, 'Echo with rhythm'),
  ] },
  { id: 'sg-15', title: 'Soft and loud', sub: 'Dynamics', minutes: 9, learns: ['sg:skill:dyn'], steps: [
    L(C('Volume is a colour', `<p>Changing volume (<b>dynamics</b>) makes singing expressive. The trick: get louder with <b>more air</b>, not by squeezing the throat. Get softer by using less air while keeping the note supported.</p><p>A common beginner problem: the pitch goes sharp when loud and flat when soft. In the game, keep the same note while the volume changes.</p>`)),
    G('dynamics', { srs: 'sg:skill:dyn' }),
    G('balloon', { secs: 4, vowel: 'ah (soft)' }, 'Soft and steady'),
  ] },
  { id: 'sg-16', title: 'Vowels and resonance', sub: 'A brighter, fuller sound', minutes: 10, learns: ['sg:skill:vowel'], steps: [
    L(C('Pure vowels', `<p>Singers hold <b>vowels</b>, not consonants. Five pure vowels make most of the sound: <b>ee, eh, ah, oh, oo</b>.</p><ul><li>"ah": jaw dropped, tongue flat.</li><li>"ee": smile slightly, tongue high.</li><li>"oo": round lips, like a small kiss.</li></ul><p>Keep the vowel the same for the whole note. Do not slide into the next consonant early.</p>`),
      C('Find your buzz', `<p>Hum "mmm" on a comfortable note. Feel the buzz on your lips and nose. That is <b>resonance</b>. Now open the hum into "mmm-ah". Try to keep the buzz in the "ah".</p>`, { mount: voiceCheck(() => ({ secs: 3, range: [R().l - 3, R().h + 3], say: 'Hum "mmm", then open to "ah"' })), requireDone: true })),
    G('balloon', { secs: 4, vowel: 'ee' }, 'Steady "ee"'),
    G('balloon', { secs: 4, vowel: 'oo' }, 'Steady "oo"'),
    G('matchNote', { rounds: 5, spread: 'mid' }, 'Match on "ah"'),
  ] },
  { id: 'sg-17', title: 'Singing on time', sub: 'Rhythm', minutes: 10, learns: ['sg:skill:rhythm'], steps: [
    L(C('Start and stop on time', `<p>In-tune singing also needs good <b>timing</b>. Start each note when its bar reaches the line. Stop when the bar ends, and breathe in the gaps.</p><p>Short notes: crisp and light. Long notes: hold them full length. Many beginners cut long notes short.</p>`)),
    G('singAlong', { ex: 'rhythm1', keys: 2 }, 'Sing: on the beat'),
    G('singAlong', { ex: 'rhythm2', keys: 2 }, 'Sing: off the beat'),
    G('echo', { pool: [0, 2, 4, 7], len: 3, max: 5, rounds: 4, rhythm: true, srs: 'sg:skill:rhythm' }, 'Echo with rhythm'),
  ] },
  { id: 'sg-18', title: 'Harmony with a drone', sub: 'Hear in tune', minutes: 11, learns: ['sg:skill:harmony'], steps: [
    L(C('Singing over a note', () => { const t = tonicMid(7); return `<p>A <b>drone</b> is one long note under you, like a sitar's tanpura. When you sing in tune with it, the sound is smooth. When you are slightly off, you hear "beating": a fast wobble.</p>${row(btn(`data-sgchord="${t},${t + 7}"`, 'Do + So together (smooth)'), btn(`data-sgchord="${t},${t + 6.75}"`, 'Slightly off (wobbles)'))}<p>Your ear can learn to hear and remove the wobble. That is the core of singing in tune.</p>`; }, { mount: hearAll, requireDone: true })),
    G('matchNote', { drone: true, intervals: [0, 7, 4, 12, 7, 4], rounds: 6, srs: 'sg:skill:harmony' }, 'Sing over the drone'),
    G('matchNote', { drone: true, intervals: [4, 7, 2, 5, 9, 0], rounds: 6, noRefAfter: 2 }, 'Over the drone, no hints'),
  ] },
  ...[
    ['sg-19', 'First songs', 'Twinkle · Frère Jacques', ['twinkle', 'frere']],
    ['sg-20', 'Classic melodies', 'Mary · Ode to Joy', ['mary', 'ode']],
    ['sg-21', 'Rounds and folk', 'Row Your Boat · Auld Lang Syne', ['row', 'auld']],
    ['sg-22', 'Songs with feeling', 'Amazing Grace · Sakura Sakura', ['grace', 'sakura']],
  ].map(([id, title, sub, songs]) => ({
    id, title, sub, minutes: 12, learns: songs.map(s => `sg:song:${s}`), steps: [
      L(...songs.map(s => C(SONGS[s].title, () => `<p>${songIntro[s]}</p>${row(btn(songSeq(s, 12), 'Hear the opening'))}<p class="muted small">${SONGS[s].origin}. The app moves it into your range.</p>`, { mount: hearAll, requireDone: true })),
        C('How to practise a song', `<ol class="sg-steps"><li>First pass: listen with guide notes on and sing softly.</li><li>Loop the hardest phrase at 75% speed.</li><li>Then sing the whole song at 100%, guide on.</li><li>Finally try with the guide off.</li></ol>`)),
      ...songs.map(s => G('singAlong', { song: s, srs: `sg:song:${s}` }, `Sing: ${SONGS[s].title}`)),
      G('songQuiz', { ids: Object.keys(SONGS), only: songs, n: 4 }, 'Name that tune'),
    ],
  })),
];

const songIntro = {
  twinkle: 'A perfect first song: small steps, one fifth jump at the start, and lots of repeated notes.',
  frere: 'A round: groups start at different times and it still fits. Notice the steps up "Frè-re Jac-ques" and the fast run "Son-nez les ma-ti-nes".',
  mary: 'Only five notes, mostly steps. Great for training steady, even notes.',
  ode: 'Beethoven\'s famous tune walks almost entirely in steps. Watch the one low leap near the end of the middle part.',
  row: 'Mixes long and short notes. Feel the rhythm "row, row, row" and the fast "merrily merrily".',
  auld: 'A gentle 4/4 song with dotted rhythms ("long-short") and a big lift to La.',
  grace: 'A slow 3/4 hymn. Starts with a fourth ("A-ma") and needs long, steady notes.',
  sakura: 'A Japanese folk song in an old Japanese scale. It sounds mysterious because it uses half steps you have not sung much yet.',
};
