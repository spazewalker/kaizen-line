// Guitar games. Each: { name, how, mic?, run(stage, args, ctx) -> cleanup }.
import { getCtx, click, strum as playStrum, pluck, unlock, arpeggio } from '../../core/audio.js';
import { OPEN_STRINGS, STRING_NAMES, shapeFor, noteName, parseChord } from '../../core/music.js';
import { chordSVG, micGate, shuffle, pick, esc, sleep, fitCanvas, cssVar, loop, countdown } from '../../core/ui.js';
import { store, settings } from '../../core/store.js';
import { GuitarEar, openEar, CHORD_OK, chordStrings, STRING_LABEL } from './listen.js';
import { fretboardHTML, builderHTML, patternHTML, micHud, noteNameOf, useGuitarCss, col } from './fretboard.js';
import { startChordSession } from './session.js';
import { startNoteHighway } from './notehw.js';
import { songSession, melodyPiece } from './songs.js';

const ALL_CHORDS = ['Em', 'Am', 'E', 'A', 'D', 'G', 'C', 'Dm', 'E7', 'A7', 'D7', 'G7', 'B7', 'Fmaj7', 'F', 'Bm', 'C7', 'Em7', 'Am7'];
const q2grade = tries => (tries <= 1 ? 2 : tries === 2 ? 1 : 0);

/** Ask for the mic (with skip). Returns ear or null. Registers cleanup on ctx. */
async function ear(stage, ctx, opts = {}) {
  const e = await openEar(stage, micGate, opts);
  if (e && ctx.onLeave) ctx.onLeave(() => e.stop());
  return e;
}
const done = (stage, html) => { stage.innerHTML = `<div class="card center">${html}</div>`; };

// ---------- shared single questions (used by games and review) ----------
/** Chord name -> pick the right chart (or chart -> name). Resolves true/false. */
export function qChord(el, name, { pool = ALL_CHORDS, dir } = {}) {
  return new Promise(res => {
    const others = shuffle(pool.filter(n => n !== name && shapeFor(n))).slice(0, 3);
    const opts = shuffle([name, ...others]);
    const d = dir || (Math.random() < 0.5 ? 'name' : 'chart');
    el.innerHTML = d === 'name'
      ? `<div class="qbox">${chordSVG(name, { size: 170, label: false })}<p>Which chord is this?</p><button class="play" data-strum="${name}">Hear it</button></div><div class="opts">${opts.map(o => `<button class="opt" data-v="${o}">${o}</button>`).join('')}</div><div class="feedback"></div>`
      : `<div class="qbox"><div class="bigglyph" style="font-family:var(--display);font-weight:400">${name}</div><p>Pick the right chart.</p></div><div class="opts gt-chartopts">${opts.map(o => `<button class="opt" data-v="${o}">${chordSVG(o, { size: 110, label: false, showFingers: false })}</button>`).join('')}</div><div class="feedback"></div>`;
    let tries = 0;
    el.querySelector('.opts').onclick = e => {
      const b = e.target.closest('.opt'); if (!b || b.disabled) return;
      tries++;
      const ok = b.dataset.v === name;
      b.classList.add(ok ? 'right' : 'wrong');
      const fb = el.querySelector('.feedback');
      if (ok) { playStrum(name); fb.innerHTML = `<span class="ok">Yes, ${name}.</span>`; setTimeout(() => res(tries === 1), 900); }
      else { b.disabled = true; playStrum(b.dataset.v); fb.innerHTML = `<span class="err">That is ${b.dataset.v}. Try again.</span>`; if (tries >= 2) { el.querySelector(`[data-v="${name}"]`).classList.add('right'); setTimeout(() => res(false), 1400); } }
    };
  });
}
/** Find a note on the fretboard by tapping. */
export function qNote(el, s, f, { frets = 5 } = {}) {
  return new Promise(res => {
    const target = OPEN_STRINGS[s] + f;
    el.innerHTML = `<div class="qbox gt-qnote"><p>Find <b class="gt-big">${noteNameOf(s, f)}</b> on the <b>${STRING_LABEL[s]}</b> string.</p><button class="play" data-pluck="${target}">Hear it</button></div>
      <div class="gt-boardwrap">${fretboardHTML({ frets: Math.max(frets, f + 1), tappable: true })}</div><div class="feedback"></div>`;
    let tries = 0;
    el.querySelector('.gt-board').onclick = e => {
      const b = e.target.closest('.gt-cell'); if (!b) return;
      const bs = +b.dataset.s, bf = +b.dataset.f;
      pluck(OPEN_STRINGS[bs] + bf);
      if (bs !== s) { el.querySelector('.feedback').innerHTML = `<span class="err">That is the ${STRING_NAMES[bs]} string. Use the ${STRING_NAMES[s]} string.</span>`; return; }
      tries++;
      if (bf === f) { b.classList.add('mk', 'good'); b.innerHTML += `<b>${noteNameOf(s, f)}</b>`; el.querySelector('.feedback').innerHTML = `<span class="ok">Yes! ${f ? 'Fret ' + f : 'Open string'}.</span>`; setTimeout(() => res(tries === 1), 900); }
      else { b.classList.add('mk', 'badc'); b.innerHTML += `<b>${noteNameOf(bs, bf)}</b>`; el.querySelector('.feedback').innerHTML = `<span class="err">That is ${noteNameOf(bs, bf)}. ${bf < f ? 'Go higher (toward the body).' : 'Go lower (toward the head).'}</span>`; if (tries >= 3) setTimeout(() => res(false), 1400); }
    };
  });
}
/** Which string? (by name, number or sound) */
export function qString(el, s, mode) {
  return new Promise(res => {
    const m = mode || pick(['name', 'num', 'hear']);
    const prompt = m === 'name' ? `Tap the <b>${STRING_NAMES[s]}</b> string (${s === 0 ? 'thickest' : s === 5 ? 'thinnest' : 'number ' + (6 - s)}).`
      : m === 'num' ? `Tap string number <b>${6 - s}</b>.` : 'Which open string did you hear?';
    el.innerHTML = `<div class="qbox"><p class="gt-q">${prompt}</p>${m === 'hear' ? `<button class="play" data-pluck="${OPEN_STRINGS[s]}">Play again</button>` : ''}</div>
      <div class="gt-strbtns">${[5, 4, 3, 2, 1, 0].map(i => `<button class="gt-strbtn" data-s="${i}" style="--w:${1.5 + (5 - i) * 0.7}px"><span>${STRING_NAMES[i]}</span><small>${6 - i}</small><i></i></button>`).join('')}</div><div class="feedback"></div>`;
    if (m === 'hear') setTimeout(() => pluck(OPEN_STRINGS[s], { vel: 0.35 }), 250);
    let tries = 0;
    el.querySelector('.gt-strbtns').onclick = e => {
      const b = e.target.closest('.gt-strbtn'); if (!b) return;
      tries++; const i = +b.dataset.s; pluck(OPEN_STRINGS[i], { vel: 0.3 });
      if (i === s) { b.classList.add('right'); el.querySelector('.feedback').innerHTML = `<span class="ok">Yes: ${STRING_NAMES[s]}, string ${6 - s}.</span>`; setTimeout(() => res(tries === 1), 800); }
      else { b.classList.add('wrong'); el.querySelector('.feedback').innerHTML = `<span class="err">That is ${STRING_NAMES[i]} (string ${6 - i}).</span>`; if (tries >= 2) setTimeout(() => res(false), 1200); }
    };
  });
}
/** Which strum pattern did you hear? */
export function qPattern(el, p, pool) {
  return new Promise(res => {
    const opts = shuffle([p, ...shuffle(pool.filter(x => x !== p)).slice(0, 2)]);
    const playIt = () => playPattern(p, 84, 'G');
    el.innerHTML = `<div class="qbox"><p>Which strum pattern is this?</p><button class="play" data-x>Play again</button></div><div class="opts one">${opts.map(o => `<button class="opt" data-v="${o}">${patternHTML(o, { labels: false })}</button>`).join('')}</div><div class="feedback"></div>`;
    el.querySelector('[data-x]').onclick = playIt; setTimeout(playIt, 300);
    let tries = 0;
    el.querySelector('.opts').onclick = e => {
      const b = e.target.closest('.opt'); if (!b) return; tries++;
      const ok = b.dataset.v === p; b.classList.add(ok ? 'right' : 'wrong');
      if (ok) setTimeout(() => res(tries === 1), 700); else if (tries >= 2) { el.querySelector(`[data-v="${p}"]`).classList.add('right'); setTimeout(() => res(false), 1300); }
    };
  });
}
/** Play a one-bar strum pattern (8 eighth slots) twice with clicks. */
export function playPattern(p, bpm = 80, chord = 'G', { bars = 2, at = 0.1 } = {}) {
  const c = getCtx(), e8 = 60 / bpm / 2, t0 = c.currentTime + at, sh = shapeFor(chord).f;
  for (let b = 0; b < bars; b++) [...p].forEach((x, k) => {
    const t = t0 + (b * p.length + k) * e8;
    if (k % 2 === 0) click(t, k === 0);
    if (x !== '.') playStrum(sh, { at: t - c.currentTime, up: x === 'U', vel: x === 'U' ? 0.18 : 0.24 });
  });
  return bars * p.length * e8;
}

