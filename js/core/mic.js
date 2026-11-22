// Microphone input. One shared stream, reference counted.
// Use: const m = await mic.acquire(); ... m.time() / m.spectrumDb() ...; mic.release();
import { getCtx, setSession, unlock } from './audio.js';

class Mic {
  constructor() { this.refs = 0; this.stream = null; this.an = null; this.error = null; }

  get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  get active() { return !!this.stream; }

  /** Ask for the mic (shows browser prompt once). Throws an Error with a friendly message on failure. */
  async acquire({ fftSize = 4096 } = {}) {
    this.refs++;
    if (this.stream) { if (this.an.fftSize < fftSize) this._setup(fftSize); return this; }
    if (!this.supported) { this.refs--; throw new Error('This browser has no microphone access. Open the app in Safari or Chrome over https.'); }
    await unlock();
    setSession('play-and-record');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (e) {
      this.refs--;
      setSession('playback');
      const msg = e && e.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in your browser settings for this site, then try again.'
        : 'Could not open the microphone (' + (e && e.name || 'error') + ').';
      this.error = msg;
      throw new Error(msg);
    }
    const c = getCtx();
    await c.resume().catch(() => {});
    this.src = c.createMediaStreamSource(this.stream);
    this._setup(fftSize);
    return this;
  }
  _setup(fftSize) {
    const c = getCtx();
    if (this.an) try { this.src.disconnect(this.an); } catch (e) { /* ignore */ }
    this.an = c.createAnalyser();
    this.an.fftSize = fftSize;
    this.an.smoothingTimeConstant = 0;
    this.an.minDecibels = -110; this.an.maxDecibels = -10;
    this.src.connect(this.an);
    this.tbuf = new Float32Array(fftSize);
    this.fbuf = new Float32Array(fftSize / 2);
  }
  get sampleRate() { return getCtx().sampleRate; }
  get fftSize() { return this.an ? this.an.fftSize : 0; }
  /** Latest time-domain samples (Float32Array, length fftSize). Reused buffer: copy if you keep it. */
  time() { this.an.getFloatTimeDomainData(this.tbuf); return this.tbuf; }
  /** Latest spectrum in dB (Float32Array, length fftSize/2). */
  spectrumDb() { this.an.getFloatFrequencyData(this.fbuf); return this.fbuf; }
  /** RMS level of the latest frame, 0..1. */
  level() {
    const b = this.time(); let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  }
  /** Connect the mic source to another node (e.g. an AudioWorklet or a recorder). */
  connect(node) { this.src.connect(node); }
  release(force = false) {
    this.refs = force ? 0 : Math.max(0, this.refs - 1);
    if (this.refs > 0 || !this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    try { this.src.disconnect(); } catch (e) { /* ignore */ }
    this.stream = null; this.an = null; this.src = null;
    setSession('playback');
  }
}
export const mic = new Mic();

/**
 * Run a callback every animation frame with the mic, until stop() is called.
 * @param {(m:Mic, t:number)=>void} fn  t = AudioContext time of the frame
 * @returns {Function} stop
 */
export function micLoop(fn) {
  let raf = 0, on = true;
  const step = () => { if (!on) return; if (mic.active) fn(mic, getCtx().currentTime); raf = requestAnimationFrame(step); };
  raf = requestAnimationFrame(step);
  return () => { on = false; cancelAnimationFrame(raf); };
}
