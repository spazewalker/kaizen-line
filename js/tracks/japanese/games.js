// Japanese games. Every game: run(stage, args, ctx) -> cleanup
import { ITEMS, kanaId } from './data/items.js';
import { KANA_BY, morae, toHira } from './data/kana.js';
import { SCENARIOS } from './data/scenarios.js';
import { NUMBERS, PRICES_ITEMS, TIME_ITEMS, fmtYen, fmtTime } from './data/numbers.js';
import { VOCAB } from './data/vocab.js';
import { speak, sfx, preload, hasClip } from './audio.js';
import { items, buildPool, questionOrder, distractors, mcRound, buildRound, quality, jpHtml, showRo, tilesFor, speakerBtn } from './engine.js';
import { mic } from '../../core/mic.js';
import { esc, shuffle, pick, rnd, sleep, clamp } from '../../core/ui.js';

const hud = (i, n, extra = '') => `<span>${i + 1} / ${n}</span><span>${extra}</span>`;
const alive = st => st.isConnected;
function makeRun(fn) { return (stage, args, ctx) => { const s = { dead: false }; fn(stage, args, ctx, s).catch(e => { if (!s.dead) { console.error(e); stage.innerHTML = `<p class="err">${esc(e.message)}</p>`; } }); return () => { s.dead = true; }; }; }

// ---------- 1. Listen & pick ----------
async function listenGame(stage, a, ctx, s) {
  const kinds = a.kinds || ['word', 'phr'];
  let pool = buildPool(a.ids || [], { kinds, interleave: a.interleave ?? 0.3 });
  if (pool.length < 4) pool = [...pool, ...shuffle(Object.values(ITEMS).filter(x => x.kind === 'phr')).slice(0, 12)];
  const qs = questionOrder(pool, a.n || 10);
  preload(qs.map(x => x.jp));
  let right = 0, streak = 0, best = 0;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i], toJp = it.kind === 'kana' || a.prompt === 'jp';
    const key = toJp ? 'jp' : 'en';
    const opts = shuffle([it, ...distractors(it, pool, 3, key)]);
    const r = await mcRound(stage, {
      hud: hud(i, qs.length, streak >= 3 ? `Streak ${streak}` : ''),
      prompt: `<p class="muted">Listen. ${toJp ? 'Which one did you hear?' : 'What does it mean?'}</p>`,
      audio: it.jp,
      options: opts.map(o => ({ v: o.id, html: toJp ? `<span class="jp jp-opt" lang="ja">${esc(o.jp)}</span>` : esc(o.en) })),
      answer: it.id, cols: toJp ? 4 : 2, big: toJp,
      explain: `<span lang="ja">${esc(it.jp)}</span> = ${esc(it.en)}`,
    });
    if (s.dead) return;
    ctx.grade(it.id, quality(r.ok, r.ms));
    if (r.ok) { right++; streak++; best = Math.max(best, streak); if (streak % 5 === 0) sfx.combo(streak); } else streak = 0;
  }
  ctx.finish(right / qs.length, { lines: [`Best streak: ${best}`] });
}

// ---------- 2. Speed read ----------
async function readGame(stage, a, ctx, s) {
  const pool = buildPool(a.ids || [], { kinds: a.kinds || ['kana', 'word'], interleave: a.interleave ?? 0.3 });
  const qs = questionOrder(pool, a.n || 12);
  let right = 0, streak = 0, time = 9000;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i], key = it.kind === 'kana' ? 'ro' : 'en';
    const opts = shuffle([it, ...distractors(it, pool, 3, key)]);
    const r = await mcRound(stage, {
      hud: hud(i, qs.length, `${Math.round(time / 1000)} s`),
      prompt: `<p class="muted">Read it. Be fast!</p><div class="bigglyph ${it.jp.length > 4 ? 'jp-long' : ''}" lang="ja">${esc(it.jp)}</div>`,
      options: opts.map(o => ({ v: o.id, html: esc(o[key]) })), answer: it.id, after: it.jp, time,
      explain: `${esc(it.jp)} = ${esc(it.ro)}${it.kind !== 'kana' ? ' · ' + esc(it.en) : ''}`,
    });
    if (s.dead) return;
    ctx.grade(it.id, quality(r.ok, r.ms, 2500));
    if (r.ok) { right++; streak++; time = Math.max(4000, time - 600); } else { streak = 0; time = Math.min(10000, time + 1500); }
  }
  ctx.finish(right / qs.length);
}

