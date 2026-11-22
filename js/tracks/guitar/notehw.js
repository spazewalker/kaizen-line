// Note highway (tab lanes): single notes scroll to the line; the mic checks each pitch.
// startNoteHighway(stage, piece, opts) -> cleanup
//   piece = { title, bpm, bpb?, notes: [{ b: beat, d: beats, s: string 0=low E, f: fret }] }
//   opts  = { ear (GuitarEar|null), onFinish(result), wait (default true), speed }
import { getCtx, click, pluck, unlock } from '../../core/audio.js';
import { OPEN_STRINGS, STRING_NAMES, noteName } from '../../core/music.js';
import { esc, fitCanvas, cssVar, loop } from '../../core/ui.js';
import { settings } from '../../core/store.js';
import { fretboardHTML, micHud, noteNameOf, col } from './fretboard.js';

const SCOL = ['#7b4cc9', '#2f6fd0', '#2f9e5b', '#c9a10c', '#e0801a', '#d93a26']; // low E .. high e

export function startNoteHighway(stage, piece, opts = {}) {
  const ear = opts.ear || null;
  const bpm = piece.bpm || 70, bpb = piece.bpb || 4, spb = 60 / bpm;
  const notes = piece.notes.map((n, i) => ({ ...n, i, t: n.b * spb, dur: (n.d || 1) * spb, midi: OPEN_STRINGS[n.s] + n.f, state: 'pending', tries: 0 }));
  const end = notes.length ? notes[notes.length - 1].t + notes[notes.length - 1].dur : 4;
  let alive = true, rate = opts.speed || 0.8, playing = false, s0 = -bpb * spb, t0 = 0, waiting = null, demo = false, finished = false;
  let pts = 0, combo = 0, maxCombo = 0, lastSched = -99, offs = [];
  const fx = [];
  const now = () => (playing ? s0 + (getCtx().currentTime - t0) * rate : s0);

  stage.innerHTML = `<div class="gt-sess gt-nhw">
    <div class="gt-sess-head"><div class="gt-sess-t"><b>${esc(piece.title || 'Notes')}</b><small>${notes.length} notes · ${bpm} bpm</small></div>
      <div class="gt-score"><b id="nP">0</b><small>points</small></div><div class="gt-score"><b id="nC">0</b><small>combo</small></div></div>
    <div class="playfield gt-lane gt-tab" id="nl"></div>
    <div class="gt-fb" id="nfb" aria-live="polite">${ear ? 'Tap Play. Pick each note as it reaches the red line.' : 'No mic: tap "I played it" for each note.'}</div>
    <div id="nb" class="gt-minib"></div>
    <div id="nhud"></div>
    <div class="row"><button class="btn primary big" id="nplay">Play</button><button class="btn ghost" id="ndemo">Listen first</button>${ear ? '' : '<button class="btn primary big" id="ntap">I played it</button>'}</div>
    <div class="gt-opts"><label class="field">Speed <select id="nspd">${[0.5, 0.6, 0.7, 0.8, 0.9, 1].map(v => `<option value="${v}" ${v === rate ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
    <label class="tog"><input type="checkbox" id="nwait" ${opts.wait !== false ? 'checked' : ''}> Wait for me</label></div></div>`;
  const $ = s => stage.querySelector(s);
  const cv = fitCanvas($('#nl'));
  let wait = opts.wait !== false;
  let hud = null;
  if (ear) { hud = micHud(); $('#nhud').append(hud.el); offs.push(ear.on(f => { hud.level(f.rms, ear.gate); if (f.midi) hud.text(`Hearing ${noteName(f.midi)}`); })); }
  $('#nwait').onchange = e => { wait = e.target.checked; if (!wait && waiting) { waiting = null; resume(); } };
  $('#nspd').onchange = e => { if (playing) { s0 = now(); t0 = getCtx().currentTime; } rate = +e.target.value; };
  $('#nplay').onclick = () => { unlock(); demo = false; playing ? pause() : start(); };
  $('#ndemo').onclick = () => { unlock(); reset(); demo = true; start(); say('Listen and watch. Then tap Play.'); };
  const tap = $('#ntap');
  if (tap) tap.onpointerdown = e => { e.preventDefault(); onPick({ t: getCtx().currentTime, tap: true }); };

  function say(t, cls = '') { const fb = $('#nfb'); fb.textContent = t; fb.className = 'gt-fb ' + cls; }
  function score() { $('#nP').textContent = pts; $('#nC').textContent = combo; }
  function reset() { notes.forEach(n => { n.state = 'pending'; n.tries = 0; }); s0 = -bpb * spb; playing = false; waiting = null; finished = false; pts = 0; combo = 0; lastSched = -99; score(); $('#nplay').textContent = 'Play'; }
  function start() {
    if (finished) reset();
    const c = getCtx();
    if (s0 < 0 || finished) s0 = -bpb * spb;
    if (s0 > -0.01) s0 = Math.max(-bpb * spb, s0 - bpb * spb); // count-in before resuming
    t0 = c.currentTime + 0.1; playing = true; lastSched = s0 - 0.001;
    $('#nplay').textContent = 'Pause';
  }
  function resume() { t0 = getCtx().currentTime; playing = true; }
  function pause() { if (playing) { s0 = now(); playing = false; } $('#nplay').textContent = 'Play'; }
  function songAt(ctxT) { return now() - (getCtx().currentTime - ctxT) * rate; }
  let lastBoard = -2;
  function board(n) {
    if ((n ? n.i : -1) === lastBoard) return;
    lastBoard = n ? n.i : -1;
    if (!n) { $('#nb').innerHTML = ''; return; }
    const maxF = Math.max(5, ...notes.map(x => x.f)), minF = Math.min(...notes.map(x => x.f));
    const from = maxF > 8 ? Math.max(0, minF - 1) : 0;
    $('#nb').innerHTML = fretboardHTML({ from, frets: Math.min(15, Math.max(from + 5, maxF + 1)), marks: [{ s: n.s, f: n.f, label: noteNameOf(n.s, n.f), cls: 'target' }] }) +
      `<p class="muted small center">${STRING_NAMES[n.s]} string, ${n.f ? 'fret ' + n.f : 'open'} = ${noteNameOf(n.s, n.f)}</p>`;
  }

  async function onPick(p) {
    if (!alive || finished || demo) return;
    const target = waiting || notes.find(n => n.state === 'pending' && songAt(p.t) >= n.t - 0.3 && songAt(p.t) <= n.t + Math.max(0.4, n.dur * 0.7));
    if (!target) return;
    if (p.tap) return hit(target, waiting ? 0 : songAt(p.t) - target.t, !!waiting);
    const dt = songAt(p.t) - target.t;
    target.busy = true;
    await new Promise(r => setTimeout(r, 160));
    target.busy = false;
    if (!alive || target.state !== 'pending') return;
    const fr = ear.frames.filter(f => f.midi && f.rawT >= p.rawT + 0.03 && f.rawT <= p.rawT + 0.2).map(f => f.midi).sort((a, b) => a - b);
    const m = fr.length ? fr[fr.length >> 1] : 0;
    if (m && matches(m, target.midi)) hit(target, dt, !!waiting);
    else {
      target.tries++;
      if (m) {
        const d = Math.round(m - target.midi);
        say(`I heard ${noteName(m)}. ${Math.abs(d) <= 4 && d ? `Target is ${Math.abs(d)} fret${Math.abs(d) > 1 ? 's' : ''} ${d > 0 ? 'lower' : 'higher'} on the same string.` : `Target: ${STRING_NAMES[target.s]} string, ${target.f ? 'fret ' + target.f : 'open'}.`}`, 'bad');
      } else say('I heard the pick but not a clear note. Press right behind the fret wire.', 'bad');
    }
  }
  const matches = (m, t) => Math.abs(m - t) <= 0.6 || Math.abs(m - t - 12) <= 0.6 || Math.abs(m - t + 12) <= 0.6;
  function hit(n, dt, waited) {
    n.state = 'hit';
    let p = waited ? 50 : Math.abs(dt) < 0.1 ? 100 : Math.abs(dt) < 0.22 ? 70 : 40;
    if (n.tries) p = Math.round(p * 0.7);
    combo++; maxCombo = Math.max(maxCombo, combo); pts += p + Math.min(40, combo * 4); n.pts = p;
    fx.push({ text: waited ? 'Yes!' : p === 100 ? 'Perfect!' : dt < 0 ? 'Early' : 'Late', color: col('--ok'), t: performance.now(), lane: n.s });
    say(`${noteNameOf(n.s, n.f)}: ${waited ? 'got it' : p === 100 ? 'perfect' : 'good'}${combo > 2 ? ` · combo ${combo}` : ''}`, 'ok'); score();
    if (waiting === n) { waiting = null; resume(); }
  }
  if (ear) offs.push(ear.onStrum(s => onPick(s)));

  let lastHold = 0;
  const stop = loop(() => {
    if (!alive) return;
    let s = now();
    if (playing) {
      const c = getCtx(), ahead = s + 0.25 * rate;
      for (let b = Math.ceil((lastSched + 1e-6) / spb) * spb; b <= ahead; b += spb) {
        const at = c.currentTime + (b - s) / rate;
        click(at, Math.round(b / spb) % bpb === 0);
        lastSched = b;
      }
      if (demo) notes.forEach(n => { if (!n.played && n.t > s && n.t <= ahead) { n.played = true; pluck(n.midi, { at: (n.t - s) / rate, vel: 0.3 }); } });
      if (wait && !waiting && !demo) {
        const n = notes.find(x => x.state === 'pending' && s >= x.t);
        if (n && !n.busy) { s0 = n.t; s = n.t; playing = false; waiting = n; say(`Play ${noteNameOf(n.s, n.f)}: ${STRING_NAMES[n.s]} string, ${n.f ? 'fret ' + n.f : 'open'}.`); }
      }
      if (!wait && !demo) notes.forEach(n => { if (n.state === 'pending' && !n.busy && s > n.t + Math.max(0.4, n.dur * 0.7)) { n.state = 'miss'; combo = 0; score(); fx.push({ text: 'Miss', color: col('--bad'), t: performance.now(), lane: n.s }); } });
      if (s > end + 0.5) {
        if (demo) { demo = false; notes.forEach(n => { n.played = false; }); reset(); say('Your turn. Tap Play.'); }
        else finish();
      }
    }
    // in wait mode also accept a held/soft note that was not picked hard enough to count as an attack
    if (waiting && ear && performance.now() - lastHold > 150) {
      lastHold = performance.now();
      const fr = ear.frames.slice(-4).map(f => f.midi);
      if (fr.length === 4 && fr.every(m => m && matches(m, waiting.midi))) {
        const prev = notes[waiting.i - 1];
        if (!prev || prev.midi !== waiting.midi || ear.frames.slice(-20, -8).some(f => !f.midi)) hit(waiting, 0, true);
      }
    }
    board(waiting || notes.find(n => n.state === 'pending') || null);
    draw(s);
  });

  function draw(s) {
    const { g, w: W, h: H } = cv;
    if (!W) return;
    const hitX = W * 0.18, pps = Math.max(55, Math.min(120, W / 8)) / spb;
    const top = 14, lh = (H - top - 14) / 6, y = str => top + (5 - str) * lh + lh / 2;
    g.clearRect(0, 0, W, H); g.fillStyle = col('--card'); g.fillRect(0, 0, W, H);
    for (let st = 0; st < 6; st++) {
      g.strokeStyle = col('--mute'); g.globalAlpha = 0.5; g.lineWidth = 1 + (5 - st) * 0.0 + (st < 3 ? 1.2 : 0.6);
      g.beginPath(); g.moveTo(0, y(st)); g.lineTo(W, y(st)); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col('--mute'); g.font = '700 12px "M PLUS Rounded 1c", sans-serif'; g.fillText(STRING_NAMES[st], 6, y(st) - 4);
    }
    for (let b = Math.floor((s - 1) / spb); b * spb < s + W / pps; b++) {
      const x = hitX + (b * spb - s) * pps; if (x < 0) continue;
      g.strokeStyle = col('--line'); g.lineWidth = b % bpb === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, H - 10); g.stroke();
    }
    const r = Math.max(12, Math.min(20, lh * 0.42));
    for (const n of notes) {
      const x = hitX + (n.t - s) * pps; if (x < -40 || x > W + 40) continue;
      const yy = y(n.s), cc = n.state === 'hit' ? col('--ok') : n.state === 'miss' ? col('--bad') : SCOL[n.s];
      if (n.dur > spb * 1.2) { g.fillStyle = cc; g.globalAlpha = 0.3; g.fillRect(x, yy - r * 0.35, n.dur * pps - r, r * 0.7); g.globalAlpha = 1; }
      g.fillStyle = cc; g.globalAlpha = n.state === 'miss' ? 0.45 : 1;
      g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill();
      if (waiting === n) { g.lineWidth = 4; g.strokeStyle = col('--ink'); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.05)}px "M PLUS Rounded 1c", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n.f), x, yy + 1); g.textAlign = 'left';
    }
    g.fillStyle = col('--red') || '#d93a26'; g.fillRect(hitX - 2, 6, 4, H - 12);
    if (s < 0 && playing) { g.fillStyle = col('--ink'); g.font = '400 56px "Dela Gothic One", sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.ceil(-s / spb)), W / 2, H / 2); g.textAlign = 'left'; }
    const pn = performance.now();
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], age = (pn - f.t) / 800; if (age > 1) { fx.splice(i, 1); continue; }
      g.globalAlpha = 1 - age; g.fillStyle = f.color; g.font = '800 18px "M PLUS Rounded 1c", sans-serif';
      g.fillText(f.text, hitX + 14, y(f.lane) - r - 4 - age * 20); g.globalAlpha = 1;
    }
  }

  function finish() {
    if (finished) return;
    finished = true; playing = false; $('#nplay').textContent = 'Play again';
    const hits = notes.filter(n => n.state === 'hit').length;
    const sc = notes.reduce((a, n) => a + (n.state === 'hit' ? (n.pts || 50) / 100 : 0), 0) / notes.length;
    const result = { score: Math.min(1, sc * (wait ? 1.6 : 1)), hits, total: notes.length, maxCombo, points: pts };
    say(`Done: ${hits} of ${notes.length} notes · best combo ${maxCombo}`, 'ok');
    if (opts.onFinish) opts.onFinish(result);
  }
  return () => { alive = false; stop(); cv.destroy(); offs.forEach(f => f()); };
}
