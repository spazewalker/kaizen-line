// Kana tables, mnemonics and a Hepburn romaji converter. No DOM: safe in node for audio generation.

// [kana, romaji, mnemonic]
const H = [
  ['a', [['あ', 'a', 'An apple: a cross with a looping stem'], ['い', 'i', 'Two eels side by side: "ee"-ls'], ['う', 'u', 'A person with a stomach ache: "ooh!"'], ['え', 'e', 'An energetic dancer kicking a leg out'], ['お', 'o', '"Oh!" A golf ball flying off its tee']]],
  ['k', [['か', 'ka', 'A karate chop with a blade beside it'], ['き', 'ki', 'A key with two teeth'], ['く', 'ku', 'A cuckoo bird’s open beak'], ['け', 'ke', 'A keg next to a post'], ['こ', 'ko', 'Two co-workers lying flat on the floor']]],
  ['s', [['さ', 'sa', 'A samurai leaning on his sword'], ['し', 'shi', 'A fishing hook: she goes fishing'], ['す', 'su', 'A swing with a loop in its rope'], ['せ', 'se', 'Say "ahh": a mouth with one big tooth'], ['そ', 'so', 'A zig-zag sewing thread']]],
  ['t', [['た', 'ta', 'The letters t + a, side by side'], ['ち', 'chi', 'A cheerleader drawing a backward 5'], ['つ', 'tsu', 'A tsunami wave curling over'], ['て', 'te', 'A hand reaching out (te means hand)'], ['と', 'to', 'A toe with a thorn stuck in it']]],
  ['n', [['な', 'na', 'A nun praying beside a cross'], ['に', 'ni', 'A knee next to a stick'], ['ぬ', 'nu', 'Noodles with chopsticks'], ['ね', 'ne', 'A neko (cat) curling its tail'], ['の', 'no', 'A "no entry" sign']]],
  ['h', [['は', 'ha', 'A laughing stick figure: ha!'], ['ひ', 'hi', 'A big grin: hee hee'], ['ふ', 'fu', 'Mount Fuji with people dancing around it'], ['へ', 'he', 'A small hill: he climbs it'], ['ほ', 'ho', 'A holy tree with one extra branch']]],
  ['m', [['ま', 'ma', 'Mama wearing a necklace'], ['み', 'mi', 'Me, writing the number 21'], ['む', 'mu', 'A cow’s face: moo'], ['め', 'me', 'An eye (me means eye)'], ['も', 'mo', 'More fish on one hook']]],
  ['y', [['や', 'ya', 'A yak with big horns'], ['ゆ', 'yu', 'A unique fish swimming in a loop'], ['よ', 'yo', 'A yo-yo on a string']]],
  ['r', [['ら', 'ra', 'A rabbit sitting up'], ['り', 'ri', 'Reeds swaying by a river'], ['る', 'ru', 'A route that ends in a loop'], ['れ', 're', 'A man retching over a fence'], ['ろ', 'ro', 'A road with no loop at the end (unlike る)']]],
  ['w', [['わ', 'wa', 'A wasp: like ね but no loop'], ['を', 'o', '"Whoa!" A man tipping over (used as the object marker)'], ['ん', 'n', 'A cursive n']]],
];
const K = [
  ['a', [['ア', 'a', 'An axe blade on a handle'], ['イ', 'i', 'An easel leaning on a stick'], ['ウ', 'u', 'Like う with a hat on'], ['エ', 'e', 'An I-beam in an elevator shaft'], ['オ', 'o', 'An opera singer with arms out']]],
  ['k', [['カ', 'ka', 'Like か without the tick: a karate blade'], ['キ', 'ki', 'A key, like き without the bottom'], ['ク', 'ku', 'A sharp cuckoo beak'], ['ケ', 'ke', 'A bent letter K: "ke"'], ['コ', 'ko', 'The corner of a box']]],
  ['s', [['サ', 'sa', 'Like さ: a samurai’s crossed poles'], ['シ', 'shi', 'A smiling face; the strokes go UP: she smiles'], ['ス', 'su', 'A person doing the splits: super stretch'], ['セ', 'se', 'Like せ: a mouth with a big tooth'], ['ソ', 'so', 'A needle sewing DOWN (ン sews up)']]],
  ['t', [['タ', 'ta', 'Like ク with a tongue: ta'], ['チ', 'chi', 'A cheerleader holding a baton up'], ['ツ', 'tsu', 'A tsunami: drops fall DOWN (シ goes up)'], ['テ', 'te', 'A telephone pole with a wire'], ['ト', 'to', 'A totem pole with one branch']]],
  ['n', [['ナ', 'na', 'A knife cross'], ['ニ', 'ni', 'Two lines: ni means two'], ['ヌ', 'nu', 'Chopsticks pinching noodles'], ['ネ', 'ne', 'A necktie on a hook'], ['ノ', 'no', 'One slash: no way!']]],
  ['h', [['ハ', 'ha', 'Two lines laughing apart: ha-ha'], ['ヒ', 'hi', 'A heel kicking back'], ['フ', 'fu', 'One side of Mount Fuji'], ['ヘ', 'he', 'The same hill as へ'], ['ホ', 'ho', 'A holy cross with two arms']]],
  ['m', [['マ', 'ma', 'A mailbox flap opening'], ['ミ', 'mi', 'Three lines: mi-ttsu means three'], ['ム', 'mu', 'A cow’s nose: moo'], ['メ', 'me', 'An X marks the melon'], ['モ', 'mo', 'More bars than テ: monkey bars']]],
  ['y', [['ヤ', 'ya', 'A yak’s horn'], ['ユ', 'yu', 'A U-turn sign: you turn'], ['ヨ', 'yo', 'A backward E: yo!']]],
  ['r', [['ラ', 'ra', 'A ramp with a lid'], ['リ', 'ri', 'Reeds, like り'], ['ル', 'ru', 'Roots spreading out'], ['レ', 're', 'A lever pulled back'], ['ロ', 'ro', 'A robot’s square mouth']]],
  ['w', [['ワ', 'wa', 'A wide water cup'], ['ヲ', 'o', 'Like オ with a hook (rare in words)'], ['ン', 'n', 'A needle sewing UP (ソ sews down)']]],
];
const DAKU_H = [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'], ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'], ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'], ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'], ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']];
const YOON_BASE = [['き', 'k'], ['し', 'sh'], ['ち', 'ch'], ['に', 'n'], ['ひ', 'h'], ['み', 'm'], ['り', 'r'], ['ぎ', 'g'], ['じ', 'j'], ['び', 'b'], ['ぴ', 'p']];
const EXT_K = [['ティ', 'ti'], ['ディ', 'di'], ['ファ', 'fa'], ['フィ', 'fi'], ['フェ', 'fe'], ['フォ', 'fo'], ['ウィ', 'wi'], ['ウェ', 'we'], ['ウォ', 'wo'], ['シェ', 'she'], ['ジェ', 'je'], ['チェ', 'che'], ['ヴ', 'vu'], ['ヴァ', 'va'], ['デュ', 'dyu']];