// ---------- 3. Kana rain ----------
async function rainGame(stage, a, ctx, s) {
  const pool = (a.kana || []).map(k => KANA_BY[k]).filter(Boolean);
  const learned = ctx.srs.learned('jp', 'jp:kana:').map(id => KANA_BY[id.slice(8)]).filter(x => x && !pool.includes(x) && (!a.script || x.script === a.script));
  const P = [...pool, ...shuffle(learned).slice(0, Math.round(pool.length * 0.4))];
  const goal = a.goal || 15;
  stage.innerHTML = `<div class="jp-field" id="fld"><div class="hud jp-rainhud"><span id="rc">0 / ${goal}</span><span id="cb"></span><span id="rl">♥♥♥</span></div><div class="jp-ground"></div></div><div class="opts four" id="ro"></div>`;
  const Q = x => stage.querySelector(x), fld = Q('#fld'), ro = Q('#ro');
  const roms = [...new Set(P.map(p => p.r))];
  let drops = [], caught = 0, miss = 0, lives = 3, last = 0, spawnT = 0.3, target = null, raf = 0, over = false, speed = 30, combo = 0, score = 0;
  const firstTry = new Map();
  const spawn = () => { const k = pick(P), el = document.createElement('div'); el.className = 'jp-drop'; el.lang = 'ja'; el.textContent = k.k; el.style.left = (8 + Math.random() * Math.max(10, fld.clientWidth - 76)) + 'px'; fld.appendChild(el); drops.push({ k, el, y: -64 }); };
  const setOpts = () => {
    const low = drops.reduce((m, d) => (!m || d.y > m.y ? d : m), null);
    if (low === target) return; target = low;
    if (!low) { ro.innerHTML = ''; return; }
    const o = shuffle([low.k.r, ...shuffle(roms.filter(r => r !== low.k.r)).slice(0, 3)]);
    ro.innerHTML = o.map(r => `<button class="opt" data-r="${r}">${r}</button>`).join('');
  };
  const hearts = () => { Q('#rl').textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(3 - Math.max(0, lives)); };
  const floatTxt = (d, txt, cls) => { const f = document.createElement('div'); f.className = 'jp-float ' + cls; f.textContent = txt; f.style.left = d.el.style.left; f.style.top = Math.max(30, d.y) + 'px'; fld.appendChild(f); setTimeout(() => f.remove(), 900); };
  const end = () => {
    if (over) return; over = true; cancelAnimationFrame(raf);
    firstTry.forEach((ok, k) => ctx.grade(kanaId(k), ok ? 2 : 0));
    setTimeout(() => ctx.finish(caught / Math.max(1, caught + miss), { lines: [`Score ${score}`] }), 600);
  };
  ro.onclick = e => {
    const b = e.target.closest('.opt'); if (!b || !target || over) return;
    const d = target;
    if (b.dataset.r === d.k.r) {
      speak(d.k.k); if (!firstTry.has(d.k.k)) firstTry.set(d.k.k, true);
      combo++; const pts = 10 * (combo >= 10 ? 3 : combo >= 5 ? 2 : 1); score += pts;
      floatTxt(d, `+${pts}`, 'ok'); if (combo % 5 === 0) sfx.combo(combo);
      d.el.classList.add('pop'); setTimeout(() => d.el.remove(), 250);
      drops = drops.filter(x => x !== d); target = null; caught++; speed += 2.5;
      Q('#rc').textContent = `${caught} / ${goal}`; Q('#cb').textContent = combo >= 5 ? `Combo x${combo >= 10 ? 3 : 2}` : '';
      if (caught >= goal) { sfx.win(); return end(); }
      setOpts();
    } else {
      firstTry.set(d.k.k, false); combo = 0; Q('#cb').textContent = ''; miss++;
      b.classList.add('wrong'); sfx.wrong(); fld.classList.remove('shake'); void fld.offsetWidth; fld.classList.add('shake');
    }
  };
  const loop = t => {
    if (over || s.dead) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = Math.max(1.1, 2.7 - caught * 0.1); }
    const H = fld.clientHeight - 74;
    for (const d of drops.slice()) {
      d.y += speed * dt; d.el.style.transform = `translateY(${d.y}px)`;
      if (d.y > H) {
        lives--; miss++; combo = 0; firstTry.set(d.k.k, false);
        floatTxt(d, `${d.k.k} = ${d.k.r}`, 'err'); speak(d.k.k);
        d.el.remove(); drops = drops.filter(x => x !== d); if (target === d) target = null; hearts();
        if (lives <= 0) return end();
      }
    }
    setOpts(); raf = requestAnimationFrame(loop);
  };
  preload(P.map(p => p.k));
  raf = requestAnimationFrame(loop);
  await new Promise(r => { const iv = setInterval(() => { if (over || s.dead) { clearInterval(iv); cancelAnimationFrame(raf); over = true; r(); } }, 200); });
}

