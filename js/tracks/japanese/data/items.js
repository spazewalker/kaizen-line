// Central registry: every learnable item keyed by its SRS id.
// Item: { id, kind: 'kana'|'word'|'phr'|'num'|'price'|'time', jp, ro, en, kj?, tokens?, mn?, theme?, script? }
import { ALL_KANA } from './kana.js';
import { VOCAB } from './vocab.js';
import { PHRASES } from './phrases.js';
import { SCENARIOS } from './scenarios.js';
import { NUMBERS, PRICES_ITEMS, TIME_ITEMS } from './numbers.js';

export const KANA_ITEMS = ALL_KANA.map(x => ({ id: 'jp:kana:' + x.k, kind: 'kana', jp: x.k, ro: x.r, en: x.r, mn: x.mn, script: x.script, group: x.group, row: x.row }));
export const ITEMS = {};
for (const it of [...KANA_ITEMS, ...VOCAB, ...PHRASES, ...NUMBERS, ...PRICES_ITEMS, ...TIME_ITEMS]) ITEMS[it.id] = it;

export const item = id => ITEMS[id];
export const kanaId = k => 'jp:kana:' + k;
export const ofKind = kind => Object.values(ITEMS).filter(x => x.kind === kind);

/** Every Japanese string that needs a sound clip (deduplicated). */
export function audioTexts() {
  const s = new Set();
  Object.values(ITEMS).forEach(x => s.add(x.jp));
  Object.values(SCENARIOS).forEach(sc => sc.steps.forEach(st => { s.add(st.npc.jp); st.ch.forEach(c => s.add(c.jp)); }));
  return [...s];
}
