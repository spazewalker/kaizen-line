// Singing tools: range finder (required id 'range'), live pitch monitor, drone + keyboard.
import { tone, holdTone, unlock } from '../../core/audio.js';
import { settings } from '../../core/store.js';
import { noteName, SHARP, pcName } from '../../core/music.js';
import { $, $$, esc, micGate, loop, sleep, toast } from '../../core/ui.js';
import { VoiceListener, hintFor } from './voice.js';
import { Lanes, Meter } from './lanes.js';
import { estimateRange, voiceType } from './score.js';
import { useSingingCss } from './session.js';

const midiOpts = (sel, lo = 36, hi = 79) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${noteName(m)}</option>`).join('');

async function rangeFinder(stage, ctx) {
  useSingingCss();
  const S = settings.get();
  let v = null, alive = true, lanes = null, stopDraw = null;
  const cleanup = () => { alive = false; if (v) v.stop(); if (stopDraw) stopDraw(); if (lanes) lanes.destroy(); };
  const intro = () => {
    stage.innerHTML = `<div class="card"><h2 style="margin-top:0">Find your vocal range</h2>
      <p>Your range is the set of notes you can sing <b>comfortably</b>. Every exercise in the app is moved into this range, so you never strain.</p>
      <ol class="sg-steps"><li>Sing "ah" or "ooo" from a middle note, gliding <b>down</b> until it gets breathy or growly. Hold the lowest clear note.</li>
      <li>Then glide <b>up</b> until it starts to squeeze or crack. Hold the highest easy note. Do not push.</li></ol>
      <p class="muted">Current range: <b>${noteName(S.vocalLow)} to ${noteName(S.vocalHigh)}</b> (${S.vocalHigh - S.vocalLow} semitones).</p>
      <button class="btn primary big" id="go">Start (about 30 seconds)</button>
      <details style="margin-top:12px"><summary>Set it by hand</summary><div class="row" style="margin-top:8px"><label class="sg-sel">Low <select id="ml">${midiOpts(S.vocalLow)}</select></label><label class="sg-sel">High <select id="mh">${midiOpts(S.vocalHigh)}</select></label><button class="btn ghost" id="msave">Save</button></div></details></div>`;
    $('#go', stage).onclick = () => run();
    $('#msave', stage).onclick = () => { const lo = +$('#ml', stage).value, hi = +$('#mh', stage).value; if (hi - lo < 7) return toast('Keep at least 7 semitones between low and high.'); settings.set({ vocalLow: lo, vocalHigh: hi }); toast(`Saved: ${noteName(lo)} to ${noteName(hi)}`); intro(); };
  };
  const phase = async (label, instr, secs, ref) => {
    const frames = [];
    $('#ph', stage).textContent = label; $('#pi', stage).textContent = instr;
    if (ref) tone(ref, { dur: 1 });
    const t0 = performance.now();
    return new Promise(res => {
      v.cbs = [];
      v.on(s => {
        lanes.time = s.t; lanes.push(s.t, s.midi, null); lanes.cur = s.midi ? { midi: s.midi, cents: null } : null;
        if (s.midi) { frames.push({ m: s.midi, stab: s.stab }); $('#pn', stage).textContent = noteName(s.midi); }
        const left = secs - (performance.now() - t0) / 1000;
        $('#pt', stage).textContent = Math.max(0, Math.ceil(left)) + ' s';
        if (left <= 0) res(frames);
      });
    });
  };
  const run = async () => {
    if (!(await micGate(stage, { why: 'The range finder listens to your lowest and highest comfortable notes.' }))) return;
    if (!alive) return;
    stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small" id="ph"></span><br><b id="pn">–</b></div><span class="pill" id="pt"></span></div>
      <p id="pi"></p><div class="playfield" id="pf" style="height:min(340px,44vh)"></div></div>`;
    lanes = new Lanes($('#pf', stage), { pxPerSec: 60, nowFrac: 0.85, labelAll: false });
    lanes.setRange(38, 76);
    stopDraw = loop(dt => lanes.draw(dt));
    v = new VoiceListener(); await v.start();
    await sleep(300);
    const low = await phase('Step 1 of 2 · low', 'Start on this note and glide DOWN slowly on "ah". Hold the lowest clear note.', 10, Math.round((S.vocalLow + S.vocalHigh) / 2));
    if (!alive) return;
    const high = await phase('Step 2 of 2 · high', 'Now start on this note and glide UP slowly. Hold the highest easy note. No straining.', 10, Math.round((S.vocalLow + S.vocalHigh) / 2));
    if (!alive) return;
    v.stop(); v = null;
    const r = estimateRange(low, high);
    if (!r || r.span < 5) {
      stage.innerHTML = `<div class="card center"><h2>I could not hear enough</h2><p>${r ? `I heard only ${r.span} semitones.` : 'The mic heard too little steady singing.'} Try again closer to the device, singing a bit louder, and holding each end note for 2 seconds.</p><button class="btn primary big" id="again">Try again</button></div>`;
      $('#again', stage).onclick = () => run(); return;
    }
    // comfortable range: trim one semitone off each extreme, keep at least 9 semitones
    let lo = r.low + 1, hi = r.high - 1;
    if (hi - lo < 9) { lo = r.low; hi = r.high; }
    const type = voiceType(lo, hi);
    stage.innerHTML = `<div class="card center"><p class="muted">Your comfortable range</p><div class="bignote">${noteName(lo)} – ${noteName(hi)}</div>
      <p>${hi - lo} semitones${hi - lo >= 12 ? `, about ${(Math.round((hi - lo) / 12 * 10) / 10)} octaves` : ''}. Full reach heard: ${noteName(r.low)} to ${noteName(r.high)}.</p>
      <p>This looks like a <b>${esc(type)}</b> range. Many beginners find their range grows by a few notes after some weeks of practice.</p>
      <div class="row"><button class="btn ghost" id="hl">Hear low</button><button class="btn ghost" id="hh">Hear high</button></div>
      <div class="row" style="margin-top:10px"><button class="btn primary big" id="save">Use this range</button><button class="btn ghost" id="again">Try again</button></div></div>`;
    $('#hl', stage).onclick = () => tone(lo, { dur: 1.2 }); $('#hh', stage).onclick = () => tone(hi, { dur: 1.2 });
    $('#again', stage).onclick = () => run();
    $('#save', stage).onclick = () => { settings.set({ vocalLow: lo, vocalHigh: hi }); toast(`Range saved: ${noteName(lo)} to ${noteName(hi)}`); intro(); };
    stage.dataset.result = JSON.stringify({ low: lo, high: hi, rawLow: r.low, rawHigh: r.high });
  };
  intro();
  return cleanup;
}

