// Chord highway (Yousician-style). Used by built-in songs and by Song Lab.
// startChordSession(stage, session, ctx, opts?) -> cleanup
//   session = { title, audioUrl?, bpm, beatsPerBar, beats[], chords:[{t,dur,name}], capo, key?, sections?[{name,t0,t1}] }
//   opts    = { onFinish(result), wait (bool), speed (0.5..1), gate (ask for mic first, default true), backing (bool) }
import { getCtx, click, strum as playStrum, unlock } from '../../core/audio.js';
import { mic } from '../../core/mic.js';
import { chordSVG, esc, fitCanvas, micGate, cssVar, loop } from '../../core/ui.js';
import { transposeChord, shapeFor } from '../../core/music.js';
import { settings } from '../../core/store.js';
import { GuitarEar } from './listen.js';
import { useGuitarCss, micHud, col } from './fretboard.js';

function normalize(s) {
  const bpm = s.bpm || 90, bpb = s.beatsPerBar || 4, spb = 60 / bpm;
  const chords = (s.chords || []).filter(c => c && c.name && c.dur > 0).slice().sort((a, b) => a.t - b.t);
  const end = chords.length ? chords[chords.length - 1].t + chords[chords.length - 1].dur : 8;
  let beats = (s.beats && s.beats.length) ? s.beats.slice() : [];
  if (!beats.length) { const first = chords.length ? chords[0].t : 0; for (let t = first; t <= end + 1e-6; t += spb) beats.push(+t.toFixed(4)); }
  let sections = (s.sections || []).filter(x => x.t1 > x.t0);
  if (!sections.length) {
    const barLen = bpb * 4;
    for (let i = 0, k = 1; i < beats.length; i += barLen, k++) {
      const t0 = beats[i], t1 = beats[Math.min(beats.length - 1, i + barLen)] ?? end;
      if (t1 > t0 + 0.5) sections.push({ name: `Bars ${(k - 1) * 4 + 1}–${k * 4}`, t0, t1: i + barLen >= beats.length ? end : t1 });
    }
  }
  const capo = s.capo || 0;
  // Song Lab may pass range {t0,t1}: the part of the original audio being practised (chords already filtered)
  const range = s.range && s.range.t1 > s.range.t0 ? { name: 'This part', t0: s.range.t0, t1: s.range.t1 } : null;
  return { ...s, bpm, bpb, spb, chords, beats, end: range ? Math.min(end, range.t1) : end, sections, capo, range, title: s.title || 'Practice' };
}

function makeClock(url) {
  const c = getCtx();
  if (url) {
    const el = new Audio(url);
    el.preload = 'auto'; el.preservesPitch = true; el.webkitPreservesPitch = true; el.mozPreservesPitch = true; el.setAttribute('playsinline', '');
    let base = 0, basePerf = 0, lastCT = -1;
    return {
      kind: 'audio', el,
      get playing() { return !el.paused; },
      time() {
        const ct = el.currentTime, p = performance.now();
        if (ct !== lastCT) { lastCT = ct; base = ct; basePerf = p; }
        return el.paused ? ct : base + (p - basePerf) / 1000 * el.playbackRate;
      },
      play() { return el.play().catch(() => {}); },
      pause() { el.pause(); },
      seek(s) { el.currentTime = Math.max(0, s); lastCT = -1; },
      setRate(r) { el.playbackRate = r; },
      get rate() { return el.playbackRate; },
      ctxAt(s) { return c.currentTime + (s - this.time()) / el.playbackRate; },
      destroy() { el.pause(); el.removeAttribute('src'); el.load(); },
    };
  }
  let playing = false, s0 = 0, t0 = 0, rate = 1;
  return {
    kind: 'metro',
    get playing() { return playing; },
    time() { return playing ? s0 + (c.currentTime - t0) * rate : s0; },
    play(at) { t0 = at ?? c.currentTime; playing = true; },
    pause() { s0 = this.time(); playing = false; },
    seek(s) { s0 = s; if (playing) t0 = c.currentTime; },
    setRate(r) { if (playing) { s0 = this.time(); t0 = c.currentTime; } rate = r; },
    get rate() { return rate; },
    ctxAt(s) { return playing ? t0 + (s - s0) / rate : c.currentTime + (s - s0) / rate; },
    destroy() {},
  };
}

