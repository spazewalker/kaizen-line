// App shell: router, today screen, track pages, unit runner, reviews, extras, settings.
import { unlock, soundCheck, state as audioState, onState, tone, strum, arpeggio, pluck, playSeq, playClip, click, getCtx } from './core/audio.js';
import { mic, micLoop } from './core/mic.js';
import { PitchDetector } from './core/pitch.js';
import { OnsetDetector } from './core/onset.js';
import { dbToMag } from './core/chroma.js';
import { noteName } from './core/music.js';
import { store, settings, progress, activity } from './core/store.js';
import { srs } from './core/srs.js';
import { $, $$, esc, toast, modal, bar, stars, resultScreen, el, sleep, micGate } from './core/ui.js';

const app = $('#app');
const TRACK_IDS = ['jp', 'gt', 'sg'];
const TRACK_PATHS = { jp: './tracks/japanese/index.js', gt: './tracks/guitar/index.js', sg: './tracks/singing/index.js' };
const TR = {};
let songlab = null;

async function loadTracks() {
  await Promise.all(TRACK_IDS.map(async id => {
    try { TR[id] = (await import(TRACK_PATHS[id])).default; }
    catch (e) { console.error('track load failed', id, e); TR[id] = { id, name: { jp: 'Japanese', gt: 'Guitar', sg: 'Singing' }[id], color: '#888', units: [], games: {}, extras: [], broken: String(e) }; }
  }));
  try { songlab = (await import('./songlab/index.js')).default; } catch (e) { console.error('songlab load failed', e); }
}

// ---------- screen lifecycle ----------
let cleanups = [];
function cleanup() { cleanups.forEach(f => { try { f(); } catch (e) { console.error(e); } }); cleanups = []; mic.release(true); }
const onLeave = f => { if (typeof f === 'function') cleanups.push(f); };
function frame(html, color) {
  cleanup();
  app.style.setProperty('--trk', color || 'var(--ink)');
  app.innerHTML = html;
  window.scrollTo(0, 0);
}
const topbar = (back = '#/', label = '', right = '') => `<header class="topbar"><a class="btn ghost sm" href="${back}" aria-label="Back">‹ Back</a><span class="crumb">${label}</span>${right || '<span></span>'}</header>`;

// ---------- global play buttons in lesson html ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-clip],[data-tone],[data-seq],[data-strum],[data-arp],[data-pluck]');
  if (!t) return;
  unlock();
  const d = t.dataset;
  t.classList.add('playing'); setTimeout(() => t.classList.remove('playing'), 400);
  if (d.clip) playClip(d.clip, { rate: +(d.rate || settings.get().jaSpeed || 1) });
  else if (d.tone) tone(+d.tone, { dur: +(d.dur || 1.1) });
  else if (d.seq) playSeq(d.seq.split(',').map(Number), { gap: +(d.gap || 0.5) });
  else if (d.strum) strum(d.strum.includes(',') ? d.strum.split(',').map(Number) : d.strum);
  else if (d.arp) arpeggio(d.arp.includes(',') ? d.arp.split(',').map(Number) : d.arp);
  else if (d.pluck) pluck(+d.pluck);
});

