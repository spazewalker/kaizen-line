"""Speak-it game: (1) stubbed SpeechRecognition returning kanji text must count as correct,
(2) wrong speech must not, (3) record-and-compare fallback records from the (fake) mic."""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from harness import App, write_wav
import numpy as np
STUB = r"""
window.__heard = 'メニューをください';
class FakeSR { constructor(){ this.lang=''; } start(){ setTimeout(()=>{ const alt=[{transcript: window.__heard}]; this.onresult && this.onresult({results:[alt]}); this.onend && this.onend(); }, 300); } stop(){} }
window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
"""
sr = 48000; t = np.arange(sr * 2) / sr
write_wav('/tmp/jp_mic.wav', 0.2 * np.sin(2 * math.pi * 200 * t), sr)
ok = True
with App(mic_wav='/tmp/jp_mic.wav') as app:
    pg = app.page
    pg.add_init_script(STUB); pg.reload(); pg.wait_for_timeout(1000)
    # similarity check of kanji vs kana via the exported function
    sim = pg.evaluate("import('./js/tracks/japanese/games.js').then(m => [m.similarity('水をください','みず を ください'), m.similarity('メニューをください','メニューをください'), m.similarity('トイレはどこですか','えきはどこですか')])")
    print('similarity', [round(x, 2) for x in sim])
    app.go('#/u/jp/jp-03/3', 1500)   # speak game: koreo, mizuo, menyuo
    for i in range(3):
        phrase = pg.inner_text('.jp-say-big')
        kj = pg.evaluate(f"window.__kz.TR.jp && (() => {{ return null }})()")
        heard = {'これをください': 'これをください', 'みずをください': '水をください', 'メニューをください': 'メニューをください'}.get(phrase, phrase)
        if i == 1: heard = 'トイレはどこですか'  # wrong on purpose first
        pg.evaluate(f"window.__heard = {heard!r}")
        pg.click('[data-act=rec]'); pg.wait_for_timeout(900)
        fb = pg.inner_text('#out'); print(i, phrase, '->', fb.replace('\n', ' '))
        if i == 1:
            ok &= 'match' in fb
            pg.evaluate(f"window.__heard = {({'これをください':'これをください','みずをください':'水をください','メニューをください':'メニューをください'}.get(phrase, phrase))!r}")
            pg.click('[data-act=rec]'); pg.wait_for_timeout(900); fb = pg.inner_text('#out'); print('  retry ->', fb)
        ok &= 'Great' in fb
        pg.wait_for_timeout(1600)
    pg.wait_for_timeout(500)
    print('result screen:', pg.is_visible('.result'))
    ok &= pg.is_visible('.result')
    # record fallback
    pg.evaluate("delete window.webkitSpeechRecognition; delete window.SpeechRecognition")
    app.go('#/t/jp', 300); pg.evaluate("location.hash='#/u/jp/jp-03/3'"); pg.wait_for_timeout(300)
    pg.evaluate("window.webkitSpeechRecognition = undefined; window.SpeechRecognition = undefined;")
    app.go('#/t/jp', 300); app.go('#/u/jp/jp-03/3', 1500)
    has_rec = pg.is_visible('[data-act=record]'); print('record button', has_rec)
    if has_rec:
        pg.click('[data-act=record]'); pg.wait_for_timeout(7000)
        print('after record:', pg.inner_text('#out'), '| rate visible', pg.is_visible('#rate'))
        ok &= pg.is_visible('#rate')
    print('errors', app.errors)
    ok &= not app.errors
print('SPEAK TEST', 'PASS' if ok else 'FAIL')