export const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
export const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

const mk = (k, r, mn, script, group, row) => ({ k, r, mn: mn || '', script, group, row });
export const HIRAGANA = H.flatMap(([row, l]) => l.map(([k, r, mn]) => mk(k, r, mn, 'hira', 'basic', row)));
export const KATAKANA = K.flatMap(([row, l]) => l.map(([k, r, mn]) => mk(k, r, mn, 'kata', 'basic', row)));
export const DAKUTEN_H = DAKU_H.map(([k, r]) => mk(k, r, '', 'hira', 'daku', r[0]));
export const DAKUTEN_K = DAKU_H.map(([k, r]) => mk(toKata(k), r, '', 'kata', 'daku', r[0]));
const yoonFor = script => YOON_BASE.flatMap(([b, c]) => [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o']].map(([s, v]) => {
  const k = b + s;
  const r = (c === 'sh' || c === 'ch' || c === 'j') ? c + v : c + 'y' + v;
  return mk(script === 'kata' ? toKata(k) : k, r, '', script, 'yoon', c);
}));
export const YOON_H = yoonFor('hira');
export const YOON_K = yoonFor('kata');
export const EXT_KATA = EXT_K.map(([k, r]) => mk(k, r, '', 'kata', 'ext', 'ext'));
export const ALL_KANA = [...HIRAGANA, ...DAKUTEN_H, ...YOON_H, ...KATAKANA, ...DAKUTEN_K, ...YOON_K, ...EXT_KATA];
export const KANA_BY = Object.fromEntries(ALL_KANA.map(x => [x.k, x]));
/** Kana of one row: script 'hira'|'kata', row 'a'|'k'|... */
export const row = (script, r) => (script === 'kata' ? KATAKANA : HIRAGANA).filter(x => x.row === r);
export const rowNames = { a: 'vowels', k: 'K', s: 'S', t: 'T', n: 'N', h: 'H', m: 'M', y: 'Y', r: 'R', w: 'W' };

