// Song Lab: upload any song -> beats, chords, melody -> guitar chord highway + sing-along practice.
import { $, $$, esc, toast as uiToast, modal, resultScreen, fitCanvas, el } from '../core/ui.js';
import { strum, unlock } from '../core/audio.js';
import { shapeFor, transposeChord, pcName, parseChord } from '../core/music.js';
import { chordSVG } from '../core/ui.js';
import { lib, analyzeSong, jobState, subscribe, model, displayChords, capoChoices, regrid, halveGrid, doubleGrid, gridFromTaps, chordSession, singSession, transposedKey, MAX_MINUTES } from './client.js';
import { keyUsesFlats, rootName } from './analysis.js';

function useCss() {
  if (!document.querySelector('link[data-css=songlab]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/songlab.css'; l.dataset.css = 'songlab';
    document.head.append(l);
  }
}
// Guitarists say Bb, Eb, Ab, C#, F# (not A#, D#, G#, Db, Gb) unless the key uses flats.
const nice = (name, flats = false) => { const p = parseChord(name); return p ? rootName(p.root, flats) + p.type : name; };
const fmt = s => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm';

export default {
  run(stage, ctx, parts = []) {
    useCss();
    const [id, mode, sec] = parts;
    if (!id) return library(stage, ctx);
    if (mode === 'guitar' || mode === 'sing') return practice(stage, ctx, id, mode, sec != null && sec !== 'all' ? +sec : null);
    return songView(stage, ctx, id);
  },
};

// ================================================================ library
async function library(stage, ctx) {
  const toast = ctx.toast || uiToast;
  let unsubs = [];
  stage.innerHTML = `<section class="sl-hero">
      <h1>Song Lab</h1>
      <p>Upload any song. The app finds the beat, the chords and the melody. Then you play along on guitar or sing along, with live feedback.</p>
      <label class="btn light big sl-upload">Upload a song<input type="file" id="slfile" accept="${ACCEPT}" hidden></label>
      <p class="small sl-note">MP3, M4A or WAV, up to ${MAX_MINUTES} minutes. Files stay on this device.</p>
    </section>
    <h2>Your songs</h2><div class="sl-list" id="sllist"><p class="muted">Loading…</p></div>
    <h2>Try a demo song</h2><p class="muted small">Original practice tracks made for this app.</p><div class="sl-demos" id="sldemos"></div>`;

  const render = async () => {
    unsubs.forEach(u => u()); unsubs = [];
    const songs = await lib.list();
    const list = $('#sllist', stage); if (!list) return;
    list.innerHTML = songs.length ? songs.map(card).join('') : `<div class="card sl-empty"><p><b>No songs yet.</b> Upload a song you love, or add a demo below.</p></div>`;
    songs.forEach(s => {
      const j = jobState(s.id);
      if (j) unsubs.push(subscribe(s.id, jb => updateProgress(s.id, jb)));
    });
    await renderDemos(songs);
  };
  const card = s => {
    const j = jobState(s.id);
    const info = s.status === 'ready' ? `${fmt(s.duration)} · ${esc(s.key || '')} · ${Math.round(s.bpm || 0)} bpm` : s.status === 'error' ? `<span class="err">${esc(s.error || 'Analysis failed')}</span>` : (j ? esc(j.stage) : 'Waiting for analysis');
    return `<article class="sl-song" data-id="${s.id}">
      <a class="sl-open" ${s.status === 'ready' ? `href="#/songs/${s.id}"` : ''}><b>${esc(s.title)}</b><span class="sl-info">${info}</span>
      ${s.status !== 'ready' && s.status !== 'error' ? `<span class="bar sl-pbar"><b style="width:${Math.round((j?.p || 0) * 100)}%;background:var(--violet)"></b></span>` : ''}</a>
      <div class="sl-acts">${s.status === 'error' || (s.status !== 'ready' && !j) ? `<button class="btn ghost sm" data-act="redo">${s.status === 'error' ? 'Try again' : 'Analyze'}</button>` : ''}
      <button class="btn ghost sm" data-act="menu" aria-label="More options for ${esc(s.title)}">⋯</button></div></article>`;
  };
  const updateProgress = (id, jb) => {
    const c = stage.querySelector(`.sl-song[data-id="${id}"]`); if (!c) return;
    if (jb.p >= 1 || jb.error) { render(); return; }
    const b = $('.sl-pbar b', c); if (b) b.style.width = Math.round(jb.p * 100) + '%';
    const i = $('.sl-info', c); if (i) i.textContent = jb.stage + '…';
  };
  const start = async meta => {
    const p = analyzeSong(meta.id);
    await render();
    try { await p; toast(`“${meta.title}” is ready`); } catch (e) { toast(e.message); }
    render();
  };
  const renderDemos = async songs => {
    const box = $('#sldemos', stage); if (!box) return;
    let demos = [];
    try { demos = await fetch('audio/demo/index.json').then(r => r.json()); } catch (e) { box.innerHTML = '<p class="muted">Demos are not available offline.</p>'; return; }
    box.innerHTML = demos.map(d => {
      const have = songs.find(s => s.demo === d.id);
      return `<div class="sl-demo"><b>${esc(d.title.replace(' (demo)', ''))}</b><span class="muted small">${esc(d.key)} · ${d.bpm} bpm · ${fmt(d.duration)}</span>
        ${have ? `<a class="btn ghost sm" href="#/songs/${have.id}">Open</a>` : `<button class="btn ghost sm" data-demo="${d.id}">Add</button>`}</div>`;
    }).join('');
    $$('[data-demo]', box).forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Adding…';
      const d = demos.find(x => x.id === b.dataset.demo);
      try {
        const blob = await fetch(d.file).then(r => { if (!r.ok) throw new Error('Could not load the demo'); return r.blob(); });
        const meta = await lib.add(blob, d.title.replace(' (demo)', ''), { demo: d.id });
        start(meta);
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Add'; }
    });
  };

  $('#slfile', stage).onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 120 * 1024 * 1024) { toast('That file is too large (over 120 MB).'); return; }
    const meta = await lib.add(f, f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '));
    start(meta);
  };
  stage.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.sl-song').dataset.id, meta = await lib.get(id);
    if (b.dataset.act === 'redo') return start(meta);
    const choice = await modal({ title: meta.title, html: '<p>What do you want to do with this song?</p>', buttons: [{ label: 'Rename', value: 'rename' }, { label: 'Analyze again', value: 'redo' }, { label: 'Delete', value: 'del' }, { label: 'Cancel', value: null, primary: true }] });
    if (choice === 'redo') { if (await confirmText('Analyze again?', 'Your chord edits for this song will be lost.')) start(meta); }
    else if (choice === 'del') { if (await confirmText('Delete this song?', 'It is removed from this device.')) { await lib.remove(id); render(); } }
    else if (choice === 'rename') {
      const name = await promptText('Rename song', meta.title);
      if (name) { meta.title = name; await lib.save(meta); render(); }
    }
  });
  await render();
  return () => unsubs.forEach(u => u());
}

