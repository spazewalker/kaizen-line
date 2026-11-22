"""Browser DSP tests for the guitar mic engine (fake mic from synthetic WAVs).
Run: python3 tests/guitar_dsp_test.py"""
import sys, json; sys.path.insert(0, 'tests')
import numpy as np
from harness import App
import guitar_synth as G
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

# ---------- 1. chords + strum timing (with clicks and noise) ----------
# Pattern: strums at known times; clicks between (must NOT count as strums).
L = 16.0
x = G.noise(int(G.SR * L), 0.002)
plan = [(1.0, 'Em'), (2.5, 'Em'), (4.0, 'C'), (5.2, 'C'), (6.4, 'G'), (8.0, 'Am'), (9.5, 'D'), (11.0, 'Em_mutedG'), (12.5, 'A'), (14.0, 'E')]
for t, name in plan:
    if name == 'Em_mutedG':
        G.place(x, G.strum([0, 2, 2, -1, 0, 0], 1.4), t)   # G string dead
    else:
        G.place(x, G.strum(G.SHAPES[name], 1.4), t)
for t in [1.75, 3.25, 4.6, 7.2, 10.2, 13.2]:
    G.place(x, G.click(), t)  # stray metronome clicks during ringing chords
G.save('/tmp/gt_chords.wav', x)

JS = r"""
async () => {
  const L = await import('/js/tracks/guitar/listen.js');
  const ear = await new L.GuitarEar().start();
  const strums = []; const judged = [];
  const names = %s;
  ear.onStrum(s => { strums.push(s.rawT); });
  // wait until the file has played ~once (fake capture starts from file start when stream opens)
  await new Promise(r => setTimeout(r, %d));
  ear.stop();
  return { strums, noise: ear.noise };
}
"""
with App(mic_wav='/tmp/gt_chords.wav') as app:
    pg = app.page
    pg.evaluate("document.body.click()")
    res = pg.evaluate("""async () => {
      const L = await import('/js/tracks/guitar/listen.js');
      const ear = await new L.GuitarEar().start();
      const strums = [], scores = [];
      ear.onStrum(s => strums.push(s));
      const exp = ['Em','Em','C','C','G','Am','D','Em','A','E'];
      const all = ['Em','C','G','Am','D','A','E','Dm'];
      let i = 0;
      ear.onStrum(async s => {
        const out = {};
        for (const n of all) { const r = await ear.judgeStrum(s, n); out[n] = +r.score.toFixed(2); }
        const rr = await ear.judgeStrum(s, 'Em');
        scores.push({ t: s.rawT, out, hintEm: rr.hint });
      });
      await new Promise(r => setTimeout(r, 15500));
      ear.stop();
      return { strums: strums.map(s => s.rawT), scores, noise: ear.noise };
    }""")
    print('errors', app.errors)
st = res['strums']
print('detected strums', len(st), [round(s - st[0], 3) for s in st])
exp_t = [t for t, _ in plan]
# align: first detected strum = first planned strum (fake mic start offset unknown)
if st:
    off = st[0] - exp_t[0]
    matched = []
    for t in exp_t:
        d = [abs((s - off) - t) for s in st]
        matched.append(min(d) if d else 9)
    extra = len(st) - len(exp_t)
    print('timing errors ms', [round(m * 1000) for m in matched])
    check(all(m < 0.04 for m in matched), 'every strum detected within 40 ms (relative timing)')
    check(extra <= 0, f'no false strums from clicks (extra={extra})')
names = [n for _, n in plan]
ok = 0; tot = 0
for sc, name in zip(res['scores'], names):
    o = sc['out']
    if name == 'Em_mutedG':
        print('muted-G Em scores', o, 'hint:', sc['hintEm'])
        check(o['Em'] < 0.72 and 'G (3rd)' in sc['hintEm'], 'Em with a dead G string is rejected and the hint names the G string')
        continue
    best = max(o, key=o.get); tot += 1
    good = o[name] >= 0.72 and best == name
    ok += good
    wrongs = {k: v for k, v in o.items() if k != name}
    print(f'{name}: self {o[name]} best-other {max(wrongs.values())} ({max(wrongs, key=wrongs.get)})', 'OK' if good else 'BAD')
check(ok == tot, f'chord accepted and ranked first: {ok}/{tot}')
# rejection: every wrong chord below threshold for each strum
rej = sum(1 for sc, name in zip(res['scores'], names) if name != 'Em_mutedG' for k, v in sc['out'].items() if k != name and v >= 0.72)
print('wrong chords above threshold:', rej)
check(rej <= 3, 'wrong chords rejected (allowing near-identical pairs like Em/G)')
print('FAILS', len(fails))