// ---------- games ----------
export const GAMES = {
  names: {
    name: 'String names', how: 'Tap the string the app asks for. Some rounds you only hear it.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true;
      (async () => {
        const n = a.n || 10, queue = shuffle([0, 1, 2, 3, 4, 5, ...shuffle([0, 1, 2, 3, 4, 5])]).slice(0, n);
        let ok = 0, total = 0;
        while (queue.length && alive) {
          const s = queue.shift(); total++;
          stage.innerHTML = `<div class="hud"><span>${total} / ${n}</span><span>${ok} right</span></div><div id="q"></div>`;
          const r = await qString(stage.querySelector('#q'), s, a.mode);
          ctx.grade(`gt:string:${s}`, r); if (r) ok++; else if (queue.length < 3) queue.push(s);
        }
        if (alive) ctx.finish(ok / total);
      })();
      return () => { alive = false; };
    },
  },

  quiz: {
    name: 'Chord flash cards', how: 'See a chart, name the chord. Or see a name, pick the chart.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true;
      (async () => {
        const pool = a.chords || ALL_CHORDS.slice(0, 7), n = a.n || 8;
        const learned = ctx.srs.learned('gt', 'gt:chord:').map(id => id.split(':')[2]).filter(c => !pool.includes(c));
        const list = shuffle([...pool, ...pool, ...shuffle(learned).slice(0, 3)]).slice(0, n);
        let ok = 0;
        for (let i = 0; i < list.length && alive; i++) {
          stage.innerHTML = `<div class="hud"><span>${i + 1} / ${list.length}</span><span>${ok} right</span></div><div id="q"></div>`;
          const r = await qChord(stage.querySelector('#q'), list[i], { pool: [...new Set([...pool, ...learned])].length >= 4 ? [...new Set([...pool, ...learned])] : ALL_CHORDS.slice(0, 8) });
          ctx.grade(`gt:chord:${list[i]}`, r); if (r) ok++;
        }
        if (alive) ctx.finish(ok / list.length);
      })();
      return () => { alive = false; };
    },
  },

  build: {
    name: 'Build the chord', how: 'Tap frets to place your fingers. Tap ○ / × above a string to play it open or mute it. Strum to hear it, then Check.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      const list = a.chords || ['Em']; let ci = 0, total = 0;
      const next = () => {
        if (ci >= list.length) return ctx.finish(total / list.length);
        const name = list[ci], C = shapeFor(name), f = [0, 0, 0, 0, 0, 0]; let tries = 0;
        stage.innerHTML = `<div class="gt-target"><small>Chord ${ci + 1} of ${list.length}</small><b>${name}</b></div><div id="bd"></div>
          <div class="row"><button class="btn ghost" data-b="strum">Strum it</button><button class="btn ghost" data-b="hint">Hint</button></div>
          <button class="btn primary big" data-b="check" style="margin-top:10px">Check</button><div class="feedback" id="fb"></div>`;
        const bd = stage.querySelector('#bd'), fb = stage.querySelector('#fb');
        const draw = () => { bd.innerHTML = builderHTML(f); };
        draw();
        stage.onclick = e => {
          const t = e.target.closest('button'); if (!t) return;
          if (t.dataset.f) { const s = +t.dataset.s, r = +t.dataset.f; f[s] = f[s] === r ? 0 : r; if (f[s] >= 0) pluck(OPEN_STRINGS[s] + f[s]); draw(); }
          else if (t.dataset.n) { const s = +t.dataset.n; f[s] = f[s] < 0 ? 0 : -1; if (f[s] === 0) pluck(OPEN_STRINGS[s]); draw(); }
          else if (t.dataset.b === 'strum') playStrum(f);
          else if (t.dataset.b === 'hint') {
            tries++;
            const s = C.f.findIndex((v, i) => v !== f[i]);
            if (s >= 0) { f[s] = C.f[s]; draw(); fb.style.color = ''; fb.textContent = `${STRING_LABEL[s]}: ${C.f[s] < 0 ? 'do not play it (×)' : C.f[s] === 0 ? 'play it open (○)' : `fret ${C.f[s]}${C.fi && C.fi[s] ? `, finger ${C.fi[s]}` : ''}`}.`; }
          } else if (t.dataset.b === 'check') {
            tries++;
            const wrong = C.f.map((v, i) => (v !== f[i] ? i : -1)).filter(i => i >= 0);
            if (!wrong.length) {
              playStrum(C.f); const sc = [0, 1, 0.8, 0.6, 0.45][Math.min(4, tries)] || 0.35; total += sc;
              ctx.grade(`gt:chord:${name}`, q2grade(tries));
              stage.onclick = null;
              bd.innerHTML = chordSVG(name, { size: 170 });
              fb.innerHTML = `<span class="ok">That is ${name}! Listen to it ring.</span>`; ci++; setTimeout(next, 1900);
            } else { playStrum(f); fb.innerHTML = `<span class="err">${wrong.length} string${wrong.length > 1 ? 's are' : ' is'} not right: ${wrong.map(i => STRING_NAMES[i]).join(', ')}.</span>`; }
          }
        };
      };
      next();
      return () => { stage.onclick = null; };
    },
  },

  check: {
    name: 'Chord check', mic: true, how: 'Make the chord on your guitar and strum it. The app tells you if every string rings.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, off = null;
      (async () => {
        E = await ear(stage, ctx, { why: 'Strum each chord on your guitar. The app checks every string.' });
        if (!alive) return;
        const list = shuffle([].concat(...Array(a.reps || 2).fill(a.chords || ['Em'])));
        let total = 0;
        for (let i = 0; i < list.length && alive; i++) {
          const name = list[i];
          stage.innerHTML = `<div class="hud"><span>${i + 1} / ${list.length}</span><span id="pts"></span></div>
            <div class="gt-check"><div class="gt-checkchart">${chordSVG(name, { size: 190 })}</div>
            <div><p class="gt-big">Strum ${name}</p><div id="sr" class="gt-strrep">${chordStrings(name).map(x => `<span data-s="${x.s}">${STRING_NAMES[x.s]}</span>`).join('')}</div><button class="play" data-strum="${name}">Hear it</button></div></div>
            <div id="hud"></div><div class="feedback" id="fb">${E ? 'Strum when ready.' : 'Strum it, then rate yourself honestly.'}</div>
            <div class="row" id="btns">${E ? '<button class="btn ghost" id="skip">Skip</button>' : '<button class="btn ghost" data-r="0">Not yet</button><button class="btn ghost" data-r="0.6">Some buzz</button><button class="btn primary" data-r="1">Clean!</button>'}</div>`;
          const fb = stage.querySelector('#fb');
          const sc = await new Promise(res => {
            let tries = 0;
            if (!E) { stage.querySelector('#btns').onclick = e => { const b = e.target.closest('[data-r]'); if (b) res(+b.dataset.r); }; return; }
            const h = micHud(); stage.querySelector('#hud').append(h.el);
            const o1 = E.on(f => h.level(f.rms, E.gate));
            stage.querySelector('#skip').onclick = () => { o1(); off && off(); res(0); };
            off = E.onStrum(async s => {
              const r = await E.judgeStrum(s, name);
              if (!alive) return;
              tries++;
              stage.querySelectorAll('#sr span').forEach(sp => { const st = (r.strings || []).find(x => x.s === +sp.dataset.s); sp.className = st ? (st.state === 'ok' ? 'ok' : st.state === 'unknown' ? '' : 'bad') : ''; });
              if (r.ok) { o1(); off(); off = null; fb.innerHTML = `<span class="ok">Clean ${name}! ${tries === 1 ? 'First try.' : ''}</span>`; setTimeout(() => res([0, 1, 0.75, 0.55][Math.min(3, tries)] || 0.4), 1100); }
              else { fb.innerHTML = `<span class="err">${esc(r.hint || 'Not clean yet.')}</span>`; if (tries >= 4) { o1(); off(); off = null; setTimeout(() => res(0.25), 1600); } }
            });
          });
          ctx.grade(`gt:chord:${name}`, sc >= 0.99 ? 2 : sc >= 0.5 ? 1 : 0);
          total += sc;
        }
        if (alive) ctx.finish(total / list.length);
      })();
      return () => { alive = false; if (off) off(); if (E) E.stop(); };
    },
  },

  strings: {
    name: 'String by string', mic: true, how: 'Hold the chord. Pick one string at a time, low to high. Each string lights up when it rings clearly.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, stopL = null;
      (async () => {
        E = await ear(stage, ctx, { why: 'Pick each string of the chord slowly. The app checks that every note rings.' });
        if (!alive) return;
        const chords = a.chords || [a.chord || 'Em'];
        let good = 0, all = 0;
        for (const name of chords) {
          if (!alive) return;
          const strs = chordStrings(name), sh = shapeFor(name);
          stage.innerHTML = `<div class="gt-check"><div class="gt-checkchart">${chordSVG(name, { size: 170 })}</div><div><p class="gt-big">${name}: pick each string</p>
            <ol class="gt-strlist">${sh.f.map((v, i) => `<li data-s="${i}" class="${v < 0 ? 'skip' : ''}"><b>${STRING_NAMES[i]}</b> ${v < 0 ? 'do not play' : v === 0 ? 'open' : 'fret ' + v} <span>${v < 0 ? '×' : ''}</span></li>`).join('')}</ol></div></div>
            <div id="hud"></div><div class="feedback" id="fb"></div><div class="row" id="btns"></div>`;
          const fb = stage.querySelector('#fb');
          const res = await new Promise(resolve => {
            let k = 0, okN = 0, stable = 0, wrongStable = 0, since = performance.now();
            const mark = (cls, t) => { const li = stage.querySelector(`li[data-s="${strs[k].s}"]`); li.className = cls; li.querySelector('span').textContent = t; };
            const cur = () => { const li = stage.querySelector(`li[data-s="${strs[k].s}"]`); li.classList.add('cur'); fb.textContent = `Pick the ${STRING_LABEL[strs[k].s]} string.`; pluck(strs[k].midi, { vel: 0.12 }); since = performance.now(); };
            const advance = ok => { if (ok) okN++; k++; stable = wrongStable = 0; if (k >= strs.length) { stopL && stopL(); stopL = null; resolve({ okN, n: strs.length }); } else setTimeout(cur, 350); };
            if (!E) {
              stage.querySelector('#btns').innerHTML = '<button class="btn ghost" data-r="0">Buzzed</button><button class="btn primary" data-r="1">Rang clear</button>';
              stage.querySelector('#btns').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; mark(+b.dataset.r ? 'ok' : 'bad', +b.dataset.r ? '✓' : '✗'); advance(+b.dataset.r); };
              cur(); return;
            }
            stage.querySelector('#btns').innerHTML = '<button class="btn ghost" id="sk">Skip this string</button>';
            stage.querySelector('#sk').onclick = () => { mark('bad', '✗'); advance(false); };
            const h = micHud(); stage.querySelector('#hud').append(h.el);
            setTimeout(cur, 400);
            stopL = E.on(f => {
              h.level(f.rms, E.gate);
              if (k >= strs.length || performance.now() - since < 450) return;
              const t = strs[k].midi;
              if (f.midi) h.text(`Hearing ${noteName(f.midi)}`);
              if (f.midi && Math.abs(f.midi - t) <= 0.6) { if (++stable >= 4) { mark('ok', '✓'); advance(true); } }
              else if (f.midi && Math.abs(f.midi - t) > 0.6) {
                stable = 0;
                if (++wrongStable === 10) {
                  const d = Math.round(f.midi - t);
                  fb.textContent = Math.abs(d) === 12 ? 'Close (an octave off). Pick the right string.' : Math.abs(d) <= 2 ? `I hear ${noteName(f.midi)}. ${d < 0 ? 'Press harder or check the fret.' : 'One fret too high?'}` : `I hear ${noteName(f.midi)}. Is that the ${STRING_NAMES[strs[k].s]} string?`;
                }
              }
            });
          });
          good += res.okN; all += res.n;
          ctx.grade(`gt:chord:${name}`, res.okN === res.n ? 2 : res.okN >= res.n - 1 ? 1 : 0);
          fb.innerHTML = res.okN === res.n ? '<span class="ok">Every string rings. Now strum it!</span>' : `<span class="err">${res.okN} of ${res.n} strings rang. Fingertips, close to the fret.</span>`;
          playStrum(name);
          await sleep(1500);
        }
        if (alive) ctx.finish(good / Math.max(1, all));
      })();
      return () => { alive = false; if (stopL) stopL(); if (E) E.stop(); };
    },
  },

  switch: {
    name: 'One-minute changes', mic: true, how: 'Switch between two chords as many times as you can. Each clean change counts. Beat your best!',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, stopL = null, timer = 0;
      const A = a.a || 'Em', B = a.b || 'Am', secs = a.secs || 60, target = a.target || 20;
      const key = `gtpb:${A}-${B}`, best = store.get(key, 0);
      (async () => {
        E = await ear(stage, ctx, { why: 'Strum each chord once, then change. The app counts every clean change.' });
        if (!alive) return;
        stage.innerHTML = `<div class="gt-switch"><div class="gt-pair"><div id="ca">${chordSVG(A, { size: 140 })}</div><div class="gt-arrow">⇄</div><div id="cb">${chordSVG(B, { size: 140 })}</div></div>
          <p class="center">Personal best: <b>${best}</b> changes · goal ${target}</p><p class="center muted">Tip: lift all fingers together and land them together. Look ahead to the next shape.</p>
          <button class="btn primary big" id="go">Start ${secs} seconds</button></div>`;
        await new Promise(r => { stage.querySelector('#go').onclick = r; });
        if (!alive) return;
        const box = stage.querySelector('.gt-switch');
        box.innerHTML = '<div class="count"></div>';
        await countdown(box.querySelector('.count'), 3);
        if (!alive) return;
        let count = 0, want = B, left = secs, lastCheck = 0;
        box.innerHTML = `<div class="gt-swhud"><div><b id="cnt">0</b><small>changes</small></div><div><b id="tm">${secs}</b><small>seconds</small></div></div>
          <div class="gt-pair"><div id="ca" class="on">${chordSVG(A, { size: 130 })}</div><div class="gt-arrow">⇄</div><div id="cb">${chordSVG(B, { size: 130 })}</div></div>
          <div id="hud"></div><div class="feedback" id="fb">Strum ${A}, then change to ${B}.</div>${E ? '' : '<button class="btn primary big" id="tapc">Changed! (tap each clean change)</button>'}`;
        const cnt = box.querySelector('#cnt'), tm = box.querySelector('#tm');
        const flip = () => { count++; cnt.textContent = count; want = want === A ? B : A; box.querySelector('#ca').classList.toggle('on', want === B); box.querySelector('#cb').classList.toggle('on', want === A); box.querySelector('#fb').textContent = `Now ${want}.`; };
        if (!E) box.querySelector('#tapc').onclick = flip;
        else {
          const h = micHud(); box.querySelector('#hud').append(h.el);
          stopL = E.on(f => {
            h.level(f.rms, E.gate);
            const pn = performance.now(); if (pn - lastCheck < 120) return; lastCheck = pn;
            const other = want === A ? B : A;
            const rw = E.chordNow(want, 0.25), ro = E.chordNow(other, 0.25);
            if (rw.ok && rw.score > ro.score + 0.04) flip();
          });
        }
        await new Promise(r => { timer = setInterval(() => { left--; tm.textContent = left; if (left <= 0) { clearInterval(timer); r(); } }, 1000); });
        if (stopL) { stopL(); stopL = null; }
        if (!alive) return;
        const nb = Math.max(best, count); store.set(key, nb);
        ctx.grade(`gt:chord:${A}`, count >= target / 2 ? 2 : 1); ctx.grade(`gt:chord:${B}`, count >= target / 2 ? 2 : 1);
        ctx.finish(Math.min(1, count / target), { lines: [`${count} changes in ${secs} s${count > best ? ' · new personal best!' : ` · best ${best}`}`, 'Do this every day. Most people double their score in two weeks.'] });
      })();
      return () => { alive = false; clearInterval(timer); if (stopL) stopL(); if (E) E.stop(); };
    },
  },

  strum: {
    name: 'Strum hero', how: 'Arrows slide to the red line. Strum as each one arrives. With the mic, the app hears your strums. Without it, tap Down / Up.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, stopDraw = null, offS = null, kd = null, cv = null;
      const P = a.pattern || 'D.D.D.D.', bpm = a.bpm || 72, chords = a.chords || ['G'], bars = a.bars || 4;
      (async () => {
        stage.innerHTML = `<div class="card center"><p>Pattern</p>${patternHTML(P)}<p class="muted">${bpm} beats per minute · ${chords.join(' → ')}</p>
          <div class="row"><button class="btn ghost" id="lis">Listen first</button><button class="btn primary" id="mic">Play with mic</button><button class="btn ghost" id="tapm">Tap mode</button></div></div>`;
        stage.querySelector('#lis').onclick = () => { unlock(); playPattern(P, bpm, chords[0]); };
        const mode = await new Promise(r => { stage.querySelector('#mic').onclick = () => r('mic'); stage.querySelector('#tapm').onclick = () => r('tap'); });
        if (!alive) return;
        if (mode === 'mic') { E = await ear(stage, ctx, { why: 'Strum on your guitar. The app times each strum.' }); if (!alive) return; }
        const c = getCtx(), qn = 60 / bpm, e8 = qn / 2, t0 = c.currentTime + qn * 4 + 0.5;
        const notes = [];
        for (let b = 0; b < bars; b++) [...P].forEach((d, k) => { if (d !== '.') notes.push({ t: t0 + (b * P.length + k) * e8, d, ch: chords[b % chords.length] }); });
        for (let q = 0; q < 4 + bars * P.length / 2; q++) click(t0 - qn * 4 + q * qn, q % 4 === 0);
        stage.innerHTML = `<div class="playfield gt-strumlane" id="ln"></div><div class="feedback" id="jg">Count in: 1, 2, 3, 4…</div><div id="hud"></div>
          ${E ? '<p class="center muted">Strum your guitar. Up and down both count; follow the arrows anyway.</p>' : '<div class="row gt-pads"><button class="gt-pad d" data-d="D">↓ Down</button><button class="gt-pad u" data-d="U">↑ Up</button></div>'}`;
        cv = fitCanvas(stage.querySelector('#ln'));
        const jg = stage.querySelector('#jg');
        let per = 0, good = 0, fxT = '', fxC = '', fxAt = 0;
        const judge = (t, col) => { jg.textContent = t; jg.style.color = col; fxT = t; fxC = col; fxAt = performance.now(); };
        const press = (d, t) => {
          if (!E) { const sh = shapeFor(notes[0].ch).f; playStrum(sh, { up: d === 'U' }); }
          let best = null;
          for (const n of notes) { if (n.j) continue; const dt = Math.abs(n.t - t); if (dt < 0.22 && (!best || dt < Math.abs(best.t - t))) best = n; }
          if (!best) return;
          const dt = t - best.t;
          if (!E && best.d !== d) { best.j = 'w'; judge('Wrong direction', col('--bad')); return; }
          if (Math.abs(dt) < (E ? 0.07 : 0.08)) { best.j = 'p'; per++; judge('Perfect!', col('--ok')); }
          else { best.j = 'g'; good++; judge(dt < 0 ? 'Good (early)' : 'Good (late)', col('--warn')); }
        };
        if (E) { const h = micHud(); stage.querySelector('#hud').append(h.el); E.on(f => h.level(f.rms, E.gate)); offS = E.onStrum(s => press(null, s.t)); }
        else {
          const tl = (settings.get().tapLatencyMs || 0) / 1000;
          stage.querySelector('.gt-pads').onpointerdown = e => { const p = e.target.closest('.gt-pad'); if (!p) return; e.preventDefault(); press(p.dataset.d, getCtx().currentTime - tl); p.classList.add('hit'); setTimeout(() => p.classList.remove('hit'), 90); };
          kd = e => { if (e.key === 'ArrowDown' || e.key === 'j') press('D', getCtx().currentTime - tl); if (e.key === 'ArrowUp' || e.key === 'k') press('U', getCtx().currentTime - tl); };
          addEventListener('keydown', kd);
        }
        const PX = 180 * (72 / bpm) * 1.1;
        stopDraw = loop(() => {
          const now = c.currentTime, { g, w: W, h: H } = cv; if (!W) return;
          const hx = W * 0.18;
          g.clearRect(0, 0, W, H); g.fillStyle = col('--card'); g.fillRect(0, 0, W, H);
          for (let b = -4; b < bars * 4 + 1; b++) { const x = hx + (t0 + b * qn - now) * PX; if (x < 0 || x > W) continue; g.strokeStyle = b % 4 === 0 ? col('--mute') : col('--line'); g.lineWidth = b % 4 === 0 ? 2 : 1; g.beginPath(); g.moveTo(x, 10); g.lineTo(x, H - 10); g.stroke(); }
          let lastCh = '';
          for (const n of notes) {
            if (!n.j && now - n.t > 0.22) { n.j = 'm'; judge('Miss', col('--bad')); }
            const x = hx + (n.t - now) * PX; if (x < -40 || x > W + 40) continue;
            const y = n.d === 'D' ? H * 0.42 : H * 0.62;
            if (n.ch !== lastCh) { g.fillStyle = col('--ink'); g.font = '400 18px "Dela Gothic One", sans-serif'; g.fillText(n.ch, x - 10, 26); lastCh = n.ch; }
            g.globalAlpha = n.j ? (n.j === 'm' || n.j === 'w' ? 0.25 : 0.35) : 1;
            g.fillStyle = n.j === 'p' ? col('--ok') : n.j === 'g' ? col('--warn') : n.d === 'D' ? '#3b4a94' : '#b0650a';
            g.beginPath(); g.roundRect ? g.roundRect(x - 22, y - 22, 44, 44, 10) : g.rect(x - 22, y - 22, 44, 44); g.fill();
            g.fillStyle = '#fff'; g.font = '800 26px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.d === 'D' ? '↓' : '↑', x, y + 1); g.textAlign = 'left';
            g.globalAlpha = 1;
          }
          g.fillStyle = '#d93a26'; g.fillRect(hx - 2, 8, 4, H - 16);
          if (now < t0) { g.fillStyle = col('--ink'); g.font = '400 56px "Dela Gothic One", sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.ceil((t0 - now) / qn)), W / 2, H / 2 + 10); g.textAlign = 'left'; }
          const age = (performance.now() - fxAt) / 700;
          if (age < 1 && fxT) { g.globalAlpha = 1 - age; g.fillStyle = fxC; g.font = '800 22px "M PLUS Rounded 1c", sans-serif'; g.fillText(fxT, hx + 12, H - 18 - age * 16); g.globalAlpha = 1; }
          if (now > notes[notes.length - 1].t + 0.6) {
            stopDraw(); stopDraw = null;
            const sc = (per + 0.65 * good) / notes.length;
            ctx.grade(`gt:pattern:${P}`, sc >= 0.8 ? 2 : sc >= 0.5 ? 1 : 0);
            ctx.finish(sc, { lines: [`${per} perfect · ${good} good · ${notes.length - per - good} missed`] });
          }
        });
      })();
      return () => { alive = false; if (stopDraw) stopDraw(); if (offS) offS(); if (kd) removeEventListener('keydown', kd); if (cv) cv.destroy(); if (E) E.stop(); };
    },
  },

  notehunt: {
    name: 'Note hunter', how: 'Find each note on the fretboard. Tap it, or play it on your guitar when the mic is on.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, offF = null;
      (async () => {
        const pool = (a.notes || [[5, 0], [5, 1], [5, 3], [4, 0], [4, 1], [4, 3]]).map(([s, f]) => ({ s, f }));
        const n = a.n || 8, frets = a.frets || 5;
        if (a.play) { E = await ear(stage, ctx, { why: 'Play each note on your guitar. The app hears the pitch.' }); if (!alive) return; }
        const list = []; while (list.length < n) list.push(...shuffle(pool)); list.length = n;
        let ok = 0;
        for (let i = 0; i < n && alive; i++) {
          const { s, f } = list[i];
          stage.innerHTML = `<div class="hud"><span>${i + 1} / ${n}</span><span>${ok} right</span></div><div id="q"></div>`;
          let r;
          if (E) {
            const q = stage.querySelector('#q'), target = OPEN_STRINGS[s] + f;
            q.innerHTML = `<div class="qbox"><p>Play <b class="gt-big">${noteNameOf(s, f)}</b> on the <b>${STRING_LABEL[s]}</b> string.</p><button class="play" data-pluck="${target}">Hear it</button><button class="btn ghost sm" id="show">Show me where</button></div><div id="bb"></div><div id="hud"></div><div class="feedback" id="fb"></div>`;
            q.querySelector('#show').onclick = () => { q.querySelector('#bb').innerHTML = fretboardHTML({ frets: Math.max(frets, f + 1), marks: [{ s, f, label: noteNameOf(s, f), cls: 'target' }] }); q.dataset.shown = 1; };
            const h = micHud(); q.querySelector('#hud').append(h.el);
            r = await new Promise(res => {
              let stable = 0, wrong = 0; const t1 = performance.now();
              offF = E.on(fr => {
                h.level(fr.rms, E.gate); if (fr.midi) h.text(`Hearing ${noteName(fr.midi)}`);
                if (fr.midi && Math.abs(fr.midi - target) <= 0.6) { if (++stable >= 4) { offF(); offF = null; q.querySelector('#fb').innerHTML = '<span class="ok">Yes!</span>'; q.querySelector('#bb').innerHTML = fretboardHTML({ frets: Math.max(frets, f + 1), marks: [{ s, f, label: noteNameOf(s, f), cls: 'good' }] }); setTimeout(() => res(!q.dataset.shown && performance.now() - t1 < 15000), 900); } }
                else if (fr.midi) { stable = 0; if (++wrong === 12) q.querySelector('#fb').innerHTML = `<span class="err">I hear ${noteName(fr.midi)}. ${fr.midi < target ? 'Go higher.' : 'Go lower.'}</span>`; if (wrong > 30) wrong = 0; }
              });
            });
          } else r = await qNote(stage.querySelector('#q'), s, f, { frets });
          ctx.grade(`gt:note:${s}:${f}`, r); if (r) ok++;
        }
        if (alive) ctx.finish(ok / n);
      })();
      return () => { alive = false; if (offF) offF(); if (E) E.stop(); };
    },
  },

  riff: {
    name: 'Note highway', mic: true, how: 'Notes slide along the strings. Pick each one as it reaches the red line. The number is the fret.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, cl = null;
      (async () => {
        E = await ear(stage, ctx, { why: 'Play the notes on your guitar. The app hears each pitch.' });
        if (!alive) return;
        const piece = melodyPiece(a.piece || 'ewalk');
        cl = startNoteHighway(stage, piece, { ear: E, wait: a.wait !== false, speed: a.speed || 0.8, onFinish: r => {
          (a.learns || []).forEach(id => ctx.grade(id, r.score > 0.7));
          setTimeout(() => ctx.finish(r.score, { lines: [`${r.hits} of ${r.total} notes · best combo ${r.maxCombo}`] }), 1200);
        } });
      })();
      return () => { alive = false; if (cl) cl(); if (E) E.stop(); };
    },
  },

  song: {
    name: 'Play the song', mic: true, how: 'Chords slide to the red line. Strum each one when it arrives. "Wait for me" stops until you get it right.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      const sess = songSession(a.song || 'loop4', { bpm: a.bpm });
      return startChordSession(stage, sess, ctx, { wait: a.wait ?? true, speed: a.speed || 0.8, backing: a.backing, onFinish: r => {
        [...new Set(sess.chords.map(c => c.name))].forEach(n => ctx.grade(`gt:chord:${n}`, !r.weakest.includes(n)));
        setTimeout(() => ctx.finish(r.score, { lines: [`${r.hits} of ${r.total} chords · best combo ${r.maxCombo}`, r.weakest.length ? `Practise: ${r.weakest.join(', ')}` : 'Every chord landed!'] }), 1200);
      } });
    },
  },

  ear: {
    name: 'Ear trainer', how: 'Listen to the chord. Pick what you hear.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true;
      (async () => {
        const mode = a.mode || 'mm', pool = a.chords || ['E', 'Em', 'A', 'Am', 'D', 'Dm', 'G', 'C'], n = a.n || 8;
        let ok = 0;
        for (let i = 0; i < n && alive; i++) {
          const C = pick(pool), maj = parseChord(C).type === '' || parseChord(C).type === '7';
          const opts = mode === 'mm' ? ['Major', 'Minor'] : shuffle([C, ...shuffle(pool.filter(x => x !== C)).slice(0, Math.min(3, pool.length - 1))]);
          const right = mode === 'mm' ? (maj ? 'Major' : 'Minor') : C;
          stage.innerHTML = `<div class="hud"><span>${i + 1} / ${n}</span><span>${ok} right</span></div><div class="qbox"><div class="bigglyph" id="md" style="font-size:72px">?</div><p>${mode === 'mm' ? 'Bright (major) or sad (minor)?' : 'Which chord was that?'}</p><button class="play" id="re">Play again</button></div>
            <div class="opts">${opts.map(o => `<button class="opt" data-v="${o}">${o}${mode === 'mm' ? `<small>${o === 'Major' ? 'bright, happy' : 'sad, dark'}</small>` : ''}</button>`).join('')}</div><div class="feedback" id="fb"></div>`;
          stage.querySelector('#re').onclick = () => playStrum(C);
          setTimeout(() => playStrum(C), 300);
          const r = await new Promise(res => { stage.querySelector('.opts').onclick = e => { const b = e.target.closest('.opt'); if (!b) return; stage.querySelector('.opts').onclick = null; const good = b.dataset.v === right; b.classList.add(good ? 'right' : 'wrong'); if (!good) stage.querySelector(`[data-v="${right}"]`).classList.add('right'); stage.querySelector('#md').textContent = C; stage.querySelector('#fb').innerHTML = good ? '<span class="ok">Yes!</span>' : `<span class="err">It was ${C}${mode === 'mm' ? ` (${right.toLowerCase()})` : ''}. Listen again.</span>`; playStrum(C); setTimeout(() => res(good), 1500); }; });
          if (r) ok++;
        }
        if (alive) ctx.finish(ok / n);
      })();
      return () => { alive = false; };
    },
  },

  echo: {
    name: 'Rhythm echo', how: 'Listen to a strum rhythm. Then strum it back after the four clicks.',
    run(stage, a = {}, ctx) {
      useGuitarCss();
      let alive = true, E = null, offS = null, raf = null;
      (async () => {
        stage.innerHTML = '<div class="card center"><p>Use your guitar with the mic, or tap the drum pad.</p><div class="row"><button class="btn primary" id="m">Mic</button><button class="btn ghost" id="t">Tap</button></div></div>';
        const mode = await new Promise(r => { stage.querySelector('#m').onclick = () => r('mic'); stage.querySelector('#t').onclick = () => r('tap'); });
        if (mode === 'mic') { E = await ear(stage, ctx, { why: 'Strum the rhythm back on your guitar.' }); if (!alive) return; }
        const pats = a.patterns || ['D.D.D.D.', 'D.D.DUD.', 'D.DUD.D.', 'D.DU.UD.'];
        const bpm = a.bpm || 80, qn = 60 / bpm, e8 = qn / 2, rounds = a.rounds || 4;
        let tot = 0;
        for (let r = 0; r < rounds && alive; r++) {
          const P = pats[r % pats.length], want = [...P].map((x, i) => (x !== '.' ? i : -1)).filter(i => i >= 0);
          stage.innerHTML = `<div class="qbox"><p id="ph">Round ${r + 1} of ${rounds} · listen</p>${patternHTML(P)}</div><div id="hud"></div>${E ? '' : '<button class="gt-drum" id="dr" disabled>Strum</button>'}<div class="feedback" id="fb"></div>`;
          const c = getCtx(), T0 = c.currentTime + 0.3, pb = T0 + 4 * qn, yb = pb + 8 * e8, ys = yb + 4 * qn, end = ys + 8 * e8;
          for (let q = 0; q < 4; q++) { click(T0 + q * qn, !q); click(yb + q * qn, !q); }
          const sh = shapeFor('G').f;
          [...P].forEach((x, k) => { if (x !== '.') playStrum(sh, { at: pb + k * e8 - c.currentTime, up: x === 'U' }); });
          const taps = [];
          const slots = [...stage.querySelectorAll('.gt-slot')];
          if (E) offS = E.onStrum(s => { if (s.t > ys - 0.15 && s.t < end + 0.1) { taps.push(s.t - ys); const k = Math.round((s.t - ys) / e8); if (slots[k]) slots[k].classList.add('tp'); } });
          else { const dr = stage.querySelector('#dr'); dr.onpointerdown = e => { e.preventDefault(); const t = c.currentTime - (settings.get().tapLatencyMs || 0) / 1000; if (t < ys - 0.15) return; taps.push(t - ys); playStrum(sh, { vel: 0.15 }); const k = Math.round((t - ys) / e8); if (slots[k]) slots[k].classList.add('tp'); }; }
          await new Promise(res => {
            let ph = 0;
            const step = () => {
              if (!alive) return res();
              const t = c.currentTime; let k = -1;
              if (t >= pb && t < pb + 8 * e8) k = Math.floor((t - pb) / e8); else if (t >= ys && t < end) k = Math.floor((t - ys) / e8);
              slots.forEach((s, i) => s.classList.toggle('cur', i === k));
              if (ph === 0 && t >= yb) { ph = 1; stage.querySelector('#ph').textContent = 'Your turn after 4 clicks…'; slots.forEach(s => s.classList.add('hide')); const dr = stage.querySelector('#dr'); if (dr) dr.disabled = false; }
              if (ph === 1 && t >= ys) { ph = 2; stage.querySelector('#ph').textContent = 'Strum now!'; }
              if (t > end + 0.3) return res();
              raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
          });
          if (offS) { offS(); offS = null; }
          if (!alive) return;
          const used = new Set(); let hits = 0;
          want.forEach(k => { let bi = -1, bd = 0.13; taps.forEach((x, j) => { const d = Math.abs(x - k * e8); if (!used.has(j) && d < bd) { bd = d; bi = j; } }); if (bi >= 0) { used.add(bi); hits++; } });
          const sc = hits / (want.length + Math.max(0, taps.length - hits));
          tot += sc;
          slots.forEach(s => s.classList.remove('hide', 'cur'));
          stage.querySelector('#ph').textContent = `${hits} of ${want.length} strums on time${taps.length > hits ? ` · ${taps.length - hits} extra` : ''}`;
          stage.querySelector('#fb').innerHTML = sc > 0.95 ? '<span class="ok">Perfect rhythm!</span>' : '<span class="muted">Arrows = the rhythm. Blue ring = your strums.</span>';
          ctx.grade(`gt:pattern:${P}`, sc > 0.8);
          await sleep(2300);
        }
        if (alive) ctx.finish(tot / rounds);
      })();
      return () => { alive = false; if (offS) offS(); if (raf) cancelAnimationFrame(raf); if (E) E.stop(); };
    },
  },
};

