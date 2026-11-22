// Small persistent store on localStorage (namespaced), with export/import for backups.
const NS = 'kz3:';
const mem = new Map();
let ok = true;
try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); } catch (e) { ok = false; }

export const store = {
  get(key, def) {
    try {
      const v = ok ? localStorage.getItem(NS + key) : mem.get(key);
      return v == null ? (typeof def === 'function' ? def() : def) : JSON.parse(v);
    } catch (e) { return typeof def === 'function' ? def() : def; }
  },
  set(key, val) {
    const s = JSON.stringify(val);
    try { ok ? localStorage.setItem(NS + key, s) : mem.set(key, s); } catch (e) { mem.set(key, s); }
    return val;
  },
  /** Read-modify-write. fn receives current value (or def) and returns new value. */
  update(key, def, fn) { return this.set(key, fn(this.get(key, def))); },
  remove(key) { try { ok ? localStorage.removeItem(NS + key) : mem.delete(key); } catch (e) { /* ignore */ } },
  exportAll() {
    const o = {};
    if (ok) for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(NS)) o[k.slice(NS.length)] = localStorage.getItem(k); }
    else mem.forEach((v, k) => { o[k] = v; });
    return JSON.stringify({ app: 'kaizen-line', v: 3, at: new Date().toISOString(), data: o });
  },
  importAll(json) {
    const o = JSON.parse(json);
    if (o.app !== 'kaizen-line') throw new Error('Not a Kaizen Line backup');
    Object.entries(o.data).forEach(([k, v]) => { try { ok ? localStorage.setItem(NS + k, v) : mem.set(k, v); } catch (e) { /* ignore */ } });
  },
};

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  latencyMs: 0,          // audio round-trip latency (speaker -> mic), from calibration
  tapLatencyMs: 0,       // touch-to-sound offset, from tap calibration
  vocalLow: 48,          // MIDI, from range finder (C3)
  vocalHigh: 67,         // MIDI (G4)
  leftHanded: false,
  showRomaji: true,
  jaSpeed: 1,            // Japanese clip playback rate
  knownChords: [],       // chord names the guitar track has taught
  dailyGoalMin: 15,
};
export const settings = {
  get() { return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) }; },
  set(patch) { return store.set('settings', { ...this.get(), ...patch }); },
};

// ---------- progress, streak, xp ----------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayNum = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);

export const progress = {
  all() { return store.get('progress', {}); },
  /** stars (1-3) for a unit, 0 if not done */
  stars(unitId) { return this.all()[unitId]?.stars || 0; },
  complete(unitId, stars, score) {
    store.update('progress', {}, p => {
      const prev = p[unitId] || {};
      p[unitId] = { stars: Math.max(prev.stars || 0, stars), best: Math.max(prev.best || 0, score), plays: (prev.plays || 0) + 1, at: Date.now() };
      return p;
    });
  },
};

export const activity = {
  /** Log practice minutes/xp for today; updates streak. */
  log({ xp = 0, seconds = 0, track } = {}) {
    const today = dayKey();
    store.update('activity', { days: {}, streak: 0, best: 0, last: null }, a => {
      const d = a.days[today] || { xp: 0, sec: 0, tracks: {} };
      d.xp += xp; d.sec += seconds; if (track) d.tracks[track] = (d.tracks[track] || 0) + seconds;
      a.days[today] = d;
      if (a.last !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        a.streak = a.last === dayKey(y) ? a.streak + 1 : 1;
        a.last = today;
        a.best = Math.max(a.best, a.streak);
      }
      return a;
    });
  },
  get() {
    const a = store.get('activity', { days: {}, streak: 0, best: 0, last: null });
    const y = new Date(); y.setDate(y.getDate() - 1);
    const alive = a.last === dayKey() || a.last === dayKey(y);
    return { ...a, streak: alive ? a.streak : 0, today: a.days[dayKey()] || { xp: 0, sec: 0, tracks: {} } };
  },
};
