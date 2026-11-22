import { PitchDetector } from '../js/core/pitch.js';
import { magSpectrum } from '../js/core/fft.js';
import { chromaFromMag, rankChords, matchChord } from '../js/core/chroma.js';
import { shapeFor, shapeMidis, capoOptions, parseChord, findKey } from '../js/core/music.js';
const sr = 48000;
const hz = m => 440 * 2 ** ((m - 69) / 12);
function ks(f, len = sr) { const N = Math.round(sr / f), r = new Float64Array(N).map(() => Math.random() * 2 - 1), d = new Float32Array(len); let p = 0; for (let i = 0; i < len; i++) { const n = (p + 1) % N, v = r[p]; r[p] = .4985 * (r[p] + r[n]); d[i] = v; p = n } return d }
function voice(f, len = sr) { const d = new Float32Array(len); let ph = 0; for (let i = 0; i < len; i++) { ph += 2 * Math.PI * f * (1 + .004 * Math.sin(2 * Math.PI * 5 * i / sr)) / sr; let s = 0; for (let h = 1; h < 8; h++) s += Math.sin(ph * h) / h ** 1.2; d[i] = .3 * s + (Math.random() - .5) * .02 } return d }
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m) } };
const gd = new PitchDetector(4096, sr), vd = new PitchDetector(2048, sr);
for (const m of [40, 45, 50, 55, 59, 64, 52, 69, 76]) { const b = ks(hz(m)); const r = gd.detect(b.subarray(4000, 8096)); ok(Math.abs(r.midi - m) < .3, `guitar ${m} got ${r.midi.toFixed(2)} cl ${r.clarity.toFixed(2)}`) }
for (const m of [45, 48, 52, 57, 60, 64, 67, 72]) { const b = voice(hz(m)); const r = vd.detect(b.subarray(10000, 12048), { minF: 70, maxF: 1000 }); ok(Math.abs(r.midi - m) < .3, `voice ${m} got ${r.midi.toFixed(2)}`) }
// chords
for (const name of ['C', 'G', 'D', 'Em', 'Am', 'E', 'A', 'Dm', 'F']) {
  const sh = shapeFor(name), ms = shapeMidis(sh.f), sig = new Float32Array(sr);
  ms.forEach((m, i) => { const s = ks(hz(m)); for (let j = 0; j < sr - i * 1500; j++) sig[j + i * 1500] += s[j] * .3 });
  const mag = magSpectrum(sig.subarray(12000, 12000 + 8192), 8192);
  const ch = chromaFromMag(mag, sr, 8192); const top = rankChords(ch)[0];
  const self = matchChord(ch, name), other = matchChord(ch, name === 'C' ? 'D' : 'C');
  ok(top.name.replace('Db', 'C#') === name || top.name === name, `chord ${name} ranked ${top.name}`);
  ok(self > other + .15, `match ${name} self ${self.toFixed(2)} other ${other.toFixed(2)}`);
}
console.log('capo for Bb F Gm Eb:', JSON.stringify(capoOptions(['Bb', 'F', 'Gm', 'Eb'])[0]));
console.log('F#m7 shape', JSON.stringify(shapeFor('F#m7')), 'Bb', JSON.stringify(shapeFor('Bb')));
console.log('key', findKey([5, 0, 3, 0, 4, 3, 0, 5, 0, 3, 0, 1]).name);
console.log(fails ? `${fails} FAILURES` : 'ALL DSP TESTS PASS');