// ---------- lesson card helpers (mount functions) ----------
/** "Play X now" card: listens for a clean strum of the chord; enables Next. */
export function checkCard(name, text = '') {
  return {
    title: `Your turn: play ${name}`, requireDone: true,
    html: `<div class="gt-check"><div class="gt-checkchart">${chordSVG(name, { size: 170 })}</div><div><p>${text || `Make ${name} on your guitar and strum it. The app checks every string.`}</p><button class="play" data-strum="${name}">Hear it first</button></div></div><div class="gt-cardmic"></div>`,
    mount(el, ctx) {
      useGuitarCss();
      const host = el.querySelector('.gt-cardmic');
      let E = null, off = null, gone = false;
      host.innerHTML = '<div class="row"><button class="btn primary" data-go>Check with the mic</button><button class="btn ghost" data-skip>Skip</button></div>';
      host.querySelector('[data-skip]').onclick = () => ctx.done();
      host.querySelector('[data-go]').onclick = async () => {
        try { E = await new GuitarEar().start(); } catch (e) { host.innerHTML = `<p class="err">${esc(e.message)}</p>`; ctx.done(); return; }
        if (gone) return E.stop();
        const h = micHud(); host.innerHTML = '<p class="feedback" id="cfb">Strum now.</p>'; host.prepend(h.el);
        E.on(f => h.level(f.rms, E.gate));
        off = E.onStrum(async s => {
          const r = await E.judgeStrum(s, name);
          if (gone) return;
          const fb = host.querySelector('#cfb');
          if (r.ok) { fb.innerHTML = `<span class="ok">Clean ${name}! Every string rings.</span>`; ctx.done(); off(); }
          else fb.innerHTML = `<span class="err">${esc(r.hint)}</span>`;
        });
      };
      return () => { gone = true; if (off) off(); if (E) E.stop(); };
    },
  };
}
/** Pattern demo card. */
export function patternCard(title, p, bpm, chord, text) {
  return { title, html: `${text}${patternHTML(p)}<div class="row"><button class="btn primary" data-pp>Play the pattern</button><button class="btn ghost" data-pps>Slow</button></div>`,
    mount(el) { useGuitarCss(); el.querySelector('[data-pp]').onclick = () => { unlock(); playPattern(p, bpm, chord); }; el.querySelector('[data-pps]').onclick = () => { unlock(); playPattern(p, Math.round(bpm * 0.7), chord); }; } };
}
export { ALL_CHORDS };
