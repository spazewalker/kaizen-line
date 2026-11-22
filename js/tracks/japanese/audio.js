// Japanese speech clips: text -> audio/ja/<file>.mp3 via audio/ja/index.json
import { playClip, preloadClips, tone } from '../../core/audio.js';
import { settings } from '../../core/store.js';

let INDEX = {};
try {
  const r = await fetch('audio/ja/index.json');
  if (r.ok) INDEX = await r.json();
} catch (e) { console.warn('Japanese audio index missing', e); }

const clean = t => (t || '').replace(/\s+/g, '');
export const clipUrl = text => { const f = INDEX[clean(text)]; return f ? 'audio/ja/' + f : null; };
export const hasClip = text => !!INDEX[clean(text)];
/** Play the clip for a Japanese text. slow = 0.7x (pitch kept). Resolves when finished. */
export function speak(text, { slow = false } = {}) {
  const u = clipUrl(text);
  if (!u) return Promise.resolve();
  const rate = (slow ? 0.7 : 1) * (settings.get().jaSpeed || 1);
  return playClip(u, { rate });
}
export const preload = texts => preloadClips(texts.map(clipUrl).filter(Boolean));
/** data-clip attribute string for lesson HTML (handled globally by main.js). */
export const clipAttr = text => { const u = clipUrl(text); return u ? `data-clip="${u}"` : ''; };
/** Short UI sounds. */
export const sfx = {
  right() { tone(84, { dur: 0.09, gain: 0.18 }); tone(91, { at: 0.07, dur: 0.14, gain: 0.18 }); },
  wrong() { tone(50, { dur: 0.2, gain: 0.22, voice: 'triangle' }); },
  combo(n) { tone(72 + Math.min(n, 12), { dur: 0.08, gain: 0.15 }); },
  win() { [72, 76, 79, 84].forEach((m, i) => tone(m, { at: i * 0.09, dur: 0.2, gain: 0.18 })); },
};
