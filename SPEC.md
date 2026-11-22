# Kaizen Line — build spec for track authors

A hosted web app (static files, no build step, ES modules) that teaches **Japanese, guitar and singing** through
short lessons, then games, then spaced-repetition reviews. Guitar and singing listen through the microphone and give
instant on-screen feedback (Yousician-style). Users can upload any song in **Song Lab** and get practice sessions.

Primary user: one adult learner (Hindi/English speaker, software engineer), mainly on an **iPad (Safari / home-screen app)**,
also phone and laptop. He quits when practice is boring or when he must work out *what* to do. So the app always says
exactly what to do next, gives feedback within ~100 ms, and makes practice feel like play.

## Learning design (applies to every track)
1. **Hear first.** Every new idea starts with sound: a clip, a tone, a strum. Text supports the sound, not the reverse.
2. **Tiny steps.** A unit ("station") teaches 1 idea in 8–15 minutes: lesson cards (5–10, interactive) → 2–4 games of rising difficulty.
3. **Retrieval + spacing.** Everything taught becomes SRS items (`unit.learns`). Daily reviews (`track.review`) drill due items
   in mixed formats. Games pull ~30% of questions from earlier learned items (interleaving) via `srs.learned(track)`.
4. **Instant feedback.** Right/wrong within 100 ms, with the correct answer heard, not just shown. Mic games show the user's
   pitch/chord/timing live on screen and say *how* to fix it ("a bit flat — go up", "the B string is muted").
5. **Desirable difficulty.** Games adapt: speed up on streaks, slow down / repeat misses. Never a dead end; always a retry.
6. **Fun.** Real game mechanics (lanes, combos, lives, timers, high scores), juicy feedback (sound + motion), short rounds.
7. **Honest.** Mic detection is approximate; say so where it matters, offer "I did it" fallbacks, never fake a score.

## Files and ownership
```
index.html  css/app.css  js/main.js  js/core/*      — shell + core (owner: lead). Do NOT rewrite. Surgical Edit only for a real bug, and list it in your report.
js/tracks/japanese/   audio/ja/                      — Japanese agent
js/tracks/guitar/                                    — Guitar agent
js/tracks/singing/                                   — Singing agent
js/songlab/                                          — Song Lab agent
css/<area>.css                                       — optional per-area stylesheet; inject it from your module:
    `import { useCss } from '../../core/css.js'`? (not provided) → just do:
    `if(!document.querySelector('link[data-css=gt]')) document.head.append(Object.assign(document.createElement('link'),{rel:'stylesheet',href:'css/guitar.css',dataset:{css:'gt'}}))`
tests/<area>_*.py                                    — your tests (use tests/harness.py)
```
Paths inside modules: import core with relative paths (`../../core/audio.js`). Fetch assets with paths relative to the
site root (`audio/ja/xyz.mp3`) because the page is served from root `index.html`.

## Track contract — `js/tracks/<name>/index.js` default export
```js
export default {
  id: 'jp' | 'gt' | 'sg', name: 'Japanese', color: '#d93a26',      // gt '#27346a', sg '#b0650a'
  art: '<svg ...>',            // hero art, viewBox 0 0 400 300, preserveAspectRatio="xMidYMid slice", decorative
  units: [Unit],               // ordered stations; unit N unlocks when N-1 has ≥1 star
  games: { [key]: Game },
  review: { batch: 20, run(stage, ids, ctx) },  // drill due SRS ids; call ctx.grade(id, q) per item, then ctx.finish(score)
  extras: [Extra],             // tools. REQUIRED ids: gt 'tuner', sg 'range', jp 'chart'
}
Unit  = { id: 'gt-05', title, sub, minutes, learns: ['gt:chord:Em', ...], steps: [Step], onComplete?({settings}) }
Step  = { type: 'lesson', cards: [Card] } | { type: 'game', game: 'key', args: {...}, title? }
Card  = { title, html, tip?, mount?(bodyEl, ctx) => cleanup?, requireDone?: bool }   // ctx.done() enables Next when requireDone
Game  = { name, how, mic?: bool, run(stage, args, ctx) => cleanup | Promise<cleanup> }
Extra = { id, title, sub, run(stage, ctx) => cleanup }
ctx   = { el, track, unit, settings, toast, srs, grade(id, q|bool), learn(ids), finish(score0to1, {lines:[html]}), onLeave(fn) }
```
- The shell shows the game title + `how` text, mounts your game into `stage`, and shows a result screen after `ctx.finish`.
- Always clean up (timers, rAF, mic loops, audio nodes) in the returned cleanup. The shell calls it on finish or navigation,
  and force-releases the mic.
