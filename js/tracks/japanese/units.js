// Japanese curriculum: 30 stations. Each = listen-first lesson cards, then games. Items go to SRS via `learns`.
import { ITEMS } from './data/items.js';
import { row, HIRAGANA, KATAKANA, DAKUTEN_H, DAKUTEN_K, YOON_H, YOON_K, EXT_KATA } from './data/kana.js';
import { SCENARIOS } from './data/scenarios.js';
import { NUMBERS, PRICES_ITEMS, TIME_ITEMS } from './data/numbers.js';
import { clipAttr, speak, preload } from './audio.js';
import { mcRound, distractors } from './engine.js';
import { esc, shuffle, sleep } from '../../core/ui.js';
import { settings } from '../../core/store.js';

// ---------- id helpers ----------
const w = s => s.trim().split(/\s+/).map(x => 'jp:word:' + x);
const p = s => s.trim().split(/\s+/).map(x => 'jp:phr:' + x);
const K = list => list.map(x => 'jp:kana:' + x.k);
const kr = (script, rows) => K(rows.split(' ').flatMap(r => row(script, r)));
const nums = ns => ns.map(n => 'jp:num:' + n);
const prices = f => PRICES_ITEMS.filter(x => f(x.n)).map(x => x.id);
const times = () => TIME_ITEMS.filter(x => x.m === 0 || x.m === 30).map(x => x.id);

// ---------- lesson cards ----------
const roOn = () => settings.get().showRomaji !== false;
const row1 = it => `<button class="say" ${clipAttr(it.jp)}><span class="jp" lang="ja">${esc(it.jp)}</span><span class="en">${esc(it.en)}</span><span class="play" aria-hidden="true"></span><span class="ro">${roOn() ? esc(it.ro) : ''}${it.kj && it.kj !== it.jp ? ` · <span lang="ja">${esc(it.kj)}</span>` : ''}</span></button>`;
async function playAll(list, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Playing…'; }
  for (const it of list) { if (!btn || btn.isConnected) { await speak(it.jp); await sleep(450); } }
  if (btn) { btn.disabled = false; btn.textContent = 'Play all again'; }
}
const ids2items = ids => ids.map(id => ITEMS[id]).filter(Boolean);

/** Listen first: plays the items with text hidden; learner guesses, then reveals. */
function hearFirst(ids, title = 'Listen first', intro = 'Do not read yet. Just listen and guess what they mean.') {
  const list = typeof ids[0] === 'string' ? ids2items(ids) : ids;
  return {
    title, html: `<p>${intro}</p><button class="btn primary" data-pa>Play all</button><div class="listen jp-blur">${list.map(row1).join('')}</div><button class="btn ghost" data-rv>Show me</button>`,
    mount(el) {
      preload(list.map(x => x.jp));
      el.querySelector('[data-pa]').onclick = e => playAll(list, e.currentTarget);
      el.querySelector('[data-rv]').onclick = e => { el.querySelector('.jp-blur').classList.remove('jp-blur'); e.currentTarget.remove(); };
    },
  };
}
function kanaCard(list, title = 'Meet the kana', tip = 'Tap each kana. Say it out loud, then say the picture hint once.') {
  return {
    title, tip,
    html: `<div class="jp-kgrid">${list.map(k => { const it = ITEMS['jp:kana:' + k.k]; return `<button class="jp-ktile" ${clipAttr(k.k)}><b lang="ja">${k.k}</b><span>${k.r}</span>${it?.mn ? `<small>${esc(it.mn)}</small>` : ''}</button>`; }).join('')}</div>`,
  };
}
function wordsCard(title, ids, intro = '', tip = '') {
  const list = ids2items(ids);
  return {
    title, tip, html: `${intro ? `<p>${intro}</p>` : ''}<button class="btn ghost sm" data-pa>Play all</button><div class="listen">${list.map(row1).join('')}</div>`,
    mount(el) { preload(list.map(x => x.jp)); el.querySelector('[data-pa]').onclick = e => playAll(list, e.currentTarget); },
  };
}
function patternCard(title, html, ids, tip = '') {
  const list = ids2items(ids);
  return { title, tip, html: `<div class="jp-pattern">${html}</div><div class="listen">${list.map(row1).join('')}</div>` };
}
function note(title, html, tip = '') { return { title, html, tip }; }
/** What locals will say in this scene (all NPC lines, with audio). */
function sceneCard(scId) {
  const sc = SCENARIOS[scId];
  const lines = [...new Map(sc.steps.map(s => [s.npc.jp, s.npc])).values()];
  return {
    title: `What you will hear: ${sc.title.toLowerCase()}`, tip: 'Locals speak fast. Tap a line twice, or use Slow in the game.',
    html: `<p>${esc(sc.place)}. Listen to every line once. Try to catch one word you know.</p><button class="btn ghost sm" data-pa>Play all</button><div class="listen">${lines.map(row1).join('')}</div>`,
    mount(el) { el.querySelector('[data-pa]').onclick = e => playAll(lines, e.currentTarget); },
  };
}
/** Mini quiz inside the lesson. Must finish to continue. */
function check(ids, title = 'Quick check', n = 4) {
  return {
    title, requireDone: true, html: '<p class="muted">Three or four quick questions. No score, just practice.</p><div class="jp-check"></div>',
    mount(el, ctx) {
      let dead = false;
      const box = el.querySelector('.jp-check');
      (async () => {
        const its = shuffle(ids2items(ids)).slice(0, n);
        const pool = ids2items(ids);
        for (let i = 0; i < its.length; i++) {
          if (dead) return;
          const it = its[i], key = it.kind === 'kana' ? 'jp' : 'en';
          const o = shuffle([it, ...distractors(it, pool, it.kind === 'kana' ? 3 : 2, key)]);
          await mcRound(box, { hud: `<span>${i + 1} / ${its.length}</span><span></span>`, prompt: `<p class="muted">Listen. ${key === 'jp' ? 'Which one?' : 'What does it mean?'}</p>`, audio: it.jp, options: o.map(x => ({ v: x.id, html: key === 'jp' ? `<span class="jp jp-opt" lang="ja">${esc(x.jp)}</span>` : esc(x.en) })), answer: it.id, cols: key === 'jp' ? 4 : 1, big: key === 'jp' });
        }
        if (!dead) { box.innerHTML = '<p class="ok center">Done! Tap Start practice.</p>'; ctx.done(); }
      })();
      return () => { dead = true; };
    },
  };
}