// ---------- 4. Memory match with audio ----------
async function memoryGame(stage, a, ctx, s) {
  const pool = buildPool(a.ids || [], { kinds: a.kinds || ['kana', 'word', 'phr'], interleave: 0.15 });
  const pairs = shuffle(pool).filter((x, i, arr) => arr.findIndex(y => y.jp === x.jp) === i).slice(0, a.pairs || 6);
  const face = it => (it.kind === 'kana' ? it.ro : (a.face === 'ro' ? it.ro : it.en));
  let cards = [];
  pairs.forEach((p, i) => { cards.push({ i, t: p.jp, jp: true, it: p }, { i, t: face(p), jp: false, it: p }); });
  cards = shuffle(cards);
  let open = [], got = 0, moves = 0, lock = false;
  const missed = new Set();
  stage.innerHTML = `<div class="hud"><span id="mv">Moves: 0</span><span>${pairs.length} pairs</span></div><div class="jp-mem">${cards.map((c, j) => `<button class="jp-mc ${c.jp ? 'isjp' : ''} ${c.t.length <= 2 ? 'k' : c.t.length > 9 ? 'long' : ''}" data-j="${j}" aria-label="hidden card"><span ${c.jp ? 'lang="ja"' : ''}>${esc(c.t)}</span></button>`).join('')}</div>`;
  preload(pairs.map(p => p.jp));
  await new Promise(res => {
    stage.querySelector('.jp-mem').onclick = e => {
      const b = e.target.closest('.jp-mc'); if (!b || lock || b.classList.contains('up')) return;
      const c = cards[+b.dataset.j]; b.classList.add('up'); b.setAttribute('aria-label', c.t);
      if (c.jp) speak(c.it.jp);
      open.push([b, c]);
      if (open.length < 2) return;
      moves++; stage.querySelector('#mv').textContent = 'Moves: ' + moves;
      const [[b1, c1], [b2, c2]] = open; open = [];
      if (c1.i === c2.i) {
        b1.classList.add('got'); b2.classList.add('got'); sfx.right(); speak(c1.it.jp);
        if (++got === pairs.length) setTimeout(res, 900);
      } else {
        missed.add(c1.it.id); missed.add(c2.it.id);
        lock = true; setTimeout(() => { b1.classList.remove('up'); b2.classList.remove('up'); lock = false; }, 1000);
      }
    };
  });
  if (s.dead) return;
  pairs.forEach(p => ctx.grade(p.id, missed.has(p.id) ? 1 : 2));
  ctx.finish(Math.min(1, pairs.length * 1.5 / moves), { lines: [`${moves} moves for ${pairs.length} pairs`] });
}

