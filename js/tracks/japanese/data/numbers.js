// Numbers, prices and clock times with correct readings (sound changes included).
import { romaji } from './kana.js';

const ONES = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
function under10000(n) {
  let s = '';
  const th = Math.floor(n / 1000), hu = Math.floor(n / 100) % 10, te = Math.floor(n / 10) % 10, on = n % 10;
  if (th) s += ({ 1: 'せん', 3: 'さんぜん', 8: 'はっせん' })[th] || ONES[th] + 'せん';
  if (hu) s += ({ 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' })[hu] || ONES[hu] + 'ひゃく';
  if (te) s += (te === 1 ? '' : ONES[te]) + 'じゅう';
  if (on) s += ONES[on];
  return s;
}
/** Reading of 0..99,999 in kana. */
export function numKana(n) {
  if (n === 0) return 'ゼロ';
  const man = Math.floor(n / 10000), rest = n % 10000;
  return (man ? ONES[man] + 'まん' : '') + under10000(rest);
}
export const priceKana = n => numKana(n) + 'えん';
const HOURS = [, 'いちじ', 'にじ', 'さんじ', 'よじ', 'ごじ', 'ろくじ', 'しちじ', 'はちじ', 'くじ', 'じゅうじ', 'じゅういちじ', 'じゅうにじ'];
const MIN = { 5: 'ごふん', 10: 'じゅっぷん', 15: 'じゅうごふん', 20: 'にじゅっぷん', 30: 'はん', 40: 'よんじゅっぷん', 45: 'よんじゅうごふん', 50: 'ごじゅっぷん' };
export const timeKana = (h, m) => HOURS[h] + (m ? MIN[m] : '');
export const fmtYen = n => '¥' + n.toLocaleString('en-US');
export const fmtTime = (h, m) => `${h}:${String(m).padStart(2, '0')}`;

const NUMS = [...Array(100).keys()].map(i => i + 1).concat([200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]);
const PRICES = [100, 120, 150, 180, 200, 250, 280, 300, 330, 350, 380, 400, 420, 450, 480, 500, 550, 580, 600, 650, 680, 700, 750, 780, 800, 850, 880, 900, 950, 980,
  1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800, 2000, 2300, 2400, 2500, 2800, 3000, 3300, 3600, 3800, 4000, 4400, 4500, 4800, 5000, 5500, 6000, 6600, 6800, 7000, 7700, 8000, 8800, 9000, 9800, 10000, 12000, 15000, 18000, 20000, 30000];
const TIMES = [];
for (let h = 1; h <= 12; h++) for (const m of [0, 15, 30, 45]) TIMES.push([h, m]);
[[7, 10], [8, 20], [9, 40], [6, 50], [10, 5]].forEach(t => TIMES.push(t));

export const NUMBERS = NUMS.map(n => ({ id: 'jp:num:' + n, kind: 'num', n, jp: numKana(n), ro: romaji(numKana(n)), en: n.toLocaleString('en-US'), shown: n.toLocaleString('en-US') }));
export const PRICES_ITEMS = PRICES.map(n => ({ id: 'jp:price:' + n, kind: 'price', n, jp: priceKana(n), ro: romaji(priceKana(n)), en: fmtYen(n), shown: fmtYen(n) }));
export const TIME_ITEMS = TIMES.map(([h, m]) => ({ id: `jp:time:${h}:${m}`, kind: 'time', h, m, jp: timeKana(h, m), ro: romaji(timeKana(h, m)), en: fmtTime(h, m), shown: fmtTime(h, m) }));
