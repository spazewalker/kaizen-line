// Radix-2 in-place complex FFT. Shared by pitch, chroma, onset and the song analyzer.
// Works in the main thread and in Web Workers (no DOM use).

const cache = new Map();

export class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of 2');
    this.n = n;
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(2 * Math.PI * i / n);
      this.sin[i] = -Math.sin(2 * Math.PI * i / n);
    }
  }

  static get(n) {
    if (!cache.has(n)) cache.set(n, new FFT(n));
    return cache.get(n);
  }

  /** Forward transform, in place. re/im: Float32Array or Float64Array of length n. */
  transform(re, im) {
    const n = this.n, rev = this.rev, C = this.cos, S = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, l = a + half;
          const tre = re[l] * C[k] - im[l] * S[k];
          const tim = re[l] * S[k] + im[l] * C[k];
          re[l] = re[a] - tre; im[l] = im[a] - tim;
          re[a] += tre; im[a] += tim;
        }
      }
    }
  }

  /** Inverse transform, in place, scaled by 1/n. */
  inverse(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.transform(re, im);
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }
}

const windows = new Map();
/** Hann window of length n (cached). */
export function hann(n) {
  if (!windows.has(n)) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    windows.set(n, w);
  }
  return windows.get(n);
}

/**
 * Magnitude spectrum of a real frame (Hann windowed, zero padded to n).
 * Returns Float32Array of length n/2 (linear magnitude).
 */
export function magSpectrum(frame, n = frame.length, out) {
  const fft = FFT.get(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  const L = Math.min(frame.length, n), w = hann(L);
  for (let i = 0; i < L; i++) re[i] = frame[i] * w[i];
  fft.transform(re, im);
  const mag = out || new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}