// ---------- helpers ----------
const nextUnitIndex = T => T.units.findIndex(u => !progress.stars(u.id));
const fmtMin = s => s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`;
function gameCtx(T, unit, stage, onFinish) {
  const started = performance.now();
  let done = false;
  return {
    el: stage, track: T, unit, settings: settings.get(),
    toast, srs,
    grade: (id, q) => srs.grade(id, typeof q === 'boolean' ? (q ? 2 : 0) : q),
    learn: ids => srs.learn(ids, T.id),
    onLeave,
    finish: (score, info = {}) => {
      if (done) return; done = true;
      const sec = (performance.now() - started) / 1000;
      activity.log({ xp: Math.round(10 + 20 * (score || 0)), seconds: sec, track: T.id });
      onFinish(Math.max(0, Math.min(1, score || 0)), info);
    },
  };
}

// ---------- screens ----------
function today() {
  const A = activity.get(), S = settings.get();
  const mins = Math.round(A.today.sec / 60);
  const cards = TRACK_IDS.map(id => {
    const T = TR[id]; if (!T || !T.units) return '';
    const ni = nextUnitIndex(T), due = srs.dueCount(id), done = T.units.filter(u => progress.stars(u.id)).length;
    const next = T.units[ni];
    return `<section class="tcard" style="--trk:${T.color}">
      <a class="tcard-head" href="#/t/${id}"><span class="tname">${esc(T.name)}</span><span class="muted">${done} / ${T.units.length} stations</span></a>
      ${bar(T.units.length ? done / T.units.length : 0)}
      <div class="tcard-actions">
        ${due ? `<a class="btn primary" href="#/r/${id}">Review ${due} due</a>` : `<span class="muted small">No reviews due</span>`}
        ${next ? `<a class="btn ${due ? 'ghost' : 'primary'}" href="#/u/${id}/${next.id}">${esc(next.title)} ›</a>` : '<span class="muted small">Line complete</span>'}
      </div>${T.broken ? `<p class="err small">Track failed to load.</p>` : ''}</section>`;
  }).join('');
  const tools = [
    ['gt', 'tuner', 'Tuner', 'Tune your guitar by ear and mic'],
    ['sg', 'range', 'Vocal range', 'Find your comfortable notes'],
    ['jp', 'chart', 'Kana chart', 'Every sound, tap to hear'],
  ].filter(([t, x]) => TR[t]?.extras?.some(e => e.id === x));
  frame(`<header class="apphead"><div><h1>Kaizen Line</h1><p class="muted">${greeting()}</p></div>
    <a class="btn ghost sm" href="#/settings" aria-label="Settings">Settings</a></header>
    <section class="hero-today">
      <div class="stat"><b>${A.streak}</b><span>day streak</span></div>
      <div class="stat"><b>${mins}</b><span>of ${S.dailyGoalMin} min today</span></div>
      <div class="stat"><b>${srs.stats().total}</b><span>things learned</span></div>
      ${audioState() !== 'running' ? `<button class="btn light" id="snd">Tap to enable sound</button>` : ''}
    </section>
    <h2>Today</h2><div class="tcards">${cards}</div>
    ${songlab ? `<a class="songlab-card" href="#/songs"><b>Song Lab</b><span>Upload any song. Get a guitar chord lane and a sing-along trainer.</span></a>` : ''}
    <h2>Tools</h2><div class="tools">${tools.map(([t, x, n, d]) => `<a class="tool" href="#/x/${t}/${x}" style="--trk:${TR[t].color}"><b>${n}</b><span>${d}</span></a>`).join('')}</div>`);
  const s = $('#snd'); if (s) s.onclick = async () => { await soundCheck(); s.remove(); };
}
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Late practice. Respect.' : h < 12 ? 'Good morning. Small steps, every day.' : h < 18 ? 'Good afternoon. Ready for a station?' : 'Good evening. A few minutes counts.'; }

function trackPage(id) {
  const T = TR[id]; if (!T) return notFound();
  const ni = nextUnitIndex(T), due = srs.dueCount(id), st = srs.stats(id);
  frame(`${topbar('#/', esc(T.name))}
    <section class="hero" style="background:${T.color}">${T.art || ''}<div class="hero-txt">
      <span class="small">${ni < 0 ? 'Line complete' : `Next station · ${ni + 1} of ${T.units.length}`}</span>
      <h1>${ni < 0 ? 'All stamped!' : esc(T.units[ni].title)}</h1><span class="small">${ni < 0 ? 'Replay stations for 3 stars.' : esc(T.units[ni].sub || '')}</span></div>
      ${ni >= 0 ? `<a class="btn light big" href="#/u/${id}/${T.units[ni].id}">${ni ? 'Continue' : 'Start'}${T.units[ni].minutes ? ` · ~${T.units[ni].minutes} min` : ''}</a>` : ''}</section>
    <div class="row wrap">${due ? `<a class="btn primary" href="#/r/${id}">Review ${due} due</a>` : ''}<span class="muted small">${st.total} learned · ${st.mature} strong</span></div>
    ${T.extras?.length ? `<h2>Practice tools</h2><div class="tools">${T.extras.map(x => `<a class="tool" href="#/x/${id}/${x.id}"><b>${esc(x.title)}</b><span>${esc(x.sub || '')}</span></a>`).join('')}</div>` : ''}
    <h2>Stations</h2><ol class="stations">${T.units.map((u, i) => {
      const s = progress.stars(u.id), lock = ni >= 0 && i > ni;
      return `<li class="stn ${lock ? 'locked' : ''} ${i === ni ? 'next' : ''}">
        <a ${lock ? 'aria-disabled="true"' : `href="#/u/${id}/${u.id}"`}><span class="dot ${s ? 'done' : ''}">${s ? '✓' : i + 1}</span>
        <span class="stn-t"><b>${esc(u.title)}</b><small>${esc(u.sub || '')}</small></span>${s ? stars(s) : i === ni ? '<span class="pill">Next</span>' : ''}</a>
        ${s ? `<div class="stn-steps">${u.steps.map((st, k) => `<a class="chip" href="#/u/${id}/${u.id}/${k}">${st.type === 'lesson' ? 'Lesson' : esc(T.games[st.game]?.name || st.game)}</a>`).join('')}</div>` : ''}</li>`;
    }).join('')}</ol>`, T.color);
}

async function runUnit(id, unitId, onlyStep) {
  const T = TR[id], unit = T?.units.find(u => u.id === unitId);
  if (!unit) return notFound();
  const steps = onlyStep != null ? [unit.steps[onlyStep]] : unit.steps;
  frame(`${topbar(`#/t/${id}`, esc(unit.title), '<span class="pill" id="stepl"></span>')}<div id="stage"></div>`, T.color);
  const stage = $('#stage'), scores = [];
  const token = {}; runUnit.token = token;
  const alive = () => runUnit.token === token && document.body.contains(stage);
  for (let i = 0; i < steps.length; i++) {
    if (!alive()) return;
    const st = steps[i];
    $('#stepl').textContent = onlyStep != null ? (st.type === 'lesson' ? 'Lesson' : 'Game') : `${i + 1} / ${steps.length}`;
    if (st.type === 'lesson') {
      await runLesson(stage, T, unit, st);
      if (unit.learns && onlyStep == null) srs.learn(unit.learns, T.id);
    } else {
      const G = T.games[st.game];
      if (!G) { stage.innerHTML = `<p class="err">Missing game ${esc(st.game)}</p>`; return; }
      const score = await runGame(stage, T, unit, G, st.args || {}, st.title);
      if (score == null) return;
      scores.push(score);
    }
  }
  if (!alive()) return;
  if (onlyStep != null) { location.hash = `#/t/${id}`; return; }
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
  const s = avg >= 0.85 ? 3 : avg >= 0.6 ? 2 : 1;
  progress.complete(unit.id, s, avg);
  if (unit.learns) srs.learn(unit.learns, T.id);
  if (unit.onComplete) try { unit.onComplete({ settings }); } catch (e) { console.error(e); }
  const ti = unit.title.length > 16 ? 13 : unit.title.length > 11 ? 16 : 19;
  stage.innerHTML = `<div class="card center"><svg class="stamp" viewBox="0 0 170 170" aria-hidden="true"><g transform="rotate(-8 85 85)" fill="none" stroke="${T.color}"><circle cx="85" cy="85" r="76" stroke-width="7"/><circle cx="85" cy="85" r="63" stroke-width="2"/></g><text x="85" y="82" text-anchor="middle" fill="${T.color}" class="stampt" font-size="${ti}" transform="rotate(-8 85 85)">${esc(unit.title)}</text><text x="85" y="106" text-anchor="middle" fill="${T.color}" font-size="13" font-weight="800" transform="rotate(-8 85 85)">${new Date().toLocaleDateString()}</text></svg>
    <h2>Station stamped!</h2>${stars(s)}<p>Average ${Math.round(avg * 100)}%.${s < 3 ? ' Replay the games from the station list for 3 stars.' : ''}</p>
    ${unit.learns?.length ? `<p class="muted">${unit.learns.length} new items go into your daily reviews.</p>` : ''}
    <a class="btn primary big" href="#/t/${id}">Back to the line</a></div>`;
}

