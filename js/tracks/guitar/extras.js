// Guitar practice tools (track extras).
import { Metronome, getCtx, unlock, strum } from '../../core/audio.js';
import { EASY_CHORDS, shapeFor, noteName } from '../../core/music.js';
import { chordSVG, micGate, esc, resultScreen } from '../../core/ui.js';
import { settings } from '../../core/store.js';
import { tunerExtra } from './tuner.js';
import { GuitarEar, MONITOR_VOCAB, openEar } from './listen.js';
import { useGuitarCss, micHud } from './fretboard.js';
import { GAMES } from './games.js';
import { CHORD_SONGS, MELODIES, songSession, melodyPiece } from './songs.js';
import { startChordSession } from './session.js';
import { startNoteHighway } from './notehw.js';

const GROUPS = {
  'Open chords': ['C', 'D', 'Dm', 'E', 'Em', 'G', 'A', 'Am', 'Fmaj7', 'Cadd9', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4'],
  'Seventh chords': ['A7', 'B7', 'C7', 'D7', 'E7', 'G7', 'Am7', 'Dm7', 'Em7', 'Cmaj7', 'Amaj7', 'Dmaj7'],
  'Barre chords': ['F', 'Bm', 'Bb', 'B', 'F#m', 'C#m', 'Gm', 'Cm', 'Bbm', 'F#'],
  'Power chords': ['E5', 'A5', 'D5', 'G5'],
};

const chordLib = {
  id: 'chords', title: 'Chord library', sub: 'Every chord chart, tap to hear',
  run(stage) {
    useGuitarCss();
    const known = new Set(settings.get().knownChords || []);
    stage.innerHTML = Object.entries(GROUPS).map(([g, list]) => `<h2>${g}</h2><div class="gt-lib">${list.filter(n => shapeFor(n)).map(n => `<button class="gt-libc ${known.has(n) ? 'known' : ''}" data-strum="${n}" aria-label="Play ${n}">${chordSVG(n, { size: 120 })}${known.has(n) ? '<small>learned</small>' : ''}</button>`).join('')}</div>`).join('') +
      '<p class="muted small">Learned chords are marked. Song Lab uses them to pick an easy capo position.</p>';
    return () => {};
  },
};

const metro = {
  id: 'metronome', title: 'Metronome', sub: 'Steady beat, tap tempo',
  run(stage) {
    useGuitarCss();
    let m = null, bpm = 80, bpb = 4, taps = [];
    stage.innerHTML = `<div class="card center gt-metro"><div class="bignum" id="bpm">${bpm}</div><p class="muted">beats per minute</p>
      <div class="gt-beats" id="bts"></div>
      <input type="range" id="sl" min="40" max="200" value="${bpm}" aria-label="Tempo">
      <div class="row"><button class="btn ghost" data-d="-5">−5</button><button class="btn ghost" data-d="-1">−1</button><button class="btn ghost" data-d="1">+1</button><button class="btn ghost" data-d="5">+5</button></div>
      <label class="field">Beats per bar <select id="bpb"><option>2</option><option>3</option><option selected>4</option><option>6</option></select></label>
      <div class="row"><button class="btn primary big" id="go">Start</button><button class="btn ghost" id="tap">Tap tempo</button></div></div>`;
    const $ = s => stage.querySelector(s);
    const dots = () => { $('#bts').innerHTML = Array.from({ length: bpb }, (_, i) => `<i data-i="${i}"></i>`).join(''); };
    dots();
    const set = v => { bpm = Math.max(40, Math.min(200, Math.round(v))); $('#bpm').textContent = bpm; $('#sl').value = bpm; if (m) { m.bpm = bpm; } };
    $('#sl').oninput = e => set(+e.target.value);
    stage.querySelectorAll('[data-d]').forEach(b => { b.onclick = () => set(bpm + +b.dataset.d); });
    $('#bpb').onchange = e => { bpb = +e.target.value; dots(); if (m) m.beatsPerBar = bpb; };
    $('#go').onclick = () => {
      unlock();
      if (m) { m.stop(); m = null; $('#go').textContent = 'Start'; return; }
      m = new Metronome({ bpm, beatsPerBar: bpb }).onBeat((i, t) => {
        const d = (t - getCtx().currentTime) * 1000;
        setTimeout(() => { stage.querySelectorAll('#bts i').forEach((x, k) => x.classList.toggle('on', k === i % bpb)); }, Math.max(0, d));
      });
      m.start(); $('#go').textContent = 'Stop';
    };
    $('#tap').onclick = () => {
      const t = performance.now(); taps = taps.filter(x => t - x < 3000); taps.push(t);
      if (taps.length >= 2) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); set(60000 / d); }
    };
    return () => { if (m) m.stop(); };
  },
};