const confirmText = (title, text) => modal({ title, html: `<p>${esc(text)}</p>`, buttons: [{ label: 'Cancel', value: false }, { label: 'Yes', value: true, primary: true }] });
function promptText(title, value) {
  return new Promise(res => {
    const m = el(`<div class="modal-bg"><form class="modal"><h2>${esc(title)}</h2><input type="text" class="sl-input" value="${esc(value)}" maxlength="80" aria-label="Song title"><div class="row" style="margin-top:12px"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Save</button></div></form></div>`);
    document.body.append(m);
    const inp = $('input', m); inp.focus(); inp.select();
    $('[data-x]', m).onclick = () => { m.remove(); res(null); };
    $('form', m).onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); m.remove(); res(v || null); };
  });
}

// ================================================================ song view
async function songView(stage, ctx, id) {
  const toast = ctx.toast || uiToast;
  const known = ctx.settings?.knownChords || [];
  let meta = await lib.get(id);
  if (!meta) { stage.innerHTML = `<div class="card center"><h2>Song not found</h2><a class="btn primary" href="#/songs">All songs</a></div>`; return; }
  if (meta.status !== 'ready') {
    stage.innerHTML = `<a class="sl-back" href="#/songs">‹ All songs</a><div class="card center"><h2>${esc(meta.title)}</h2><p id="slst">${meta.status === 'error' ? esc(meta.error) : 'Analyzing…'}</p><div class="bar"><b id="slpb" style="width:0;background:var(--violet)"></b></div></div>`;
    const off = subscribe(id, j => { const p = $('#slpb', stage); if (p) p.style.width = Math.round(j.p * 100) + '%'; const s = $('#slst', stage); if (s) s.textContent = j.error || j.stage + '…'; if (j.p >= 1) setTimeout(() => songView(stage, ctx, id), 100); });
    if (!jobState(id) && meta.status !== 'error') analyzeSong(id).catch(() => {});
    return off;
  }
  const an = await lib.analysis(id);
  if (!an) { meta.status = 'new'; await lib.save(meta); return songView(stage, ctx, id); }
  const blob = await lib.blob(id);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url); audio.preload = 'auto'; audio.setAttribute('playsinline', '');
  let M = model(meta, an), names = displayChords(meta, M), cleanups = [], raf = 0, curBeat = -1, tapping = null;
  const save = async () => { await lib.save(meta); M = model(meta, an); names = displayChords(meta, M); };

  stage.innerHTML = `<a class="sl-back" href="#/songs">‹ All songs</a>
    <header class="sl-head"><h1>${esc(meta.title)}</h1><div class="sl-chips" id="slchips"></div></header>
    <div class="sl-wave" id="slwave" role="slider" aria-label="Song position" tabindex="0"></div>
    <div class="sl-transport"><button class="btn primary" id="slplay">Play</button><button class="btn ghost sm" id="slback5" aria-label="Back 5 seconds">−5 s</button><span class="sl-time" id="sltime">0:00 / ${fmt(an.duration)}</span></div>
    <section class="card sl-practice"><h2>Practise</h2>
      <label class="field">Part <select id="slsec"><option value="all">Whole song</option>${an.sections.map((s, i) => `<option value="${i}">Part ${esc(s.name)} · ${fmt(s.t0)}–${fmt(s.t1)}</option>`).join('')}</select></label>
      <div class="row"><button class="btn primary big" id="slgtr">Play guitar</button><button class="btn primary big sl-sing" id="slsing">Sing along</button></div>
    </section>
    <section class="card sl-play"><h2>Make it playable</h2><div id="slcapo"></div>
      <div class="sl-opt"><span>Chords</span><div class="seg" id="slsimp"><button data-v="0">As heard</button><button data-v="1">Simple</button></div></div>
      <div class="sl-opt"><span>Key</span><div class="row tight"><button class="btn ghost sm" id="sltd" aria-label="Transpose down">−1</button><b id="slkey"></b><button class="btn ghost sm" id="sltu" aria-label="Transpose up">+1</button></div></div>
      <p class="muted small" id="sltnote"></p></section>
    <h2>Chord chart</h2>
    <p class="muted small">Chords are detected automatically and can be wrong. Tap any chord to fix it. Your fixes are saved.</p>
    <div class="sl-chart" id="slchart"></div>
    <details class="card sl-fix"><summary><b>Fix the beat</b> <span class="muted small">if the chart drifts from the music</span></summary>
      <p class="muted small">Detected tempo: <b id="slbpm"></b> bpm. If the bars feel twice too fast or slow, use ½ or 2×.</p>
      <div class="row"><button class="btn ghost sm" id="slhalf">½ tempo</button><button class="btn ghost sm" id="sldbl">2× tempo</button><button class="btn ghost sm" id="slearly">Beats earlier</button><button class="btn ghost sm" id="sllate">Beats later</button></div>
      <div class="row"><button class="btn ghost sm" id="slbar">Move bar line</button><button class="btn ghost sm" id="sltap">Tap along</button><button class="btn ghost sm" id="slreset">Reset</button></div>
      <div id="sltapbox"></div></details>`;

  // ---- waveform
  const wave = $('#slwave', stage), W = fitCanvas(wave);
  // canvas cannot read light-dark() variables: take the resolved text colour of the element instead
  let inkColor = getComputedStyle(wave).color || '#222';
  const mq = matchMedia('(prefers-color-scheme: dark)'); const onScheme = () => { inkColor = getComputedStyle(wave).color; drawWave(); };
  mq.addEventListener?.('change', onScheme); cleanups.push(() => mq.removeEventListener?.('change', onScheme));
  const secColors = ['#6b5bd6', '#d93a26', '#1f8a70', '#b0650a', '#2f6fd0', '#9c3d9c'];
  const drawWave = () => {
    const { g, w, h } = W, p = meta.peaks || new Float32Array(400), t = audio.currentTime || 0, D = an.duration;
    g.clearRect(0, 0, w, h);
    an.sections.forEach((s, i) => {
      const x0 = s.t0 / D * w, x1 = s.t1 / D * w, c = secColors[(s.name.charCodeAt(0) - 65) % secColors.length];
      g.fillStyle = c + '22'; g.fillRect(x0, 0, x1 - x0, h);
      g.fillStyle = c; g.font = '700 12px "M PLUS Rounded 1c", sans-serif'; g.fillText(s.name, x0 + 4, 14);
    });
    const played = '#6b5bd6';
    const n = p.length, bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * bw, a = Math.max(1, p[i] * (h * 0.38));
      const past = (i + 0.5) / n * D <= t;
      g.fillStyle = past ? played : inkColor; g.globalAlpha = past ? 1 : 0.35;
      g.fillRect(x, h / 2 + 8 - a, Math.max(1, bw - 0.5), 2 * a);
      g.globalAlpha = 1;
    }
    const px = t / D * w; g.fillStyle = '#d93a26'; g.fillRect(px - 1, 0, 2, h);
  };
  const seekAt = ev => { const r = wave.getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(an.duration - 0.1, (ev.clientX - r.left) / r.width * an.duration)); tickUI(true); };
  wave.addEventListener('pointerdown', ev => { seekAt(ev); const mv = e2 => seekAt(e2); wave.addEventListener('pointermove', mv); const up = () => { wave.removeEventListener('pointermove', mv); }; window.addEventListener('pointerup', up, { once: true }); });
  wave.addEventListener('keydown', e => { if (e.key === 'ArrowRight') audio.currentTime += 5; if (e.key === 'ArrowLeft') audio.currentTime -= 5; tickUI(true); });
  const ro = new ResizeObserver(drawWave); ro.observe(wave);
  cleanups.push(() => { ro.disconnect(); W.destroy(); });

  // ---- transport
  const playBtn = $('#slplay', stage);
  playBtn.onclick = async () => { await unlock(); if (audio.paused) { audio.play().catch(err => toast('Could not play: ' + err.message)); } else audio.pause(); };
  audio.onplay = () => { playBtn.textContent = 'Pause'; loop(); };
  audio.onpause = () => { playBtn.textContent = 'Play'; cancelAnimationFrame(raf); tickUI(true); };
  audio.onended = audio.onpause;
  $('#slback5', stage).onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 5); tickUI(true); };
  const loop = () => { tickUI(false); raf = requestAnimationFrame(loop); };
  function beatAt(t) { let lo = 0, hi = M.beats.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (M.beats[m] <= t + 0.03) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  function tickUI(force) {
    const t = audio.currentTime;
    $('#sltime', stage).textContent = `${fmt(t)} / ${fmt(an.duration)}`;
    drawWave();
    const b = beatAt(t);
    if (b !== curBeat || force) {
      const prev = stage.querySelector('.sl-beat.now'); if (prev) prev.classList.remove('now');
      curBeat = b;
      const cell = stage.querySelector(`.sl-beat[data-b="${b}"]`);
      if (cell) { cell.classList.add('now'); if (!audio.paused) { const bar = cell.parentElement, r = bar.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 20) bar.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    }
  }
  cleanups.push(() => { cancelAnimationFrame(raf); audio.pause(); audio.src = ''; URL.revokeObjectURL(url); });

  // ---- info + options
  const renderInfo = () => {
    const key = transposedKey(M.key, meta.transpose || 0);
    $('#slchips', stage).innerHTML = `<span class="pill">${esc(key.name)}</span><span class="pill">${Math.round(M.bpm)} bpm</span><span class="pill">${fmt(an.duration)}</span><span class="pill">${an.sections.length} parts</span>`;
    $('#slkey', stage).textContent = key.name + (meta.transpose ? ` (${meta.transpose > 0 ? '+' : ''}${meta.transpose})` : '');
    $('#sltnote', stage).textContent = meta.transpose ? 'Transposed practice uses a metronome instead of the original recording.' : '';
    $('#slbpm', stage).textContent = M.bpm.toFixed(1);
    $$('#slsimp button', stage).forEach(b => b.classList.toggle('on', +b.dataset.v === (meta.simplify || 0)));
    const opts = capoChoices(meta, M, known);
    const cur = meta.capo != null ? meta.capo : opts[0]?.capo || 0;
    if (!opts.some(o => o.capo === cur)) opts.push({ capo: cur, shapes: [...new Set(names.filter(n => n !== 'N'))].map(n => transposeChord(n, -cur)) });
    $('#slcapo', stage).innerHTML = `<p class="small muted">Capo choices, easiest first. With a capo you play easier shapes and still sound like the record.</p><div class="sl-capos">${opts.map((o, i) => {
      const hard = o.shapes.filter(s => { const sh = shapeFor(s); return !sh || !sh.open; }).length;
      return `<button class="sl-capo ${o.capo === cur ? 'on' : ''}" data-capo="${o.capo}"><b>${o.capo ? 'Capo ' + o.capo : 'No capo'}</b><span>${o.shapes.slice(0, 6).map(x => esc(nice(x))).join(' ')}${o.shapes.length > 6 ? ' …' : ''}</span><small>${hard ? hard + ' barre chord' + (hard > 1 ? 's' : '') : 'All open chords'}${i === 0 && meta.capo == null ? ' · suggested' : ''}</small></button>`;
    }).join('')}</div>`;
  };
  stage.addEventListener('click', async e => {
    const c = e.target.closest('[data-capo]'); if (c) { meta.capo = +c.dataset.capo; await save(); renderInfo(); renderChart(); return; }
    const s = e.target.closest('#slsimp button'); if (s) { meta.simplify = +s.dataset.v; await save(); renderInfo(); renderChart(); return; }
    const bt = e.target.closest('.sl-beat'); if (bt && bt.dataset.b != null) { pickChord(+bt.dataset.b); }
  });
  $('#sltd', stage).onclick = async () => { meta.transpose = Math.max(-6, (meta.transpose || 0) - 1); await save(); renderInfo(); renderChart(); };
  $('#sltu', stage).onclick = async () => { meta.transpose = Math.min(6, (meta.transpose || 0) + 1); await save(); renderInfo(); renderChart(); };

  // ---- chord chart
  const capoNow = () => (meta.capo != null ? meta.capo : capoChoices(meta, M, known)[0]?.capo || 0);
  function renderChart() {
    const capo = capoNow(), n = M.beats.length, start = M.phase > 0 ? M.phase - 4 : 0;
    const secStart = {};
    an.sections.forEach(s => { const b = beatAt(s.t0 + 0.05); secStart[Math.max(0, b)] = s.name; });
    let html = '';
    for (let i = start, bar = 0; i < n; i += 4, bar++) {
      let tag = '';
      for (let j = 0; j < 4; j++) if (secStart[i + j] && i + j >= 0) tag = secStart[i + j];
      html += `<div class="sl-bar">${tag ? `<span class="sl-tag">${esc(tag)}</span>` : ''}`;
      for (let j = 0; j < 4; j++) {
        const b = i + j;
        if (b < 0 || b >= n) { html += '<span class="sl-beat empty"></span>'; continue; }
        const nm = names[b], change = b === 0 || nm !== names[b - 1], edited = meta.edits && meta.edits[b] != null;
        const shape = capo && nm !== 'N' ? nice(transposeChord(nm, -capo, false)) : nm;
        html += `<button class="sl-beat ${change ? 'chg' : ''} ${edited ? 'edited' : ''}" data-b="${b}" aria-label="Beat ${b + 1}: ${esc(nm)}">${change || j === 0 ? `<b>${esc(capo ? shape : nm)}</b>${capo && nm !== 'N' ? `<small>${esc(nm)}</small>` : ''}` : '<i>·</i>'}</button>`;
      }
      html += '</div>';
    }
    $('#slchart', stage).innerHTML = html;
    curBeat = -2; tickUI(true);
  }

  // ---- chord picker
  function pickChord(b) {
    const old = names[b], flats = keyUsesFlats(transposedKey(M.key, meta.transpose || 0));
    const p = parseChord(old) || { root: 0, type: '' };
    let root = old === 'N' ? 0 : p.root, type = old === 'N' ? 'N' : p.type;
    const types = [['', 'Major'], ['m', 'Minor'], ['7', '7'], ['m7', 'm7'], ['maj7', 'maj7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['dim', 'dim'], ['N', 'No chord']];
    const m = el(`<div class="modal-bg"><div class="modal sl-picker" role="dialog" aria-label="Change chord"><h2>Change chord</h2>
      <p class="muted small">Beat ${b + 1} · ${fmt(M.beats[b])} · detected <b>${esc(old)}</b></p>
      <div class="sl-roots">${Array.from({ length: 12 }, (_, r) => `<button data-root="${r}">${rootName(r, flats)}</button>`).join('')}</div>
      <div class="sl-types">${types.map(([t, l]) => `<button data-type="${t}">${l}</button>`).join('')}</div>
      <div class="sl-pick-now"><span id="pkname"></span><button class="btn ghost sm" id="pkhear">Hear it</button><button class="btn ghost sm" id="pksong">Hear song here</button></div>
      <fieldset class="sl-scope"><legend class="small muted">Apply to</legend>
        <label><input type="radio" name="sc" value="run" checked> Until the next chord change</label>
        <label><input type="radio" name="sc" value="beat"> This beat only</label>
        <label><input type="radio" name="sc" value="all"> Every “${esc(old)}” in the song</label></fieldset>
      <div class="row"><button class="btn ghost" id="pkx">Cancel</button><button class="btn primary" id="pkok">Save</button></div></div></div>`);
    document.body.append(m);
    const name = () => (type === 'N' ? 'N' : rootName(root, flats) + type);
    const sync = () => {
      $$('[data-root]', m).forEach(x => x.classList.toggle('on', +x.dataset.root === root && type !== 'N'));
      $$('[data-type]', m).forEach(x => x.classList.toggle('on', x.dataset.type === type));
      $('#pkname', m).innerHTML = `<b>${esc(name())}</b>`;
    };
    sync();
    m.addEventListener('click', ev => {
      const r = ev.target.closest('[data-root]'); if (r) { root = +r.dataset.root; if (type === 'N') type = ''; sync(); }
      const t = ev.target.closest('[data-type]'); if (t) { type = t.dataset.type; sync(); }
    });
    $('#pkhear', m).onclick = async () => { await unlock(); if (type !== 'N') strum(transposeChord(name(), 0)); };
    $('#pksong', m).onclick = async () => { await unlock(); audio.currentTime = Math.max(0, M.beats[b] - 0.2); audio.play(); setTimeout(() => audio.pause(), 2200); };
    $('#pkx', m).onclick = () => m.remove();
    $('#pkok', m).onclick = async () => {
      const scope = $('input[name=sc]:checked', m).value;
      // store in "as heard" space: undo transpose
      const stored = type === 'N' ? 'N' : transposeChord(name(), -(meta.transpose || 0));
      meta.edits = meta.edits || {};
      const idx = [];
      if (scope === 'beat') idx.push(b);
      else if (scope === 'run') { let s = b; while (s > 0 && names[s - 1] === old) s--; let e = b; while (e + 1 < names.length && names[e + 1] === old) e++; for (let i = s; i <= e; i++) idx.push(i); }
      else names.forEach((nm, i) => { if (nm === old) idx.push(i); });
      idx.forEach(i => { meta.edits[i] = stored; });
      m.remove();
      await save(); renderInfo(); renderChart();
      toast(`Changed ${idx.length} beat${idx.length > 1 ? 's' : ''} to ${name()}`);
    };
  }

  // ---- beat grid tools
  const applyGrid = async beats => { regrid(meta, an, beats); await save(); renderInfo(); renderChart(); toast('Beat grid updated. Chords were detected again.'); };
  const confirmGrid = async () => !Object.keys(meta.edits || {}).length || await confirmText('Change the beat grid?', 'Your chord fixes are tied to beats and will be cleared.');
  $('#slhalf', stage).onclick = async () => { if (await confirmGrid()) applyGrid(halveGrid(M.beats.map(b => b - (meta.gridShift || 0)))); };
  $('#sldbl', stage).onclick = async () => { if (await confirmGrid()) applyGrid(doubleGrid(M.beats.map(b => b - (meta.gridShift || 0)))); };
  $('#slearly', stage).onclick = async () => { meta.gridShift = +((meta.gridShift || 0) - 0.02).toFixed(3); await save(); renderChart(); toast(`Beats shifted ${Math.round(meta.gridShift * 1000)} ms`); };
  $('#sllate', stage).onclick = async () => { meta.gridShift = +((meta.gridShift || 0) + 0.02).toFixed(3); await save(); renderChart(); toast(`Beats shifted ${Math.round(meta.gridShift * 1000)} ms`); };
  $('#slbar', stage).onclick = async () => { meta.phase = ((M.phase + 1) % 4); await save(); renderChart(); toast('Bar lines moved by one beat'); };
  $('#slreset', stage).onclick = async () => { if (!(await confirmText('Reset the beat grid?', 'This also clears your chord fixes.'))) return; Object.assign(meta, { grid: null, gridShift: 0, phase: null, edits: {} }); await save(); renderInfo(); renderChart(); };
  $('#sltap', stage).onclick = async () => {
    await unlock();
    const box = $('#sltapbox', stage);
    tapping = [];
    box.innerHTML = `<p class="small">Tap the big button on every beat while the song plays. 8 taps or more.</p><button class="sl-tapbtn" id="tapb">Tap</button><div class="row"><span id="tapn" class="muted small">0 taps</span><button class="btn ghost sm" id="tapcancel">Cancel</button><button class="btn primary sm" id="tapdone" disabled>Use my taps</button></div>`;
    if (audio.paused) audio.play().catch(() => {});
    const lat = ((ctx.settings?.tapLatencyMs) || 0) / 1000;
    $('#tapb', box).addEventListener('pointerdown', ev => { ev.preventDefault(); tapping.push(audio.currentTime - lat); $('#tapn', box).textContent = tapping.length + ' taps'; $('#tapdone', box).disabled = tapping.length < 8; });
    $('#tapcancel', box).onclick = () => { tapping = null; box.innerHTML = ''; };
    $('#tapdone', box).onclick = async () => {
      const g = gridFromTaps(tapping, an.duration); tapping = null; box.innerHTML = '';
      if (!g) { toast('The taps were too uneven. Try again.'); return; }
      if (await confirmGrid()) applyGrid(g);
    };
  };

  // ---- practice
  const go = kind => { audio.pause(); const sec = $('#slsec', stage).value; (ctx.go || (h => { location.hash = h; }))(`#/songs/${id}/${kind}/${sec}`); };
  $('#slgtr', stage).onclick = () => go('guitar');
  $('#slsing', stage).onclick = () => go('sing');
  if (!an.melody.length) { $('#slsing', stage).disabled = true; $('#slsing', stage).title = 'No melody was found in this song'; }

  renderInfo(); renderChart();
  return () => cleanups.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
}

// ================================================================ practice launcher
async function practice(stage, ctx, id, kind, sectionIndex) {
  const meta = await lib.get(id), an = meta && await lib.analysis(id);
  if (!meta || !an) { stage.innerHTML = `<div class="card center"><h2>Song not found</h2><a class="btn primary" href="#/songs">All songs</a></div>`; return; }
  const blob = await lib.blob(id), url = URL.createObjectURL(blob);
  const M = model(meta, an);
  stage.innerHTML = `<a class="sl-back" href="#/songs/${id}">‹ ${esc(meta.title)}</a><div id="slsess"></div>`;
  const box = $('#slsess', stage);
  const sctx = {
    el: box, track: ctx.tracks?.[kind === 'guitar' ? 'gt' : 'sg'] || null, unit: null, settings: ctx.settings || {}, toast: ctx.toast || uiToast, srs: ctx.srs,
    grade() {}, learn() {}, onLeave: ctx.onLeave || (() => {}),
    finish: async (score, info = {}) => {
      await resultScreen(box, { title: meta.title, score, lines: info.lines || [], cta: 'Back to the song' });
      (ctx.go || (h => { location.hash = h; }))(`#/songs/${id}`);
    },
  };
  let cleanup = null;
  try {
    if (kind === 'guitar') {
      const mod = await import('../tracks/guitar/session.js');
      const session = chordSession(meta, an, M, { sectionIndex, audioUrl: url, known: ctx.settings?.knownChords || [] });
      if (!session.chords.length) throw Object.assign(new Error('No chords in this part.'), { soft: true });
      cleanup = await mod.startChordSession(box, session, sctx);
    } else {
      const mod = await import('../tracks/singing/session.js');
      const session = singSession(meta, an, M, { sectionIndex, audioUrl: url });
      if (!session.notes.length) throw Object.assign(new Error('No melody notes were found in this part.'), { soft: true });
      cleanup = await mod.startSingSession(box, session, sctx);
    }
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="card center"><h2>${kind === 'guitar' ? 'Guitar practice' : 'Sing-along'} could not start</h2>
      <p>${e.soft ? esc(e.message) : 'This part of the app is not available right now.'}</p>${e.soft ? '' : `<p class="muted small">${esc(e.message)}</p>`}
      <a class="btn primary" href="#/songs/${id}">Back to the song</a></div>`;
  }
  return () => { try { if (typeof cleanup === 'function') cleanup(); } finally { URL.revokeObjectURL(url); } };
}
