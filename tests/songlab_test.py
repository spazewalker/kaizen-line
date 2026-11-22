"""End-to-end Song Lab test: upload, analysis, song screen, chord edit, capo/simplify, practice launch, phone layout,
and main-thread fallback (no Worker). Run: python3 tests/songlab_test.py"""
import sys, time, os
sys.path.insert(0, 'tests')
from harness import App

def own(errors):  # ignore 404s from other areas still being built
    return [e for e in errors if 'songlab' in e.lower() or ('404' not in e and 'track load failed' not in e and 'Failed to fetch dynamically' not in e)]

def wait_ready(pg, n=1, timeout=90):
    t = time.time()
    while time.time() - t < timeout:
        k = pg.evaluate("[...document.querySelectorAll('.sl-info')].filter(e=>/bpm/.test(e.textContent)).length")
        if k >= n: return time.time() - t
        pg.wait_for_timeout(500)
    raise SystemExit('analysis timed out: ' + pg.inner_text('#sllist'))

fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

with App() as app:
    pg = app.page
    app.go('#/songs', 800)
    check(pg.is_visible('text=Upload a song'), 'library renders')
    app.shot('/tmp/sl_library_empty.png')
    pg.set_input_files('#slfile', 'audio/demo/paper-lanterns.mp3')
    pg.wait_for_timeout(1200); app.shot('/tmp/sl_library_progress.png')
    dt = wait_ready(pg, 1)
    print(f'     upload analysis took {dt:.1f}s (93 s song, headless)')
    pg.click('[data-demo=night-express]')
    wait_ready(pg, 2)
    app.shot('/tmp/sl_library.png', full=True)
    titles = pg.evaluate("[...document.querySelectorAll('.sl-open b')].map(b=>b.textContent)")
    check(len(titles) == 2, f'two songs listed {titles}')
    # open the uploaded song
    pg.click('.sl-song:last-child .sl-open'); pg.wait_for_timeout(1500)
    chips = pg.inner_text('#slchips')
    check('G major' in chips and '96 bpm' in chips, f'key/bpm chips: {chips!r}')
    first = pg.evaluate("[...document.querySelectorAll('.sl-beat.chg b')].slice(0,8).map(b=>b.textContent)")
    print('     first chords:', first)
    app.shot('/tmp/sl_song.png'); app.shot('/tmp/sl_song_full.png', full=True)
    # play + seek
    pg.click('#slplay'); pg.wait_for_timeout(1500)
    check(pg.inner_text('#slplay') == 'Pause', 'plays')
    check(pg.evaluate("document.querySelectorAll('.sl-beat.now').length") == 1, 'current beat highlighted')
    pg.click('#slplay')
    # edit a chord: beat 6 -> A minor everywhere this chord appears
    pg.click('.sl-beat[data-b="6"]'); pg.wait_for_timeout(300)
    app.shot('/tmp/sl_picker.png')
    old = pg.evaluate("document.querySelector('.sl-picker .muted b').textContent")
    pg.click('.sl-picker [data-root="9"]'); pg.click('.sl-picker [data-type="m"]')
    pg.click('.sl-picker input[value=all]'); pg.click('#pkok'); pg.wait_for_timeout(500)
    ed = pg.evaluate("document.querySelectorAll('.sl-beat.edited').length")
    check(ed >= 8, f'edit applied everywhere ({old} -> Am): {ed} beats')
    pg.reload(); pg.wait_for_timeout(1500)
    check(pg.evaluate("document.querySelectorAll('.sl-beat.edited').length") == ed, 'edit persisted after reload')
    # simplify + capo + transpose
    pg.click('#slsimp button[data-v="1"]'); pg.wait_for_timeout(200)
    caps = pg.evaluate("[...document.querySelectorAll('.sl-capo b')].map(b=>b.textContent)")
    check(len(caps) >= 2, f'capo options {caps}')
    pg.click('.sl-capo:nth-child(2)'); pg.wait_for_timeout(300)
    pg.click('#sltu'); pg.wait_for_timeout(200)
    check('A major' in pg.inner_text('#slkey') or 'Ab' in pg.inner_text('#slkey'), 'transpose up: ' + pg.inner_text('#slkey'))
    pg.click('#sltd'); pg.wait_for_timeout(200)
    # beat tools
    pg.click('.sl-fix summary'); pg.click('#slearly'); pg.wait_for_timeout(300)
    # launch guitar session
    pg.select_option('#slsec', '1')
    pg.click('#slgtr'); pg.wait_for_timeout(2500)
    gt = pg.inner_text('#slsess')[:160].replace('\n', ' ')
    gt_exists = os.path.exists('js/tracks/guitar/session.js')
    print('     guitar session view:', gt)
    check(('could not start' not in gt) if gt_exists else ('could not start' in gt), f'guitar launch (session.js present={gt_exists})')
    app.shot('/tmp/sl_guitar.png')
    sess = pg.evaluate("location.hash")
    check(sess.endswith('/guitar/1'), 'section in route ' + sess)
    pg.click('.sl-back'); pg.wait_for_timeout(1500)
    pg.click('#slsing'); pg.wait_for_timeout(2500)
    sg = pg.inner_text('#slsess')[:160].replace('\n', ' ')
    sg_exists = os.path.exists('js/tracks/singing/session.js')
    print('     sing session view:', sg)
    check(('could not start' not in sg) if sg_exists else ('could not start' in sg), f'sing launch (session.js present={sg_exists})')
    app.shot('/tmp/sl_sing.png')
    # phone layout
    pg.set_viewport_size({'width': 390, 'height': 844})
    app.go('#/songs', 1000); app.shot('/tmp/sl_phone_library.png', full=True)
    pg.click('.sl-song:last-child .sl-open'); pg.wait_for_timeout(1500)
    app.shot('/tmp/sl_phone_song.png', full=True)
    ov = pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    check(not ov, 'no horizontal scroll on phone')
    # delete flow
    app.go('#/songs', 800)
    n0 = pg.evaluate("document.querySelectorAll('.sl-song').length")
    pg.click('.sl-song:first-child [data-act=menu]'); pg.click('.modal button:has-text("Delete")'); pg.click('.modal button:has-text("Yes")'); pg.wait_for_timeout(800)
    check(pg.evaluate("document.querySelectorAll('.sl-song').length") == n0 - 1, 'delete works')
    e = own(app.errors); check(not e, f'no page errors {e[:5]}')

# main-thread fallback (no module worker)
with App() as app:
    pg = app.page
    pg.add_init_script("window.Worker = undefined")
    pg.reload(); pg.wait_for_timeout(800)
    app.go('#/songs', 800)
    pg.click('[data-demo=morning-ferry]')
    dt = wait_ready(pg, 1)
    print(f'     main-thread fallback analysis took {dt:.1f}s')
    check('D major' in pg.inner_text('.sl-info'), 'fallback result: ' + pg.inner_text('.sl-info'))
    e = own(app.errors); check(not e, f'no page errors (fallback) {e[:5]}')

print('SONGLAB E2E', 'PASS' if not fails else f'{len(fails)} FAILURES: {fails}')
