import { VoiceTracker } from '../js/tracks/singing/voice.js';
import { scoreFrame, noteHit, summarize, fitShift, estimateRange, voiceType } from '../js/tracks/singing/score.js';
const sr = 48000, hop = 800; // ~60 fps
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m) } else console.log('ok  ', m) };
// voice-like signal from a midi(t) function, with vibrato + noise
function synth(fn, secs) { const n = Math.floor(sr * secs), d = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr, m = fn(t); if (!m) { d[i] = (Math.random() - .5) * .004; continue } const f = 440 * 2 ** ((m - 69) / 12) * (1 + .006 * Math.sin(2 * Math.PI * 5.5 * t)); ph += 2 * Math.PI * f / sr; let s = 0; for (let h = 1; h < 10; h++) s += Math.sin(ph * h + h) / h ** 1.1 * (h === 2 || h === 3 ? 1.3 : 1); d[i] = .22 * s + (Math.random() - .5) * .03 } return d }
function run(sig, opt) { const tr = new VoiceTracker(sr, opt), out = []; for (let e = 2048; e <= sig.length; e += hop) out.push(tr.process(sig.subarray(e - 2048, e), e / sr)); return out }
// 1. steady tones within ±10 cents (median of voiced frames after settling)
for (const m of [43, 48, 52, 57, 62, 67, 72]) {
  const fr = run(synth(() => m, 1.2)).filter(f => f.voiced && f.t > .3);
  const errs = fr.map(f => Math.abs(f.midi - m) * 100).sort((a, b) => a - b);
  const med = errs[errs.length >> 1], p90 = errs[Math.floor(errs.length * .9)];
  ok(fr.length > 40 && med < 10 && p90 < 15, `steady ${m}: median err ${med.toFixed(1)}c, p90 ${p90.toFixed(1)}c, frames ${fr.length}`);
  const st = fr[fr.length - 1].stab; ok(st < 20, `stability on steady ${m}: ${st.toFixed(1)}c`);
}
// 2. slide follows: 48 -> 60 over 2 s
{ const fr = run(synth(t => 48 + 6 * t, 2)).filter(f => f.voiced && f.t > .15);
  const errs = fr.map(f => Math.abs(f.midi - (48 + 6 * (f.t))) * 100); errs.sort((a, b) => a - b);
  const med = errs[errs.length >> 1]; ok(med < 40, `slide tracking median err ${med.toFixed(1)}c (incl. ~2 frame smoothing lag)`) }
// 3. silence gaps -> unvoiced and onsets
{ const fr = run(synth(t => (t % 1 < .6 ? 55 : 0), 3)); const ons = fr.filter(f => f.onset).length, silent = fr.filter(f => f.t % 1 > .75 && f.t % 1 < .95 && f.voiced).length;
  ok(ons === 3, `onsets on 3 notes: ${ons}`); ok(silent === 0, `no voicing in gaps (${silent})`) }
// 4. octave jump (real) is followed after a moment; octave glitch suppressed
{ const fr = run(synth(t => (t < 1 ? 50 : 62), 2)).filter(f => f.voiced && f.t > 1.3); const med = fr.map(f => f.midi).sort((a, b) => a - b)[fr.length >> 1]; ok(Math.abs(med - 62) < .2, `real octave leap tracked: ${med.toFixed(2)}`) }
// 5. scoring rewards in-tune, penalises off notes
function scoreAgainst(target, sungFn, oa = false) { const notes = [{ t: .2, dur: 1, midi: target }]; run(synth(sungFn, 1.4)).forEach(f => scoreFrame(notes, f.t, f.midi, { octaveAgnostic: oa })); return noteHit(notes[0]) }
const sIn = scoreAgainst(57, () => 57), sFlat = scoreAgainst(57, () => 56.6), sOff = scoreAgainst(57, () => 56), sOct = scoreAgainst(57, () => 45), sOctOA = scoreAgainst(57, () => 45, true), sSil = scoreAgainst(57, () => 0);
ok(sIn > .9, `in tune hit ${sIn.toFixed(2)}`); const gFlat = (() => { const n = [{ t: .2, dur: 1, midi: 57 }]; run(synth(() => 56.6, 1.4)).forEach(f => scoreFrame(n, f.t, f.midi)); return (n[0]._great || 0) / n[0]._n })();
ok(sFlat > .8 && gFlat < .3, `40c flat: counts as close (hit ${sFlat.toFixed(2)}) but not great (${gFlat.toFixed(2)})`);
ok(sOff < .05, `semitone off hit ${sOff.toFixed(2)}`); ok(sOct < .05 && sOctOA > .9, `octave: strict ${sOct.toFixed(2)} vs agnostic ${sOctOA.toFixed(2)}`); ok(sSil === 0, `silence hit ${sSil}`);
// 6. fit + range
ok(fitShift([60, 62, 64, 65, 67], 45, 64) === -6 || fitShift([60, 62, 64, 65, 67], 45, 64) <= -3, `fitShift scale into 45..64 -> ${fitShift([60, 62, 64, 65, 67], 45, 64)}`);
ok(fitShift([60, 72], 45, 64, { octavesOnly: true }) % 12 === 0, 'octavesOnly');
{ const fr = run(synth(t => 52 - 4 * Math.min(1, t / 2), 4)); const hi = run(synth(t => 52 + 13 * Math.min(1, t / 2), 4)); const r = estimateRange(fr, hi); ok(r && Math.abs(r.low - 48) <= 1 && Math.abs(r.high - 65) <= 1, `range estimate ${JSON.stringify(r)} type ${r && voiceType(r.low, r.high)}`) }
console.log(fails ? `${fails} FAILURES` : 'ALL SINGING DSP TESTS PASS');