// ---------- 5. Sound dictation ----------
async function dictationGame(stage, a, ctx, s) {
  const pool = buildPool(a.ids || [], { kinds: ['word', 'kana'], interleave: 0.25 }).filter(x => morae(x.jp).length <= 7 && hasClip(x.jp));
  const qs = questionOrder(pool, a.n || 8);
  let pts = 0;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i];
    const { answer, tiles } = tilesFor(it.jp, Math.min(4, 2 + Math.floor(i / 3)));
    const r = await buildRound(stage, { hud: hud(i, qs.length), prompt: `<p class="muted">Listen and build the word.</p>${it.kind !== 'kana' ? `<p class="jp-hint">${esc(it.en)}</p>` : ''}`, audio: it.jp, answer, tiles, joiner: '' });
    if (s.dead) return;
    ctx.grade(it.id, r.ok ? quality(true, r.ms, 6000) : r.half ? 1 : 0);
    pts += r.ok ? 1 : r.half ? 0.5 : 0;
  }
  ctx.finish(pts / qs.length);
}

// ---------- 6. Numbers, prices, times ----------
const SETS = {
  num10: () => NUMBERS.filter(x => x.n <= 10), num100: () => NUMBERS.filter(x => x.n <= 100), numbig: () => NUMBERS,
  price: () => PRICES_ITEMS.filter(x => x.n < 1000), pricebig: () => PRICES_ITEMS, time: () => TIME_ITEMS,
};
function confusable(it) {
  if (it.kind === 'time') {
    const c = new Set();
    const sw = { 4: 7, 7: 4, 9: 1, 1: 9, 2: 12, 12: 2 };
    c.add(fmtTime(sw[it.h] || (it.h % 12) + 1, it.m)); c.add(fmtTime(it.h, it.m === 30 ? 0 : 30)); c.add(fmtTime(it.h === 12 ? 11 : it.h + 1, it.m)); c.add(fmtTime(it.h, it.m === 15 ? 45 : 15));
    c.delete(it.shown); return [...c];
  }
  const n = it.n, out = new Set(), s = String(n);
  if (s.length > 1 && !s.endsWith('0')) out.add(+s.split('').reverse().join(''));
  else if (s.length >= 3) out.add(+(s[1] + s[0] + s.slice(2)));
  [4, 7].forEach((d, i, arr) => { if (s.includes(String(d))) out.add(+s.replaceAll(String(d), String(arr[1 - i]))); });
  if (s.includes('1') && n > 10) out.add(+s.replace('1', '7'));
  const mag = n >= 1000 ? 1000 : n >= 100 ? 100 : n >= 10 ? 10 : 1;
  out.add(n + mag); out.add(Math.max(1, n - mag)); if (n >= 100) out.add(n * 10 > 99999 ? n / 10 : n * 10);
  out.delete(n);
  const lo = it.kind === 'price' ? 100 : 1;
  return [...out].filter(x => x >= lo && x !== n && Number.isInteger(x) && String(x).length >= String(n).length - 1).map(x => (it.kind === 'price' ? fmtYen(x) : x.toLocaleString('en-US')));
}
async function numbersGame(stage, a, ctx, s) {
  const set = (SETS[a.set] || SETS.price)();
  const qs = questionOrder(shuffle(set), a.n || 12);
  preload(qs.map(x => x.jp));
  let right = 0, time = a.time || 9000, streak = 0;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i];
    const opts = shuffle([it.shown, ...shuffle(confusable(it)).slice(0, 3)]);
    while (opts.length < 4) { const o = pick(set).shown; if (!opts.includes(o)) opts.push(o); }
    const r = await mcRound(stage, {
      hud: hud(i, qs.length, streak >= 3 ? `Streak ${streak}` : ''),
      prompt: `<p class="muted">${it.kind === 'price' ? 'The cashier says the price:' : it.kind === 'time' ? 'What time did you hear?' : 'Which number?'}</p>`,
      audio: it.jp, options: shuffle(opts).map(o => ({ v: o, html: `<span class="jp-num">${esc(o)}</span>` })), answer: it.shown, cols: 2, time,
      explain: `<span lang="ja">${esc(it.jp)}</span> = ${esc(it.shown)}${showRo() ? ` <small>(${esc(it.ro)})</small>` : ''}`,
    });
    if (s.dead) return;
    if (it.id && ctx.srs.has(it.id)) ctx.grade(it.id, quality(r.ok, r.ms, 3000));
    if (r.ok) { right++; streak++; time = Math.max(4500, time - 500); } else { streak = 0; time = Math.min(11000, time + 1500); }
  }
  ctx.finish(right / qs.length);
}

