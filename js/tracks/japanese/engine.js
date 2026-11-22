// Shared question engine for Japanese games and reviews.
import { ITEMS } from './data/items.js';
import { morae, toHira, toKata, KANA_BY } from './data/kana.js';
import { speak, sfx } from './audio.js';
import { srs } from '../../core/srs.js';
import { settings } from '../../core/store.js';
import { esc, shuffle, pick, rnd, sleep } from '../../core/ui.js';

export const items = ids => ids.map(id => ITEMS[id]).filter(Boolean);
export const showRo = () => settings.get().showRomaji !== false;

/**
 * Build a practice pool: the station's own items plus ~interleave share of earlier learned items (weakest first).
 */
export function buildPool(ids = [], { kinds = null, interleave = 0.3, min = 4 } = {}) {
  const base = items(ids).filter(x => !kinds || kinds.includes(x.kind));
  const baseSet = new Set(base.map(x => x.id));
  const learned = srs.learned('jp').filter(id => !baseSet.has(id)).map(id => ITEMS[id]).filter(x => x && (!kinds || kinds.includes(x.kind)));
  const weak = new Set(srs.weakest('jp', 30));
  learned.sort((a, b) => (weak.has(b.id) - weak.has(a.id)) || (srs.strength(a.id) - srs.strength(b.id)));
  const want = !base.length ? 40 : interleave >= 1 ? 40 : Math.max(Math.round(base.length * interleave / (1 - interleave)), base.length < min ? min - base.length : 0);
  return [...base, ...learned.slice(0, want)];
}

/** n questions, weak items more often, every base item at least once when possible. */
export function questionOrder(pool, n) {
  if (!pool.length) return [];
  const out = shuffle(pool).slice(0, Math.min(n, pool.length));
  while (out.length < n) {
    const w = pool.map(x => 1 + 2 * (1 - srs.strength(x.id)));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), it = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { it = pool[i]; break; } }
    if (out[out.length - 1] !== it) out.push(it);
  }
  return out;
}

/** k wrong options for an item: same kind, different display, similar length / theme preferred. */
export function distractors(it, pool, k = 3, key = 'en') {
  const all = Object.values(ITEMS).filter(x => x.kind === it.kind && x[key] !== it[key] && x.jp !== it.jp);
  const local = pool.filter(x => x.kind === it.kind && x[key] !== it[key] && x.jp !== it.jp);
  const score = x => (x.theme && x.theme === it.theme ? -2 : 0) + Math.abs((x.jp || '').length - (it.jp || '').length) * 0.5 + (it.kind === 'kana' && x.script !== it.script ? 5 : 0) + Math.random() * 2;
  const cand = [...new Map([...local, ...all.sort((a, b) => score(a) - score(b)).slice(0, 12)].map(x => [x[key], x])).values()];
  return shuffle(cand.sort((a, b) => score(a) - score(b)).slice(0, k + 2)).slice(0, k);
}

const SPK = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
export const speakerBtn = (label = 'Play') => `<button class="jp-spk" data-act="play" aria-label="${label}">${SPK}</button>`;
export const slowBtn = () => `<button class="btn ghost sm" data-act="slow">Slow</button>`;

/**
 * One multiple-choice question.
 * q: { prompt (html), audio (text played on show), after (text played after answering), options: [{html, v}], answer (v),
 *      hud (html), cols (1|2|4), time (ms limit, optional), big (bool: large option text) }
 * @returns Promise<{ok:boolean, ms:number, timeout?:boolean}>
 */
