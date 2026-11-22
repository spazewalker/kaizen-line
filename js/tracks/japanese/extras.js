// Japanese tools: kana chart, phrasebook, listening drill.
import { HIRAGANA, KATAKANA, DAKUTEN_H, DAKUTEN_K, YOON_H, YOON_K, EXT_KATA } from './data/kana.js';
import { PHRASES, PHRASE_THEMES } from './data/phrases.js';
import { VOCAB, THEMES } from './data/vocab.js';
import { ITEMS } from './data/items.js';
import { speak, clipUrl } from './audio.js';
import { srs } from '../../core/srs.js';
import { esc, shuffle, pick, sleep } from '../../core/ui.js';

function chart(stage) {
  let script = 'hira';
  const cell = k => {
    if (!k) return '<span class="jp-cell empty"></span>';
    const s = srs.strength('jp:kana:' + k.k), known = srs.has('jp:kana:' + k.k);
    return `<button class="jp-cell ${known ? 'known' : ''}" style="--s:${s.toFixed(2)}" data-k="${k.k}" aria-label="${k.k} ${k.r}"><b lang="ja">${k.k}</b><small>${k.r}</small></button>`;
  };
  const basicGrid = list => {
    const rows = ['a', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w'];
    const out = [];
    for (const r of rows) {
      const ks = list.filter(x => x.row === r);
      if (r === 'y') out.push(ks[0], null, ks[1], null, ks[2]);
      else if (r === 'w') out.push(ks[0], null, null, null, ks[1], ks[2], null, null, null, null);
      else out.push(...ks);
    }
    return `<div class="jp-chart c5">${out.map(cell).join('')}</div>`;
  };
  const draw = () => {
    const H = script === 'hira';
    stage.innerHTML = `<div class="tabs jp-tabs"><button class="${H ? 'on' : ''}" data-s="hira">Hiragana</button><button class="${!H ? 'on' : ''}" data-s="kata">Katakana</button></div>
      <p class="muted">Tap any kana to hear it. Colour shows how well you know it (from your reviews).</p>
      <h3>Basic sounds</h3>${basicGrid(H ? HIRAGANA : KATAKANA)}
      <h3>Two dots and a circle (voiced sounds)</h3><p class="muted small">Two dots make the sound "heavier": k→g, s→z, t→d, h→b. A circle makes h→p.</p>
      <div class="jp-chart c5">${(H ? DAKUTEN_H : DAKUTEN_K).map(cell).join('')}</div>
      <h3>Combined sounds (small ya, yu, yo)</h3><p class="muted small">A small ゃ ゅ ょ merges with the kana before it into one beat: き + ゃ = kya.</p>
      <div class="jp-chart c3">${(H ? YOON_H : YOON_K).map(cell).join('')}</div>
      ${H ? '' : `<h3>Extra sounds for foreign words</h3><div class="jp-chart c5">${EXT_KATA.map(cell).join('')}</div>`}`;
  };
  draw();
  stage.onclick = e => {
    const t = e.target.closest('[data-s]'); if (t) { script = t.dataset.s; draw(); return; }
    const c = e.target.closest('.jp-cell[data-k]'); if (c) { speak(c.dataset.k); c.classList.add('playing'); setTimeout(() => c.classList.remove('playing'), 400); }
  };
  return () => { stage.onclick = null; };
}

function phrasebook(stage) {
  let slow = false, theme = 'all', q = '';
  const all = [...PHRASES.map(p => ({ ...p, th: 'p:' + p.theme })), ...VOCAB.map(v => ({ ...v, th: 'w:' + v.theme }))];
  const chips = [['all', 'All'], ...Object.entries(PHRASE_THEMES).map(([k, v]) => ['p:' + k, v]), ['w', 'Words']];
  stage.innerHTML = `<input type="text" id="q" placeholder="Search English, romaji or kana" aria-label="Search" class="jp-search">
    <label class="tog"><input type="checkbox" id="slow"> Slow audio</label>
    <div class="jp-chips">${chips.map(([k, v]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-t="${k}">${esc(v)}</button>`).join('')}</div>
    <div id="list" class="listen"></div>`;
  const list = stage.querySelector('#list');
  const draw = () => {
    const ql = q.toLowerCase();
    const rows = all.filter(x => (theme === 'all' ? x.kind === 'phr' || ql : theme === 'w' ? x.kind === 'word' : x.th === theme) && (!ql || x.en.toLowerCase().includes(ql) || x.ro.toLowerCase().replace(/[āīūēō]/g, c => ({ ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o' })[c]).includes(ql) || x.jp.includes(q)));
    list.innerHTML = rows.slice(0, 200).map(x => `<button class="say" data-jp="${esc(x.jp)}"><span class="jp" lang="ja">${esc(x.jp)}</span><span class="en">${esc(x.en)}</span><span class="play" aria-hidden="true"></span><span class="ro">${esc(x.ro)}${x.kj && x.kj !== x.jp ? ` · <span lang="ja">${esc(x.kj)}</span>` : ''}</span></button>`).join('') || '<p class="muted">Nothing found.</p>';
  };
  draw();
  stage.querySelector('#q').oninput = e => { q = e.target.value.trim(); draw(); };
  stage.querySelector('#slow').onchange = e => { slow = e.target.checked; };
  stage.querySelector('.jp-chips').onclick = e => { const c = e.target.closest('[data-t]'); if (!c) return; theme = c.dataset.t; stage.querySelectorAll('.jp-chips .chip').forEach(b => b.classList.toggle('on', b === c)); draw(); };
  list.onclick = e => { const r = e.target.closest('[data-jp]'); if (r) speak(r.dataset.jp, { slow }); };
}

function drill(stage, ctx) {
  let dead = false, auto = false, count = 0;
  const learned = srs.learned('jp').map(id => ITEMS[id]).filter(x => x && clipUrl(x.jp) && x.kind !== 'kana');
  const pool = learned.length >= 5 ? learned : PHRASES.slice(0, 20);
  stage.innerHTML = `<div class="card center"><p class="muted">${learned.length >= 5 ? `Random audio from the ${learned.length} things you have learned.` : 'Learn a few stations first. For now, here are starter phrases.'} Try to understand before you reveal.</p>
    <div class="jp-drill" id="box"></div>
    <label class="tog center-row"><input type="checkbox" id="auto"> Hands-free mode (plays, pauses, reveals, repeats)</label></div>`;
  const box = stage.querySelector('#box');
  const next = async () => {
    if (dead) return;
    const it = pick(pool); count++;
    box.innerHTML = `<p class="hud"><span>#${count}</span><span></span></p><div class="jp-drill-q">?</div><div class="row"><button class="btn ghost" data-a="again">Play again</button><button class="btn primary" data-a="reveal">Reveal</button></div>`;
    const reveal = () => {
      box.querySelector('.jp-drill-q').innerHTML = `<span lang="ja" class="jp">${esc(it.jp)}</span><small>${esc(it.ro)}</small><b>${esc(it.en)}</b>`;
      box.querySelector('.row').innerHTML = srs.has(it.id) ? '<button class="btn ghost" data-a="miss">I missed it</button><button class="btn primary" data-a="knew">I knew it</button>' : '<button class="btn primary" data-a="knew">Next</button>';
    };
    box.onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'again') speak(it.jp);
      if (a === 'reveal') { reveal(); speak(it.jp); }
      if (a === 'knew' || a === 'miss') { if (srs.has(it.id)) srs.grade(it.id, a === 'knew' ? 2 : 0); next(); }
    };
    await speak(it.jp);
    if (auto && !dead) { await sleep(3000); if (dead || !auto) return; reveal(); await speak(it.jp); await sleep(2200); if (auto && !dead) next(); }
  };
  stage.querySelector('#auto').onchange = e => { auto = e.target.checked; if (auto) next(); };
  next();
  return () => { dead = true; };
}

export const EXTRAS = [
  { id: 'chart', title: 'Kana chart', sub: 'Every sound. Tap to hear.', run: chart },
  { id: 'phrasebook', title: 'Phrasebook', sub: 'Search 450+ phrases and words', run: phrasebook },
  { id: 'drill', title: 'Listening drill', sub: 'Random audio from what you learned', run: drill },
];