// ---------- romaji (modified Hepburn with macrons) ----------
const BASE = {};
[...HIRAGANA, ...DAKUTEN_H, ...YOON_H].forEach(x => { BASE[x.k] = x.r; });
BASE['を'] = 'o'; BASE['ぁ'] = 'a'; BASE['ぃ'] = 'i'; BASE['ぅ'] = 'u'; BASE['ぇ'] = 'e'; BASE['ぉ'] = 'o';
EXT_K.forEach(([k, r]) => { BASE[toHira(k)] = r; });
BASE['ゔ'] = 'vu';
const MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const SMALL = 'ゃゅょぁぃぅぇぉ';

/** Split kana into morae (yōon and small vowels attach to the previous kana). */
export function morae(s) {
  const out = [];
  for (const ch of s) {
    if (SMALL.includes(toHira(ch)) && out.length && !'っッ'.includes(out[out.length - 1])) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

function wordRomaji(w) {
  const kata = /[\u30a1-\u30fa]/.test(w);
  if (w === 'は') return 'wa';
  if (w === 'へ') return 'e';
  if (w === 'を') return 'o';
  if (/(にち|ばん)は$/.test(w)) w = w.slice(0, -1) + 'わ';
  const m = morae(toHira(w));
  let out = '', gem = false;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === 'っ') { gem = true; continue; }
    if (c === 'ー') { const v = out.slice(-1); if (MACRON[v]) out = out.slice(0, -1) + MACRON[v]; continue; }
    let r = BASE[c];
    if (r == null) { out += c; continue; }
    if (c === 'ん') {
      const nx = m[i + 1] ? (BASE[m[i + 1]] || '') : '';
      out += /^[aiueoy]/.test(nx) ? "n'" : 'n';
      continue;
    }
    if (gem) { r = (r.startsWith('ch') ? 't' : r[0]) + r; gem = false; }
    // long vowels: おう / おお -> ō, うう -> ū
    const last = out.slice(-1);
    if (!kata && ((c === 'う' && (last === 'o' || last === 'u')) || (c === 'お' && last === 'o' && i > 0 && m[i - 1] !== 'を'))) {
      out = out.slice(0, -1) + MACRON[last];
      continue;
    }
    out += r;
  }
  return out;
}
/** Romaji for kana text. Spaces separate words; standalone は/を/へ read as particles. */
export function romaji(text) {
  return text.trim().split(/\s+/).map(wordRomaji).join(' ').replace(/[、。]/g, '')
    .replace(/(desu|masu|masen|deshita|mashita|deshō)ka\b/g, '$1 ka');
}