async function monitor(stage, ctx) {
  useSingingCss();
  if (!(await micGate(stage, { why: 'The pitch monitor shows the note you sing, live.' }))) return;
  stage.innerHTML = `<div class="sg-game"><div class="grid2"><div class="qbox"><div class="sg-big" id="nn">–</div><p id="cc" class="muted">Sing any note</p></div>
    <div class="qbox"><p class="muted">Steadiness</p><div class="sg-big" id="st">–</div><p class="muted small">cents of wobble (lower is steadier)</p></div></div>
    <div class="playfield" id="pf" style="height:min(360px,46vh)"></div>
    <label class="tog"><input type="checkbox" id="snap"> Show nearest-note target (tuner mode)</label></div>`;
  const S = settings.get();
  const lanes = new Lanes($('#pf', stage), { pxPerSec: 80, nowFrac: 0.85 }); lanes.setRange(S.vocalLow, S.vocalHigh);
  const v = new VoiceListener(); await v.start();
  let tuner = false; $('#snap', stage).onchange = e => { tuner = e.target.checked; };
  v.on(s => {
    lanes.time = s.t;
    if (s.midi) {
      const near = Math.round(s.midi), c = Math.round(100 * (s.midi - near));
      lanes.push(s.t, s.midi, tuner ? c : null); lanes.cur = { midi: s.midi, cents: tuner ? c : null };
      lanes.notes = tuner ? [{ t: s.t - 3, dur: 3.5, midi: near }] : [];
      $('#nn', stage).textContent = noteName(s.midi);
      const h = hintFor(c); $('#cc', stage).textContent = `${c > 0 ? '+' : ''}${c} cents · ${c === 0 ? 'centred' : h.text.replace(/go (up|down).*/, m => m)}`;
      $('#st', stage).textContent = isFinite(s.stab) ? Math.round(s.stab) : '–';
      if (s.midi < lanes.lo + 1 || s.midi > lanes.hi - 1) lanes.setRange(Math.min(lanes.lo + 2, s.midi - 3), Math.max(lanes.hi - 2, s.midi + 3));
    } else { lanes.push(s.t, 0, null); lanes.cur = null; }
  });
  const stop = loop(dt => lanes.draw(dt));
  return () => { stop(); v.stop(); lanes.destroy(); };
}

