// Singing games. Mic games fall back to an ear-only version when the mic is unavailable.
import { tone, holdTone, playSeq, click, getCtx, unlock } from '../../core/audio.js';
import { settings } from '../../core/store.js';
import { noteName, SOLFEGE } from '../../core/music.js';
import { $, $$, esc, micGate, loop, fitCanvas, shuffle, pick, rnd, sleep, clamp } from '../../core/ui.js';
import { VoiceListener, hintFor, foldCents } from './voice.js';
import { Lanes, Meter, palette, roundRect } from './lanes.js';
import { Performer, startSingSession, useSingingCss } from './session.js';
import { SONGS, INTERVALS, EXERCISES, exerciseNotes, songNotes, parseMelody, tonicFor } from './songs.js';
import { noteHit, summarize, fitShift } from './score.js';

export const R = () => { const s = settings.get(); const l = s.vocalLow, h = Math.max(s.vocalLow + 7, s.vocalHigh); return { l, h, c: Math.round((l + h) / 2) }; };
const SOL = { 0: 'Do', 2: 'Re', 4: 'Mi', 5: 'Fa', 7: 'So', 9: 'La', 11: 'Ti', 12: 'Do↑' };
const PAD_COLORS = ['#d93a26', '#e0801a', '#b89a0c', '#2f9e5b', '#2f6fd0', '#7b4cc9', '#c2407a', '#5a6b7a'];

function pickNote(spread = 'mid') {
  const { l, h, c } = R();
  if (spread === 'full') return l + 1 + rnd(Math.max(1, h - l - 1));
  if (spread === 'narrow') return c - 1 + rnd(3);
  return clamp(c - 3 + rnd(7), l, h);
}
const MIC_WHY = 'This game listens to your voice and shows your pitch live.';
/** Open the mic or run the fallback game. Returns a VoiceListener or null (fallback started and its cleanup stored). */
async function needMic(stage, why, fallback) {
  const ok = await micGate(stage, { why: why || MIC_WHY, allowSkip: true, tips: 'Sing on "ah" at a relaxed, medium volume. A quiet room helps.' });
  if (!ok) { const r = fallback(); return { fallback: r && r.then ? await r : r }; }
  const v = new VoiceListener();
  await v.start();
  return { v };
}
const dots = (n, res, cur) => Array.from({ length: n }, (_, i) => `<i class="${res[i] == null ? (i === cur ? 'cur' : '') : res[i] ? 'ok' : 'bad'}"></i>`).join('');