export function mcRound(stage, q) {
  return new Promise(res => {
    const t0 = performance.now();
    let done = false, timer = 0;
    stage.innerHTML = `${q.hud ? `<div class="hud">${q.hud}</div>` : ''}${q.time ? '<div class="timer"><b id="tm"></b></div>' : ''}
      <div class="qbox jp-q">${q.prompt}${q.audio ? `<div class="row tight center-row">${speakerBtn()}${slowBtn()}</div>` : ''}</div>
      <div class="opts ${q.cols === 1 ? 'one' : q.cols === 4 ? 'four' : ''} ${q.big ? 'jp-bigopts' : ''}">${q.options.map((o, i) => `<button class="opt" data-i="${i}">${o.html}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>`;
    const fb = stage.querySelector('#fb');
    if (q.audio) setTimeout(() => speak(q.audio), 150);
    if (q.time) {
      const b = stage.querySelector('#tm'); b.style.width = '100%';
      requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = `width ${q.time}ms linear`; b.style.width = '0%'; }));
      timer = setTimeout(() => finish(-1), q.time);
    }
    const finish = async i => {
      if (done) return; done = true; clearTimeout(timer);
      const ms = performance.now() - t0, btns = [...stage.querySelectorAll('.opt')];
      const ai = q.options.findIndex(o => o.v === q.answer);
      const ok = i >= 0 && q.options[i].v === q.answer;
      btns.forEach(b => { b.disabled = true; });
      if (ai >= 0) btns[ai].classList.add('right');
      if (!ok && i >= 0) btns[i].classList.add('wrong');
      const tb = stage.querySelector('#tm'); if (tb) { tb.style.transition = 'none'; tb.style.width = getComputedStyle(tb).width; }
      fb.className = 'feedback ' + (ok ? 'ok' : 'err');
      fb.innerHTML = ok ? (q.okText || pick(['Yes!', 'Right!', 'Nice!', 'Correct!'])) : (i < 0 ? 'Time! ' : 'Not quite. ') + (q.explain || '');
      ok ? sfx.right() : sfx.wrong();
      if (q.after) await speak(q.after); else if (!ok && q.audio) await speak(q.audio);
      await sleep(ok ? 350 : 900);
      res({ ok, ms, timeout: i < 0 });
    };
    stage.querySelectorAll('.opt').forEach(b => { b.onclick = () => finish(+b.dataset.i); });
    stage.querySelector('[data-act=play]')?.addEventListener('click', () => q.audio && speak(q.audio));
    stage.querySelector('[data-act=slow]')?.addEventListener('click', () => q.audio && speak(q.audio, { slow: true }));
  });
}

/** SRS quality from correctness + speed. */
export const quality = (ok, ms, fastMs = 3500) => (!ok ? 0 : ms < fastMs ? 3 : ms < fastMs * 2.5 ? 2 : 1);

/** Display an item compactly: kana (+ romaji) */
export const jpHtml = (it, { ro = showRo(), cls = '' } = {}) => `<span class="jp ${cls}" lang="ja">${esc(it.jp)}</span>${ro && it.ro && it.kind !== 'kana' ? `<small class="ro">${esc(it.ro)}</small>` : ''}`;

// ---------- kana tiles for dictation ----------
const LOOK = { し: 'つ', つ: 'し', ぬ: 'め', め: 'ぬ', は: 'ほ', ほ: 'は', る: 'ろ', ろ: 'る', さ: 'ち', ち: 'さ', ね: 'れ', れ: 'わ', わ: 'ね', き: 'さ', あ: 'お', お: 'あ', シ: 'ツ', ツ: 'シ', ソ: 'ン', ン: 'ソ', ク: 'タ', タ: 'ク', ア: 'マ', マ: 'ア', ウ: 'ワ', ワ: 'ウ', ー: 'ー', っ: 'つ', ッ: 'ツ' };
const VOICE = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const UNVOICE = Object.fromEntries(Object.entries(VOICE).map(([a, b]) => [b, a]));
/** Tiles for building a word: its morae + plausible wrong tiles. */
export function tilesFor(word, extra = 3) {
  const m = morae(word);
  const kata = /[ァ-ヺ]/.test(word);
  const conv = s => (kata ? toKata(s) : s);
  const wrong = new Set();
  for (const x of shuffle(m)) {
    const h = toHira(x[0]);
    const alt = VOICE[h] || UNVOICE[h] || toHira(LOOK[x[0]] || '') || '';
    if (alt && alt !== h && alt !== 'ー') wrong.add(conv(alt) + x.slice(1));
    if (wrong.size >= extra) break;
  }
  const basic = Object.keys(KANA_BY).filter(k => k.length === 1 && (kata ? /[ァ-ヺ]/.test(k) : /[ぁ-ゖ]/.test(k)));
  while (wrong.size < extra) wrong.add(pick(basic));
  m.forEach(x => wrong.delete(x));
  return { answer: m, tiles: shuffle([...m, ...[...wrong].slice(0, extra)]) };
}

/**
 * Build-from-tiles question (dictation / sentence builder).
 * q: { prompt html, audio (text), answer: string[], tiles: string[], joiner: '' | ' ', hud }
 * @returns Promise<{ok, ms, tries}>
 */
export function buildRound(stage, q) {
  return new Promise(res => {
    const t0 = performance.now();
    let picked = [], tries = 0, done = false;
    stage.innerHTML = `${q.hud ? `<div class="hud">${q.hud}</div>` : ''}<div class="qbox jp-q">${q.prompt}${q.audio ? `<div class="row tight center-row">${speakerBtn()}${slowBtn()}</div>` : ''}</div>
      <div class="jp-answer" id="ans" aria-live="polite"></div>
      <div class="jp-tiles" id="tiles">${q.tiles.map((t, i) => `<button class="jp-tile" data-i="${i}" lang="ja">${esc(t)}</button>`).join('')}</div>
      <div class="row"><button class="btn ghost" data-act="undo">Undo</button><button class="btn primary" data-act="check" disabled>Check</button></div>
      <div class="feedback" id="fb"></div>`;
    const ans = stage.querySelector('#ans'), fb = stage.querySelector('#fb'), chk = stage.querySelector('[data-act=check]');
    const draw = () => {
      ans.innerHTML = picked.length ? picked.map((i, k) => `<button class="jp-chip" data-k="${k}" lang="ja">${esc(q.tiles[i])}</button>`).join(q.joiner === ' ' ? ' ' : '') : '<span class="muted">Tap the pieces in order</span>';
      stage.querySelectorAll('.jp-tile').forEach(b => { b.disabled = picked.includes(+b.dataset.i) || done; });
      chk.disabled = !picked.length || done;
    };
    draw();
    if (q.audio) setTimeout(() => speak(q.audio), 150);
    stage.querySelector('#tiles').onclick = e => { const b = e.target.closest('.jp-tile'); if (!b || done) return; picked.push(+b.dataset.i); draw(); if (picked.length === q.answer.length && q.autoCheck !== false) check(); };
    ans.onclick = e => { const b = e.target.closest('.jp-chip'); if (!b || done) return; picked.splice(+b.dataset.k, 1); draw(); };
    stage.querySelector('[data-act=undo]').onclick = () => { if (!done) { picked.pop(); draw(); } };
    stage.querySelector('[data-act=play]')?.addEventListener('click', () => speak(q.audio));
    stage.querySelector('[data-act=slow]')?.addEventListener('click', () => speak(q.audio, { slow: true }));
    const check = async () => {
      tries++;
      const got = picked.map(i => q.tiles[i]);
      const ok = got.length === q.answer.length && got.every((t, i) => t === q.answer[i]);
      if (ok || tries >= 2) {
        done = true; draw();
        fb.className = 'feedback ' + (ok ? 'ok' : 'err');
        fb.innerHTML = ok ? 'Correct!' : `Answer: <span lang="ja">${esc(q.answer.join(q.joiner || ''))}</span>`;
        ok ? sfx.right() : sfx.wrong();
        ans.classList.add(ok ? 'right' : 'wrong');
        if (!ok) ans.innerHTML = q.answer.map(t => `<span class="jp-chip" lang="ja">${esc(t)}</span>`).join(q.joiner === ' ' ? ' ' : '');
        if (q.after || q.audio) await speak(q.after || q.audio);
        await sleep(ok ? 300 : 1000);
        res({ ok: ok && tries === 1, half: ok && tries > 1, ms: performance.now() - t0, tries });
      } else {
        sfx.wrong(); fb.className = 'feedback err'; fb.textContent = 'Not quite. Listen again and fix it.';
        ans.classList.add('shake'); setTimeout(() => ans.classList.remove('shake'), 350);
        if (q.audio) speak(q.audio, { slow: true });
      }
    };
    chk.onclick = check;
  });
}