- SRS ids are namespaced: `jp:kana:あ`, `jp:word:えき`, `gt:chord:Em`, `gt:note:3:5` (string:fret), `sg:interval:7` …
  `review.run` must handle every id prefix your units can teach.
- Routes: `#/t/<id>` track, `#/u/<id>/<unitId>` unit, `#/u/<id>/<unitId>/<stepIndex>` single step, `#/r/<id>` review,
  `#/x/<id>/<extraId>` tool, `#/songs/...` Song Lab, `#/settings`.

## Lesson HTML conventions (handled globally by main.js)
Buttons/elements with these attributes play sound on click:
`data-clip="audio/ja/0012.mp3"` · `data-tone="60"` (`data-dur`) · `data-seq="60,62,64"` (`data-gap`) ·
`data-strum="Em"` or `data-strum="0,2,2,0,0,0"` · `data-arp="C"` · `data-pluck="64"`.
Use class `play` for a small play button, `say` (grid: `.jp .ro .en`) for phrase rows, `listen` as a container.
`ui.chordSVG(nameOrShape, {size})` draws chord charts. Use `.card`, `.btn primary|ghost|big|sm`, `.opts/.opt(.right|.wrong)`,
`.qbox`, `.bigglyph`, `.feedback`, `.hud`, `.playfield`, `.meter`, `.bignote`, `.tip`, `.muted`, `.row`, `.grid2/.grid3`.
Track color is available as `var(--trk)`. Respect light + dark mode (use the CSS variables, never hard-coded white text on var(--card)).

## Core API (read the source in js/core for details)
- `audio.js`: `unlock()`, `getCtx()`, `now()`, `out()` (master gain node), `tone(midi,{at,dur,gain,voice})`, `playSeq(notes,{gap})`,
  `holdTone(midi)→{set,stop}`, `pluck(midi,{at,vel})`, `strum(shapeOrName,{at,up,vel,capo,mute})`, `arpeggio(name)`,
  `click(t,accent)`, `woodblock(t)`, `class Metronome({bpm,beatsPerBar}).onBeat(fn).start(t0)/.stop()/.beatAt(t)`,
  `playClip(url,{rate})→Promise(ended)`, `preloadClips(urls)`, `decodeFile(file)→AudioBuffer`, `wavBlob(float32,sr)`, `setSession(type)`.
  All times are AudioContext seconds. iOS: `playClip` uses <audio> (plays on silent switch, rate keeps pitch).
- `mic.js`: `mic.acquire({fftSize})` (prompt; throws friendly Error), `mic.time()`, `mic.spectrumDb()`, `mic.level()`, `mic.sampleRate`,
  `mic.release()`, `micLoop((m, ctxTime)=>{})→stop`. Use `ui.micGate(stage,{why,allowSkip,tips})` before mic games.
  Latency: `settings.get().latencyMs` = speaker→mic round trip from calibration; subtract it when judging timing of what the
  mic hears against what was scheduled.
- `pitch.js`: `new PitchDetector(size, sr).detect(buf,{minF,maxF,k,rmsMin,minClarity})→{freq,midi,clarity,rms}`, `PitchSmoother`,
  `centsOff(freq, midi)`. Guitar: size 4096, minF 70. Voice: size 2048, minF 70, maxF 1100.
- `chroma.js`: `dbToMag(db)`, `chromaFromMag(mag,sr,n)`, `matchChord(chroma,name)→0..1`, `rankChords(chroma,vocab)`, `chordVocab(with7)`.
  Live chord check: `dbToMag(mic.spectrumDb())` → `chromaFromMag(mag, sr, fftSize)` → `matchChord`. Average over ~150–300 ms after an onset.