// ---------- 7. Conversation scenario ----------
async function talkGame(stage, a, ctx, s) {
  const sc = SCENARIOS[a.sc];
  if (!sc) throw new Error('Unknown scenario ' + a.sc);
  preload(sc.steps.flatMap(st => [st.npc.jp, ...st.ch.map(c => c.jp)]));
  stage.innerHTML = `<div class="jp-scene"><b>${esc(sc.place)}</b><span>${esc(sc.title)}</span></div><div class="jp-chat" id="chat"></div><div id="ch"></div>`;
  const chat = stage.querySelector('#chat'), ch = stage.querySelector('#ch');
  let i = 0, err = 0, steps = 0;
  const ro = showRo();
  while (i < sc.steps.length) {
    if (s.dead) return;
    const st = sc.steps[i]; steps++;
    chat.insertAdjacentHTML('beforeend', `<div class="jp-ctx">${esc(st.ctx)}</div><div class="jp-bub npc"><span lang="ja" class="jp">${esc(st.npc.jp)}</span>${ro ? `<small>${esc(st.npc.ro)}</small>` : ''}
      <div class="row tight"><button class="mini-b" data-p="${i}">Play</button><button class="mini-b" data-ps="${i}">Slow</button><button class="mini-b" data-m>Meaning</button></div><em hidden>${esc(st.npc.en)}</em></div>`);
    chat.scrollTop = chat.scrollHeight;
    await speak(st.npc.jp);
    const order = shuffle(st.ch.map((c, j) => j));
    const choice = await new Promise(res => {
      ch.innerHTML = `<div class="opts one">${order.map(j => { const c = st.ch[j]; return `<button class="opt jp-choice" data-j="${j}"><span lang="ja" class="jp">${esc(c.jp)}</span>${ro ? `<small>${esc(c.ro)}</small>` : ''}</button>`; }).join('')}</div><button class="btn ghost sm" data-hint>Hint: show meanings</button>`;
      ch.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ch.onclick = e => {
        if (e.target.closest('[data-hint]')) { ch.querySelectorAll('.jp-choice').forEach(b => { if (!b.querySelector('i')) b.insertAdjacentHTML('beforeend', `<i>${esc(st.ch[+b.dataset.j].en)}</i>`); }); return; }
        const b = e.target.closest('.jp-choice'); if (!b || b.disabled) return;
        const c = st.ch[+b.dataset.j];
        if (c.ok) res(c);
        else { err++; sfx.wrong(); b.classList.add('wrong'); b.disabled = true; b.querySelector('i')?.remove(); b.insertAdjacentHTML('beforeend', `<i>${esc(c.en)}${c.why ? ' — ' + esc(c.why) : ''}</i>`); speak(c.jp); }
      };
    });
    if (s.dead) return;
    sfx.right();
    ch.innerHTML = '';
    chat.insertAdjacentHTML('beforeend', `<div class="jp-bub me"><span lang="ja" class="jp">${esc(choice.jp)}</span>${ro ? `<small>${esc(choice.ro)}</small>` : ''}<small>${esc(choice.en)}</small></div>`);
    chat.scrollTop = chat.scrollHeight;
    await speak(choice.jp);
    await sleep(500);
    i = choice.goto != null ? choice.goto : i + 1;
  }
  chat.onclick = null;
  ctx.finish(steps / (steps + err), { lines: [err ? `${err} wrong replies. Replay to get a clean run.` : 'Clean run. Natural!'] });
}
function chatButtons(stage) {
  stage.addEventListener('click', e => {
    const p = e.target.closest('[data-p],[data-ps],[data-m]'); if (!p) return;
    const bub = p.closest('.jp-bub'); const txt = bub?.querySelector('.jp')?.textContent;
    if (p.dataset.m !== undefined) { bub.querySelector('em').hidden = false; p.remove(); return; }
    if (txt) speak(txt, { slow: p.dataset.ps !== undefined });
  });
}

