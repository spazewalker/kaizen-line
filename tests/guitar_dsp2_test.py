"""Tuner accuracy, fretted-note detection and an end-to-end chord session via fake mic.
Run: python3 tests/guitar_dsp2_test.py"""
import sys; sys.path.insert(0, 'tests')
import numpy as np
from harness import App
import guitar_synth as G
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

# ---------- tuner ----------
offs = [0, 3, -4, 0, 2, -3]
x = G.noise(int(G.SR * 1.0), 0.001)
for i, o in enumerate(offs):
    x = np.concatenate([x, G.pure(G.OPEN[i], 1.6, o), G.noise(int(G.SR * 0.4), 0.001)])
G.save('/tmp/gt_tuner.wav', x)
with App(mic_wav='/tmp/gt_tuner.wav') as app:
    res = app.page.evaluate("""async () => {
      const T = await import('/js/tracks/guitar/tuner.js');
      const host = document.createElement('div'); document.body.append(host);
      const cl = await T.mountTuner(host, { gate: false });
      const seen = [];
      const iv = setInterval(() => { const n = host.querySelector('#tnN')?.textContent, f = host.querySelector('#tnF')?.textContent; if (f) seen.push([n, f]); }, 60);
      await new Promise(r => setTimeout(r, 13000)); clearInterval(iv); cl();
      return { seen, ticks: [...host.querySelectorAll('.gt-tn-s.done')].length };
    }""")
    errs = [e for e in app.errors if 'track load' not in e and '404' not in e and 'dynamically' not in e]
by = {}
for n, f in res['seen']:
    try: c = int(f.split('·')[1].split('cents')[0].replace('+', '').strip())
    except Exception: continue
    by.setdefault(n, []).append(c)
names = ['E', 'A', 'D', 'G', 'B', 'e']
for i, n in enumerate(names):
    v = by.get(n, [])
    if n == 'E': v = [c for c in v if abs(c - offs[0]) < 30]  # low E vs high e share the label 'E'? (label 'e' for high)
    med = int(np.median(v)) if v else None
    print(f'  string {n}: true {offs[i]:+d} cents, tuner median {med} ({len(v)} readings)')
    check(med is not None and abs(med - offs[i]) <= 3, f'tuner {n} within ±3 cents of true offset (so within ±5 of target)')
check(res['ticks'] >= 3, f"in-tune ticks given for strings within 5 cents (got {res['ticks']}: E, G, B, e expected ≥3)")

# ---------- fretted notes ----------
seq = [(5, 3), (4, 1), (3, 2), (2, 2), (1, 3), (0, 3), (5, 8), (0, 5)]
x = G.noise(int(G.SR * 1.0), 0.001)
for s, f in seq: x = np.concatenate([x, G.ks(G.OPEN[s] + f, 1.2) * 0.3, G.noise(int(G.SR * 0.3), 0.001)])
G.save('/tmp/gt_notes.wav', x)
with App(mic_wav='/tmp/gt_notes.wav') as app:
    res = app.page.evaluate("""async () => {
      const L = await import('/js/tracks/guitar/listen.js');
      const ear = await new L.GuitarEar().start(); const picks = [];
      ear.onStrum(s => setTimeout(() => { const m = ear.frames.filter(f => f.midi && f.rawT > s.rawT + 0.03 && f.rawT < s.rawT + 0.25).map(f => f.midi).sort((a,b)=>a-b); picks.push(m.length ? m[m.length >> 1] : 0); }, 300));
      await new Promise(r => setTimeout(r, 13500)); ear.stop(); return picks;
    }""")
exp = [G.OPEN[s] + f for s, f in seq]
print('  expected', exp, '\n  detected', [round(p, 2) for p in res[:len(exp)]])
okn = sum(1 for e, p in zip(exp, res) if abs(p - e) <= 0.5)
check(len(res) >= len(exp) and okn == len(exp), f'fretted note detection {okn}/{len(exp)} (each pluck detected once, pitch within ±50 cents)')