export function startChordSession(stage, session, ctx = {}, opts = {}) {
  useGuitarCss();
  const S = normalize(session);
  let alive = true, ear = null, cv = null, stopLoop = null, offs = [];
  const clock = makeClock(S.audioUrl);
  const ev = S.chords.map((c, i) => ({ ...c, i, shape: S.capo ? transposeChord(c.name, -S.capo) : c.name, state: 'pending', tries: 0 }));
  const st = { pts: 0, combo: 0, maxCombo: 0, perfect: 0, waiting: null, loop: S.range, counting: 0, lastSched: -1, finished: false, strays: 0 };
  const fx = [];
  const cleanup = () => {
    alive = false;
    offs.forEach(f => f()); offs = [];
    if (stopLoop) stopLoop();
    if (ear) ear.stop();
    if (cv) cv.destroy();
    clock.destroy();
  };

  (async () => {
    if (!mic.active && opts.gate !== false) {
      const ok = await micGate(stage, { why: 'Play along on your guitar. The app hears each chord and scores you.', tips: 'Headphones help: then the app hears only your guitar, not the song.', allowSkip: true });
      if (!alive) return;
      if (ok) try { ear = await new GuitarEar().start(); } catch (e) { ear = null; }
    } else if (mic.active) { try { ear = await new GuitarEar().start(); } catch (e) { ear = null; } }
    if (!alive) { if (ear) ear.stop(); return; }
    build();
  })();

  function build() {
    const speeds = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const sp0 = opts.speed || (S.audioUrl ? 1 : 0.8);
    const waitDefault = opts.wait ?? !S.audioUrl;
    stage.innerHTML = `<div class="gt-sess">
      <div class="gt-sess-head"><div class="gt-sess-t"><b>${esc(S.title)}</b><small>${[S.key, S.capo ? `Capo ${S.capo}` : '', `${Math.round(S.bpm)} bpm`].filter(Boolean).map(esc).join(' · ')}</small></div>
        <div class="gt-score"><b id="scP">0</b><small>points</small></div><div class="gt-score"><b id="scC">0</b><small>combo</small></div></div>
      <div class="gt-charts"><div class="gt-now"><small>Now</small><div id="chNow"></div></div><div class="gt-next"><small>Next</small><div id="chNext"></div></div></div>
      <div class="playfield gt-lane" id="lane"></div>
      <div class="gt-fb" id="fb" aria-live="polite">${ear ? 'Tap Play. One bar of clicks first, then strum each chord as it hits the line.' : 'No mic: tap Strum on each new chord. Play your guitar along.'}</div>
      <div id="hudHost"></div>
      <div class="gt-ctl row"><button class="btn primary big" id="play">Play</button><button class="btn ghost" id="restart">Restart</button>${ear ? '' : '<button class="btn primary big" id="tap">Strum</button>'}</div>
      <div class="gt-opts">
        <label class="field">Speed <select id="spd">${speeds.map(v => `<option value="${v}" ${v === sp0 ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
        <label class="field">Practise <select id="sec">${S.range ? '<option value="-2" selected>This part (loop)</option><option value="-1">Play once</option>' : '<option value="-1">Whole song</option>'}${S.sections.map((x, i) => `<option value="${i}">${esc(x.name)} (loop)</option>`).join('')}</select></label>
        <label class="tog"><input type="checkbox" id="wait" ${waitDefault ? 'checked' : ''}> Wait for me (stops until you play the chord)</label>
        <label class="tog"><input type="checkbox" id="back" ${(opts.backing ?? (!ear && !S.audioUrl)) ? 'checked' : ''}> Backing guitar (strums the chords for you)</label>
        <label class="tog"><input type="checkbox" id="clk" ${S.audioUrl ? '' : 'checked'}> Metronome click</label>
      </div></div>`;
    const $ = s => stage.querySelector(s);
    cv = fitCanvas($('#lane'));
    clock.setRate(sp0);
    let hud = null;
    if (ear) { hud = micHud(); $('#hudHost').append(hud.el); }
    if (S.range) {
      const go = () => clock.seek(Math.max(0, S.range.t0 - 0.05));
      go(); if (clock.el) clock.el.addEventListener('loadedmetadata', go, { once: true });
    }
    const opt = { wait: waitDefault, back: $('#back').checked, clk: $('#clk').checked };
    $('#wait').onchange = e => { opt.wait = e.target.checked; if (!opt.wait && st.waiting) resumeFromWait(false); };
    $('#back').onchange = e => { opt.back = e.target.checked; };
    $('#clk').onchange = e => { opt.clk = e.target.checked; };
    $('#spd').onchange = e => { clock.setRate(+e.target.value); };
    $('#sec').onchange = e => {
      const i = +e.target.value; st.loop = i >= 0 ? S.sections[i] : i === -2 ? S.range : null;
      const from = st.loop ? st.loop.t0 : (S.range ? S.range.t0 : 0);
      pause(); resetFrom(from); clock.seek(Math.max(0, from - 0.05)); st.lastSched = -1; draw();
    };
    $('#play').onclick = () => { unlock(); clock.playing || st.counting ? pause() : play(); };
    $('#restart').onclick = () => { pause(); const t0 = st.loop ? st.loop.t0 : (S.range ? S.range.t0 : 0); resetFrom(t0); clock.seek(Math.max(0, t0 - 0.05)); st.pts = 0; st.combo = 0; st.finished = false; score(); draw(); };
    const tap = $('#tap');
    if (tap) tap.onpointerdown = e => { e.preventDefault(); onStrum({ t: getCtx().currentTime - (settings.get().tapLatencyMs || 0) / 1000, tap: true }); tap.classList.add('hit'); setTimeout(() => tap.classList.remove('hit'), 90); };
    if (ear) {
      offs.push(ear.onStrum(s => onStrum(s)));
      offs.push(ear.on(f => { hud.level(f.rms, ear.gate); }));
    }

    function play() {
      if (st.finished) { $('#restart').click(); }
      const c = getCtx(), spb = S.spb / clock.rate, lead = S.bpb * spb;
      const t1 = c.currentTime + 0.12;
      for (let i = 0; i < S.bpb; i++) click(t1 + i * spb, i === 0);
      st.counting = t1 + lead;
      $('#play').textContent = 'Pause';
      const startAt = t1 + lead;
      st.playFrom = clock.time();
      ev.forEach(e => { if (e.state === 'pending' && e.t + e.dur <= st.playFrom + 0.05) e.state = 'skip'; });
      if (clock.kind === 'metro') { clock.play(startAt); st.counting = 0; }
      else setTimeout(() => { if (alive && st.counting) { st.counting = 0; clock.play(); } }, (startAt - c.currentTime) * 1000);
      st.lastSched = st.playFrom - 0.001;
    }
    function pause() { st.counting = 0; if (clock.playing) clock.pause(); $('#play').textContent = 'Play'; }
    function resetFrom(t0) { ev.forEach(e => { if (e.t >= t0 - 0.01 || e.state === 'skip') { e.state = 'pending'; e.tries = 0; e.grade = null; } }); st.waiting = null; }
    function score() { $('#scP').textContent = st.pts; $('#scC').textContent = st.combo; }
    function say(t, cls = '') { const fb = $('#fb'); fb.textContent = t; fb.className = 'gt-fb ' + cls; }
    function pop(text, color) { fx.push({ text, color, t: performance.now() }); }
    function current(now) { return ev.find(e => e.state === 'pending' && e.t + e.dur > now - 0.05) || null; }

    function songAt(ctxT) { return clock.time() - (getCtx().currentTime - ctxT) * clock.rate; }
    async function onStrum(s) {
      if (!alive || st.finished) return;
      if (st.waiting) {
        const e = st.waiting;
        if (s.tap) return hit(e, 0, true);
        const r = await ear.judgeStrum(s, e.name);
        if (!alive || st.waiting !== e) return;
        if (r.ok) hit(e, 0, true); else { e.tries++; say(r.hint || `Not ${e.shape} yet. Try again.`, 'bad'); }
        return;
      }
      if (!clock.playing) return;
      const now = songAt(s.t);
      const e = ev.find(x => x.state === 'pending' && now >= x.t - 0.35 && now <= x.t + Math.max(0.6, Math.min(2.5, x.dur * 0.75)));
      if (!e) { st.strays++; return; }
      if (s.tap) return hit(e, now - e.t, false);
      e.busy = true;
      const r = await ear.judgeStrum(s, e.name);
      e.busy = false;
      if (!alive || e.state !== 'pending') return;
      if (r.ok) hit(e, now - e.t, false);
      else { e.tries++; say(r.hint || `That was not ${e.shape}.`, 'bad'); pop('Wrong chord', col('--bad')); }
    }
    function hit(e, dt, waited) {
      e.state = 'hit'; e.dt = dt;
      let p, label, color = col('--ok');
      if (waited) { p = 50; label = 'Got it!'; }
      else if (Math.abs(dt) < 0.1) { p = 100; label = 'Perfect!'; st.perfect++; }
      else if (Math.abs(dt) < 0.22) { p = 70; label = dt < 0 ? 'Good (early)' : 'Good (late)'; }
      else { p = 40; label = dt < 0 ? 'Early' : 'Late'; color = col('--warn'); }
      if (e.tries) p = Math.round(p * 0.7);
      st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo);
      st.pts += p + Math.min(50, st.combo * 5);
      e.pts = p;
      pop(label, color); say(`${label} ${e.shape}${st.combo > 2 ? ` · combo ${st.combo}` : ''}`, 'ok'); score();
      if (waited) resumeFromWait(true);
    }
    function resumeFromWait(withCount) {
      st.waiting = null;
      if (!withCount) { clock.play(); return; }
      clock.play(clock.kind === 'metro' ? getCtx().currentTime + 0.05 : undefined);
    }
    function miss(e) {
      e.state = 'miss'; st.combo = 0; score();
      pop('Miss', col('--bad')); say(`Missed ${e.shape}. Next one!`, 'bad');
    }

    let lastChartKey = '';
    function charts(now) {
      const cur = st.waiting || current(now), nx = cur ? ev[cur.i + 1] : null;
      const key = (cur ? cur.i : -1) + ':' + (nx ? nx.i : -1);
      if (key === lastChartKey) return;
      lastChartKey = key;
      $('#chNow').innerHTML = cur ? chordSVG(cur.shape, { size: 150 }) : '<p class="muted">–</p>';
      $('#chNext').innerHTML = nx ? chordSVG(nx.shape, { size: 100, showFingers: false }) : '<p class="muted">End</p>';
    }

    function schedule(now) {
      if (!clock.playing) return;
      const ahead = now + 0.25 * clock.rate;
      const c = getCtx();
      for (const b of S.beats) {
        if (b <= st.lastSched || b > ahead) continue;
        if (st.loop && (b < st.loop.t0 - 0.01 || b >= st.loop.t1 - 0.01)) continue;
        const at = c.currentTime + (b - now) / clock.rate;
        const bi = S.beats.indexOf(b);
        if (opt.clk) click(at, bi % S.bpb === 0);
        if (opt.back) {
          const e = ev.find(x => b >= x.t - 0.01 && b < x.t + x.dur - 0.01);
          if (e) { const sh = shapeFor(e.shape); if (sh) playStrum(sh.f, { at: Math.max(0, at - c.currentTime), capo: S.capo, vel: Math.abs(b - e.t) < 0.02 ? 0.2 : 0.12 }); }
        }
      }
      st.lastSched = Math.max(st.lastSched, ahead);
    }

    function frame() {
      if (!alive) return;
      let now = clock.time();
      if (clock.playing && now >= (st.playFrom ?? -1e9) - 0.001) {
        schedule(now);
        // wait mode: stop at a chord until it is played
        if (opt.wait && !st.waiting) {
          const e = ev.find(x => x.state === 'pending' && now >= x.t && now < x.t + x.dur);
          if (e && !e.busy) { clock.pause(); clock.seek(e.t); now = e.t; st.waiting = e; st.lastSched = e.t - 0.001; say(`Play ${e.shape} to continue.`, ''); }
        }
        if (!opt.wait) for (const e of ev) if (e.state === 'pending' && !e.busy && now > e.t + Math.max(0.6, Math.min(2.5, e.dur * 0.75))) miss(e);
        if (st.loop && now >= st.loop.t1) {
          const t0 = st.loop.t0; resetFrom(t0); clock.seek(Math.max(0, t0 - 0.02)); st.lastSched = t0 - 0.03; say('Again! Loop restarts.', '');
        } else if (!st.loop && now >= S.end + 0.4) finish();
      }
      if (st.waiting) st.waitT = st.waitT || performance.now(); else st.waitT = 0;
      const pn = performance.now();
      if (st.waiting && ear && pn - st.waitT > 300 && pn - (st.lastCheck || 0) > 200) {
        st.lastCheck = pn;
        const r = ear.chordNow(st.waiting.name, 0.3);
        if (r.ok) hit(st.waiting, 0, true);
      }
      charts(now);
      draw(now);
    }
    stopLoop = loop(frame);

    function draw(now = clock.time()) {
      const { g, w: W, h: H } = cv;
      if (!W) return;
      const pps = Math.max(48, Math.min(110, W / 8.5)) / S.spb;
      const hitX = Math.round(W * 0.2);
      const X = t => hitX + (t - now) * pps;
      const ink = col('--ink'), mute = col('--mute'), line = col('--line'), card = col('--card'), trk = col('--trk');
      g.clearRect(0, 0, W, H);
      g.fillStyle = card; g.fillRect(0, 0, W, H);
      const top = 16, bh = Math.max(70, H * 0.5), by = top;
      // loop shading
      if (st.loop) { g.fillStyle = 'rgba(127,127,127,.08)'; g.fillRect(X(st.loop.t0), 0, (st.loop.t1 - st.loop.t0) * pps, H); }
      // beats + bars
      S.beats.forEach((b, i) => {
        const x = X(b); if (x < -10 || x > W + 10) return;
        const bar = i % S.bpb === 0;
        g.strokeStyle = bar ? mute : line; g.lineWidth = bar ? 2 : 1;
        g.beginPath(); g.moveTo(x, by + bh + 8); g.lineTo(x, H - 8); g.stroke();
        g.fillStyle = bar ? ink : mute;
        g.beginPath(); g.moveTo(x - 7, by + bh + 20); g.lineTo(x + 7, by + bh + 20); g.lineTo(x, by + bh + 33); g.closePath(); g.fill();
      });
      // chord blocks
      for (const e of ev) {
        const x0 = X(e.t), x1 = X(e.t + e.dur);
        if (x1 < -5 || x0 > W + 5) continue;
        const cur = (st.waiting === e) || (now >= e.t && now < e.t + e.dur);
        g.globalAlpha = e.state === 'miss' ? 0.4 : 1;
        g.fillStyle = e.state === 'hit' ? col('--ok') : e.state === 'miss' ? col('--bad') : trk;
        const r = 12, y = by, w = Math.max(10, x1 - x0 - 6);
        g.beginPath(); g.roundRect ? g.roundRect(x0, y, w, bh, r) : g.rect(x0, y, w, bh); g.fill();
        if (cur && e.state === 'pending') { g.lineWidth = 4; g.strokeStyle = ink; g.stroke(); }
        g.globalAlpha = 1;
        g.fillStyle = '#fff';
        g.font = `400 ${Math.min(42, bh * 0.5)}px "Dela Gothic One", sans-serif`;
        g.textBaseline = 'middle';
        const tx = Math.max(x0 + 12, Math.min(hitX + 10, x0 + w - 12 - g.measureText(e.shape).width));
        if (w > 30) g.fillText(e.shape, tx, y + bh / 2);
      }
      // hit line
      g.fillStyle = col('--red') || '#d93a26';
      g.fillRect(hitX - 2, 6, 4, H - 12);
      // waiting overlay
      if (st.waiting) {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#fff'; g.font = `400 ${Math.min(34, W / 14)}px "Dela Gothic One", sans-serif`; g.textAlign = 'center';
        g.fillText(`Play ${st.waiting.shape}`, W / 2, H / 2); g.textAlign = 'left';
      }
      if (st.counting) {
        const left = st.counting - getCtx().currentTime;
        if (left > 0) { const n = Math.ceil(left / (S.spb / clock.rate)); g.fillStyle = ink; g.font = `400 64px "Dela Gothic One", sans-serif`; g.textAlign = 'center'; g.fillText(String(Math.min(S.bpb, n)), W / 2, H / 2); g.textAlign = 'left'; }
      }
      // floating feedback
      const pn = performance.now();
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i], age = (pn - f.t) / 900;
        if (age > 1) { fx.splice(i, 1); continue; }
        g.globalAlpha = 1 - age; g.fillStyle = f.color; g.font = '800 20px "M PLUS Rounded 1c", sans-serif';
        g.fillText(f.text, hitX + 10, by + bh + 50 - age * 30);
        g.globalAlpha = 1;
      }
    }

    function finish() {
      if (st.finished) return;
      st.finished = true; pause();
      const played = ev.filter(e => e.state !== 'skip');
      const total = played.length, hits = played.filter(e => e.state === 'hit').length;
      const per = {};
      played.forEach(e => { per[e.shape] = per[e.shape] || { n: 0, bad: 0 }; per[e.shape].n++; if (e.state !== 'hit') per[e.shape].bad++; per[e.shape].bad += e.tries * 0.5; });
      const weakest = Object.entries(per).filter(([, v]) => v.bad > 0).sort((a, b) => b[1].bad / b[1].n - a[1].bad / a[1].n).slice(0, 3).map(([k]) => k);
      const score = total ? played.reduce((a, e) => a + (e.state === 'hit' ? (e.pts || 50) / 100 : 0), 0) / total : 0;
      const result = { score: Math.min(1, score * (opt.wait ? 1.6 : 1)), hits, total, perfect: st.perfect, maxCombo: st.maxCombo, points: st.pts, weakest };
      if (opts.onFinish) return opts.onFinish(result);
      say(`Done: ${hits} of ${total} chords · best combo ${st.maxCombo}${weakest.length ? ` · practise ${weakest.join(', ')}` : ''}`, 'ok');
    }
    draw(0);
  }
  return cleanup;
}