function runLesson(stage, T, unit, step) {
  return new Promise(res => {
    let i = 0, cl = null;
    const show = () => {
      if (cl) { try { cl(); } catch (e) { console.error(e); } cl = null; }
      const c = step.cards[i], last = i === step.cards.length - 1;
      stage.innerHTML = `<article class="lesson card"><div class="dots">${step.cards.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
        <h2>${esc(c.title)}</h2><div class="lbody">${c.html || ''}</div>${c.tip ? `<p class="tip">${c.tip}</p>` : ''}</article>
        <div class="row navrow">${i ? '<button class="btn ghost" data-p>Back</button>' : ''}<button class="btn primary big" data-n ${c.requireDone ? 'disabled' : ''}>${last ? 'Start practice' : 'Next'}</button></div>`;
      const next = $('[data-n]', stage);
      if (c.mount) {
        const ctx = { done: () => { next.disabled = false; next.classList.add('pulse'); }, track: T, unit, settings: settings.get(), toast, srs, onLeave };
        try { cl = c.mount($('.lbody', stage), ctx); } catch (e) { console.error(e); }
      }
      next.onclick = () => { if (last) { if (cl) cl(); res(); } else { i++; show(); } };
      const p = $('[data-p]', stage); if (p) p.onclick = () => { i--; show(); };
    };
    onLeave(() => { if (cl) cl(); });
    show();
  });
}

