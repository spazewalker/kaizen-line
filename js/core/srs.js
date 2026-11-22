// Spaced repetition (SM-2 style) shared by all tracks.
// An item is anything worth remembering: a kana, a word, a chord shape, an interval.
// Tracks add items when a lesson teaches them; review games pull due items and grade them.
import { store, dayNum } from './store.js';

const KEY = 'srs';
const load = () => store.get(KEY, {});
const save = s => store.set(KEY, s);

export const srs = {
  /** Register items as learned (no-op for items already known). ids: string[] like 'jp:kana:あ' */
  learn(ids, track) {
    const s = load(), today = dayNum();
    for (const id of ids) if (!s[id]) s[id] = { t: track, due: today, ivl: 0, ease: 2.5, reps: 0, lapses: 0, seen: 0, ok: 0 };
    save(s);
  },
  has(id) { return !!load()[id]; },
  get(id) { return load()[id] || null; },
  /**
   * Grade an answer. q: 0 = wrong, 1 = hard / slow, 2 = good, 3 = easy.
   * Wrong answers come back today; right answers spread out over days.
   */
  grade(id, q) {
    const s = load(); const it = s[id]; if (!it) return;
    const today = dayNum();
    it.seen++;
    if (q === 0) {
      it.lapses++; it.reps = 0; it.ivl = 0; it.ease = Math.max(1.3, it.ease - 0.2); it.due = today;
    } else {
      it.ok++;
      it.reps++;
      if (it.reps === 1) it.ivl = q === 3 ? 2 : 1;
      else if (it.reps === 2) it.ivl = q === 3 ? 4 : 3;
      else it.ivl = Math.round(it.ivl * (q === 1 ? 1.2 : q === 3 ? it.ease * 1.3 : it.ease));
      it.ease = Math.max(1.3, it.ease + (q === 3 ? 0.15 : q === 1 ? -0.15 : 0));
      it.due = today + Math.max(1, it.ivl);
    }
    save(s);
  },
  /** Due items for a track (or all), most overdue first. */
  due(track, limit = 50) {
    const s = load(), today = dayNum();
    return Object.entries(s)
      .filter(([, v]) => (!track || v.t === track) && v.due <= today)
      .sort((a, b) => a[1].due - b[1].due || a[1].ivl - b[1].ivl)
      .slice(0, limit).map(([id]) => id);
  },
  dueCount(track) { return this.due(track, 9999).length; },
  /** All learned ids for a track, optionally filtered by prefix. */
  learned(track, prefix = '') {
    return Object.entries(load()).filter(([id, v]) => v.t === track && id.startsWith(prefix)).map(([id]) => id);
  },
  /** Weakest items (lowest accuracy, most lapses) for targeted practice. */
  weakest(track, n = 10) {
    return Object.entries(load()).filter(([, v]) => v.t === track && v.seen > 0)
      .sort((a, b) => (a[1].ok / a[1].seen - b[1].ok / b[1].seen) || b[1].lapses - a[1].lapses)
      .slice(0, n).map(([id]) => id);
  },
  /** 0..1 strength of an item (for UI meters). */
  strength(id) { const it = load()[id]; if (!it) return 0; return Math.min(1, (it.ivl || 0) / 21 + (it.reps ? 0.1 : 0)); },
  stats(track) {
    const v = Object.values(load()).filter(x => !track || x.t === track);
    return { total: v.length, mature: v.filter(x => x.ivl >= 21).length, due: this.dueCount(track) };
  },
};
