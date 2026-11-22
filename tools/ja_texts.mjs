// Dump every Japanese string that needs audio (+ kanji forms) for tools/ja_audio.py
import { audioTexts, ITEMS } from '../js/tracks/japanese/data/items.js';
import { writeFileSync } from 'fs';
const kj = {};
Object.values(ITEMS).forEach(x => { if (x.kj && !/[A-Za-z]/.test(x.kj)) kj[x.jp] = x.kj.replace(/…/g, ''); });
const texts = audioTexts();
writeFileSync('/tmp/ja_texts.json', JSON.stringify({ texts, kj }, null, 0));
const kinds = {}; Object.values(ITEMS).forEach(x => kinds[x.kind] = (kinds[x.kind] || 0) + 1);
console.log(texts.length, 'texts', kinds);
