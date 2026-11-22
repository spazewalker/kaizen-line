// Accuracy test for js/songlab/analysis.js on the demo fixtures (ground truth from tools/make_demos.py).
// Run: node tests/songlab_analysis.test.mjs [--fast]
import fs from 'fs';
import { analyze, SR } from '../js/songlab/analysis.js';
import { parseChord } from '../js/core/music.js';

function readWav(p) {
  const b = fs.readFileSync(p), sr = b.readUInt32LE(24), ch = b.readUInt16LE(22);
  let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2 / ch, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2 * ch) / 32768;
  return { x, sr };
}
export function resample(x, from, to) {
  if (from === to) return x;
  const r = from / to, n = Math.floor(x.length / r), y = new Float32Array(n);
  // windowed-sinc low-pass + linear interpolation (fine for analysis)
  const taps = 16, fc = 0.45 / r;
  for (let i = 0; i < n; i++) {
    const c = i * r, ci = Math.floor(c); let s = 0, ws = 0;
    for (let k = -taps; k <= taps; k++) {
      const j = ci + k; if (j < 0 || j >= x.length) continue;
      const d = j - c, w = (d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d)) * (0.5 + 0.5 * Math.cos(Math.PI * d / (taps + 1)));
      s += x[j] * w; ws += w;
    }
    y[i] = s / (ws || 1);
  }
  return y;
}
const same = (a, b) => { const p = parseChord(a), q = parseChord(b); return p && q && p.root === q.root && p.type === q.type; };
const triad = n => { const p = parseChord(n); return p ? p.root + (p.type.startsWith('m') && !p.type.startsWith('maj') ? 'm' : '') : n; };

function evaluate(R, T) {
  // beats: F-measure at 70 ms
  const used = new Set(); let hit = 0;
  for (const tb of T.beats) { const j = R.beats.findIndex((b, i) => !used.has(i) && Math.abs(b - tb) < 0.07); if (j >= 0) { used.add(j); hit++; } }
  const P = hit / R.beats.length, Rc = hit / T.beats.length, beatF = 2 * P * Rc / (P + Rc || 1);
  const offs = T.beats.map(tb => { const b = R.beats.reduce((m, x) => Math.abs(x - tb) < Math.abs(m - tb) ? x : m, 1e9); return b - tb; }).filter(d => Math.abs(d) < 0.1);
  // chords: sample estimate at the middle of each truth beat
  let ok = 0, okT = 0;
  const spb = 60 / T.bpm;
  T.beats.forEach((tb, i) => {
    const t = tb + spb / 2; const seg = R.chords.filter(s => s.t <= t).pop();
    const nm = seg ? seg.name : 'N';
    if (same(nm, T.beatChords[i])) ok++;
    if (triad(nm) === triad(T.beatChords[i])) okT++;
  });
  // melody: notes (onset 100 ms, same midi) and pitch-class match
  let nh = 0, nhOct = 0; const usedN = new Set();
  for (const tn of T.melody) {
    const j = R.melody.findIndex((n, i) => !usedN.has(i) && Math.abs(n.t - tn.t) < 0.1 && (n.midi % 12) === (tn.midi % 12));
    if (j >= 0) { usedN.add(j); nhOct++; if (R.melody[j].midi === tn.midi) nh++; }
  }
  const nP = nh / (R.melody.length || 1), nR = nh / T.melody.length;
  // frame-level raw pitch accuracy on truth-voiced frames (sampled every 20 ms)
  let vf = 0, vc = 0;
  for (const tn of T.melody) for (let t = tn.t + 0.04; t < tn.t + tn.dur - 0.02; t += 0.02) {
    vf++; const n = R.melody.find(n => n.t <= t && t < n.t + n.dur); if (n && n.midi === tn.midi) vc++;
  }
  return {
    bpm: R.bpm, bpmTrue: T.bpm, tempoErr: Math.abs(R.bpm - T.bpm) / T.bpm, beatF, meanOffMs: Math.round(1000 * offs.reduce((a, b) => a + b, 0) / (offs.length || 1)),
    chordAcc: ok / T.beats.length, triadAcc: okT / T.beats.length, key: R.key.name, keyTrue: T.key,
    keyOk: R.key.name.toLowerCase().replace(/\s/g, '') === T.key.toLowerCase().replace(/\s/g, ''),
    noteF: 2 * nP * nR / (nP + nR || 1), noteRecallPc: nhOct / T.melody.length, rpa: vc / (vf || 1), notesEst: R.melody.length, notesTrue: T.melody.length,
    sections: R.sections.map(s => s.name + '@' + s.t0.toFixed(1)).join(' '), truthSections: T.sections.map(s => s.name[0] + '@' + s.t0.toFixed(1)).join(' '),
    ms: R.ms,
  };
}

const ids = JSON.parse(fs.readFileSync('audio/demo/index.json')).map(s => s.id);
let fails = 0;
for (const id of ids) {
  const { x, sr } = readWav(`tests/fixtures/${id}.wav`);
  const y = resample(x, sr, SR);
  const R = await analyze(y, SR);
  const T = JSON.parse(fs.readFileSync(`tests/fixtures/${id}.json`));
  const e = evaluate(R, T);
  const checks = [['tempo ±2%', e.tempoErr <= 0.02], ['beat F ≥ .8', e.beatF >= 0.8], ['chords ≥ 75%', e.chordAcc >= 0.75], ['key', e.keyOk]];
  checks.forEach(([n, c]) => { if (!c) { fails++; console.log('FAIL', id, n); } });
  console.log(id, JSON.stringify(e, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
}
console.log(fails ? `${fails} FAILURES` : 'SONGLAB ANALYSIS PASS');
process.exit(fails ? 1 : 0);
