"""Walk every Japanese station (lesson + all games) with an auto-player, then tools and review.
Usage: python3 tests/japanese_test.py [first_unit_index] [last_unit_index_exclusive] [--shots]"""
import sys, time, json, os, math
sys.path.insert(0, os.path.dirname(__file__))
from harness import App, write_wav
import numpy as np

AUTO = r"""() => {
  const st = document.querySelector('#stage'); if (!st) return 'nostage';
  const vis = e => e && e.offsetParent !== null;
  const rand = a => a[Math.floor(Math.random() * a.length)];
  if (st.querySelector('.stamp')) return 'stamped';
  const res = st.querySelector('.result [data-c]'); if (res) { res.click(); return 'result'; }
  const q = s => [...st.querySelectorAll(s)].filter(e => vis(e) && !e.disabled);
  const chk = q('.jp-check .opt'); if (chk.length) { rand(chk).click(); return 'check'; }
  const nx = q('.navrow [data-n]'); if (nx.length) { nx[0].click(); return 'next'; }
  const rate = q('[data-q="2"]'); if (rate.length) { rate[0].click(); return 'rate'; }
  const ch = q('.jp-choice'); if (ch.length) { rand(ch).click(); return 'choice'; }
  const mc = q('.jp-mc:not(.up):not(.got)'); if (mc.length) { rand(mc).click(); return 'mem'; }
  const mi = q('.jp-mi'); if (mi.length) { rand(mi).click(); return 'menu'; }
  const tile = q('.jp-tile'); const check = q('[data-act=check]');
  if (check.length && st.querySelectorAll('.jp-chip').length >= 2 && Math.random() < .5) { check[0].click(); return 'checkbuild'; }
  if (tile.length) { rand(tile).click(); return 'tile'; }
  if (check.length) { check[0].click(); return 'checkbuild'; }
  const opt = q('.opt'); if (opt.length) { rand(opt).click(); return 'opt'; }
  const rec = q('[data-act=record]'); if (rec.length) { rec[0].click(); return 'record'; }
  return 'wait';
}"""

def run(lo, hi, shots):
    # fake mic: quiet tone so recording works
    sr = 48000; t = np.arange(sr * 2) / sr
    write_wav('/tmp/jp_mic.wav', 0.1 * np.sin(2 * math.pi * 220 * t), sr)
    with App(mic_wav='/tmp/jp_mic.wav') as app:
        pg = app.page
        pg.evaluate("localStorage.setItem('kz3:settings', JSON.stringify({jaSpeed: 4}))")
        pg.add_init_script("delete window.webkitSpeechRecognition; delete window.SpeechRecognition;")
        pg.reload(); pg.wait_for_timeout(1200)
        units = pg.evaluate("window.__kz.TR.jp.units.map(u => u.id)")
        report = {}
        for uid in units[lo:hi]:
            app.go(f'#/u/jp/{uid}', 600)
            t0 = time.time(); steps = {}; state = ''
            while time.time() - t0 < 420:
                state = pg.evaluate(AUTO)
                steps[state] = steps.get(state, 0) + 1
                if state == 'stamped': break
                pg.wait_for_timeout(120 if state != 'wait' else 250)
            report[uid] = {'ok': state == 'stamped', 'sec': round(time.time() - t0), 'learned': pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('kz3:srs')||'{}')).length")}
            print(uid, report[uid], flush=True)
            if shots: app.shot(f'/tmp/jp_{uid}_done.png')
        print('ERRORS', [e for e in app.errors if 'favicon' not in e])
        return report

if __name__ == '__main__':
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 99
    run(lo, hi, '--shots' in sys.argv)
