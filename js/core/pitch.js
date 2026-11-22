// Monophonic pitch detection: McLeod Pitch Method (NSDF via FFT autocorrelation).
// Good for a single sung note or a single guitar string. Works in workers too.
import { FFT } from './fft.js';

export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);
/** Cents between a frequency and a (fractional) MIDI target. Positive = sharp. */
export const centsOff = (freq, midi) => 100 * (freqToMidi(freq) - midi);

export class PitchDetector {
  /**
   * @param {number} size  analysis window in samples (2048 for voice, 4096 for guitar at 44.1/48 kHz)
   * @param {number} sampleRate
   */
  constructor(size, sampleRate) {
    this.size = size;
    this.sr = sampleRate;
    let n = 1; while (n < size * 2) n <<= 1;
    this.n = n;
    this.fft = FFT.get(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.nsdf = new Float64Array(size);
  }

  /**
   * @param {Float32Array} buf  time-domain samples (uses the last `size` samples)
   * @param {object} o  minF/maxF in Hz, k = peak threshold (0.8–0.95), rmsMin = silence gate
   * @returns {{freq:number, midi:number, clarity:number, rms:number}} freq = 0 when no clear pitch
   */
  detect(buf, o = {}) {
    const { minF = 55, maxF = 1200, k = 0.9, rmsMin = 0.008, minClarity = 0.6 } = o;
    const N = this.size, off = buf.length - N;
    const { re, im, nsdf, sr } = this;
    let ss = 0;
    for (let i = 0; i < N; i++) { const v = buf[off + i]; ss += v * v; }
    const rms = Math.sqrt(ss / N);
    if (rms < rmsMin) return { freq: 0, midi: 0, clarity: 0, rms };

    re.fill(0); im.fill(0);
    let mean = 0;
    for (let i = 0; i < N; i++) mean += buf[off + i];
    mean /= N;
    for (let i = 0; i < N; i++) re[i] = buf[off + i] - mean;
    const x = re.slice(0, N);
    this.fft.transform(re, im);
    for (let i = 0; i < this.n; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    this.fft.inverse(re, im); // re[t] = autocorrelation r(t)

    const maxLag = Math.min(N - 2, Math.floor(sr / minF));
    const minLag = Math.max(2, Math.floor(sr / maxF));
    let m = 2 * re[0];
    nsdf[0] = 1;
    for (let t = 1; t <= maxLag; t++) {
      m -= x[t - 1] * x[t - 1] + x[N - t] * x[N - t];
      nsdf[t] = m > 1e-9 ? 2 * re[t] / m : 0;
    }

    // key maxima: highest point of each positive region after the first negative dip
    const peaks = [];
    let t = 1;
    while (t < maxLag && nsdf[t] > 0) t++;
    while (t < maxLag) {
      while (t < maxLag && nsdf[t] <= 0) t++;
      let best = -1, bt = -1;
      while (t < maxLag && nsdf[t] > 0) {
        if (nsdf[t] > best) { best = nsdf[t]; bt = t; }
        t++;
      }
      if (bt > 0 && bt >= minLag) peaks.push(bt);
    }
    if (!peaks.length) return { freq: 0, midi: 0, clarity: 0, rms };
    let top = 0;
    for (const p of peaks) top = Math.max(top, nsdf[p]);
    const thr = k * top;
    let tau = peaks.find(p => nsdf[p] >= thr);
    const a = nsdf[tau - 1], b = nsdf[tau], c = nsdf[tau + 1];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
    const clarity = b - 0.25 * (a - c) * shift;
    if (clarity < minClarity) return { freq: 0, midi: 0, clarity, rms };
    const freq = sr / (tau + shift);
    if (freq < minF || freq > maxF) return { freq: 0, midi: 0, clarity, rms };
    return { freq, midi: freqToMidi(freq), clarity, rms };
  }
}

/** Simple median smoother for a stream of MIDI values (0 = no pitch). */
export class PitchSmoother {
  constructor(n = 5) { this.n = n; this.h = []; }
  push(midi) {
    this.h.push(midi);
    if (this.h.length > this.n) this.h.shift();
    const v = this.h.filter(x => x > 0);
    if (v.length < Math.ceil(this.n / 2)) return 0;
    const s = v.slice().sort((p, q) => p - q);
    return s[s.length >> 1];
  }
  reset() { this.h = []; }
}