# ---------- end-to-end chord session (wait mode) ----------
# Song 'emam' = Em(2 bars) Am(2) Em(2) Am(1) Em(1) -> 5 events. WAV loops strums: Em, C (wrong), Am, Em, Am, Em ...
x = G.noise(int(G.SR * 0.8), 0.001)
for name in ['Em', 'C', 'Am', 'C', 'Em', 'Am', 'Em']:
    x = np.concatenate([x, G.strum(G.SHAPES[name], 1.6)[:int(G.SR * 1.9)], G.noise(int(G.SR * 0.3), 0.001)])
G.save('/tmp/gt_session.wav', x)
with App(mic_wav='/tmp/gt_session.wav') as app:
    res = app.page.evaluate("""async () => {
      const S = await import('/js/tracks/guitar/session.js'), songs = await import('/js/tracks/guitar/songs.js');
      const host = document.createElement('div'); document.querySelector('#app').innerHTML = ''; document.querySelector('#app').append(host);
      const { mic } = await import('/js/core/mic.js'); await mic.acquire({ fftSize: 8192 });
      let result = null; const msgs = new Set();
      const cl = S.startChordSession(host, songs.songSession('emam', { bpm: 160 }), {}, { wait: true, speed: 1, onFinish: r => { result = r; } });
      await new Promise(r => setTimeout(r, 1500));
      host.querySelector('#clk').click();  // no clicks into the mic
      host.querySelector('#play').click();
      const iv = setInterval(() => { const t = host.querySelector('#fb')?.textContent; if (t) msgs.add(t); }, 100);
      for (let i = 0; i < 400 && !result; i++) await new Promise(r => setTimeout(r, 100));
      clearInterval(iv); cl(); mic.release(true);
      return { result, msgs: [...msgs] };
    }""")
    errs += [e for e in app.errors if 'track load' not in e and '404' not in e and 'dynamically' not in e]
r = res['result']
print('  session result', r)
print('  messages', [m for m in res['msgs'] if 'not' in m.lower() or 'Got' in m][:6])
check(r is not None and r['hits'] == r['total'] == 5, 'wait-mode session: all 5 chord events hit from mic strums')
check(any(('not' in m.lower() or 'string' in m.lower()) for m in res['msgs']), 'wrong strums (C) were rejected with a hint')
# ---------- note highway end-to-end (wait mode) + latency compensation ----------
seq = [(5,0),(5,1),(5,3),(5,1),(5,0),(5,1),(5,3),(5,0)]
x = G.noise(int(G.SR * 0.8), 0.001)
for s_, f_ in seq: x = np.concatenate([x, G.ks(G.OPEN[s_] + f_, 1.0) * 0.3, G.noise(int(G.SR * 0.25), 0.001)])
G.save('/tmp/gt_ewalk.wav', x)
with App(mic_wav='/tmp/gt_ewalk.wav') as app:
    res = app.page.evaluate("""async () => {
      const { settings } = await import('/js/core/store.js'); settings.set({ latencyMs: 120 });
      const L = await import('/js/tracks/guitar/listen.js'), H = await import('/js/tracks/guitar/notehw.js'), S = await import('/js/tracks/guitar/songs.js');
      const ear = await new L.GuitarEar().start();
      let lat = null; ear.onStrum(s => { if (lat === null) lat = +(s.rawT - s.t).toFixed(3); });
      const host = document.createElement('div'); document.querySelector('#app').innerHTML = ''; document.querySelector('#app').append(host);
      let result = null;
      const cl = H.startNoteHighway(host, S.melodyPiece('ewalk'), { ear, wait: true, speed: 1, onFinish: r => { result = r; } });
      host.querySelector('#nplay').click();
      for (let i = 0; i < 300 && !result; i++) await new Promise(r => setTimeout(r, 100));
      cl(); ear.stop(); settings.set({ latencyMs: 0 });
      return { result, lat };
    }""")
    errs += [e for e in app.errors if 'track load' not in e and '404' not in e and 'dynamically' not in e]
print('  note highway', res)
check(res['result'] is not None and res['result']['hits'] == 8, 'note highway (wait mode): 8/8 notes hit from mic plucks')
check(res['lat'] == 0.12, 'strum times are latency-compensated by settings.latencyMs')
print('page errors:', errs or 'none')
print('FAILS', len(fails), fails)
