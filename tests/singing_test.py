"""Singing track end-to-end tests with a fake microphone.
Run: python3 tests/singing_test.py   (takes ~6 min)
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from harness import App, write_wav
SR = 48000
def voice(midi_fn, secs, amp=.25):
    t = np.arange(int(SR*secs))/SR
    m = np.array([midi_fn(x) for x in t[::48]]); m = np.repeat(m, 48)[:len(t)]
    voiced = m > 0
    f = 440*2**((np.where(voiced, m, 60)-69)/12)*(1+.005*np.sin(2*np.pi*5.5*t))
    ph = np.cumsum(2*np.pi*f/SR)
    s = sum(np.sin(ph*h+h)/h**1.1 for h in range(1, 10))
    out = amp*s*voiced + (np.random.rand(len(t))-.5)*.01
    return out
fails = []
def check(c, msg):
    print(('ok   ' if c else 'FAIL ')+msg)
    if not c: fails.append(msg)
IGN = lambda errs: [e for e in errs if not any(x in e for x in ('404', 'track load failed', 'songlab'))]
RANGE = "localStorage.setItem('kz3:settings', JSON.stringify({vocalLow:48, vocalHigh:66}))"
os.makedirs('/tmp/sgt', exist_ok=True)
write_wav('/tmp/sgt/a3.wav', voice(lambda t: 57, 30))
write_wav('/tmp/sgt/slide.wav', voice(lambda t: (lambda u: 45+21*(u/4 if u < 4 else (8-u)/4))(t % 8) if (t % 8) < 8 else 0, 32))

# ---------- 1. monitor + session scoring with steady A3 ----------
with App(mic_wav='/tmp/sgt/a3.wav') as app:
    pg = app.page; pg.evaluate(RANGE)
    app.go('#/x/sg/monitor', 600); pg.click('[data-go]'); pg.wait_for_timeout(2500)
    nn = pg.inner_text('#nn'); cc = pg.inner_text('#cc')
    cents = int(cc.split(' ')[0])
    check(nn == 'A3' and abs(cents) <= 10, f'monitor shows {nn} {cents:+d}c for a sung A3')
    app.shot('/tmp/sgt/monitor.png')
    res = {}
    for name, target in [('in_tune', 57), ('semitone_off', 58), ('octave_strict', 45)]:
        app.go('#/settings', 300)
        pg.evaluate("""async ([target]) => {
          const st = document.getElementById('app'); st.innerHTML = '<div id=st></div>';
          const { startSingSession } = await import('/js/tracks/singing/session.js');
          const notes = Array.from({length: 6}, (_, i) => ({t: 1 + i*0.8, dur: 0.7, midi: target}));
          window.__res = null;
          startSingSession(document.getElementById('st'), {title: 'test', bpm: 120, notes, transpose: 0, octaveAgnostic: false, guide: false, onDone: r => { window.__res = r }}, {});
        }""", [target])
        pg.wait_for_timeout(500)
        if pg.query_selector('[data-go]'): pg.click('[data-go]'); pg.wait_for_timeout(600)
        pg.click('#pp')
        pg.wait_for_function('window.__res', timeout=20000)
        r = pg.evaluate('window.__res'); res[name] = r
        if name == 'in_tune': pass
    print('session results', json.dumps(res))
    check(res['in_tune']['acc'] > .85, f"in-tune session accuracy {res['in_tune']['acc']:.2f}")
    check(res['semitone_off']['acc'] < .1, f"semitone-off session accuracy {res['semitone_off']['acc']:.2f}")
    check(res['octave_strict']['acc'] < .1, f"wrong-octave (strict) accuracy {res['octave_strict']['acc']:.2f}")
    check(abs(res['semitone_off']['bias'] + 100) < 15, f"bias reported {res['semitone_off']['bias']:.0f}c (expect about -100)")
    # visual check of a running session
    pg.evaluate("""async () => { const st = document.getElementById('app'); st.innerHTML='<div id=st></div>'; const { startSingSession } = await import('/js/tracks/singing/session.js'); const { songNotes } = await import('/js/tracks/singing/songs.js');
      startSingSession(document.getElementById('st'), {title:'Twinkle Twinkle Little Star', bpm: 92, notes: songNotes('twinkle', {low:48, high:66}), guide: true}, {}); }""")
    pg.wait_for_timeout(600)
    if pg.query_selector('[data-go]'): pg.click('[data-go]'); pg.wait_for_timeout(500)
    pg.click('#pp'); pg.wait_for_timeout(5000); app.shot('/tmp/sgt/session.png')
    pg.evaluate("""async () => { const st = document.getElementById('app'); st.innerHTML='<div id=st></div>'; const { startSingSession } = await import('/js/tracks/singing/session.js');
      const notes = Array.from({length: 12}, (_, i) => ({t: i, dur: .8, midi: 57}));
      startSingSession(document.getElementById('st'), {title:'range', bpm: 60, notes: notes.filter(n => n.t >= 4 && n.t < 7), range: {t0: 4, t1: 7}, transpose: 0, guide: false}, {}); }""")
    pg.wait_for_timeout(500)
    if pg.query_selector('[data-go]'): pg.click('[data-go]'); pg.wait_for_timeout(500)
    check(pg.evaluate("document.getElementById('lp').value") == 'sec', 'section range defaults to loop this section')
    pg.click('#pp'); pg.wait_for_timeout(9000)  # 4-beat count-in at 60 bpm, then 3 notes
    sc = pg.inner_text('#ra')
    check(sc.endswith('%') and int(sc[:-1]) > 80, f'section loop scores the section notes ({sc})')
    check(not IGN(app.errors), f'no page errors (1): {IGN(app.errors)[:3]}')

# ---------- 2. range finder with a 45..66 slide ----------
with App(mic_wav='/tmp/sgt/slide.wav') as app:
    pg = app.page; pg.evaluate(RANGE)
    app.go('#/x/sg/range', 600); pg.click('#go'); pg.wait_for_timeout(300); pg.click('[data-go]')
    pg.wait_for_selector('#save', timeout=40000)
    r = json.loads(pg.evaluate("document.getElementById('stage').dataset.result"))
    print('range result', r)
    check(abs(r['rawLow'] - 45) <= 1 and abs(r['rawHigh'] - 66) <= 1, f"range finder heard {r['rawLow']}..{r['rawHigh']} (sung 45..66)")
    app.shot('/tmp/sgt/range.png'); pg.click('#save'); pg.wait_for_timeout(300)
    s = pg.evaluate("JSON.parse(localStorage.getItem('kz3:settings'))")
    check(s['vocalLow'] == r['low'] and s['vocalHigh'] == r['high'], f"range saved {s['vocalLow']}..{s['vocalHigh']}")
    # slalom trail follows a slide (ball moves): pitch monitor trail range
    check(not IGN(app.errors), f'no page errors (2): {IGN(app.errors)[:3]}')

# ---------- 3. walk every lesson and game ----------
with App(mic_wav='/tmp/sgt/a3.wav') as app:
    pg = app.page; pg.evaluate(RANGE)
    units = pg.evaluate("window.__kz.TR.sg.units.map(u => ({id: u.id, steps: u.steps.map(s => s.type === 'lesson' ? 'lesson' : s.game)}))")
    shots = {'sg-02': 'breath', 'sg-04': 'slalom', 'sg-05': 'balloon', 'sg-07': 'singAlong', 'sg-10': 'intervalQuiz', 'sg-14': 'echo', 'sg-15': 'dynamics', 'sg-18': 'matchNote', 'sg-01': 'elevator', 'sg-08': 'degreeQuiz'}
    for u in units:
        for k, st in enumerate(u['steps']):
            app.go(f"#/u/sg/{u['id']}/{k}", 700)
            if st == 'lesson':
                for _ in range(8):
                    for b in pg.query_selector_all('.lbody [data-tone], .lbody [data-seq], .lbody [data-sgchord]'): b.click(); pg.wait_for_timeout(40)
                    if pg.query_selector('.lbody [data-go]'): pg.click('.lbody [data-go]'); pg.wait_for_timeout(3500)
                    if pg.query_selector('.sg-breathe') and pg.inner_text('.sg-breathe') == 'Tap to start': pg.click('.sg-breathe'); pg.wait_for_timeout(12500)
                    nb = pg.query_selector('[data-n]')
                    if not nb: break
                    if nb.is_disabled() and pg.query_selector('.lbody .sg-mini'): pg.wait_for_timeout(13000)
                    if nb.is_disabled() and pg.query_selector('.lbody .btn.ghost.sm'): pg.click('.lbody .btn.ghost.sm'); pg.wait_for_timeout(200)
                    if nb.is_disabled(): print('  card stuck (requireDone not met):', u['id'], pg.inner_text('.lesson h2')); fails.append('stuck ' + u['id']); break
                    last = 'Start' in nb.inner_text(); nb.click(); pg.wait_for_timeout(200)
                    if last: break
            else:
                if pg.query_selector('[data-go]'): pg.click('[data-go]')
                pg.wait_for_timeout(2600)
                # answer an option if a quiz is showing
                o = pg.query_selector('#gstage .opt, #gstage .sg-pad')
                if o:
                    try: o.click()
                    except Exception: pass
                    pg.wait_for_timeout(400)
                if pg.query_selector('#pp'): pg.click('#pp'); pg.wait_for_timeout(2500)
                if shots.get(u['id']) == st: app.shot(f"/tmp/sgt/g_{st}.png")
        print('walked', u['id'], len(app.errors), 'errors so far')
    check(not IGN(app.errors), f'no page errors while walking all units: {IGN(app.errors)[:5]}')

# ---------- 4. phone layout ----------
with App(mic_wav='/tmp/sgt/a3.wav', width=390, height=844, mobile=True) as app:
    pg = app.page; pg.evaluate(RANGE)
    app.go('#/u/sg/sg-19/2', 700); pg.click('[data-go]'); pg.wait_for_timeout(700); pg.click('#pp'); pg.wait_for_timeout(4000); app.shot('/tmp/sgt/phone_session.png')
    app.go('#/u/sg/sg-03/1', 700); pg.click('[data-go]'); pg.wait_for_timeout(3000); app.shot('/tmp/sgt/phone_match.png')
    sw = pg.evaluate('document.documentElement.scrollWidth')
    check(sw <= 390, f'no horizontal scroll on phone (scrollWidth {sw})')
    check(not IGN(app.errors), f'no page errors on phone: {IGN(app.errors)[:3]}')
print('FAILURES:', fails if fails else 'none')
