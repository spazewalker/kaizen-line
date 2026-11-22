// Guitar tuner: auto string detection, needle, per-string "in tune" ticks, reference tones.
import { GuitarEar } from './listen.js';
import { pluck } from '../../core/audio.js';
import { OPEN_STRINGS, STRING_NAMES, noteName } from '../../core/music.js';
import { micGate } from '../../core/ui.js';
import { useGuitarCss } from './fretboard.js';

const LABEL = ['6 · low E', '5 · A', '4 · D', '3 · G', '2 · B', '1 · high e'];

/**
 * Mount a tuner into `el`. Returns cleanup.
 * @param {object} o onAllTuned(): called once when all six strings were held in tune; compact: smaller layout;
 *                   gate: show the mic permission card first (default true)
 */
export async function mountTuner(el, { onAllTuned, compact = false, gate = true } = {}) {
  useGuitarCss();
  if (gate && !(await micGate(el, { why: 'The tuner listens to one string at a time. Pluck a string and let it ring.', tips: 'Quiet room, iPad close to the guitar.' }))) return () => {};
  let ear;
  try { ear = await new GuitarEar({ pitchMax: 500 }).start(); } catch (e) { el.innerHTML = `<p class="err">${e.message}</p>`; return () => {}; }
  let target = -1, auto = true, holdStart = 0, needle = 0, done = false;
  const tuned = new Array(6).fill(false);
  const hist = [];
  el.innerHTML = `<div class="gt-tuner ${compact ? 'compact' : ''}">
    <div class="gt-tn-note" aria-live="polite"><span id="tnN">–</span><small id="tnF"></small></div>
    <svg class="gt-gauge" viewBox="0 0 300 170" aria-hidden="true">
      <path d="M30 150 A120 120 0 0 1 270 150" class="arc"/>
      <path d="M137 32 A120 120 0 0 1 163 32" class="arc ok"/>
      ${[-50, -25, 0, 25, 50].map(c => { const a = (c / 50) * 70 * Math.PI / 180; return `<line x1="${150 + 112 * Math.sin(a)}" y1="${150 - 112 * Math.cos(a)}" x2="${150 + 128 * Math.sin(a)}" y2="${150 - 128 * Math.cos(a)}" class="tick"/>`; }).join('')}
      <text x="40" y="168" class="lbl">flat</text><text x="236" y="168" class="lbl">sharp</text>
      <g id="tnNeedle"><line x1="150" y1="150" x2="150" y2="36" class="needle"/><circle cx="150" cy="150" r="9" class="hub"/></g>
    </svg>
    <p class="gt-tn-hint" id="tnH">Pluck any string.</p>
    <div class="gt-tn-strings">${LABEL.map((l, i) => `<button class="gt-tn-s" data-s="${i}"><b>${STRING_NAMES[i]}</b><small>${l}</small><i class="tick">✓</i></button>`).join('')}</div>
    <div class="row tight gt-tn-ctl"><button class="btn ghost sm" id="tnAuto" aria-pressed="true">Auto string: on</button><span class="muted small">Tap a string to hear its target note.</span></div>
  </div>`;
  const $ = s => el.querySelector(s);
  const btns = [...el.querySelectorAll('.gt-tn-s')];
  const paint = () => btns.forEach((b, i) => { b.classList.toggle('sel', i === target); b.classList.toggle('done', tuned[i]); });
  el.querySelector('.gt-tn-strings').onclick = e => {
    const b = e.target.closest('.gt-tn-s'); if (!b) return;
    target = +b.dataset.s; auto = false; $('#tnAuto').textContent = 'Auto string: off'; $('#tnAuto').setAttribute('aria-pressed', 'false');
    pluck(OPEN_STRINGS[target], { vel: 0.35 }); paint();
  };
  $('#tnAuto').onclick = () => { auto = !auto; $('#tnAuto').textContent = `Auto string: ${auto ? 'on' : 'off'}`; $('#tnAuto').setAttribute('aria-pressed', String(auto)); };
  let lastHeard = 0;
  const off = ear.on(f => {
    const now = f.rawT;
    if (ear.calibrating) { $('#tnH').textContent = 'Listening to the room…'; return; }
    if (f.pitch.freq && f.pitch.clarity > 0.85) { hist.push(f.pitch.midi); if (hist.length > 7) hist.shift(); lastHeard = now; }
    else if (now - lastHeard > 0.4) { hist.length = 0; }
    if (hist.length < 3) { if (now - lastHeard > 1.2) $('#tnH').textContent = 'Pluck a string and let it ring.'; holdStart = 0; return; }
    const m = hist.slice().sort((a, b) => a - b)[hist.length >> 1];
    if (auto) {
      let best = -1, bd = 9;
      OPEN_STRINGS.forEach((o, i) => { const d = Math.abs(m - o); if (d < bd) { bd = d; best = i; } });
      if (bd <= 3.5) target = best;
    }
    if (target < 0) { $('#tnN').textContent = noteName(m); return; }
    const cents = (m - OPEN_STRINGS[target]) * 100;
    $('#tnN').textContent = STRING_NAMES[target];
    $('#tnF').textContent = `${noteName(m)} · ${cents >= 0 ? '+' : ''}${Math.round(cents)} cents`;
    needle = needle * 0.6 + Math.max(-50, Math.min(50, cents)) * 0.4;
    $('#tnNeedle').setAttribute('transform', `rotate(${needle / 50 * 70} 150 150)`);
    const inT = Math.abs(cents) < 5;
    el.querySelector('.gt-tuner').classList.toggle('intune', inT);
    if (Math.abs(cents) > 100) $('#tnH').textContent = cents < 0 ? `Far too low (${noteName(m)}). Tighten the ${STRING_NAMES[target]} string a lot.` : `Far too high (${noteName(m)}). Loosen the ${STRING_NAMES[target]} string.`;
    else if (inT) $('#tnH').textContent = 'In tune. Hold it…';
    else $('#tnH').textContent = cents < 0 ? 'A little low. Tighten slowly (turn the peg up).' : 'A little high. Loosen slowly (turn the peg down).';
    if (inT) {
      if (!holdStart) holdStart = now;
      if (now - holdStart > 0.7 && !tuned[target]) {
        tuned[target] = true; $('#tnH').textContent = `${STRING_NAMES[target]} string is in tune!`;
        paint();
        if (!done && tuned.every(Boolean)) { done = true; $('#tnH').textContent = 'All six strings are in tune. Great!'; onAllTuned && onAllTuned(); }
      }
    } else holdStart = 0;
    paint();
  });
  paint();
  return () => { off(); ear.stop(); };
}

export const tunerExtra = {
  id: 'tuner', title: 'Tuner', sub: 'Listens and shows each string',
  run(stage) {
    let cl = null, gone = false;
    stage.innerHTML = '<div id="tnHost"></div><div class="card"><h3>How to tune</h3><ol><li>Pluck one string. Let it ring.</li><li>Needle left = too low: tighten. Right = too high: loosen.</li><li>Turn slowly. Pluck again often.</li><li>Tune from low E to high e, then check all again: strings pull on each other.</li></ol><p class="muted small">Standard tuning: E A D G B e (low to high).</p></div>';
    mountTuner(stage.querySelector('#tnHost')).then(c => { if (gone) c(); else cl = c; });
    return () => { gone = true; if (cl) cl(); };
  },
};