function drone(stage) {
  useSingingCss();
  const S = settings.get();
  let held = [], key = 0, oct = 0, v = null, stopL = null, mineNote = 0;
  const tonic = () => { let t = Math.floor(S.vocalLow / 12) * 12 + key + 12 * oct; while (t < S.vocalLow - 2) t += 12; return t; };
  stage.innerHTML = `<div class="sg-game"><div class="card" style="margin:0"><p>A drone is one steady note under you. Singing over it trains your ear to hear in tune and out of tune: when you match, the sound gets smooth; when you are off, it "beats" and wobbles.</p>
    <div class="row"><label class="sg-sel">Key <select id="ky">${SHARP.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
    <button class="btn primary" id="dr">Start drone</button><button class="btn ghost" id="mic">Show my voice</button></div></div>
    <p class="muted small">Your range keys. Tap a key to hear it. Coloured keys belong to the major scale of the drone.</p>
    <div class="sg-key" id="kb"></div><div class="feedback" id="fb"></div></div>`;
  const kb = $('#kb', stage);
  const draw = () => {
    const t = tonic(), scale = [0, 2, 4, 5, 7, 9, 11];
    const keys = []; for (let m = S.vocalLow - 2; m <= S.vocalHigh + 2; m++) keys.push(m);
    kb.innerHTML = keys.map(m => { const blk = SHARP[((m % 12) + 12) % 12].includes('#'); const inS = scale.includes((((m - t) % 12) + 12) % 12); return `<button class="${blk ? 'blk' : ''} ${inS ? 'on' : ''} ${Math.round(mineNote) === m ? 'me' : ''}" data-m="${m}">${noteName(m)}</button>`; }).join('');
  };
  draw();
  kb.onclick = e => { const b = e.target.closest('[data-m]'); if (b) tone(+b.dataset.m, { dur: 1 }); };
  $('#ky', stage).onchange = e => { key = +e.target.value; draw(); if (held.length) { stopDrone(); startDrone(); } };
  const startDrone = () => { const t = tonic(); held = [holdTone(t - 12, { gain: 0.12, voice: 'sine' }), holdTone(t - 5, { gain: 0.05, voice: 'sine' })]; $('#dr', stage).textContent = 'Stop drone'; };
  const stopDrone = () => { held.forEach(h => h.stop()); held = []; $('#dr', stage).textContent = 'Start drone'; };
  $('#dr', stage).onclick = async () => { await unlock(); held.length ? stopDrone() : startDrone(); };
  $('#mic', stage).onclick = async () => {
    if (v) return;
    const fb = $('#fb', stage);
    const { mic } = await import('../../core/mic.js');
    try { await mic.acquire(); } catch (e) { fb.textContent = e.message; return; }
    v = new VoiceListener(); await v.start();
    let lastDraw = 0;
    v.on(s => { if (s.midi) { mineNote = s.midi; const c = Math.round(100 * (s.midi - Math.round(s.midi))); fb.textContent = `You: ${noteName(s.midi)} ${c > 0 ? '+' : ''}${c}c`; if (performance.now() - lastDraw > 150) { lastDraw = performance.now(); draw(); } } });
  };
  return () => { held.forEach(h => h.stop()); if (v) v.stop(); if (stopL) stopL(); };
}

export const EXTRAS = [
  { id: 'range', title: 'Vocal range', sub: 'Find your comfortable low and high notes', run: rangeFinder },
  { id: 'monitor', title: 'Pitch monitor', sub: 'See the note you sing, live', run: monitor },
  { id: 'drone', title: 'Drone + keyboard', sub: 'Sing over a steady note; find notes', run: drone },
];
