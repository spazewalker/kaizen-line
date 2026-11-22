// Time the full analysis on a 4-minute song (3 demo fixtures concatenated + repeat).
import fs from 'fs';
import { analyze, SR } from '../js/songlab/analysis.js';
const parts = ['paper-lanterns', 'night-express', 'morning-ferry'].map(id => {
  const b = fs.readFileSync(`tests/fixtures/${id}.wav`); let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n >> 1); for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(o + 8 + i * 4) / 32768; return x;
});
const len = 240 * SR, y = new Float32Array(len); let p = 0;
while (p < len) for (const x of parts) { const k = Math.min(x.length, len - p); y.set(x.subarray(0, k), p); p += k; if (p >= len) break; }
const t = Date.now(); let last = '';
const R = await analyze(y, SR, { onProgress: e => { if (e.stage !== last) { last = e.stage; } } });
console.log(`4-minute song: ${((Date.now() - t) / 1000).toFixed(1)} s, ${R.beats.length} beats, ${R.chords.length} chord segments, ${R.melody.length} notes, ${R.sections.length} sections, bpm ${R.bpm}`);
