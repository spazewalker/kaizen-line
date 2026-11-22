// Interactive lesson-card helpers (Card.mount). Each returns a cleanup function.
import { tone } from '../../core/audio.js';
import { mic } from '../../core/mic.js';
import { noteName } from '../../core/music.js';
import { $, $$, micGate, loop } from '../../core/ui.js';
import { VoiceListener, hintFor } from './voice.js';
import { Lanes } from './lanes.js';
import { useSingingCss } from './session.js';

/** Done when every play button in the card has been tapped (hear-first). */
const SEL = '[data-tone],[data-seq],[data-strum],[data-clip],[data-sgchord]';
export const hearAll = (el, ctx) => {
  const bs = $$(SEL, el), seen = new Set();
  if (!bs.length) { ctx.done(); return; }
  const prog = document.createElement('p'); prog.className = 'muted small'; el.appendChild(prog);
  const upd = () => { prog.textContent = seen.size >= bs.length ? 'All heard. Tap Next.' : `Tap every sound button (${seen.size} of ${bs.length}).`; };
  upd();
  const h = e => { const b = e.target.closest(SEL); if (!b || !bs.includes(b)) return; if (b.dataset.sgchord) b.dataset.sgchord.split(',').forEach(m => tone(+m, { dur: 2, gain: 0.22 })); seen.add(b); b.classList.add('heard'); upd(); if (seen.size >= bs.length) ctx.done(); };
  el.addEventListener('click', h);
  return () => el.removeEventListener('click', h);
};

/**
 * Mini live pitch view inside a lesson card. Done when the goal is met.
 * goal: {secs} voiced time; {span} semitones covered (siren); {target, hold} match a note.
 */
export function voiceCheck(goalFn) {
  return (el, ctx) => {
    useSingingCss();
    let v = null, stop = null, lanes = null, alive = true;
    const box = document.createElement('div'); el.appendChild(box);
    (async () => {
      const ok = await micGate(box, { why: 'Try it now: the app shows your voice live.', allowSkip: true });
      if (!alive) return;
      if (!ok) { box.innerHTML = '<p class="muted">Mic skipped. Try it out loud anyway, then tap Next.</p>'; ctx.done(); return; }
      const goal = goalFn();
      box.innerHTML = `<div class="sg-mini" id="mn"></div><div class="sg-fill"><b id="mf"></b></div><p class="feedback" id="mt">${goal.say || 'Sing now'}</p>${goal.target ? '<button class="btn ghost sm" id="mh">Hear the note</button>' : ''}`;
      lanes = new Lanes($('#mn', box), { pxPerSec: 70, nowFrac: 0.82 });
      if (goal.range) lanes.setRange(goal.range[0], goal.range[1]);
      if (goal.target) { lanes.setRange(goal.target - 5, goal.target + 5); tone(goal.target, { dur: 1.2 }); $('#mh', box).onclick = () => tone(goal.target, { dur: 1.2 }); }
      v = new VoiceListener(); await v.start();
      let got = 0, lo = 999, hi = -999, last = 0, done = false;
      v.on(s => {
        lanes.time = s.t;
        const dt = last ? Math.min(0.1, s.now - last) : 0; last = s.now;
        let cents = null;
        if (s.midi && goal.target) cents = 100 * (s.midi - goal.target);
        lanes.push(s.t, s.midi, cents); lanes.cur = s.midi ? { midi: s.midi, cents } : null;
        if (goal.target) lanes.notes = [{ t: s.t - 4, dur: 5, midi: goal.target }];
        if (!s.midi) return;
        const mt = $('#mt', box);
        if (goal.target) { if (Math.abs(cents) <= 50) got += dt; const h = hintFor(cents); mt.textContent = h.text; }
        else if (goal.span) { lo = Math.min(lo, s.midi); hi = Math.max(hi, s.midi); got = hi - lo; mt.textContent = `${noteName(lo)} to ${noteName(hi)} · ${Math.round(hi - lo)} semitones`; }
        else { got += dt; mt.textContent = `${noteName(s.midi)} · keep going`; }
        const need = goal.span || goal.hold || goal.secs || 1.5;
        $('#mf', box).style.width = Math.min(100, got / need * 100) + '%';
        if (!done && got >= need) { done = true; mt.textContent = goal.win || 'Nice! Tap Next.'; mt.style.color = 'var(--ok)'; ctx.done(); }
      });
      stop = loop(dt => lanes.draw(dt));
      setTimeout(() => { if (!alive || done) return; const b = document.createElement('button'); b.className = 'btn ghost sm'; b.textContent = 'Having trouble? Continue anyway'; b.onclick = () => { done = true; ctx.done(); b.remove(); }; box.appendChild(b); }, 15000);
    })();
    return () => { alive = false; if (v) v.stop(); if (stop) stop(); if (lanes) lanes.destroy(); mic.release(); };
  };
}

/** Guided breathing circle: in 4, hold 2, out 6. Done after one full cycle. */
export const breathe = (el, ctx) => {
  useSingingCss();
  const box = document.createElement('div'); box.innerHTML = '<div class="sg-breathe" id="bc">Tap to start</div><p class="center muted" id="bt"></p>'; el.appendChild(box);
  const bc = $('#bc', box), bt = $('#bt', box); let alive = true, cycles = 0, timer = 0;
  const seq = [['Breathe in', 'in', 4], ['Hold', 'hold', 2], ['Out slowly', '', 6]];
  const run = (i = 0) => {
    if (!alive) return; const [txt, cls, secs] = seq[i % 3];
    bc.textContent = txt; bc.className = 'sg-breathe ' + cls; bc.style.transitionDuration = secs + 's';
    let left = secs; bt.textContent = left; const tick = () => { left--; if (left > 0 && alive) { bt.textContent = left; timer = setTimeout(tick, 1000); } };
    timer = setTimeout(tick, 1000);
    setTimeout(() => { if (i % 3 === 2) { cycles++; if (cycles === 1) ctx.done(); } if (cycles < 3) run(i + 1); else { bc.textContent = 'Done'; bt.textContent = '3 calm breaths.'; } }, secs * 1000);
  };
  bc.style.cursor = 'pointer'; bc.onclick = () => { bc.onclick = null; run(); };
  return () => { alive = false; clearTimeout(timer); };
};