// ---------- station builder ----------
function U(id, title, sub, minutes, cards, games, extraLearn = []) {
  const learns = new Set(extraLearn);
  cards.forEach(c => (c._ids || []).forEach(x => learns.add(x)));
  return { id, title, sub, minutes, learns: [...learns].filter(x => ITEMS[x]), steps: [{ type: 'lesson', cards }, ...games.map(([game, args, t]) => ({ type: 'game', game, args, title: t }))] };
}
// attach learnable ids to a card
const L = (card, ids) => Object.assign(card, { _ids: ids });

const V = HIRAGANA.filter(x => x.row === 'a');
const vowels = K(V);

export const UNITS = [
  U('jp-01', 'First sounds: a i u e o', 'あいうえお + your first words', 10, [
    hearFirst(p('konnichiwa arigato sumimasen'), 'Listen first', 'Three phrases you will use every single day in Japan. Listen twice. Guess which one is "thank you".'),
    note('How Japanese sounds', `<p>Japanese is built from short, even beats. Each kana = one beat.</p><p>There are only <b>5 vowels</b>: a, i, u, e, o. They are short and pure, like Hindi <b>अ इ उ ए ओ</b>. They never change.</p><p>Japanese has no strong stress. Say every beat with the same length: <b>ko-n-ni-chi-wa</b> is five beats.</p>`, 'Good news for Hindi speakers: almost every Japanese sound already exists in Hindi.'),
    L(kanaCard(V), vowels),
    L(wordsCard('Words made only of vowels', w('iie ue ao'), 'You can already read these.'), w('iie ue ao')),
    L(wordsCard('Your first phrases', p('konnichiwa arigato sumimasen'), 'Say each one out loud three times.'), p('konnichiwa arigato sumimasen')),
    check(vowels),
  ], [['listen', { ids: vowels, kinds: ['kana'], n: 10 }, 'Hear the vowels'], ['memory', { ids: [...vowels, ...w('iie ue ao')], pairs: 6 }], ['listen', { ids: p('konnichiwa arigato sumimasen'), kinds: ['phr', 'word'], n: 6 }, 'Everyday phrases']]),

  U('jp-02', 'The K row + yes and no', 'かきくけこ · はい · いいえ', 10, [
    hearFirst(w('hai iie koko aka eki')),
    note('Add a consonant', `<p>Put <b>k</b> in front of each vowel: ka, ki, ku, ke, ko. The vowels sound exactly like before.</p><p>Learn one row and you learn 5 sounds at once.</p>`),
    L(kanaCard(row('hira', 'k')), kr('hira', 'k')),
    L(wordsCard('Words you can read now', w('hai iie koko aka eki')), w('hai iie koko aka eki')),
    note('Polite or casual', `<p><b>ありがとう</b> = thanks (casual). <b>ありがとう ございます</b> = thank you very much (polite).</p><p>With strangers, shop staff and older people, always use the polite form.</p>`, 'Adding ございます or です makes almost anything polite.'),
    check([...kr('hira', 'k'), ...vowels]),
  ], [['rain', { kana: [...V, ...row('hira', 'k')].map(x => x.k), goal: 12 }], ['read', { ids: [...vowels, ...kr('hira', 'k')], kinds: ['kana'], n: 12 }], ['listen', { ids: w('hai iie koko aka eki'), n: 8 }]]),

  U('jp-03', 'Order anything: ___ を ください', 'Your first real sentence', 12, [
    hearFirst(p('koreo mizuo menyuo'), 'Listen first', 'You hear these in every café. What is the shared ending?'),
    L(patternCard('The magic pattern', `<p><b>X を ください</b> = "X, please" (give me X).</p><p>を marks the thing you want. It is written を but said <b>"o"</b>.</p><p>Point at anything and say <b>これ を ください</b>. You can order food on day one.</p>`, p('koreo mizuo menyuo')), p('koreo mizuo menyuo')),
    L(wordsCard('Drinks', w('mizu ocha kohi kocha biru jusu')), w('mizu ocha kohi kocha biru jusu')),
    L(wordsCard('Food', w('ramen sushi kare udon onigiri')), w('ramen sushi kare udon onigiri')),
    L(patternCard('This, that, that over there', `<p><b>これ</b> = this (near me) · <b>それ</b> = that (near you) · <b>あれ</b> = that (over there).</p><p>Like Hindi यह and वह, with one extra step for "far away".</p>`, w('kore sore are')), w('kore sore are')),
    note('Say it!', '<p>Say these out loud now: <b>みず を ください</b>. <b>コーヒー を ください</b>. <b>ラーメン を ください</b>.</p>', 'Speaking out loud, even alone, builds the habit fastest.'),
    check([...w('mizu ocha kohi biru ramen sushi kore'), ...p('koreo mizuo')]),
  ], [['listen', { ids: w('mizu ocha kohi kocha biru jusu ramen sushi kare udon onigiri kore sore are'), n: 10 }], ['builder', { ids: p('koreo mizuo menyuo biiru2'), n: 4 }], ['speak', { ids: p('koreo mizuo menyuo'), n: 3 }]]),

  U('jp-04', 'The S row + numbers 1 to 10', 'さしすせそ · いち に さん', 12, [
    hearFirst(nums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map(id => ITEMS[id]), 'Listen first', 'Count along with your fingers.'),
    L(kanaCard(row('hira', 's'), 'The S row', 'Watch out: し is "shi", not "si".'), kr('hira', 's')),
    L(wordsCard('Numbers 1 to 10', nums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '', '4 = よん and 7 = なな are the safe choices. し (4) sounds like "death", so people avoid it.'), nums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    L(wordsCard('S-row words', w('sushi sake shio asa soko')), w('sushi sake shio asa soko')),
    check(nums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
  ], [['numbers', { set: 'num10', n: 10 }, 'Number catcher: 1 to 10'], ['rain', { kana: [...V, ...row('hira', 'k'), ...row('hira', 's')].map(x => x.k), goal: 15 }], ['listen', { ids: w('sushi sake shio asa soko'), n: 6 }]]),

  U('jp-05', 'At the konbini', 'Bags, bento and paying', 12, [
    sceneCard('konbini'),
    L(wordsCard('Konbini words', w('bento fukuro reshito kado2 hashi genkin')), w('bento fukuro reshito kado2 hashi genkin')),
    L(patternCard('Short, polite answers', '<p>Staff ask quick yes/no questions. You can answer almost all of them with:</p><p><b>はい おねがいします</b> = yes, please · <b>いいえ だいじょうぶ です</b> = no, I’m fine.</p>', p('daijoubu fukuro kaado arigato')), p('daijoubu fukuro kaado arigato')),
    note('Konbini tips', '<p>Konbini staff talk fast and say a lot. You only need to catch the <b>question</b>: heat it? bag? card? Point, nod and smile for the rest.</p><p>The word <b>おねがいします</b> (please) works for almost any "yes".</p>', 'Konbini are open 24 hours and sell hot food, tickets and SIM cards.'),
    check([...w('bento fukuro reshito'), ...p('daijoubu fukuro kaado')]),
  ], [['talk', { sc: 'konbini' }], ['listen', { ids: [...w('bento fukuro reshito kado2 hashi genkin'), ...p('daijoubu fukuro kaado')], n: 8 }], ['speak', { ids: p('fukuro kaado daijoubu'), n: 3 }]]),

  U('jp-06', 'The T row + "where is…?"', 'たちつてと · X は どこ ですか', 12, [
    hearFirst(p('ekiwa toirewa')),
    L(kanaCard(row('hira', 't'), 'The T row', 'Two odd ones: ち = chi, つ = tsu (like the end of "cats").'), kr('hira', 't')),
    L(patternCard('Where is…?', '<p><b>X は どこ ですか</b> = Where is X?</p><p>は marks the topic. It is written は but said <b>"wa"</b> when it is a particle.</p><p>ですか turns a sentence into a question. No need to raise your voice much.</p>', p('ekiwa toirewa')), p('ekiwa toirewa')),
    L(wordsCard('Places you will look for', w('eki toire hoteru konbini ginko kusuriya')), w('eki toire hoteru konbini ginko kusuriya')),
    check([...kr('hira', 't'), ...w('eki toire hoteru konbini')]),
  ], [['rain', { kana: [...row('hira', 's'), ...row('hira', 't'), ...row('hira', 'k')].map(x => x.k), goal: 15 }], ['builder', { ids: p('ekiwa toirewa byouin koreo'), n: 4 }], ['listen', { ids: w('eki toire hoteru konbini ginko kusuriya'), n: 8 }]]),

  U('jp-07', 'Prices up to ¥1,000', 'ひゃく · いくら ですか', 14, [
    hearFirst(['jp:price:100', 'jp:price:300', 'jp:price:600', 'jp:price:800', 'jp:price:980'].map(id => ITEMS[id]), 'Listen first', 'Five prices. Three of them change their sound. Can you hear which?'),
    note('Tens', '<p>10 = じゅう. 20 = <b>に</b>じゅう, 30 = <b>さん</b>じゅう… Just say "two-ten", "three-ten".</p><p>15 = じゅうご (ten-five). 47 = よんじゅうなな.</p>'),
    L(wordsCard('Hundreds (three are irregular)', nums([100, 200, 300, 400, 500, 600, 700, 800, 900]), '', 'Irregular: <b>さんびゃく</b> (300), <b>ろっぴゃく</b> (600), <b>はっぴゃく</b> (800).'), nums([100, 200, 300, 400, 500, 600, 700, 800, 900])),
    L(patternCard('Asking the price', '<p><b>いくら ですか</b> = How much is it? · <b>これ は いくら ですか</b> = How much is this?</p><p>The answer ends in <b>えん</b> (yen): ろっぴゃく はちじゅう えん = ¥680.</p>', p('ikura korewaikura')), p('ikura korewaikura')),
    check(nums([300, 600, 800, 100, 900])),
  ], [['numbers', { set: 'num100', n: 10 }, 'Numbers to 100'], ['numbers', { set: 'price', n: 12 }, 'Cashier prices'], ['listen', { ids: p('ikura korewaikura'), n: 4 }]], prices(n => n < 1000)),

  U('jp-08', 'The N row + food', 'なにぬねの · food words', 12, [
    hearFirst(w('niku sakana yasai tamago gohan')),
    L(kanaCard(row('hira', 'n')), kr('hira', 'n')),
    L(wordsCard('Food', w('niku toriniku butaniku gyuniku sakana yasai tamago gohan pan')), w('niku toriniku butaniku gyuniku sakana yasai tamago gohan pan')),
    L(wordsCard('Japanese dishes', w('soba tenpura misoshiru bento onigiri')), w('soba tenpura misoshiru bento onigiri')),
    L(patternCard('If you don’t eat something', '<p><b>X は たべません</b> = I don’t eat X. Very useful for meat or beef.</p>', p('nikuwa vege')), p('nikuwa vege')),
    check(w('niku sakana yasai tamago gohan gyuniku')),
  ], [['rain', { kana: [...row('hira', 'n'), ...row('hira', 't'), ...V].map(x => x.k), goal: 15 }], ['memory', { ids: w('niku sakana yasai tamago gohan pan soba tenpura'), pairs: 6 }], ['dictation', { ids: w('niku sakana yasai tamago gohan soba'), n: 6 }]]),

  U('jp-09', 'Ordering ramen', 'A full meal, start to end', 14, [
    sceneCard('ramen'),
    L(wordsCard('Meal phrases', p('hitori futari osusume koreni itadakimasu gochisousama okaikei')), p('hitori futari osusume koreni itadakimasu gochisousama okaikei')),
    note('Two meal rituals', '<p><b>いただきます</b> before you eat (like saying grace). <b>ごちそうさま でした</b> after you eat, often to the staff as you leave.</p><p>Locals notice and smile when visitors use them.</p>'),
    L(wordsCard('Menu words', w('menyu osusume okawari chumon kaikei hashi')), w('menyu osusume okawari chumon kaikei hashi')),
    check(p('osusume itadakimasu gochisousama okaikei hitori')),
  ], [['talk', { sc: 'ramen' }], ['listen', { ids: p('hitori futari osusume koreni itadakimasu gochisousama okaikei'), n: 8 }], ['speak', { ids: p('osusume okaikei gochisousama'), n: 3 }]]),

  U('jp-10', 'The H row + voiced sounds', 'はひふへほ · が ざ だ ば ぱ', 14, [
    hearFirst(w('hidari hito hiru ginko kaze doko')),
    L(kanaCard(row('hira', 'h'), 'The H row', 'ふ is "fu": blow softly, like cooling soup. Between f and h.'), kr('hira', 'h')),
    L(note('Two dots and a circle', `<p>Two small dots (゛) make a sound "voiced": <b>か→が</b> (ka→ga), <b>さ→ざ</b>, <b>た→だ</b>, <b>は→ば</b>.</p><p>A small circle (゜) on the H row makes P: <b>は→ぱ</b>.</p><div class="jp-kgrid">${DAKUTEN_H.map(k => `<button class="jp-ktile sm" ${clipAttr(k.k)}><b lang="ja">${k.k}</b><span>${k.r}</span></button>`).join('')}</div>`, 'Hindi has the same pairs: क/ग, त/द, प/ब.'), K(DAKUTEN_H)),
    L(wordsCard('Words to read', w('hidari hito hiru ginko kaze doko dare eigo')), w('hidari hito hiru ginko kaze doko dare eigo')),
    check([...K(DAKUTEN_H.slice(0, 10)), ...kr('hira', 'h')]),
  ], [['rain', { kana: [...row('hira', 'h'), ...DAKUTEN_H].map(x => x.k), goal: 15 }], ['dictation', { ids: w('hidari hito hiru ginko kaze doko dare'), n: 6 }], ['read', { ids: [...K(DAKUTEN_H), ...kr('hira', 'h')], kinds: ['kana'], n: 12 }]]),

  U('jp-11', 'Asking for directions', 'Right, left, straight on', 14, [
    hearFirst(p('massugu migini hidarini')),
    L(wordsCard('Direction words', w('migi hidari massugu mae ushiro tonari chikai toi kado shingo kosaten')), w('migi hidari massugu mae ushiro tonari chikai toi kado shingo kosaten')),
    L(patternCard('What locals will tell you', '<p>Instructions end in <b>…て ください</b> (please do…). Listen for the direction word before it.</p>', p('massugu migini hidarini')), p('massugu migini hidarini')),
    L(patternCard('Your best friends when lost', '<p>The skill is not understanding everything. It is asking them to slow down or repeat.</p>', p('tooi aruite chizude mayoi yukkuri mouichido')), p('tooi aruite chizude mayoi yukkuri mouichido')),
    sceneCard('directions'),
    check([...w('migi hidari massugu chikai toi'), ...p('yukkuri')]),
  ], [['talk', { sc: 'directions' }], ['listen', { ids: [...w('migi hidari massugu mae ushiro chikai toi kado shingo'), ...p('massugu migini hidarini')], n: 10 }], ['builder', { ids: p('migini hidarini tooi mayoi'), n: 4 }]]),

  U('jp-12', 'The M and Y rows', 'まみむめも · やゆよ', 12, [
    hearFirst(w('mise machi mado yama umi yasui yoru ima')),
    L(kanaCard([...row('hira', 'm'), ...row('hira', 'y')], 'The M and Y rows', 'The Y row has only three: や ゆ よ.'), kr('hira', 'm y')),
    L(wordsCard('Words to read', w('mise machi mado yama umi yasui yoru ima yasai')), w('mise machi mado yama umi yasui yoru ima yasai')),
    note('Look-alikes', '<p>Three pairs trick everyone: <b>ぬ / め</b> (ぬ has a loop), <b>ね / れ / わ</b> (loop, kick, or plain curve), <b>る / ろ</b> (る has a loop).</p><p>Kana rain mixes them on purpose.</p>'),
    check(kr('hira', 'm y')),
  ], [['rain', { kana: [...row('hira', 'm'), ...row('hira', 'y'), ...row('hira', 'n'), ...row('hira', 'h')].map(x => x.k), goal: 18 }], ['memory', { ids: w('mise machi mado yama umi yasui yoru ima'), pairs: 6 }], ['read', { ids: [...kr('hira', 'm y'), ...w('mise yama umi yoru')], n: 12 }]]),

  U('jp-13', 'Big prices: せん and まん', '¥1,000 to ¥30,000', 14, [
    hearFirst(['jp:price:1000', 'jp:price:3000', 'jp:price:8000', 'jp:price:10000', 'jp:price:3800'].map(id => ITEMS[id])),
    L(wordsCard('Thousands', nums([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]), '', 'Irregular: <b>さんぜん</b> (3,000), <b>はっせん</b> (8,000). 10,000 = <b>いちまん</b>: Japan counts in ten-thousands.'), nums([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000])),
    note('Build any price', '<p>Read big to small: ¥3,800 = <b>さんぜん</b> + <b>はっぴゃく</b> + えん.</p><p>¥12,000 = <b>いちまん にせん えん</b> (one ten-thousand, two thousand).</p>'),
    L(wordsCard('Money words', w('okane genkin kado2 menzei yasui takai')), w('okane genkin kado2 menzei yasui takai')),
    check(nums([1000, 3000, 8000, 10000, 5000])),
  ], [['numbers', { set: 'pricebig', n: 12 }, 'Shop prices'], ['numbers', { set: 'numbig', n: 10 }, 'Big numbers'], ['listen', { ids: w('okane genkin kado2 menzei yasui takai'), n: 6 }]], prices(n => n >= 1000)),

  U('jp-14', 'The R and W rows: all hiragana!', 'らりるれろ · わ を ん', 14, [
    hearFirst(w('ringo resutoran kore sore are doko')),
    L(kanaCard([...row('hira', 'r'), ...row('hira', 'w')], 'The last rows', 'Japanese r is a light tap of the tongue, between r, l and d. Like a soft Hindi ड़.'), kr('hira', 'r w')),
    L(wordsCard('Words to read', w('ringo kore sore are ofuro iro'), 'After this station you can read every basic hiragana.'), w('ringo kore sore are ofuro iro')),
    note('You did it', '<p>You now know all 46 basic hiragana. Open the <b>Kana chart</b> tool any time to review them and see which ones are weak.</p>'),
    check(kr('hira', 'r w')),
  ], [['rain', { kana: HIRAGANA.map(x => x.k), goal: 20 }, 'Kana rain: all hiragana'], ['dictation', { ids: w('ringo kore sore are ofuro iro'), n: 6 }], ['read', { ids: K(HIRAGANA), kinds: ['kana'], n: 15 }]]),

  U('jp-15', 'Small sounds and long sounds', 'きゃ · っ · おう', 14, [
    hearFirst(w('kippu chotto massugu densha kyo shashin byoin gyunyu')),
    L(note('Small ゃ ゅ ょ', `<p>A small ゃ ゅ ょ joins the kana before it into <b>one beat</b>: き + ゃ = <b>kya</b>, し + ょ = <b>sho</b>.</p><div class="jp-kgrid">${YOON_H.map(k => `<button class="jp-ktile sm" ${clipAttr(k.k)}><b lang="ja">${k.k}</b><span>${k.r}</span></button>`).join('')}</div>`), K(YOON_H)),
    note('Small っ = a short pause', '<p>A small っ doubles the next sound with a tiny stop: <b>きっぷ</b> = ki-<b>p</b>-pu (ticket). Like the stop in Hindi पक्का.</p>'),
    note('Long vowels change meaning', '<p>Hold a vowel for two beats when it is doubled: <b>びょういん</b> (byōin, hospital) vs <b>びよういん</b> (biyōin, hair salon)!</p><p>おう and ええ are usually long: きょう = kyō (today).</p>', 'In romaji, a line over a vowel (ō) means "hold it for two beats".'),
    L(wordsCard('Words with small and long sounds', w('kippu chotto massugu densha kyo shashin byoin gyunyu shoyu kyukyusha')), w('kippu chotto massugu densha kyo shashin byoin gyunyu shoyu kyukyusha')),
    check(w('kippu chotto densha kyo byoin shashin')),
  ], [['dictation', { ids: w('kippu chotto densha kyo shashin byoin shoyu'), n: 7 }], ['listen', { ids: K(YOON_H), kinds: ['kana'], n: 10 }, 'Hear the combined sounds'], ['listen', { ids: w('kippu chotto massugu densha kyo shashin byoin gyunyu shoyu'), n: 8 }]]),

  U('jp-16', 'Trains and tickets', 'Platforms, tickets, transfers', 15, [
    sceneCard('train'),
    L(wordsCard('Station words', w('eki densha shinkansen chikatetsu kippu homu kaisatsu deguchi iriguchi norikae shiteiseki jiyuseki otona')), w('eki densha shinkansen chikatetsu kippu homu kaisatsu deguchi iriguchi norikae shiteiseki jiyuseki otona')),
    L(patternCard('Buying a ticket', '<p><b>[place] まで おとな いちまい</b> = One adult ticket to [place]. まで = "up to / until".</p>', p('kyotomade')), p('kyotomade')),
    L(patternCard('On the platform', '<p>Ask if a train goes somewhere: <b>この でんしゃ は [place] に いきますか</b>. に = "to".</p>', p('kono_densha nanbansen tsugi koko_de donokurai')), p('kono_densha nanbansen tsugi koko_de donokurai')),
    check([...w('kippu deguchi norikae jiyuseki'), ...p('nanbansen')]),
  ], [['talk', { sc: 'train' }], ['listen', { ids: w('eki densha shinkansen kippu homu kaisatsu deguchi iriguchi norikae shiteiseki jiyuseki'), n: 10 }], ['builder', { ids: p('kyotomade kono_densha koko_de nanbansen'), n: 4 }]]),

  U('jp-17', 'Telling the time and days', 'なんじ ですか · Monday to Sunday', 15, [
    hearFirst(['jp:time:3:0', 'jp:time:4:0', 'jp:time:7:30', 'jp:time:9:0'].map(id => ITEMS[id])),
    note('Hours', '<p>Number + <b>じ</b>: いちじ (1:00), にじ (2:00)… Three are special: <b>よじ</b> (4), <b>しちじ</b> (7), <b>くじ</b> (9).</p><p><b>はん</b> = half past: さんじはん = 3:30.</p>'),
    L(wordsCard('Days of the week', w('getsuyobi kayobi suiyobi mokuyobi kinyobi doyobi nichiyobi'), 'Each day is named after a nature element: moon, fire, water, wood, gold, earth, sun.'), w('getsuyobi kayobi suiyobi mokuyobi kinyobi doyobi nichiyobi')),
    L(wordsCard('Time words', w('ima kyo ashita kino asa hiru yoru gozen gogo nanji')), w('ima kyo ashita kino asa hiru yoru gozen gogo nanji')),
    L(patternCard('Time questions', '', p('imananji akimasu nanjimade nanyoubi')), p('imananji akimasu nanjimade nanyoubi')),
  ], [['numbers', { set: 'time', n: 12 }, 'Catch the time'], ['listen', { ids: w('getsuyobi kayobi suiyobi mokuyobi kinyobi doyobi nichiyobi ima kyo ashita kino'), n: 10 }], ['builder', { ids: p('imananji akimasu nanjimade nanyoubi'), n: 4 }]], times()),

  U('jp-18', 'Hotel check-in', 'Rooms, keys and Wi-Fi', 14, [
    sceneCard('hotel'),
    L(wordsCard('Hotel words', w('heya kagi yoyaku chekkuin chekkuauto nimotsu taoru waifai pasuwado furonto erebeta ofuro')), w('heya kagi yoyaku chekkuin chekkuauto nimotsu taoru waifai pasuwado furonto erebeta ofuro')),
    L(wordsCard('Hotel phrases', p('yoyaku_shite checkin nimotsu wifi checkout asagohan kagi towel')), p('yoyaku_shite checkin nimotsu wifi checkout asagohan kagi towel')),
    note('Hotel manners', '<p>Many hotels give slippers and a light robe (ゆかた). In a traditional inn, take shoes off at the entrance.</p><p>Staff are very polite. You can stay simple: phrase + <b>おねがいします</b>.</p>'),
    check([...w('heya kagi nimotsu taoru'), ...p('wifi checkout')]),
  ], [['talk', { sc: 'hotel' }], ['listen', { ids: [...w('heya kagi yoyaku nimotsu taoru furonto'), ...p('wifi checkout asagohan towel')], n: 10 }], ['speak', { ids: p('checkin wifi nimotsu'), n: 3 }]]),

  U('jp-19', 'Katakana 1: ア to ソ', 'Foreign words, part 1', 14, [
    hearFirst(w('keki sarada aisukurimu kohi supu saizu')),
    note('Why katakana?', '<p>Katakana spells foreign words: コーヒー (coffee), ホテル (hotel). It has the same sounds as hiragana, with sharper shapes.</p><p>The line <b>ー</b> means "hold the vowel": コー = kō.</p>', 'Menus, signs and shops are full of katakana. Many words sound like English!'),
    L(kanaCard([...row('kata', 'a'), ...row('kata', 'k'), ...row('kata', 's')], 'ア row to サ row'), kr('kata', 'a k s')),
    L(wordsCard('Loanwords', w('keki sarada aisukurimu kohi supu saizu kado2')), w('keki sarada aisukurimu kohi supu saizu kado2')),
    check(kr('kata', 'a k s')),
  ], [['rain', { kana: [...row('kata', 'a'), ...row('kata', 'k'), ...row('kata', 's')].map(x => x.k), goal: 15, script: 'kata' }], ['read', { ids: [...kr('kata', 'a k s'), ...w('keki sarada kohi supu')], n: 12 }], ['menu', { n: 8, size: 6 }]]),

  U('jp-20', 'Katakana 2: タ to ホ', 'Foreign words, part 2', 14, [
    hearFirst(w('tosuto hottodoggu chizukeki sandoitchi pasuta piza')),
    L(kanaCard([...row('kata', 't'), ...row('kata', 'n'), ...row('kata', 'h')], 'タ row to ハ row', 'Tricky pairs: シ vs ツ, and ソ vs ン. Watch which way the strokes go.'), kr('kata', 't n h')),
    L(wordsCard('Café words', w('tosuto hottodoggu chizukeki sandoitchi pasuta piza tishatsu hoteru toire takushi')), w('tosuto hottodoggu chizukeki sandoitchi pasuta piza tishatsu hoteru toire takushi')),
    note('Spot the trap', '<p><b>シ</b> (shi) strokes go up from the left. <b>ツ</b> (tsu) strokes come down from the top.</p><p><b>ソ</b> (so) sews down. <b>ン</b> (n) sews up. Say the hint while you trace it with a finger.</p>'),
    check(kr('kata', 't n h')),
  ], [['rain', { kana: [...row('kata', 't'), ...row('kata', 'n'), ...row('kata', 'h'), ...row('kata', 's')].map(x => x.k), goal: 16, script: 'kata' }], ['menu', { n: 10 }], ['dictation', { ids: w('tosuto pasuta piza hoteru toire takushi'), n: 6 }]]),

  U('jp-21', 'Katakana 3: マ to ン', 'All katakana + new sounds', 15, [
    hearFirst(w('menyu remon mirukuti hanbaga furaidopoteto chokoreto erebeta pasupoto waifai')),
    L(kanaCard([...row('kata', 'm'), ...row('kata', 'y'), ...row('kata', 'r'), ...row('kata', 'w')], 'マ row to ン'), kr('kata', 'm y r w')),
    L(note('Extra sounds for foreign words', `<p>Katakana adds small vowels to make sounds Japanese lacks: <b>ティ</b> (ti), <b>ファ</b> (fa), <b>ウェ</b> (we).</p><div class="jp-kgrid">${EXT_KATA.map(k => `<button class="jp-ktile sm" ${clipAttr(k.k)}><b lang="ja">${k.k}</b><span>${k.r}</span></button>`).join('')}</div>`), K(EXT_KATA)),
    L(wordsCard('Words to read', w('menyu remon mirukuti hanbaga furaidopoteto chokoreto erebeta pasupoto waifai')), w('menyu remon mirukuti hanbaga furaidopoteto chokoreto erebeta pasupoto waifai')),
    check(kr('kata', 'm y r w')),
  ], [['rain', { kana: KATAKANA.map(x => x.k), goal: 20, script: 'kata' }, 'Kana rain: all katakana'], ['menu', { n: 12, size: 10 }, 'Busy café'], ['read', { ids: w('menyu remon mirukuti hanbaga chokoreto erebeta pasupoto waifai furaidopoteto'), n: 10 }]], [...K(DAKUTEN_K), ...K(YOON_K.slice(0, 9))]),

  U('jp-22', 'Shopping and sizes', 'Try on, bigger, tax-free', 15, [
    sceneCard('clothes'),
    L(wordsCard('Shop words', w('fuku kutsu tishatsu saizu shichaku omiyage seru')), w('fuku kutsu tishatsu saizu shichaku omiyage seru')),
    L(wordsCard('Colours', w('iro aka ao shiro kuro kiiro midori')), w('iro aka ao shiro kuro kiiro midori')),
    L(patternCard('Do you have…?', '<p><b>X は ありますか</b> = Do you have X? / Is there X?</p><p><b>もっと</b> = more: もっと おおきい の = a bigger one.</p>', p('miteiru shichaku ookii chiisai hoka menzei receipt')), p('miteiru shichaku ookii chiisai hoka menzei receipt')),
    check([...w('aka ao shiro kuro fuku kutsu'), ...p('shichaku ookii')]),
  ], [['talk', { sc: 'clothes' }], ['memory', { ids: w('aka ao shiro kuro kiiro midori fuku kutsu'), pairs: 6 }], ['builder', { ids: p('shichaku ookii chiisai hoka menzei'), n: 5 }]]),

  U('jp-23', 'Describing things', 'おいしい · たかい · きれい', 14, [
    hearFirst(w('oishii karai amai okii chiisai atsui samui kirei')),
    L(patternCard('X は Y です', '<p><b>X は Y です</b> = X is Y. ラーメン は おいしい です = The ramen is delicious.</p><p>Add <b>とても</b> (very) before the describing word: とても おいしい です.</p>', p('oishii takai genki')), p('oishii takai genki')),
    L(wordsCard('Describing words', w('oishii karai amai okii chiisai atarashii furui atsui samui tsumetai ii warui kirei shizuka tanoshii sugoi kawaii hayai osoi')), w('oishii karai amai okii chiisai atarashii furui atsui samui tsumetai ii warui kirei shizuka tanoshii sugoi kawaii hayai osoi')),
    note('Opposites in pairs', '<p>Learn them in pairs: おおきい ↔ ちいさい, あつい ↔ さむい, たかい ↔ やすい, はやい ↔ おそい.</p>', 'あつい (hot) and さむい (cold) are for weather. For a cold drink, say つめたい.'),
    check(w('oishii karai okii chiisai atsui samui kirei')),
  ], [['memory', { ids: w('oishii karai amai okii chiisai atsui samui kirei hayai osoi'), pairs: 6 }], ['listen', { ids: w('oishii karai amai okii chiisai atarashii furui atsui samui tsumetai ii warui kirei shizuka tanoshii sugoi kawaii'), n: 12 }], ['read', { ids: w('oishii karai okii chiisai atsui samui kirei sugoi'), n: 10 }]]),

  U('jp-24', 'I want to…: ～たい です', 'Say what you want to do', 14, [
    hearFirst(p('otera sushiga')),
    L(wordsCard('Action words (polite form)', w('ikimasu kimasu tabemasu nomimasu kaimasu mimasu kaerimasu')), w('ikimasu kimasu tabemasu nomimasu kaimasu mimasu kaerimasu')),
    L(patternCard('From "do" to "want to do"', '<p>Take the polite verb, swap <b>ます</b> for <b>たい です</b>:</p><p>いきます (go) → <b>いきたい です</b> (I want to go).<br>たべます (eat) → <b>たべたい です</b> (I want to eat).</p><p>Place + <b>に</b> いきたい です. Food + <b>が</b> たべたい です.</p>', p('otera sushiga')), p('otera sushiga')),
    note('Try it', '<p>Say out loud: <b>おんせん に いきたい です</b> (I want to go to a hot spring). <b>ラーメン が たべたい です</b>.</p>'),
    check(w('ikimasu tabemasu nomimasu kaimasu mimasu')),
  ], [['listen', { ids: w('ikimasu kimasu tabemasu nomimasu kaimasu mimasu kaerimasu hanashimasu wakarimasu'), n: 10 }], ['builder', { ids: p('otera sushiga ekiwa koreo'), n: 4 }], ['speak', { ids: p('otera sushiga'), n: 2 }]], w('hanashimasu wakarimasu')),

  U('jp-25', 'Counting things and people', 'ひとつ ふたり いちまい', 15, [
    sceneCard('izakaya'),
    L(wordsCard('Counting things', w('hitotsu futatsu mittsu yottsu itsutsu muttsu nanatsu yattsu kokonotsu to ikutsu'), 'Use these for most things, like dishes and drinks.'), w('hitotsu futatsu mittsu yottsu itsutsu muttsu nanatsu yattsu kokonotsu to ikutsu')),
    L(wordsCard('Counting people', w('hitori futari sannin yonin nannin'), '', 'One and two people are special: ひとり, ふたり. From three: number + にん.'), w('hitori futari sannin yonin nannin')),
    L(wordsCard('Flat and long things', w('ichimai nimai sanmai ippon nihon2 sanbon'), 'まい = flat things (tickets, sheets). ほん = long things (bottles, umbrellas).'), w('ichimai nimai sanmai ippon nihon2 sanbon')),
    check(w('hitotsu futatsu mittsu hitori futari sannin')),
  ], [['talk', { sc: 'izakaya' }], ['listen', { ids: w('hitotsu futatsu mittsu yottsu itsutsu hitori futari sannin yonin ichimai ippon'), n: 10 }], ['memory', { ids: w('hitotsu futatsu mittsu hitori futari sannin'), pairs: 6 }]]),

  U('jp-26', 'Polite requests: ～て ください', 'Wait, repeat, help', 14, [
    hearFirst(p('chottomatte yukkuri kaite tetsudatte')),
    L(patternCard('Please do…', '<p><b>～て ください</b> = please do… The て-form is the verb’s "connecting" form. Learn these ready-made:</p>', p('chottomatte mouichido yukkuri kaite tetsudatte shashin_kudasai tomete massugu')), p('chottomatte mouichido yukkuri kaite tetsudatte shashin_kudasai tomete massugu')),
    note('Your rescue kit', '<p>If you remember only three requests, make it these: <b>ゆっくり おねがいします</b>, <b>もう いちど おねがいします</b>, <b>かいて ください</b> (write it down).</p>'),
    note('ください vs おねがいします', '<p>Both mean please. <b>X を ください</b> asks for a thing. <b>～て ください</b> asks for an action. <b>おねがいします</b> works for both and sounds a little softer.</p>'),
    check(p('chottomatte mouichido yukkuri kaite tetsudatte')),
  ], [['speak', { ids: p('chottomatte mouichido yukkuri kaite tetsudatte'), n: 4 }], ['builder', { ids: p('chottomatte kaite shashin_kudasai tomete tetsudatte'), n: 5 }], ['listen', { ids: p('chottomatte mouichido yukkuri kaite tetsudatte shashin_kudasai tomete massugu'), n: 8 }]]),

  U('jp-27', 'Small talk with a local', 'Talk about India, work, hobbies', 16, [
    sceneCard('smalltalk'),
    L(wordsCard('About you', p('watashiwa indokara hajimete nikaime engineer shumi daisuki')), p('watashiwa indokara hajimete nikaime engineer shumi daisuki')),
    L(wordsCard('Ask them back', p('onamae indoni curry ogenki')), p('onamae indoni curry ogenki')),
    L(wordsCard('Make plans', p('issho nomini iidesune zannen line tanoshikatta mataai')), p('issho nomini iidesune zannen line tanoshikatta mataai')),
    note('Making friends', '<p>Japanese people often say a polite "no" without the word "no". <b>ざんねん です が ちょっと…</b> (it’s a pity, but…) is a soft no. You can use it too.</p>'),
  ], [['talk', { sc: 'smalltalk' }], ['talk', { sc: 'friend' }], ['speak', { ids: p('watashiwa indokara engineer shumi'), n: 4 }]]),

  U('jp-28', 'Taxis and temples', 'Get there, behave well', 15, [
    sceneCard('taxi'),
    L(wordsCard('Taxi phrases', p('jusho tomete donokurai')), p('jusho tomete donokurai')),
    sceneCard('temple'),
    L(wordsCard('Temple manners', p('kutsu naka shashin_ii')), p('kutsu naka shashin_ii')),
    L(wordsCard('Places to visit', w('otera jinja onsen bijutsukan hakubutsukan koen')), w('otera jinja onsen bijutsukan hakubutsukan koen')),
  ], [['talk', { sc: 'taxi' }], ['talk', { sc: 'temple' }], ['listen', { ids: [...w('otera jinja onsen bijutsukan hakubutsukan koen'), ...p('kutsu naka shashin_ii jusho tomete')], n: 10 }]]),

  U('jp-29', 'Health and emergencies', 'Pharmacy, pain, help', 15, [
    hearFirst(p('tasukete kyukyusha atama')),
    L(wordsCard('Body and health', w('itai kusuri atama onaka nodo netsu kaze arerugi isha byoki')), w('itai kusuri atama onaka nodo netsu kaze arerugi isha byoki')),
    L(patternCard('It hurts', '<p><b>[body part] が いたい です</b> = My [body part] hurts.</p>', p('atama onaka netsu kazegusuri allergy')), p('atama onaka netsu kazegusuri allergy')),
    L(wordsCard('Emergencies', p('tasukete kyukyusha keisatsu saifu byouin'), '', 'Japan emergency numbers: 119 for ambulance and fire, 110 for police.'), p('tasukete kyukyusha keisatsu saifu byouin')),
    sceneCard('pharmacy'),
  ], [['talk', { sc: 'pharmacy' }], ['listen', { ids: [...w('itai kusuri atama onaka nodo netsu kaze isha'), ...p('tasukete kyukyusha keisatsu atama onaka netsu')], n: 10 }], ['speak', { ids: p('atama tasukete kyukyusha'), n: 3 }]], w('kyukyusha keisatsu tasukete abunai saifu pasupoto')),

  U('jp-30', 'Booking a table + grand tour', 'Phone Japanese and a final mix', 16, [
    sceneCard('reserve'),
    L(wordsCard('Booking phrases', p('yoyaku_shitai konban')), p('yoyaku_shitai konban')),
    note('Phone tips', '<p>Phone Japanese is fast and very polite. Listen for numbers (people, time) and these words: <b>まんせき</b> = fully booked, <b>いかが ですか</b> = how about…?</p>'),
    check(p('yoyaku_shitai konban okaikei hitori futari')),
    note('The grand tour', '<p>The last games mix everything you have learned. Then keep your daily reviews going: they are the secret to remembering.</p>', 'Before your trip, use Listening drill in hands-free mode on walks.'),
  ], [['talk', { sc: 'reserve' }], ['listen', { ids: [], kinds: ['word', 'phr'], n: 15, interleave: 1 }, 'Grand tour: listening'], ['numbers', { set: 'pricebig', n: 10 }, 'Grand tour: prices']]),
];