export const GAMES = {
  // ------------------------------------------------------------ ear: higher / lower
  elevator: {
    name: 'Pitch elevator', how: 'You hear two notes. Is the second one higher or lower? Each right answer lifts you one floor. The notes get closer as you climb.',
    run(stage, args, ctx) {
      useSingingCss();
      const floors = args.floors || 8; let fl = 0, wrong = 0, cur = null, lock = true, alive = true;
      stage.innerHTML = `<div class="sg-game"><div class="hud"><span id="fl">Floor 0 / ${floors}</span><span id="gp"></span></div>
        <div class="sg-meterbox" id="box"></div>
        <div class="opts"><button class="opt" data-x="up">Higher ↑</button><button class="opt" data-x="dn">Lower ↓</button></div>
        <div class="row"><button class="btn ghost" data-x="re">Play again</button></div><div class="feedback" id="fb"></div></div>`;
      const c = fitCanvas($('#box', stage));
      let carY = 0, carV = 0;
      const stop = loop(dt => {
        const { g, w, h } = c, P = palette(); if (!w) return;
        g.fillStyle = P.bg; g.fillRect(0, 0, w, h);
        const fh = (h - 20) / floors;
        g.font = '700 13px "M PLUS Rounded 1c", system-ui'; g.textBaseline = 'middle';
        for (let i = 0; i <= floors; i++) { const y = h - 10 - i * fh; g.strokeStyle = P.grid; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillStyle = P.label; g.fillText(i ? `Floor ${i}` : 'Ground', 10, y - fh / 2 + fh / 2 - 10); }
        const ty = h - 10 - fl * fh; carV += (ty - carY) * 30 * dt; carV *= 0.82; carY += carV * dt * 8;
        const cw = Math.min(150, w * 0.35), x = w / 2 - cw / 2;
        g.fillStyle = P.note; roundRect(g, x, carY - fh * 0.9, cw, fh * 0.85, 10); g.fill();
        g.fillStyle = P.bg; roundRect(g, x + 10, carY - fh * 0.78, cw - 20, fh * 0.35, 6); g.fill();
        g.strokeStyle = P.gridC; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, carY - fh * 0.9); g.stroke();
      });
      carY = c.h - 10;
      const play = () => { tone(cur.a, { dur: 0.6 }); tone(cur.b, { at: 0.75, dur: 0.6 }); };
      const q = () => {
        if (!alive) return;
        if (fl >= floors) { $('#fb', stage).textContent = 'Top floor!'; return setTimeout(() => ctx.finish(floors / (floors + wrong)), 700); }
        const gap = Math.max(args.minGap || 1, (args.gap || 4) - Math.floor(fl / 2));
        const { l, h } = R(); const a = l + 2 + rnd(Math.max(1, h - l - 4)); const up = Math.random() < 0.5;
        cur = { a, b: clamp(a + (up ? gap : -gap), l - 2, h + 2), up }; cur.up = cur.b > cur.a;
        $('#gp', stage).textContent = gap === 1 ? 'Half step!' : `${gap} steps apart`;
        lock = false; play();
      };
      stage.onclick = e => {
        const b = e.target.closest('[data-x]'); if (!b || !cur) return;
        if (b.dataset.x === 're') return play(); if (lock) return; lock = true;
        const ok = (b.dataset.x === 'up') === cur.up, fb = $('#fb', stage);
        if (ok) { fl++; fb.style.color = 'var(--ok)'; fb.textContent = 'Yes!'; } else { wrong++; fb.style.color = 'var(--bad)'; fb.textContent = `It went ${cur.up ? 'up' : 'down'}. Listen again.`; play(); }
        $('#fl', stage).textContent = `Floor ${fl} / ${floors}`;
        if (args.srs) ctx.grade(args.srs, ok);
        setTimeout(q, ok ? 900 : 2300);
      };
      setTimeout(q, 500);
      return () => { alive = false; stop(); c.destroy(); };
    },
  },

  // ------------------------------------------------------------ ear: slide to match
  slideMatch: {
    name: 'Tune by ear', how: 'Hear the target note. Drag the slider until your note sounds the same, then lock it in. Then hum it.',
    run(stage, args, ctx) {
      useSingingCss();
      const N = args.rounds || 4; let i = 0, tot = 0, held = null, alive = true;
      const q = () => {
        if (!alive) return; if (i >= N) return ctx.finish(tot / N);
        const T = pickNote(args.spread), MIN = T - 7, MAX = T + 7; let v0 = T + (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3.5), locked = false;
        const pct = m => (m - MIN) / (MAX - MIN) * 100;
        stage.innerHTML = `<div class="sg-game"><div class="hud"><span>Round ${i + 1} of ${N}</span></div>
          <div class="row"><button class="btn ghost" data-x="tg">Hear target</button><button class="btn ghost" data-x="me">Hear mine</button></div>
          <div class="meter" style="height:44px;position:relative"><span id="my" style="position:absolute;top:4px;bottom:4px;width:8px;border-radius:4px;background:var(--trk);left:${pct(v0)}%"></span><span id="tm" hidden style="position:absolute;top:4px;bottom:4px;width:8px;border-radius:4px;background:var(--ok)"></span></div>
          <input type="range" id="sl" min="${MIN}" max="${MAX}" step="0.02" value="${v0}" aria-label="Your pitch"><p class="muted small">Left is lower. Right is higher.</p>
          <button class="btn primary big" data-x="lock">Lock in</button><div class="feedback" id="fb"></div></div>`;
        const sl = $('#sl', stage), fb = $('#fb', stage);
        setTimeout(() => tone(T, { dur: 1.1 }), 300);
        let stopT = 0;
        sl.oninput = () => {
          if (locked) return; const m = +sl.value; $('#my', stage).style.left = pct(m) + '%';
          if (!held) held = holdTone(m); held.set(m); clearTimeout(stopT); stopT = setTimeout(() => { if (held) { held.stop(); held = null; } }, 450);
        };
        stage.onclick = e => {
          const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x;
          if (x === 'tg') tone(T, { dur: 1.1 }); else if (x === 'me') tone(+sl.value, { dur: 1.1 });
          else if (x === 'lock' && !locked) {
            locked = true; if (held) { held.stop(); held = null; }
            const err = Math.round(Math.abs(+sl.value - T) * 100), pts = err < 25 ? 1 : err < 50 ? 0.8 : err < 100 ? 0.5 : 0.2; tot += pts;
            const tm = $('#tm', stage); tm.hidden = false; tm.style.left = pct(T) + '%';
            fb.style.color = pts >= 0.8 ? 'var(--ok)' : pts >= 0.5 ? 'var(--warn)' : 'var(--bad)';
            fb.innerHTML = `${err < 25 ? 'Spot on!' : err < 50 ? 'Very close!' : err < 100 ? 'Close.' : 'Keep training.'} ${err} cents off.<br><span class="muted">Now hum the green note for 3 seconds.</span>`;
            tone(T, { dur: 1.4 }); b.textContent = 'Next'; b.dataset.x = 'next';
          } else if (x === 'next') { i++; q(); }
        };
      };
      q();
      return () => { alive = false; if (held) held.stop(); };
    },
  },

  // ------------------------------------------------------------ mic: pitch match
  matchNote: {
    name: 'Pitch match', mic: true,
    how: 'Listen to the note. Sing it on "ah". Keep your dot in the green band until the bar fills.',
    async run(stage, args, ctx) {
      useSingingCss();
      const m = await needMic(stage, MIC_WHY, () => GAMES.slideMatch.run(stage, args, ctx));
      if (m.fallback !== undefined) return m.fallback;
      const v = m.v, N = args.rounds || 6, tol = args.tol || 50, hold = args.hold || 1.2;
      const { l, h } = R();
      let r = 0, score = 0, res = [], target = 0, fill = 0, phase = 'wait', t0 = 0, lastNow = 0, drone = null, alive = true, label = '';
      stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small" id="lb"></span><br><b id="tn">–</b></div><button class="btn ghost" id="hear">Hear it again</button></div>
        <div class="sg-meterbox" id="mb"></div><div class="sg-fill"><b id="fill"></b></div><div class="feedback" id="fb"></div><div class="sg-dots" id="dt"></div></div>`;
      const meter = new Meter($('#mb', stage), { window: args.window || 5, tol });
      let tonic = null;
      if (args.drone) { tonic = tonicFor([0, ...(args.intervals || [0, 7, 4])], l, h); drone = holdTone(tonic, { gain: 0.09, voice: 'sine' }); }
      const fb = t => { $('#fb', stage).textContent = t; };
      const next = () => {
        if (!alive) return;
        if (r >= N) { if (drone) drone.stop(); drone = null; return ctx.finish(score / N); }
        if (args.drone) { const iv = (args.intervals || [0, 7, 4])[r % (args.intervals || [0, 7, 4]).length]; target = tonic + iv; label = `Sing ${SOL[iv] || iv} above the drone`; }
        else { target = args.notes ? pick(args.notes(R())) : pickNote(args.spread); label = `Round ${r + 1} of ${N}`; }
        meter.setTarget(target); fill = 0; phase = 'listen';
        $('#lb', stage).textContent = label; $('#tn', stage).textContent = args.drone ? (SOL[target - tonic] || noteName(target)) : noteName(target);
        $('#dt', stage).innerHTML = dots(N, res, r);
        const ref = !(args.drone && args.noRefAfter != null && r >= args.noRefAfter);
        if (ref) tone(target, { dur: 1.2 }); fb(ref ? 'Listen…' : 'No hint this time. Find it over the drone.');
        setTimeout(() => { if (!alive) return; phase = 'sing'; t0 = performance.now(); fb('Now sing it'); }, ref ? 1300 : 600);
      };
      v.on(s => {
        meter.push(s.midi); meter.draw();
        const dt = lastNow ? Math.min(0.1, s.now - lastNow) : 0; lastNow = s.now;
        if (phase !== 'sing') return;
        if (s.midi) {
          let c = 100 * (s.midi - target); if (args.anyOctave) c = foldCents(c);
          if (Math.abs(c) <= tol) fill += dt; else fill = Math.max(0, fill - dt * 0.4);
          const hnt = hintFor(c); const f = $('#fb', stage); f.textContent = hnt.text; f.style.color = hnt.cls === 'good' ? 'var(--ok)' : hnt.cls === 'close' ? 'var(--warn)' : 'var(--bad)';
        } else fill = Math.max(0, fill - dt * 0.2);
        $('#fill', stage).style.width = Math.min(100, fill / hold * 100) + '%';
        const el = (performance.now() - t0) / 1000;
        if (fill >= hold) {
          phase = 'done'; const pts = Math.max(0.6, 1 - Math.max(0, el - hold - 2) / 15); score += pts; res[r] = true;
          $('#fb', stage).textContent = 'Got it!'; $('#fb', stage).style.color = 'var(--ok)'; tone(target, { dur: 0.5, gain: 0.15 });
          if (args.srs) ctx.grade(args.srs, pts > 0.8 ? 3 : 2);
          r++; setTimeout(next, 1000);
        } else if (el > (args.timeout || 14)) {
          phase = 'done'; score += 0.4 * fill / hold; res[r] = false;
          $('#fb', stage).textContent = `Time. The note was ${noteName(target)}. Hear it and hum along.`; tone(target, { dur: 1.2 });
          if (args.srs) ctx.grade(args.srs, false);
          r++; setTimeout(next, 2200);
        }
      });
      $('#hear', stage).onclick = () => tone(target, { dur: 1.2 });
      setTimeout(next, 400);
      return () => { alive = false; v.stop(); meter.destroy(); if (drone) drone.stop(); };
    },
  },

  // ------------------------------------------------------------ mic: steady note balloon
  balloon: {
    name: 'Steady balloon', mic: true,
    how: 'Sing one long, steady note. The balloon rises while your pitch stays steady. Wobble or stop, and it sinks.',
    async run(stage, args, ctx) {
      useSingingCss();
      const m = await needMic(stage, MIC_WHY, () => GAMES.elevator.run(stage, { gap: 3 }, ctx));
      if (m.fallback !== undefined) return m.fallback;
      const v = m.v, goal = args.secs || 4, tries = args.tries || 3;
      const target = pickNote('narrow');
      let tryN = 0, best = 0, run = 0, y = 0, phase = 'ready', quiet = 0, wob = 0, alive = true, lastNow = 0;
      stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small">Your note${args.vowel ? ` · vowel "${esc(args.vowel)}"` : ''}</span><br><b>${noteName(target)}</b></div><button class="btn ghost" id="hear">Hear it</button></div>
        <div class="sg-meterbox" id="sky"></div><div class="hud"><span id="tm">0.0 / ${goal} s</span><span id="wb">wobble –</span><span id="tr">Try 1 of ${tries}</span></div><div class="feedback" id="fb">Tap "Hear it", then sing and hold.</div></div>`;
      const c = fitCanvas($('#sky', stage));
      const stop = loop(() => {
        const { g, w, h } = c, P = palette(); if (!w) return;
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, P.bg === '#ffffff' ? '#cfe6ff' : '#1d2a4a'); sky.addColorStop(1, P.bg);
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        g.fillStyle = P.grid; g.fillRect(0, h - 18, w, 18);
        const gy = 30; g.strokeStyle = P.ok; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); g.setLineDash([]);
        g.fillStyle = P.label; g.font = '700 13px "M PLUS Rounded 1c", system-ui'; g.fillText(`${goal} s`, 8, gy - 8);
        const by = (h - 60) - y * (h - 90), bx = w / 2 + Math.sin(performance.now() / 600) * 10;
        g.strokeStyle = P.label; g.beginPath(); g.moveTo(bx, by + 28); g.quadraticCurveTo(bx - 8, by + 50, bx, by + 70); g.stroke();
        g.fillStyle = '#d93a26'; g.beginPath(); g.ellipse(bx, by, 24, 29, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(bx - 8, by - 10, 6, 9, -0.5, 0, Math.PI * 2); g.fill();
      });
      v.on(s => {
        const dt = lastNow ? Math.min(0.1, s.now - lastNow) : 0; lastNow = s.now;
        if (phase === 'over') return;
        const near = s.midi && Math.abs(s.midi - target) < 0.6;
        if (s.midi && phase === 'ready') phase = 'sing';
        if (phase !== 'sing') return;
        wob = s.stab;
        const steady = near && s.stab < (args.wobble || 22);
        if (steady) { run += dt; quiet = 0; } else if (!s.midi) quiet += dt;
        y = clamp(run / goal, 0, 1);
        $('#tm', stage).textContent = `${run.toFixed(1)} / ${goal} s`;
        $('#wb', stage).textContent = isFinite(wob) ? `wobble ${Math.round(wob)} c` : 'wobble –';
        const f = $('#fb', stage);
        if (s.midi && !near) { const h = hintFor(100 * (s.midi - target)); f.textContent = h.text; f.style.color = 'var(--bad)'; }
        else if (s.midi && !steady) { f.textContent = 'Steady… keep the air even'; f.style.color = 'var(--warn)'; }
        else if (steady) { f.textContent = 'Floating!'; f.style.color = 'var(--ok)'; }
        if (run >= goal || quiet > 0.45) {
          best = Math.max(best, run); tryN++;
          const won = run >= goal; phase = 'over';
          f.textContent = won ? 'You made it to the top!' : `${run.toFixed(1)} s. Breathe in low, then try again.`; f.style.color = won ? 'var(--ok)' : 'var(--ink)';
          if (args.srs) ctx.grade(args.srs, won);
          if (won || tryN >= tries) return setTimeout(() => ctx.finish(Math.min(1, best / goal)), 1200);
          setTimeout(() => { if (!alive) return; run = 0; y = 0; quiet = 0; phase = 'ready'; $('#tr', stage).textContent = `Try ${tryN + 1} of ${tries}`; tone(target, { dur: 1 }); }, 1600);
        }
      });
      $('#hear', stage).onclick = () => tone(target, { dur: 1.2 });
      setTimeout(() => tone(target, { dur: 1.2 }), 400);
      return () => { alive = false; stop(); v.stop(); c.destroy(); };
    },
  },

  // ------------------------------------------------------------ mic (or finger): siren slalom
  slalom: {
    name: 'Siren slalom', mic: true,
    how: 'Your voice steers the ball. Glide up and down like a siren to fly through the gaps. Silence makes the ball sink.',
    async run(stage, args, ctx) {
      useSingingCss();
      const ok = await micGate(stage, { why: 'Your voice steers the ball up and down.', allowSkip: true, tips: 'No mic? You can steer with your finger instead, but then your voice does not train.' });
      let v = null; if (ok) { v = new VoiceListener(); await v.start(); }
      const { l, h, c: centre } = R();
      const amp = Math.min(args.amp || 4, (h - l) / 2 - 1), period = args.period || 7, every = args.every || 1.5, gap = args.gap || 1.6, total = args.gates || 16;
      const lo = centre - amp - 3, hi = centre + amp + 3;
      stage.innerHTML = `<div class="sg-game"><div class="hud"><span id="ps">0 / ${total}</span><span id="lv">♥♥♥</span></div><div class="playfield" id="pf" style="touch-action:none"></div>
        <div class="row"><label class="tog"><input type="checkbox" id="gd" ${args.guide === false ? '' : 'checked'}> Guide hum</label><span class="muted small">${ok ? 'Sing "ooo" or "ng" and glide.' : 'Finger mode: drag up and down.'}</span></div></div>`;
      const c = fitCanvas($('#pf', stage));
      const path = t => centre + amp * Math.sin(2 * Math.PI * t / period) * (0.6 + 0.4 * Math.sin(2 * Math.PI * t / (period * 2.7)));
      const gates = Array.from({ length: total }, (_, i) => ({ t: 3 + i * every, done: false }));
      gates.forEach(g => { g.m = path(g.t); });
      let T = 0, ball = centre, bv = 0, voiced = 0, lives = 3, passed = 0, over = false, guide = null, fingerY = null, parts = [];
      const speed = 130;
      const Y = m => c.h - 10 - (m - lo) / (hi - lo) * (c.h - 20), M = y => lo + (c.h - 10 - y) / (c.h - 20) * (hi - lo);
      if (v) v.on(s => { if (s.midi) { voiced = s.midi; } else voiced = 0; });
      const pf = $('#pf', stage);
      pf.onpointerdown = pf.onpointermove = e => { if (v) return; if (e.buttons || e.type === 'pointerdown') { const r = pf.getBoundingClientRect(); fingerY = e.clientY - r.top; } };
      const gd = $('#gd', stage); const setGuide = () => { if (gd.checked && !guide) guide = holdTone(path(T), { gain: 0.06, voice: 'sine' }); if (!gd.checked && guide) { guide.stop(); guide = null; } };
      gd.onchange = setGuide; setGuide();
      const bx = () => c.w * 0.25;
      const stop = loop(dt => {
        if (over) return;
        T += dt;
        if (guide) guide.set(path(T));
        // ball physics
        let tgt = null;
        if (v) tgt = voiced ? clamp(voiced, lo, hi) : null; else if (fingerY != null) tgt = M(fingerY);
        if (tgt != null) { ball += (tgt - ball) * Math.min(1, dt * 14); bv = 0; } else { bv -= 6 * dt; ball = Math.max(lo, ball + bv * dt); }
        // gates
        for (const g of gates) {
          if (g.done) continue;
          const gx = bx() + (g.t - T) * speed;
          if (gx < bx()) {
            g.done = true;
            if (Math.abs(ball - g.m) <= gap) { passed++; g.ok = true; for (let i = 0; i < 12; i++) parts.push({ x: bx(), y: Y(ball), vx: (Math.random() - .5) * 200, vy: (Math.random() - .7) * 200, life: .6 }); }
            else { lives--; g.ok = false; }
            $('#ps', stage).textContent = `${passed} / ${total}`; $('#lv', stage).textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(3 - Math.max(0, lives));
            if (lives <= 0 || gates.every(x => x.done)) { over = true; if (guide) guide.stop(); guide = null; if (args.srs) ctx.grade(args.srs, passed / total >= 0.6); setTimeout(() => ctx.finish(passed / total), 600); }
          }
        }
        // draw
        const { g, w, h } = c, P = palette(); if (!w) return;
        g.fillStyle = P.bg; g.fillRect(0, 0, w, h);
        g.font = '700 12px "M PLUS Rounded 1c", system-ui'; g.textBaseline = 'middle';
        for (let mm = Math.ceil(lo); mm <= hi; mm++) { if (noteName(mm).includes('#')) continue; g.strokeStyle = P.grid; g.beginPath(); g.moveTo(30, Y(mm)); g.lineTo(w, Y(mm)); g.stroke(); g.fillStyle = P.label; g.fillText(noteName(mm), 2, Y(mm)); }
        g.strokeStyle = P.noteDim; g.lineWidth = 3; g.setLineDash([4, 8]); g.beginPath();
        for (let x = bx(); x < w; x += 6) { const t = T + (x - bx()) / speed; x === bx() ? g.moveTo(x, Y(path(t))) : g.lineTo(x, Y(path(t))); }
        g.stroke(); g.setLineDash([]); g.lineWidth = 1;
        for (const gt of gates) {
          const gx = bx() + (gt.t - T) * speed; if (gx < -20 || gx > w + 20) continue;
          g.fillStyle = gt.done ? (gt.ok ? P.ok : P.bad) : P.note;
          g.globalAlpha = gt.done ? 0.35 : 1;
          roundRect(g, gx - 7, 0, 14, Y(gt.m + gap), 6); g.fill();
          roundRect(g, gx - 7, Y(gt.m - gap), 14, h - Y(gt.m - gap), 6); g.fill(); g.globalAlpha = 1;
        }
        g.fillStyle = P.now; g.beginPath(); g.arc(bx(), Y(ball), 12, 0, Math.PI * 2); g.fill();
        for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; g.globalAlpha = Math.max(0, p.life / .6); g.fillStyle = P.ok; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); }
        g.globalAlpha = 1; parts = parts.filter(p => p.life > 0);
      });
      return () => { over = true; stop(); if (v) v.stop(); if (guide) guide.stop(); c.destroy(); };
    },
  },

  // ------------------------------------------------------------ ear: interval quiz
  intervalQuiz: {
    name: 'Interval ear', how: 'Hear two notes. Name the jump between them. Each interval has a song you already know.',
    run(stage, args, ctx) {
      useSingingCss();
      const set = args.set || [4, 7, 12]; const N = args.n || 8;
      const opts = [...new Set([...set, ...(set.length < 3 ? shuffle([2, 3, 4, 5, 7, 12].filter(x => !set.includes(x))).slice(0, 3 - set.length) : [])])].sort((a, b) => a - b);
      let i = 0, right = 0, queue = Array.from({ length: N }, (_, k) => set[k % set.length]); queue = shuffle(queue);
      let alive = true;
      const q = () => {
        if (!alive) return; if (i >= N) return ctx.finish(right / N);
        const iv = queue[i], { l, h } = R(); const a = l + rnd(Math.max(1, h - l - iv + 1)), b = a + iv;
        const harm = args.harmonic && i >= N / 2;
        const play = () => { if (harm) { tone(a, { dur: 1.2 }); tone(b, { dur: 1.2 }); } else { tone(a, { dur: 0.7 }); tone(b, { at: 0.8, dur: 0.9 }); } };
        stage.innerHTML = `<div class="sg-game"><div class="hud"><span>${i + 1} of ${N}</span><span>${right} right</span></div>
          <div class="qbox"><div class="sg-big">?</div><p class="muted">${harm ? 'Both notes together' : 'One note, then the next'}</p><button class="btn ghost" data-x="re">Play again</button></div>
          <div class="opts ${opts.length > 3 ? '' : 'one'}">${opts.map(o => `<button class="opt" data-iv="${o}">${INTERVALS[o].name}<small>${INTERVALS[o].short}</small></button>`).join('')}</div><div class="feedback" id="fb"></div></div>`;
        setTimeout(play, 300); let done = false;
        stage.onclick = e => {
          if (e.target.closest('[data-x=re]')) return play();
          const bt = e.target.closest('[data-iv]'); if (!bt || done) return; done = true;
          const ok = +bt.dataset.iv === iv; if (ok) right++; else queue.push(iv) && queue.length > N + 3 && queue.pop();
          bt.classList.add(ok ? 'right' : 'wrong'); if (!ok) $(`[data-iv="${iv}"]`, stage).classList.add('right');
          ctx.grade(`sg:interval:${iv}`, ok);
          $('.sg-big', stage).textContent = INTERVALS[iv].short;
          const fb = $('#fb', stage); fb.style.color = ok ? 'var(--ok)' : 'var(--bad)';
          fb.innerHTML = `${ok ? 'Yes!' : 'Not quite.'} ${INTERVALS[iv].name}: think ${esc(INTERVALS[iv].anchor)}.`;
          setTimeout(() => { tone(a, { dur: 0.5 }); tone(b, { at: 0.55, dur: 0.7 }); }, 200);
          i++; setTimeout(q, ok ? 1700 : 3000);
        };
      };
      q();
      return () => { alive = false; };
    },
  },

  // ------------------------------------------------------------ ear: scale degree (solfege)
  degreeQuiz: {
    name: 'Solfege ear', how: 'First you hear Do Mi So Do to set the key. Then one note. Which step of the scale is it?',
    run(stage, args, ctx) {
      useSingingCss();
      const pool = args.pool || [0, 2, 4, 5, 7, 9, 11, 12], N = args.n || 8; let i = 0, right = 0, alive = true;
      const { l, h } = R(); const tonic = tonicFor([0, 12], l, h);
      const q = () => {
        if (!alive) return; if (i >= N) return ctx.finish(right / N);
        const d = pick(pool.filter(x => x !== 0 || pool.length < 4));
        const play = (ctxFirst = true) => { if (ctxFirst) playSeq([tonic, tonic + 4, tonic + 7, tonic + 12], { gap: 0.22, dur: 0.25 }); tone(tonic + d, { at: ctxFirst ? 1.3 : 0, dur: 1 }); };
        stage.innerHTML = `<div class="sg-game"><div class="hud"><span>${i + 1} of ${N}</span><span>${right} right</span></div>
          <div class="qbox"><div class="sg-big">?</div><div class="row"><button class="btn ghost" data-x="re">Play again</button><button class="btn ghost" data-x="do">Hear Do</button></div></div>
          <div class="sg-pads">${pool.map((p, k) => `<button class="sg-pad" style="--c:${PAD_COLORS[k % 8]}" data-d="${p}">${SOL[p]}</button>`).join('')}</div><div class="feedback" id="fb"></div></div>`;
        setTimeout(play, 300); let done = false;
        stage.onclick = e => {
          const x = e.target.closest('[data-x]'); if (x) return x.dataset.x === 're' ? play() : tone(tonic, { dur: 0.8 });
          const b = e.target.closest('[data-d]'); if (!b || done) return; done = true;
          const ok = +b.dataset.d === d; if (ok) right++;
          b.classList.add('lit'); $('.sg-big', stage).textContent = SOL[d];
          const fb = $('#fb', stage); fb.style.color = ok ? 'var(--ok)' : 'var(--bad)'; fb.textContent = ok ? 'Yes!' : `It was ${SOL[d]}. Sing up from Do to it: ${pool.filter(p => p <= d).map(p => SOL[p]).join(' ')}.`;
          if (args.srs) ctx.grade(args.srs, ok);
          if (!ok) playSeq([0, 2, 4, 5, 7, 9, 11, 12].filter(p => p <= d).map(p => tonic + p), { gap: 0.3, at: 0.3 });
          i++; setTimeout(q, ok ? 1400 : 3200);
        };
      };
      q();
      return () => { alive = false; };
    },
  },

  // ------------------------------------------------------------ mic: interval jumper
  intervalJump: {
    name: 'Interval jumper', mic: true,
    how: 'You hear the start note. Sing it, then jump up by the interval and hold the new note in the green band.',
    async run(stage, args, ctx) {
      useSingingCss();
      const m = await needMic(stage, MIC_WHY, () => GAMES.intervalQuiz.run(stage, args, ctx));
      if (m.fallback !== undefined) return m.fallback;
      const v = m.v, set = args.set || [7], N = args.rounds || 6, tol = 50, hold = 0.8;
      let r = 0, score = 0, res = [], base = 0, target = 0, iv = 0, fill = 0, phase = 'wait', t0 = 0, last = 0, helped = false, alive = true;
      stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small" id="lb"></span><br><b id="tn"></b></div><div class="row tight"><button class="btn ghost" id="hb">Start note</button><button class="btn ghost" id="ht">Hear answer</button></div></div>
        <div class="sg-meterbox" id="mb"></div><div class="sg-fill"><b id="fill"></b></div><div class="feedback" id="fb"></div><div class="sg-dots" id="dt"></div></div>`;
      const meter = new Meter($('#mb', stage), { window: Math.max(5, Math.max(...set) + 2), tol });
      const next = () => {
        if (!alive) return; if (r >= N) return ctx.finish(score / N);
        iv = set[r % set.length]; const { l, h } = R(); base = l + rnd(Math.max(1, h - l - iv + 1)); target = base + iv;
        meter.setTarget(target, noteName(target)); fill = 0; helped = false; phase = 'listen';
        $('#lb', stage).textContent = `Round ${r + 1} of ${N} · think ${INTERVALS[iv].anchor}`;
        $('#tn', stage).textContent = `${INTERVALS[iv].name} up`;
        $('#dt', stage).innerHTML = dots(N, res, r);
        tone(base, { dur: 1 }); $('#fb', stage).textContent = `Start note: ${noteName(base)}. Sing it, then jump.`;
        setTimeout(() => { phase = 'sing'; t0 = performance.now(); }, 900);
      };
      v.on(s => {
        meter.push(s.midi); meter.draw();
        const dt = last ? Math.min(0.1, s.now - last) : 0; last = s.now;
        if (phase !== 'sing') return;
        if (s.midi && Math.abs(100 * (s.midi - target)) <= tol) fill += dt; else fill = Math.max(0, fill - dt * 0.4);
        if (s.midi) { const c = 100 * (s.midi - target); const f = $('#fb', stage); if (Math.abs(s.midi - base) < 0.5) { f.textContent = 'That is the start note. Now jump up!'; f.style.color = 'var(--ink)'; } else { const hh = hintFor(c); f.textContent = hh.text; f.style.color = hh.cls === 'good' ? 'var(--ok)' : 'var(--warn)'; } }
        $('#fill', stage).style.width = Math.min(100, fill / hold * 100) + '%';
        const el = (performance.now() - t0) / 1000;
        if (fill >= hold || el > 16) {
          const won = fill >= hold; phase = 'done'; res[r] = won;
          const pts = won ? (helped ? 0.6 : 1) : 0.2 * fill / hold; score += pts;
          ctx.grade(`sg:interval:${iv}`, won ? (helped ? 1 : 2) : 0);
          $('#fb', stage).textContent = won ? 'Great jump!' : 'Time. Listen to the jump.'; $('#fb', stage).style.color = won ? 'var(--ok)' : 'var(--bad)';
          tone(base, { dur: 0.5 }); tone(target, { at: 0.55, dur: 0.8 });
          r++; setTimeout(next, won ? 1500 : 2400);
        }
      });
      $('#hb', stage).onclick = () => tone(base, { dur: 1 });
      $('#ht', stage).onclick = () => { helped = true; tone(base, { dur: 0.5 }); tone(target, { at: 0.55, dur: 1 }); };
      setTimeout(next, 400);
      return () => { alive = false; v.stop(); meter.destroy(); };
    },
  },

  // ------------------------------------------------------------ mic: melody echo (call and response)
  echo: {
    name: 'Melody echo', mic: true,
    how: 'The app sings a short tune. Then you sing it back right after the clicks. Each round adds a note when you nail it.',
    async run(stage, args, ctx) {
      useSingingCss();
      const m = await needMic(stage, 'The app plays a tune, then listens while you sing it back.', () => GAMES.echoTap.run(stage, args, ctx));
      if (m.fallback !== undefined) return m.fallback;
      const v = m.v, pool = args.pool || [0, 2, 4, 5, 7], rounds = args.rounds || 5, bpm = args.bpm || 84, spb = 60 / bpm;
      const { l, h } = R(); const tonic = tonicFor(pool, l, h);
      let len = args.len || 3, r = 0, total = 0, alive = true, perf = null;
      stage.innerHTML = `<div class="sg-game"><div class="hud"><span id="st">Round 1 of ${rounds}</span><span id="ln"></span></div><div class="playfield" id="pf" style="height:min(320px,42vh)"></div><div class="feedback" id="fb"></div></div>`;
      const lanes = new Lanes($('#pf', stage), { keyTonic: tonic, pxPerSec: 110 });
      v.on(s => { if (perf) perf.voice(s); });
      const stopDraw = loop(dt => { if (perf) perf.tick(); lanes.draw(dt); });
      const phrase = () => {
        const out = [0]; for (let i = 1; i < len; i++) { const p = out[i - 1]; const c = pool.filter(x => x !== p && Math.abs(x - p) <= (args.leap || 7)); out.push(pick(c.length ? c : pool)); }
        if (Math.random() < 0.6) out[len - 1] = 0; return out;
      };
      const round = () => {
        if (!alive) return; if (r >= rounds) return ctx.finish(total / rounds);
        const ph = phrase(), beats = ph.map((_, i) => (args.rhythm && i < len - 1 ? pick([0.5, 1, 1]) : 1));
        const call = [], resp = []; let t = 0;
        ph.forEach((d, i) => { call.push({ t, dur: beats[i] * spb * 0.9, midi: tonic + d, skip: true, label: SOL[d] }); t += beats[i] * spb; });
        const respStart = t + 2 * spb;
        call.forEach(n => resp.push({ t: n.t + respStart, dur: n.dur, midi: n.midi }));
        const notes = [...call, ...resp];
        lanes.setNotes(notes); lanes.clearTrail();
        $('#st', stage).textContent = `Round ${r + 1} of ${rounds}`; $('#ln', stage).textContent = `${len} notes`;
        $('#fb', stage).textContent = 'Listen…'; $('#fb', stage).style.color = 'var(--ink)';
        perf = new Performer({ notes, lanes, bpm, countIn: 2, guide: true, scoring: true,
          onEnd: () => {
            const hits = resp.map(n => n.hit ?? 0), acc = hits.reduce((a, b) => a + b, 0) / hits.length;
            total += acc; r++;
            const good = acc >= 0.6; if (good && len < (args.max || 6)) len++;
            if (args.srs) ctx.grade(args.srs, good);
            const fb = $('#fb', stage); fb.textContent = `${Math.round(acc * 100)}%. ${good ? 'Nice echo!' : 'Listen again: ' + ph.map(d => SOL[d]).join(' ')}`; fb.style.color = good ? 'var(--ok)' : 'var(--bad)';
            if (!good) playSeq(call.map(n => n.midi), { gap: spb, at: 0.4 });
            setTimeout(round, good ? 1600 : 1600 + call.length * spb * 1000);
          } });
        resp.forEach(n => { n.silent = true; });
        const fbEl = $('#fb', stage), origTick = perf.tick.bind(perf);
        perf.tick = () => { const now = origTick(); if (now > respStart - 2 * spb - 0.05 && fbEl.textContent === 'Listen…') fbEl.textContent = 'Your turn after 2 clicks…'; if (now > respStart - 0.1 && /clicks/.test(fbEl.textContent)) fbEl.textContent = 'Sing!'; return now; };
        perf.start(0);
        for (let k = 0; k < 2; k++) click(perf.t0 + (respStart - (2 - k) * spb) / perf.o.speed, k === 0);
      };
      setTimeout(round, 500);
      return () => { alive = false; stopDraw(); v.stop(); if (perf) perf.stop(); lanes.destroy(); };
    },
  },

  // ear-only fallback for echo: Simon-style pads
  echoTap: {
    name: 'Melody echo (tap)', how: 'Watch and listen. Tap the pads in the same order and sing along. Each round adds a note.',
    run(stage, args, ctx) {
      useSingingCss();
      const pool = args.pool || [0, 2, 4, 5, 7], { l, h } = R(), tonic = tonicFor(pool, l, h), goal = args.max || 6;
      let seq = [pick(pool), pick(pool)], pos = 0, busy = true, lives = 2, best = 1, alive = true;
      stage.innerHTML = `<div class="sg-game"><div class="hud"><span id="el">Length 2</span><span id="lv">♥♥</span></div><div class="sg-pads">${pool.map((p, i) => `<button class="sg-pad" style="--c:${PAD_COLORS[i % 8]}" data-d="${p}">${SOL[p]}</button>`).join('')}</div><div class="feedback" id="fb">Listen…</div></div>`;
      const flash = (d, at) => setTimeout(() => { const b = $(`[data-d="${d}"]`, stage); if (!b) return; b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 330); }, at * 1000);
      const msg = t => { const f = $('#fb', stage); if (f) f.textContent = t; };
      const playSeqP = () => { if (!alive) return; busy = true; msg('Listen and sing along…'); seq.forEach((d, k) => { tone(tonic + d, { at: k * 0.6 + 0.2, dur: 0.45 }); flash(d, k * 0.6 + 0.2); }); setTimeout(() => { busy = false; pos = 0; msg('Your turn'); }, seq.length * 600 + 300); };
      stage.onclick = e => {
        const b = e.target.closest('[data-d]'); if (!b || busy) return; const d = +b.dataset.d; tone(tonic + d, { dur: 0.35 }); flash(d, 0);
        if (d === seq[pos]) { if (++pos < seq.length) return; best = seq.length; busy = true; if (best >= goal) { msg('Melody master!'); return setTimeout(() => ctx.finish(1), 800); } seq.push(pick(pool)); $('#el', stage).textContent = 'Length ' + seq.length; setTimeout(playSeqP, 900); }
        else { lives--; busy = true; $('#lv', stage).textContent = '♥'.repeat(lives) + '♡'.repeat(2 - lives); if (lives <= 0) { msg('Out of lives.'); return setTimeout(() => ctx.finish(Math.max(0.2, (best - 1) / (goal - 1))), 900); } msg('Oops. Listen again.'); setTimeout(playSeqP, 1100); }
      };
      setTimeout(playSeqP, 500);
      return () => { alive = false; };
    },
  },

  // ------------------------------------------------------------ mic: breath control
  breath: {
    name: 'Long breath', mic: true,
    how: 'Breathe in low for 4 counts. Then let the air out slowly on a long sound. The bar grows while you keep going.',
    async run(stage, args, ctx) {
      useSingingCss();
      const mode = args.mode || 'sss', goal = args.target || 12, tries = args.tries || 3;
      const word = mode === 'sss' ? 'hiss "sss"' : mode === 'hum' ? 'hum "mmm"' : 'sing "ah"';
      const ok = await micGate(stage, { why: `The app hears your ${mode === 'sss' ? 'hiss' : 'hum'} and times how long and how evenly you can keep it going.`, allowSkip: true });
      const { mic } = await import('../../core/mic.js');
      let alive = true, tryN = 0, best = 0, bestSmooth = 0, stopL = null;
      stage.innerHTML = `<div class="sg-game"><div class="qbox"><div class="sg-breathe" id="bc">Ready</div><p id="ins" class="muted">${ok ? 'Stay quiet for a moment…' : 'No mic: press and hold the button while you ' + word + '.'}</p></div>
        <div class="sg-breath"><b id="bb"></b><i class="goal" style="left:${Math.min(98, 100 * goal / (goal * 1.25))}%"></i><span id="bt">0.0 s</span></div>
        <div class="hud"><span id="tr">Try 1 of ${tries}</span><span id="sm"></span></div>
        ${ok ? '' : '<button class="btn primary big" id="hold">Hold while you breathe out</button>'}<div class="feedback" id="fb"></div></div>`;
      const max = goal * 1.25, setBar = s => { $('#bb', stage).style.width = Math.min(100, s / max * 100) + '%'; $('#bt', stage).textContent = s.toFixed(1) + ' s'; };
      const endTry = (dur, smooth) => {
        tryN++; best = Math.max(best, dur); bestSmooth = Math.max(bestSmooth, smooth || 0);
        const f = $('#fb', stage); f.textContent = `${dur.toFixed(1)} s${smooth != null ? ` · ${Math.round(smooth * 100)}% even` : ''}. ${dur >= goal ? 'Goal reached!' : 'Tip: let the belly come in slowly, not the chest.'}`;
        f.style.color = dur >= goal ? 'var(--ok)' : 'var(--ink)';
        if (args.srs) ctx.grade(args.srs, dur >= goal);
        if (tryN >= tries || dur >= goal * 1.2) return setTimeout(() => ctx.finish(Math.min(1, best / goal) * (ok ? 0.8 + 0.2 * bestSmooth : 1)), 1400);
        $('#tr', stage).textContent = `Try ${tryN + 1} of ${tries}`; setTimeout(cycle, 1800);
      };
      const breatheIn = async () => {
        const bc = $('#bc', stage); if (!bc) return;
        bc.textContent = 'Breathe in'; bc.className = 'sg-breathe in'; $('#ins', stage).textContent = 'In through the nose… belly out… 1, 2, 3, 4';
        for (let k = 0; k < 4; k++) { if (!alive) return; click(getCtx().currentTime + 0.01, k === 0); await sleep(1000); }
        bc.textContent = mode === 'sss' ? 'sss…' : 'mmm…'; bc.className = 'sg-breathe hold'; $('#ins', stage).textContent = `Now ${word}, slow and even.`;
      };
      if (!ok) {
        const btn = $('#hold', stage); let t0 = 0, raf = 0;
        btn.onpointerdown = e => { e.preventDefault(); t0 = performance.now(); const up = () => { setBar((performance.now() - t0) / 1000); raf = requestAnimationFrame(up); }; up(); };
        btn.onpointerup = btn.onpointerleave = () => { if (!t0) return; cancelAnimationFrame(raf); const d = (performance.now() - t0) / 1000; t0 = 0; if (d > 0.5) endTry(d, null); };
        var cycle = () => { setBar(0); breatheIn(); }; cycle();
        return () => { alive = false; cancelAnimationFrame(raf); };
      }
      // mic mode: noise floor, then measure
      let floor = 0.003;
      await sleep(400);
      const samples = []; const until = performance.now() + 1200;
      while (performance.now() < until && alive) { samples.push(mic.level()); await sleep(30); }
      samples.sort((a, b) => a - b); floor = samples[samples.length >> 1] || 0.003;
      const thr = Math.max(floor * 3, 0.008);
      var cycle = async () => {
        if (!alive) return; setBar(0); await breatheIn(); if (!alive) return;
        let start = 0, lastOn = 0, levels = []; const t0 = performance.now();
        const step = () => {
          if (!alive) return;
          const lv = mic.level(), now = performance.now();
          if (lv > thr) { if (!start) start = now; lastOn = now; levels.push(lv); }
          const dur = start ? (lastOn - start) / 1000 : 0; setBar(dur);
          if (levels.length > 10) { const mean = levels.reduce((a, b) => a + b, 0) / levels.length; const sd = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length); $('#sm', stage).textContent = `${Math.round(clamp(1 - sd / mean, 0, 1) * 100)}% even`; }
          if ((start && now - lastOn > 350) || (!start && now - t0 > 6000)) {
            stopL = null; const mean = levels.reduce((a, b) => a + b, 0) / (levels.length || 1); const sd = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / (levels.length || 1));
            $('#bc', stage).className = 'sg-breathe'; $('#bc', stage).textContent = 'Rest';
            return endTry(dur, clamp(1 - sd / (mean || 1), 0, 1));
          }
          stopL = requestAnimationFrame(step);
        };
        step();
      };
      cycle();
      return () => { alive = false; if (stopL) cancelAnimationFrame(stopL); };
    },
  },

  // ------------------------------------------------------------ mic: dynamics
  dynamics: {
    name: 'Soft and loud', mic: true,
    how: 'Sing "ah" on one note. Move your volume into the green zone: soft, medium or loud. Keep the pitch the same.',
    async run(stage, args, ctx) {
      useSingingCss();
      const m = await needMic(stage, 'The app measures how loud you sing.', () => GAMES.loudQuiz.run(stage, args, ctx));
      if (m.fallback !== undefined) return m.fallback;
      const v = m.v, seq = args.seq || ['medium', 'soft', 'loud', 'soft', 'medium', 'loud'], hold = 1.2;
      const ZONES = { soft: [0.2, 0.62], medium: [0.75, 1.35], loud: [1.6, 4] };
      const note = pickNote('narrow');
      let phase = 'cal', cal = [], ref = 0, i = 0, fill = 0, last = 0, hits = 0, alive = true, t0 = 0; const res = [];
      stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small" id="lb">Step 1: your normal volume</span><br><b id="zn">Normal "ah"</b></div><button class="btn ghost" id="hear">Hear the note</button></div>
        <div class="grid2"><div class="sg-loud" id="ld"><div class="zone" id="zone"></div><div class="lvl" id="lvl"></div></div><div><div class="sg-big" id="pc">–</div><p class="muted" id="pn">Keep the same note while the volume changes.</p></div></div>
        <div class="sg-fill"><b id="fill"></b></div><div class="feedback" id="fb">Sing "ah" at your normal volume.</div><div class="sg-dots" id="dt"></div></div>`;
      const pos = r => clamp((Math.log2(r) + 2.5) / 4.5, 0, 1); // ratio 0.18..4 -> 0..1
      const setZone = () => { const z = ZONES[seq[i]]; const zone = $('#zone', stage); zone.style.bottom = pos(z[0]) * 100 + '%'; zone.style.height = (pos(z[1]) - pos(z[0])) * 100 + '%'; $('#zn', stage).textContent = seq[i][0].toUpperCase() + seq[i].slice(1); $('#lb', stage).textContent = `Round ${i + 1} of ${seq.length}`; $('#dt', stage).innerHTML = dots(seq.length, res, i); };
      v.on(s => {
        const dt = last ? Math.min(0.1, s.now - last) : 0; last = s.now;
        $('#pc', stage).textContent = s.midi ? noteName(s.midi) : '–';
        if (phase === 'cal') {
          if (s.midi) cal.push(s.rms);
          $('#fill', stage).style.width = Math.min(100, cal.length / 90 * 100) + '%';
          if (cal.length >= 90) { cal.sort((a, b) => a - b); ref = cal[cal.length >> 1]; phase = 'play'; fill = 0; t0 = performance.now(); setZone(); $('#fb', stage).textContent = 'Now match the zone.'; }
          $('#lvl', stage).style.height = pos(s.rms / (ref || s.rms || 1)) * 100 + '%';
          return;
        }
        if (phase !== 'play') return;
        const ratio = s.rms / ref; $('#lvl', stage).style.height = (s.midi ? pos(ratio) : 0) * 100 + '%';
        const z = ZONES[seq[i]];
        if (s.midi && ratio >= z[0] && ratio <= z[1]) fill += dt; else fill = Math.max(0, fill - dt * 0.3);
        $('#fill', stage).style.width = Math.min(100, fill / hold * 100) + '%';
        const f = $('#fb', stage);
        if (s.midi) { f.textContent = ratio < z[0] ? 'More voice. Use more air, not more throat.' : ratio > z[1] ? 'Softer. Keep it gentle but supported.' : 'Yes, hold it there!'; f.style.color = ratio >= z[0] && ratio <= z[1] ? 'var(--ok)' : 'var(--warn)'; }
        if (fill >= hold || (performance.now() - t0) / 1000 > 12) {
          if (fill >= hold) hits++; res[i] = fill >= hold;
          i++; fill = 0; t0 = performance.now();
          if (i >= seq.length) { phase = 'done'; if (args.srs) ctx.grade(args.srs, hits / seq.length >= 0.6); return ctx.finish(hits / seq.length); }
          setZone();
        }
      });
      $('#hear', stage).onclick = () => tone(note, { dur: 1.2 });
      tone(note, { dur: 1.2 });
      return () => { alive = false; v.stop(); };
    },
  },
  loudQuiz: {
    name: 'Soft or loud?', how: 'Hear two notes. Which one is louder? Listening for volume helps you control your own.',
    run(stage, args, ctx) {
      const N = 6; let i = 0, right = 0, alive = true;
      const q = () => {
        if (!alive) return; if (i >= N) return ctx.finish(right / N);
        const n = pickNote(), firstLoud = Math.random() < 0.5, gs = firstLoud ? [0.4, 0.12] : [0.12, 0.4];
        const play = () => { tone(n, { dur: 0.8, gain: gs[0] }); tone(n, { at: 1, dur: 0.8, gain: gs[1] }); };
        stage.innerHTML = `<div class="sg-game"><div class="qbox"><div class="sg-big">${i + 1} / ${N}</div><button class="btn ghost" data-x="re">Play again</button></div><div class="opts"><button class="opt" data-a="1">First is louder</button><button class="opt" data-a="0">Second is louder</button></div><div class="feedback" id="fb"></div></div>`;
        setTimeout(play, 300); let done = false;
        stage.onclick = e => { if (e.target.closest('[data-x]')) return play(); const b = e.target.closest('[data-a]'); if (!b || done) return; done = true; const ok = (b.dataset.a === '1') === firstLoud; if (ok) right++; b.classList.add(ok ? 'right' : 'wrong'); i++; setTimeout(q, 1000); };
      };
      q(); return () => { alive = false; };
    },
  },

  // ------------------------------------------------------------ sing-along lanes (exercise or song)
  singAlong: {
    name: 'Sing along', mic: true,
    how: 'Bars scroll toward the red line. Sing each note as its bar crosses the line. Your voice draws a line: green means in tune.',
    run(stage, args, ctx) {
      useSingingCss();
      const { l, h } = R();
      let session;
      if (args.song) {
        const s = SONGS[args.song]; const notes = songNotes(args.song, { low: l, high: h });
        session = { title: s.title, bpm: s.bpm, notes, keyTonic: null, guide: args.guide ?? true };
      } else {
        const ex = EXERCISES[args.ex || 'scale5']; const { notes, tonics, bpm } = exerciseNotes(args.ex || 'scale5', { low: l, high: h, keys: args.keys || 1 });
        notes.forEach(n => { const d = n.midi - tonics[Math.min(tonics.length - 1, Math.floor(notes.indexOf(n) / ex.d.length))]; n.label = SOL[d] || ''; });
        session = { title: ex.title + (tonics.length > 1 ? ` · ${tonics.length} keys` : ''), bpm, notes, keyTonic: tonics[0], guide: args.guide ?? true };
      }
      session.transpose = 0; session.compact = true; session.octaveAgnostic = false;
      const wrapped = { ...ctx, finish: (sc, info) => { if (args.srs) ctx.grade(args.srs, sc >= 0.6 ? (sc >= 0.85 ? 3 : 2) : 0); ctx.finish(sc, info); } };
      return startSingSession(stage, session, wrapped);
    },
  },

  // ------------------------------------------------------------ ear: name that tune (reviews)
  songQuiz: {
    name: 'Name that tune', how: 'Hear the opening of a song. Which song is it?',
    run(stage, args, ctx) {
      const ids = args.ids && args.ids.length >= 2 ? args.ids : Object.keys(SONGS); const N = args.n || 4; let i = 0, right = 0, alive = true;
      const q = () => {
        if (!alive) return; if (i >= N) return ctx.finish(right / N);
        const id = args.only ? args.only[i % args.only.length] : pick(ids); const opts = shuffle([id, ...shuffle(Object.keys(SONGS).filter(x => x !== id)).slice(0, 3)]);
        const ns = songNotes(id, { low: R().l, high: R().h }).slice(0, 7);
        const play = () => ns.forEach(n => tone(n.midi, { at: n.t, dur: n.dur }));
        stage.innerHTML = `<div class="sg-game"><div class="qbox"><div class="sg-big">♪</div><button class="btn ghost" data-x="re">Play again</button></div><div class="opts one">${opts.map(o => `<button class="opt" data-s="${o}">${esc(SONGS[o].title)}</button>`).join('')}</div><div class="feedback" id="fb"></div></div>`;
        setTimeout(play, 300); let done = false;
        stage.onclick = e => { if (e.target.closest('[data-x]')) return play(); const b = e.target.closest('[data-s]'); if (!b || done) return; done = true; const ok = b.dataset.s === id; if (ok) right++; b.classList.add(ok ? 'right' : 'wrong'); if (!ok) $(`[data-s="${id}"]`, stage).classList.add('right'); ctx.grade(`sg:song:${id}`, ok); i++; setTimeout(q, 1300); };
      };
      q(); return () => { alive = false; };
    },
  },
};
