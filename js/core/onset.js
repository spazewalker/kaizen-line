// Streaming onset (attack) detector using spectral flux + adaptive threshold.
// Feed it consecutive magnitude spectra (linear). Use for strum timing and clap games.

export class OnsetDetector {
  /**
   * @param {object} o  sensitivity: 1.0 default; higher = fewer onsets. minGap seconds between onsets.
   */
  constructor({ sensitivity = 1.0, minGap = 0.09, history = 24 } = {}) {
    this.sens = sensitivity;
    this.minGap = minGap;
    this.hist = [];
    this.N = history;
    this.prev = null;
    this.lastOnset = -1;
    this.lastFlux = 0;
  }
  reset() { this.hist = []; this.prev = null; this.lastOnset = -1; }
  /**
   * @param {Float32Array} mag  linear magnitude spectrum
   * @param {number} time  timestamp (seconds) of this frame
   * @returns {number|null} onset time or null
   */
  push(mag, time) {
    let flux = 0;
    if (this.prev) {
      for (let k = 2; k < mag.length; k++) {
        const d = Math.log1p(mag[k] * 100) - Math.log1p(this.prev[k] * 100);
        if (d > 0) flux += d;
      }
    }
    this.prev = Float32Array.from(mag);
    this.hist.push(flux);
    if (this.hist.length > this.N) this.hist.shift();
    const s = this.hist.slice().sort((a, b) => a - b);
    const med = s[s.length >> 1] || 0;
    const mean = this.hist.reduce((a, b) => a + b, 0) / this.hist.length;
    const thr = (med * 1.5 + mean * 0.5) * this.sens + 0.5;
    const rising = flux > this.lastFlux;
    this.lastFlux = flux;
    if (flux > thr && rising && time - this.lastOnset > this.minGap) {
      this.lastOnset = time;
      return time;
    }
    return null;
  }
}

/** Simple level-based onset for clean taps/claps: returns true when RMS jumps. */
export class LevelOnset {
  constructor({ ratio = 2.5, minRms = 0.03, minGap = 0.1 } = {}) { Object.assign(this, { ratio, minRms, minGap }); this.env = 0; this.last = -1; }
  push(rms, time) {
    const hit = rms > this.minRms && rms > this.env * this.ratio && time - this.last > this.minGap;
    this.env = this.env * 0.9 + rms * 0.1;
    if (hit) { this.last = time; return time; }
    return null;
  }
}