- `onset.js`: `OnsetDetector.push(mag, t)→onsetTime|null` (spectral flux), `LevelOnset.push(rms,t)`.
- `music.js`: note names, `parseChord`, `transposeChord`, `simplifyChord`, `shapeFor(name)→{f,fi,barre,open,difficulty}`,
  `shapeMidis`, `OPEN_SHAPES`, `EASY_CHORDS`, `capoOptions(names, known)`, `findKey(hist)`, `scaleMidis`, `MAJOR/MINOR`, `SOLFEGE`.
- `srs.js`: `srs.learn(ids, track)`, `srs.grade(id, q 0..3)`, `srs.due(track, n)`, `srs.learned(track, prefix)`, `srs.weakest(track,n)`, `srs.strength(id)`.
- `store.js`: `store.get/set/update`, `settings.get()/set(patch)` (latencyMs, vocalLow, vocalHigh, leftHanded, showRomaji, jaSpeed,
  knownChords), `progress`, `activity`. `idb.js`: `idb.get/set/del/keys/all(store,key)` stores 'songs','analysis','blobs'.
- `ui.js`: `$`, `$$`, `esc`, `el`, `toast`, `modal`, `micGate`, `bar`, `stars`, `chordSVG`, `resultScreen`, `countdown`,
  `loop(fn(dt))→stop`, `fitCanvas(parent)→{cv,g,w,h,resize,destroy}`, `cssVar`, `shuffle`, `pick`, `sleep`, `clamp`.

## Song Lab ↔ track interfaces
Guitar agent exports from `js/tracks/guitar/session.js`:
```js
export function startChordSession(stage, session, ctx) → cleanup
session = { title, audioUrl?: string, bpm, beatsPerBar: 4, beats: number[] /* seconds in audio */,
            chords: [{ t, dur, name /* as sounding */ }], capo: 0, key?: 'G major',
            sections?: [{ name, t0, t1 }] }
```
A Yousician-style chord highway synced to the original audio (if `audioUrl`) or a metronome; speed 50–100% (keeps pitch);
section loop; **wait mode** (stops until the right chord is heard); mic chord detection + strum onset scoring; shows the shape to
fret (transposed by capo) with `chordSVG`. Used by built-in guitar songs too.

Singing agent exports from `js/tracks/singing/session.js`:
```js
export function startSingSession(stage, session, ctx) → cleanup
session = { title, audioUrl?: string, bpm?, notes: [{ t, dur, midi, conf? }], key?, transpose?: 0 }
```
Scrolling pitch lanes (time → x, pitch → y) with target note bars, the user's live pitch trail, per-note hit scoring
(±50 cents, octave-agnostic option), guide tone toggle, speed control, auto-transpose into the user's range
(`settings.vocalLow/High`). Used by built-in sing-along songs too.

Song Lab owns `js/songlab/index.js` default export `{ run(stage, ctx, routeParts) }` (route `#/songs/...`):
upload (file input; mp3/m4a/wav), analysis in a Web Worker (beats, tempo, key, chords per beat via chroma + HMM/Viterbi,
predominant melody), library in IndexedDB, chord chart review/edit screen (tap a chord to correct it), capo + simplify
options, then launches `startChordSession` / `startSingSession`. Must work when those modules are missing (graceful message).

## Quality bar
- Works on iPad Safari (touch, no hover), phone (360 px wide) and laptop. Big targets (≥ 44 px). No horizontal scroll.
- Light and dark mode both readable. Use canvas for fast visuals (highways, pitch trails); DOM for everything else.
- No external network except Google Fonts. No new libraries unless essential (then vendor a pinned file into your folder).
- Copy text: short sentences, active voice, simple words (the user prefers Simplified Technical English, ~80% strict).
- Content must be correct (Japanese, music theory, chord shapes). Use only public-domain or original songs/melodies.
- Test: `python3 tests/<area>_test.py` using `tests/harness.py` (headless Chromium, fake mic from a generated WAV).
  Walk every unit and game at least once; check no page errors; screenshot key screens at 820×1180 and 390×844.
  For mic features, generate WAVs (numpy) of the expected input (sung tones, Karplus-Strong strums with known timing) and
  assert detection works. Run `node --check` on every file.