// ---------- 8. Speak it (speech recognition or record & compare) ----------
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const normJa = t => toHira((t || '').replace(/[\s、。！？!?,.・ー〜「」]/g, '')).toLowerCase();
function similarity(a, b) {
  a = normJa(a); b = normJa(b);
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}
export { similarity };
function recognize(ms = 6000) {
  return new Promise(res => {
    const r = new SR(); r.lang = 'ja-JP'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
    let out = []; let done = false;
    const fin = () => { if (done) return; done = true; try { r.stop(); } catch (e) { /* stopped */ } res(out); };
    r.onresult = e => { for (const res0 of e.results) for (const alt of res0) out.push(alt.transcript); };
    r.onerror = e => { out.error = e.error; fin(); };
    r.onend = fin;
    try { r.start(); } catch (e) { out.error = 'start'; fin(); }
    setTimeout(fin, ms);
  });
}
async function recordClip(ms = 3500) {
  await mic.acquire();
  const rec = new MediaRecorder(mic.stream); const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start(); await sleep(ms); rec.stop(); await stopped;
  mic.release();
  return URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }));
}
async function speakGame(stage, a, ctx, s) {
  const pool = buildPool(a.ids || [], { kinds: ['phr', 'word'], interleave: 0.2 });
  const qs = questionOrder(pool, a.n || 5);
  const canSR = !!SR && a.mode !== 'record';
  const canRec = typeof MediaRecorder !== 'undefined' && mic.supported;
  let total = 0;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i];
    const score = await new Promise(res => {
      stage.innerHTML = `<div class="hud">${hud(i, qs.length)}</div><div class="qbox jp-q"><p class="muted">${esc(it.en)}</p><div class="jp-say-big" lang="ja">${esc(it.jp)}</div>${showRo() ? `<p class="ro">${esc(it.ro)}</p>` : ''}
        <div class="row tight center-row">${speakerBtn()}<button class="btn ghost sm" data-act="slow">Slow</button></div></div>
        <p class="muted center">1. Listen. 2. Say it out loud, copying the melody. ${canSR ? '3. Tap the mic and speak.' : canRec ? '3. Record yourself and compare.' : ''}</p>
        <div class="row">${canSR ? '<button class="btn primary big" data-act="rec">Tap and speak</button>' : canRec ? '<button class="btn primary big" data-act="record">Record myself (3 s)</button>' : ''}</div>
        <div id="out" class="feedback"></div><div class="row" id="rate" hidden><button class="btn ghost" data-q="0">Again</button><button class="btn ghost" data-q="1">Okay</button><button class="btn primary" data-q="2">Good</button></div>
        ${!canSR && !canRec ? '<p class="muted center">Speech check is not available in this browser. Say it 3 times, then rate yourself.</p>' : ''}`;
      const out = stage.querySelector('#out'), rate = stage.querySelector('#rate');
      if (!canSR && !canRec) rate.hidden = false;
      setTimeout(() => speak(it.jp), 200);
      let tries = 0;
      stage.onclick = async e => {
        const b = e.target.closest('[data-act],[data-q]'); if (!b) return;
        if (b.dataset.act === 'play') speak(it.jp);
        if (b.dataset.act === 'slow') speak(it.jp, { slow: true });
        if (b.dataset.q != null) { const q = +b.dataset.q; ctx.grade(it.id, q === 0 ? 0 : q === 1 ? 1 : 2); res(q / 2); }
        if (b.dataset.act === 'rec') {
          b.disabled = true; b.textContent = 'Listening… speak now'; out.className = 'feedback'; out.textContent = '';
          const alts = await recognize();
          b.disabled = false; b.textContent = 'Try again';
          if (alts.error && !alts.length) { out.className = 'feedback err'; out.textContent = alts.error === 'not-allowed' ? 'Speech access was blocked. Rate yourself instead.' : 'I did not catch that. Try again, closer to the mic.'; rate.hidden = false; return; }
          tries++;
          const best = Math.max(0, ...alts.map(t => Math.max(similarity(t, it.jp), it.kj ? similarity(t, it.kj) : 0)));
          const heard = esc(alts[0] || '');
          if (best >= 0.75) { sfx.right(); out.className = 'feedback ok'; out.innerHTML = `Great! I heard: <span lang="ja">${heard}</span>`; ctx.grade(it.id, tries === 1 ? 3 : 2); setTimeout(() => res(tries === 1 ? 1 : 0.7), 1300); }
          else { sfx.wrong(); out.className = 'feedback err'; out.innerHTML = `I heard: <span lang="ja">${heard || '…'}</span> (${Math.round(best * 100)}% match). Listen again and retry.`; speak(it.jp, { slow: true }); if (tries >= 3) rate.hidden = false; }
        }
        if (b.dataset.act === 'record') {
          b.disabled = true; b.textContent = 'Recording… speak now';
          try {
            const url = await recordClip();
            b.disabled = false; b.textContent = 'Record again';
            out.className = 'feedback'; out.innerHTML = 'Compare: yours, then the native clip.';
            const me = new Audio(url); me.setAttribute('playsinline', '');
            await new Promise(r => { me.onended = r; me.onerror = r; me.play().catch(r); });
            await sleep(300); await speak(it.jp);
            rate.hidden = false;
          } catch (err) { b.disabled = false; b.textContent = 'Record myself (3 s)'; out.className = 'feedback err'; out.textContent = err.message; rate.hidden = false; }
        }
      };
    });
    stage.onclick = null;
    total += score;
  }
  ctx.finish(total / qs.length, { lines: ['Speaking out loud is the fastest way to talk with locals.'] });
}

