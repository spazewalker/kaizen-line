// Module worker: runs the song analysis off the main thread.
import { analyze } from './analysis.js';

self.onmessage = async e => {
  const d = e.data || {};
  if (d.ping) { self.postMessage({ pong: true }); return; }
  const { id, samples, sr } = d;
  try {
    let last = 0;
    const r = await analyze(samples, sr, {
      onProgress: p => { const now = Date.now(); if (now - last > 120 || p.p >= 1) { last = now; self.postMessage({ id, progress: p }); } },
    });
    self.postMessage({ id, result: r }, [r.frames.chroma.buffer, r.frames.bass.buffer, r.frames.energy.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
