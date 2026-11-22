"""Walk every guitar station, lesson and game step (no mic input; skip mic where offered).
Run: python3 tests/guitar_walk_test.py   -> screenshots in /tmp/gt_*.png"""
import sys; sys.path.insert(0, 'tests')
from harness import App
import guitar_synth as G, numpy as np
G.save('/tmp/gt_silence.wav', G.noise(G.SR * 4, 0.0005))
SHOT = set(sys.argv[1:])
def ignore(e): return any(x in e for x in ['japanese', 'singing', 'songlab', '404', 'track load failed jp', 'track load failed sg'])
for (w, h, tag) in [(820, 1180, 'ipad'), (390, 844, 'phone')]:
    with App(mic_wav='/tmp/gt_silence.wav', width=w, height=h) as app:
        pg = app.page
        units = pg.evaluate("window.__kz.TR.gt.units.map(u => ({id: u.id, steps: u.steps.map(s => s.type === 'lesson' ? 'lesson:' + s.cards.length : s.game)}))")
        print(tag, 'units', len(units))
        app.go('#/t/gt', 800); app.shot(f'/tmp/gt_{tag}_track.png', full=True)
        for u in units:
            for k, st in enumerate(u['steps']):
                if tag == 'phone' and k > 1: continue
                app.go(f"#/u/gt/{u['id']}/{k}", 700)
                if st.startswith('lesson'):
                    n = int(st.split(':')[1])
                    for c in range(n):
                        if tag == 'ipad' and c < 6: app.shot(f"/tmp/gt_{tag}_{u['id']}_L{c}.png", full=True)
                        # requireDone cards: press skip if present
                        pg.evaluate("""(() => { const s = document.querySelector('.lbody [data-skip]'); if (s) s.click(); })()""")
                        pg.wait_for_timeout(150)
                        pg.evaluate("document.querySelector('[data-n]')?.click()")
                        pg.wait_for_timeout(200)
                else:
                    pg.wait_for_timeout(500)
                    # choose mic if offered, else allow
                    pg.evaluate("""(() => { const b = document.querySelector('#mic') || document.querySelector('[data-go]'); if (b) b.click(); })()""")
                    pg.wait_for_timeout(1500)
                    pg.evaluate("""(() => { const b = document.querySelector('[data-go]'); if (b) b.click(); })()""")
                    pg.wait_for_timeout(1200)
                    app.shot(f"/tmp/gt_{tag}_{u['id']}_{k}_{st}.png")
                    # poke a control
                    pg.evaluate("""(() => { const b = document.querySelector('#gstage .opt, #gstage .gt-strbtn, #gstage .gt-bf, #gstage .gt-cell, #play, #nplay, #go'); if (b) b.click(); })()""")
                    pg.wait_for_timeout(700)
        for x in ['tuner', 'chords', 'songs', 'changes', 'metronome', 'monitor']:
            app.go(f'#/x/gt/{x}', 600)
            pg.evaluate("""(() => { const b = document.querySelector('[data-go]'); if (b) b.click(); })()""")
            pg.wait_for_timeout(1500)
            app.shot(f'/tmp/gt_{tag}_x_{x}.png', full=(x == 'chords'))
        # review
        pg.evaluate("window.__kz.srs.learn(['gt:chord:Em','gt:note:5:3','gt:string:2','gt:pattern:D.DU.UDU'],'gt')")
        app.go('#/r/gt', 1000); app.shot(f'/tmp/gt_{tag}_review.png')
        # song lab-style session with range
        pg.evaluate("""(async () => { const m = await import('/js/tracks/guitar/session.js'); const s = await import('/js/tracks/guitar/songs.js');
            const sess = s.songSession('loop4'); sess.range = {t0: sess.chords[2].t, t1: sess.chords[5].t};
            document.querySelector('#app').innerHTML = '<div id=ss></div>'; window.__cl = m.startChordSession(document.querySelector('#ss'), sess, {}, {gate:false}); })()""")
        pg.wait_for_timeout(1200); pg.click('#play'); pg.wait_for_timeout(3500); app.shot(f'/tmp/gt_{tag}_rangesession.png')
        errs = [e for e in app.errors if not ignore(e)]
        print(tag, 'ERRORS:', errs if errs else 'none')
        # horizontal overflow check
        ov = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        print(tag, 'horizontal overflow on last screen:', ov)