// ---------- 9. Sentence builder ----------
const PARTICLES = ['は', 'を', 'に', 'で', 'が', 'も', 'の', 'から', 'まで'];
async function builderGame(stage, a, ctx, s) {
  const pool = buildPool(a.ids || [], { kinds: ['phr'], interleave: 0.25 }).filter(x => x.tokens && x.tokens.length >= 2);
  const qs = questionOrder(pool, a.n || 6);
  let pts = 0;
  for (let i = 0; i < qs.length; i++) {
    if (s.dead) return;
    const it = qs[i];
    const extra = shuffle(PARTICLES.filter(p => !it.tokens.includes(p))).slice(0, it.tokens.length > 4 ? 2 : 1);
    if (i % 2) { const w = pick(VOCAB.filter(v => v.jp.length <= 4)); if (!it.tokens.includes(w.jp)) extra.push(w.jp); }
    const r = await buildRound(stage, {
      hud: hud(i, qs.length), prompt: `<p class="muted">Build this sentence:</p><p class="jp-en">${esc(it.en)}</p>`,
      answer: it.tokens, tiles: shuffle([...it.tokens, ...extra]), joiner: ' ', after: it.jp, autoCheck: false,
    });
    if (s.dead) return;
    ctx.grade(it.id, r.ok ? 2 : r.half ? 1 : 0);
    pts += r.ok ? 1 : r.half ? 0.5 : 0;
  }
  ctx.finish(pts / qs.length);
}