const changes = {
  id: 'changes', title: 'One-minute changes', sub: 'Pick two chords, count clean changes',
  run(stage, ctx) {
    useGuitarCss();
    let cl = null;
    const pick = () => {
      if (cl) { cl(); cl = null; }
      const known = (settings.get().knownChords || []).filter(n => shapeFor(n));
      const list = known.length >= 2 ? known : ['Em', 'Am', 'E', 'A', 'D', 'G', 'C'];
      stage.innerHTML = `<div class="card"><p>Choose two chords.</p><div class="row"><label class="field">First <select id="a">${list.map(n => `<option>${n}</option>`).join('')}</select></label><label class="field">Second <select id="b">${list.map((n, i) => `<option ${i === 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><button class="btn primary big" id="go">Go</button></div>`;
      stage.querySelector('#go').onclick = () => {
        const a = stage.querySelector('#a').value, b = stage.querySelector('#b').value;
        if (a === b) return;
        const sub = { ...ctx, finish: async (score, info) => { if (cl) { cl(); cl = null; } await resultScreen(stage, { title: `${a} ⇄ ${b}`, score, lines: info.lines || [], cta: 'Another pair' }); pick(); } };
        cl = GAMES.switch.run(stage, { a, b, target: 20 }, sub);
      };
    };
    pick();
    return () => { if (cl) cl(); };
  },
};

const monitor = {
  id: 'monitor', title: 'Free play monitor', sub: 'Play anything. See the chord or note.',
  run(stage) {
    useGuitarCss();
    let E = null, gone = false;
    (async () => {
      E = await openEar(stage, micGate, { why: 'Play anything. The app shows the chord or note it hears.', allowSkip: false });
      if (gone) { if (E) E.stop(); return; }
      if (!E) { stage.innerHTML = '<p class="err">The microphone is needed for this tool.</p>'; return; }
      stage.innerHTML = '<div class="card center gt-monitor"><p class="muted">I hear</p><div class="bignum" id="mc">–</div><p id="mn" class="muted">&nbsp;</p><div id="mchart"></div><div id="hud"></div><p class="muted small">History</p><div id="hist" class="gt-hist"></div></div>';
      const h = micHud(); stage.querySelector('#hud').append(h.el);
      let last = '', lastAt = 0, chk = 0;
      const hist = [];
      E.on(f => {
        h.level(f.rms, E.gate);
        const pn = performance.now();
        if (pn - chk < 150) return; chk = pn;
        const g = f.rms > E.gate * 1.5 ? E.guessChord(MONITOR_VOCAB) : null;
        if (g) {
          if (g.name !== last || pn - lastAt > 1500) {
            stage.querySelector('#mc').textContent = g.name; stage.querySelector('#mchart').innerHTML = chordSVG(g.name, { size: 120 });
            if (g.name !== last) { hist.unshift(g.name); hist.length = Math.min(hist.length, 12); stage.querySelector('#hist').innerHTML = hist.map(x => `<span class="chip">${x}</span>`).join(''); }
            last = g.name;
          }
          lastAt = pn;
        } else if (f.midi && pn - lastAt > 600) { stage.querySelector('#mc').textContent = noteName(f.midi).replace(/\d+$/, ''); stage.querySelector('#mchart').innerHTML = ''; }
        stage.querySelector('#mn').textContent = f.midi ? `Note: ${noteName(f.midi)}` : ' ';
      });
    })();
    return () => { gone = true; if (E) E.stop(); };
  },
};

const songs = {
  id: 'songs', title: 'Song list', sub: 'Play any built-in song or melody',
  run(stage, ctx) {
    useGuitarCss();
    let cl = null, E = null;
    const list = () => {
      if (cl) { cl(); cl = null; }
      stage.innerHTML = `<h2>Chord songs</h2><div class="tools">${Object.entries(CHORD_SONGS).map(([k, s]) => `<button class="tool" data-c="${k}"><b>${esc(s.title)}</b><span>${[...new Set(s.bars)].join(' · ')}</span></button>`).join('')}</div>
        <h2>Melodies and licks</h2><div class="tools">${Object.entries(MELODIES).map(([k, s]) => `<button class="tool" data-m="${k}"><b>${esc(s.title)}</b><span>${s.notes.length} notes</span></button>`).join('')}</div>
        <p class="muted small">Upload your own songs in Song Lab.</p>`;
      stage.onclick = async e => {
        const b = e.target.closest('[data-c],[data-m]'); if (!b) return;
        stage.onclick = null;
        const back = '<button class="btn ghost sm" data-back>‹ All songs</button>';
        if (b.dataset.c) {
          stage.innerHTML = back + '<div id="ss"></div>';
          stage.querySelector('[data-back]').onclick = list;
          cl = startChordSession(stage.querySelector('#ss'), songSession(b.dataset.c), ctx, { wait: true, speed: 0.8 });
        } else {
          stage.innerHTML = back + '<div id="ss"></div>';
          stage.querySelector('[data-back]').onclick = list;
          const host = stage.querySelector('#ss');
          if (!E) E = await openEar(host, micGate, { why: 'Play the notes. The app hears each one.' });
          cl = startNoteHighway(host, melodyPiece(b.dataset.m), { ear: E, wait: true });
        }
      };
    };
    list();
    return () => { if (cl) cl(); if (E) E.stop(); };
  },
};

export const EXTRAS = [tunerExtra, chordLib, songs, changes, metro, monitor];
