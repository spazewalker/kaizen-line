// Validates Japanese track content: ids, audio coverage, unit structure.
import { readFileSync, existsSync } from 'fs';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, key(i) { return Object.keys(this._d)[i]; }, get length() { return Object.keys(this._d).length; } };
const { ITEMS, audioTexts } = await import('../js/tracks/japanese/data/items.js');
const { UNITS } = await import('../js/tracks/japanese/units.js');
const { GAMES } = await import('../js/tracks/japanese/games.js');
const { SCENARIOS } = await import('../js/tracks/japanese/data/scenarios.js');
const idx = JSON.parse(readFileSync('audio/ja/index.json', 'utf8'));
let fails = 0; const bad = m => { fails++; console.log('FAIL', m); };
for (const t of audioTexts()) { if (!idx[t]) bad('no audio for ' + t); else if (!existsSync('audio/ja/' + idx[t])) bad('missing file ' + idx[t]); }
const ids = new Set(Object.keys(ITEMS));
let learnTotal = 0;
for (const u of UNITS) {
  if (!u.learns.length && u.id !== 'jp-30') bad(u.id + ' learns nothing');
  learnTotal += u.learns.length;
  const lesson = u.steps[0];
  if (lesson.type !== 'lesson' || lesson.cards.length < 5) bad(u.id + ' has ' + lesson.cards.length + ' cards');
  for (const st of u.steps.slice(1)) {
    if (!GAMES[st.game]) bad(u.id + ' unknown game ' + st.game);
    const a = st.args || {};
    (a.ids || []).forEach(id => { if (!ids.has(id)) bad(u.id + ' bad id ' + id); });
    if (a.sc && !SCENARIOS[a.sc]) bad(u.id + ' bad scenario ' + a.sc);
    (a.kana || []).forEach(k => { if (!ids.has('jp:kana:' + k)) bad(u.id + ' bad kana ' + k); });
  }
  // card html must not reference undefined
  lesson.cards.forEach(c => { if (/undefined/.test(c.html)) bad(u.id + ' card "' + c.title + '" has undefined'); });
}
const games = new Set(UNITS.flatMap(u => u.steps.slice(1).map(s => s.game)));
const kinds = {}; Object.values(ITEMS).forEach(x => kinds[x.kind] = (kinds[x.kind] || 0) + 1);
console.log(`${UNITS.length} units, ${learnTotal} learn ids, games used: ${[...games].join(', ')}`);
console.log('items', kinds, 'scenarios', Object.keys(SCENARIOS).length, 'audio', Object.keys(idx).length);
console.log(fails ? fails + ' FAILURES' : 'JAPANESE CONTENT OK');
process.exit(fails ? 1 : 0);