function runGame(stage, T, unit, G, args, title) {
  return new Promise(res => {
    stage.innerHTML = `<div class="gamehead"><h2>${esc(title || G.name)}</h2><p class="muted">${G.how || ''}</p></div><div class="gstage" id="gstage"></div>`;
    const gs = $('#gstage', stage);
    let cl = null;
    const ctx = gameCtx(T, unit, gs, async (score, info) => {
      if (cl) { try { cl(); } catch (e) { console.error(e); } cl = null; }
      mic.release(true);
      await resultScreen(stage, { title: title || G.name, score, lines: info.lines || [], cta: 'Continue' });
      res(score);
    });
    onLeave(() => { if (cl) try { cl(); } catch (e) { /* ignore */ } });
    try { const r = G.run(gs, args, ctx); if (r && r.then) r.then(f => { cl = f; }); else cl = r; }
    catch (e) { console.error(e); gs.innerHTML = `<p class="err">Game error: ${esc(e.message)}</p>`; }
  });
}

async function review(id) {
  const T = TR[id]; if (!T?.review) return notFound();
  frame(`${topbar(`#/t/${id}`, `${esc(T.name)} · Review`)}<div id="stage"></div>`, T.color);
  const stage = $('#stage');
  const ids = srs.due(id, T.review.batch || 20);
  if (!ids.length) { stage.innerHTML = `<div class="card center"><h2>All caught up</h2><p>No reviews due. Come back tomorrow, or learn a new station.</p><a class="btn primary" href="#/t/${id}">Back</a></div>`; return; }
  const ctx = gameCtx(T, null, stage, async (score) => {
    await resultScreen(stage, { title: 'Review done', score, lines: [`${srs.dueCount(id)} still due.`], cta: 'Back to the line' });
    location.hash = `#/t/${id}`;
  });
  const cl = T.review.run(stage, ids, ctx); onLeave(cl);
}

async function extra(id, xid) {
  const T = TR[id], X = T?.extras?.find(x => x.id === xid);
  if (!X) return notFound();
  frame(`${topbar(`#/t/${id}`, `${esc(T.name)} · ${esc(X.title)}`)}<div id="stage"></div>`, T.color);
  const stage = $('#stage');
  const ctx = gameCtx(T, null, stage, () => { location.hash = `#/t/${id}`; });
  try { const r = X.run(stage, ctx); if (r && r.then) r.then(onLeave); else onLeave(r); }
  catch (e) { console.error(e); stage.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function songs(rest) {
  if (!songlab) return notFound();
  frame(`${topbar('#/', 'Song Lab')}<div id="stage"></div>`, '#3a2f6b');
  const stage = $('#stage');
  const ctx = { toast, settings: settings.get(), onLeave, srs, tracks: TR, go: h => { location.hash = h; } };
  try { const r = songlab.run(stage, ctx, rest); if (r && r.then) r.then(onLeave); else onLeave(r); }
  catch (e) { console.error(e); stage.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function settingsPage() {
  const S = settings.get();
  frame(`${topbar('#/', 'Settings')}
  <section class="card"><h2>Sound</h2><p>Audio engine: <b id="ast">${audioState()}</b></p>
    <p class="muted">On iPad and iPhone, sound plays even with the silent switch on. If you still hear nothing, turn the volume up and tap the button again.</p>
    <div class="row"><button class="btn primary" id="sc">Play test notes</button><button class="btn ghost" id="sg">Test guitar</button><button class="btn ghost" id="sj">Test Japanese voice</button></div></section>
  <section class="card"><h2>Microphone</h2><p class="muted">Guitar and singing games listen to you. Test it here: play or sing a note.</p>
    <div id="micbox"><button class="btn primary" id="mt">Test microphone</button></div></section>
  <section class="card"><h2>Timing calibration</h2><p class="muted">Bluetooth headphones and some speakers add delay. Calibrate once per setup so rhythm games judge you fairly. Use the speaker you practise with, and stay quiet.</p>
    <p>Current offset: <b id="lat">${S.latencyMs} ms</b></p><div class="row"><button class="btn primary" id="cal">Auto-calibrate (speaker + mic)</button><button class="btn ghost" id="cal0">Reset to 0</button></div><p id="calmsg" class="muted"></p></section>
  <section class="card"><h2>Preferences</h2>
    <label class="tog"><input type="checkbox" id="lh" ${S.leftHanded ? 'checked' : ''}> Left-handed guitar views</label>
    <label class="tog"><input type="checkbox" id="rom" ${S.showRomaji ? 'checked' : ''}> Show romaji under Japanese</label>
    <label class="field">Daily goal (minutes) <input type="number" id="goal" min="5" max="120" value="${S.dailyGoalMin}"></label>
    <p class="muted">Vocal range: ${noteName(S.vocalLow)} to ${noteName(S.vocalHigh)}. Change it with the Vocal range tool.</p></section>
  <section class="card"><h2>Backup</h2><p class="muted">Progress lives in this browser. Save a backup file before you switch devices or clear browser data.</p>
    <div class="row"><button class="btn ghost" id="exp">Download backup</button><label class="btn ghost">Restore backup<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    <button class="btn danger" id="reset">Reset all progress</button></section>`);
  const off = onState(s => { const a = $('#ast'); if (a) a.textContent = s; }); onLeave(off);
  $('#sc').onclick = async () => { await soundCheck(); $('#ast').textContent = audioState(); };
  $('#sg').onclick = async () => { await unlock(); strum('G'); setTimeout(() => strum('C'), 900); setTimeout(() => strum('D'), 1800); };
  $('#sj').onclick = async () => { await unlock(); const r = await fetch('audio/ja/index.json').then(r => r.ok ? r.json() : null).catch(() => null); const f = r && (r['こんにちは'] || Object.values(r)[0]); f ? playClip('audio/ja/' + f) : toast('Japanese audio is not installed yet.'); };
  $('#mt').onclick = () => micTest($('#micbox'));
  $('#cal').onclick = () => calibrate();
  $('#cal0').onclick = () => { settings.set({ latencyMs: 0 }); $('#lat').textContent = '0 ms'; };
  $('#lh').onchange = e => settings.set({ leftHanded: e.target.checked });
  $('#rom').onchange = e => settings.set({ showRomaji: e.target.checked });
  $('#goal').onchange = e => settings.set({ dailyGoalMin: Math.max(5, +e.target.value || 15) });
  $('#exp').onclick = () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `kaizen-line-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp').onchange = async e => { try { store.importAll(await e.target.files[0].text()); toast('Backup restored'); route(); } catch (err) { toast(err.message); } };
  $('#reset').onclick = async () => { if (await modal({ title: 'Reset everything?', html: '<p>This deletes all progress, reviews and settings on this device. It cannot be undone.</p>', buttons: [{ label: 'Cancel', value: false }, { label: 'Delete all', value: true, primary: true }] })) { localStorage.clear(); toast('Progress reset'); route(); } };
}

async function micTest(box) {
  box.innerHTML = '<div id="mg"></div>';
  if (!(await micGate($('#mg'), { why: 'Play a guitar string or sing a note. You should see the level and the note.' }))) return;
  $('#mg').innerHTML = `<div class="meter"><b id="lv"></b></div><p class="bignote" id="nt">–</p><button class="btn ghost" id="mstop">Stop</button>`;
  const pd = new PitchDetector(4096, mic.sampleRate);
  const stop = micLoop(m => {
    const b = m.time(), r = pd.detect(b, { minF: 60, maxF: 1100 });
    $('#lv').style.width = Math.min(100, r.rms * 400) + '%';
    if (r.freq) $('#nt').textContent = `${noteName(r.midi)}  ·  ${r.freq.toFixed(1)} Hz`;
  });
  onLeave(stop);
  $('#mstop').onclick = () => { stop(); mic.release(true); box.innerHTML = '<button class="btn primary" id="mt">Test microphone</button>'; $('#mt').onclick = () => micTest(box); };
}

async function calibrate() {
  const msg = $('#calmsg');
  try { await mic.acquire({ fftSize: 1024 }); } catch (e) { msg.textContent = e.message; return; }
  msg.textContent = 'Listening… 8 clicks. Keep quiet.';
  const c = getCtx(), od = new OnsetDetector({ sensitivity: 1.4, minGap: 0.25 });
  const t0 = c.currentTime + 0.6, gap = 0.6, N = 8, clicks = [];
  for (let i = 0; i < N; i++) { const t = t0 + i * gap; clicks.push(t); click(t, true); click(t + 0.004, true); }
  const hits = [];
  const mag = new Float32Array(512);
  const stop = micLoop((m, t) => { dbToMag(m.spectrumDb(), mag); const o = od.push(mag, t); if (o && t > t0 - 0.05) hits.push(o); });
  await sleep((N * gap + 1.2) * 1000);
  stop(); mic.release(true);
  const d = clicks.map(ct => { const h = hits.find(x => x >= ct - 0.02 && x < ct + 0.4); return h ? h - ct : null; }).filter(x => x != null);
  if (d.length < 4) { msg.textContent = `Only heard ${d.length} of ${N} clicks. Turn the volume up, move closer, and try again.`; return; }
  d.sort((a, b) => a - b);
  // analyser frames arrive ~1 frame late; subtract half a frame of the rAF period
  const ms = Math.max(0, Math.round(d[d.length >> 1] * 1000 - 8));
  settings.set({ latencyMs: ms });
  $('#lat').textContent = ms + ' ms';
  msg.textContent = `Heard ${d.length} of ${N} clicks. Offset set to ${ms} ms.`;
}

function notFound() { frame(`${topbar()}<div class="card center"><h2>Not found</h2><a class="btn primary" href="#/">Home</a></div>`); }

// ---------- router ----------
function route() {
  const parts = (location.hash || '#/').slice(2).split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (!a) return today();
  if (a === 't') return trackPage(b);
  if (a === 'u') return runUnit(b, c, d != null ? +d : null);
  if (a === 'r') return review(b);
  if (a === 'x') return extra(b, c);
  if (a === 'songs') return songs(parts.slice(1));
  if (a === 'settings') return settingsPage();
  notFound();
}
window.addEventListener('hashchange', route);

(async () => {
  app.innerHTML = '<p class="muted center pad">Loading…</p>';
  await loadTracks();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

// expose for debugging / tests
window.__kz = { TR, srs, settings, progress, route };