// ---------- 10. Katakana cafe menu ----------
async function menuGame(stage, a, ctx, s) {
  const menuWords = VOCAB.filter(v => v.theme === 'menu' || ['コーヒー', 'ジュース', 'ビール', 'カレー', 'ラーメン', 'パン'].includes(v.jp));
  const menu = shuffle(menuWords).slice(0, a.size || 9).map(w => ({ ...w, price: pick([280, 350, 380, 420, 450, 480, 520, 550, 600, 680, 750, 880, 980]) }));
  const n = a.n || 10;
  let right = 0;
  preload(menu.map(m => m.jp));
  for (let i = 0; i < n; i++) {
    if (s.dead) return;
    const it = pick(menu), mode = i % 3;
    const prompt = mode === 0 ? `<p class="muted">A customer orders. Tap their item.</p>${speakerBtn()}` : mode === 1 ? `<p class="muted">Find on the menu:</p><p class="jp-en">${esc(it.en)}</p>` : `<p class="muted">Which item costs ${fmtYen(it.price)}?</p><p class="jp-en">${esc(it.en)}?</p>`;
    const t0 = performance.now();
    const ok = await new Promise(res => {
      stage.innerHTML = `<div class="hud">${hud(i, n, `${right} right`)}</div><div class="qbox jp-q jp-menu-q">${prompt}</div>
        <div class="jp-menu"><h3>Café Sakura · メニュー</h3>${menu.map((m, k) => `<button class="jp-mi" data-k="${k}"><span lang="ja">${esc(m.jp)}</span><b>${fmtYen(m.price)}</b></button>`).join('')}</div><div class="feedback" id="fb"></div>`;
      if (mode === 0) { setTimeout(() => speak(it.jp), 200); stage.querySelector('[data-act=play]').onclick = () => speak(it.jp); }
      stage.querySelector('.jp-menu').onclick = async e => {
        const b = e.target.closest('.jp-mi'); if (!b) return;
        const m = menu[+b.dataset.k], good = m.jp === it.jp;
        stage.querySelectorAll('.jp-mi').forEach(x => { x.disabled = true; });
        b.classList.add(good ? 'right' : 'wrong');
        if (!good) stage.querySelector(`.jp-mi[data-k="${menu.indexOf(it)}"]`).classList.add('right');
        const fb = stage.querySelector('#fb'); fb.className = 'feedback ' + (good ? 'ok' : 'err');
        fb.innerHTML = `<span lang="ja">${esc(it.jp)}</span> = ${esc(it.ro)} · ${esc(it.en)}`;
        good ? sfx.right() : sfx.wrong();
        await speak(it.jp); await sleep(good ? 300 : 900);
        res(good);
      };
    });
    if (s.dead) return;
    if (ctx.srs.has(it.id)) ctx.grade(it.id, quality(ok, performance.now() - t0, 5000));
    if (ok) right++;
  }
  ctx.finish(right / n);
}

export const GAMES = {
  listen: { name: 'Listen & pick', how: 'Hear it first, then choose. Wrong answers come back later.', run: makeRun(listenGame) },
  read: { name: 'Speed read', how: 'Read the kana fast. The timer shrinks as you get it right.', run: makeRun(readGame) },
  rain: { name: 'Kana rain', how: 'Tap the sound of the lowest falling kana before it lands. 5 in a row = combo.', run: makeRun(rainGame) },
  memory: { name: 'Memory match', how: 'Flip two cards. Japanese cards speak when you flip them. Match every pair.', run: makeRun(memoryGame) },
  dictation: { name: 'Sound dictation', how: 'Listen, then build the word from kana tiles. Tap Slow if it is too fast.', run: makeRun(dictationGame) },
  numbers: { name: 'Number catcher', how: 'Hear a number, price or time and tap it. Real cashiers talk fast!', run: makeRun(numbersGame) },
  talk: { name: 'Conversation', how: 'Read the situation, listen to the local, and pick your reply. Stuck? Tap Hint.', run: (st, a, c) => { chatButtons(st); return makeRun(talkGame)(st, a, c); } },
  speak: { name: 'Speak it', how: 'Listen, copy the melody, then say it. The app checks what it hears.', run: makeRun(speakGame) },
  builder: { name: 'Sentence builder', how: 'Put the pieces in order to say the English sentence. One extra piece is a trap.', run: makeRun(builderGame) },
  menu: { name: 'Café menu', how: 'Read the katakana menu. Find what customers order.', run: makeRun(menuGame) },
};
