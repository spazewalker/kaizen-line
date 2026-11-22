"""Review flow with due items of every kind + audio HTTP check + dark-mode screenshots."""
import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from harness import App
from japanese_test import AUTO
AUTO_R = AUTO.replace("if (st.querySelector('.stamp')) return 'stamped';", "if (st.querySelector('.result')) return 'done';")
with App() as app:
    pg = app.page
    pg.evaluate("""() => { const s={}; const t=Math.floor(Date.UTC(new Date().getFullYear(),new Date().getMonth(),new Date().getDate())/86400000);
      ['jp:kana:あ','jp:kana:シ','jp:kana:きゃ','jp:word:mizu','jp:word:kippu','jp:word:aisukurimu','jp:phr:koreo','jp:phr:ekiwa','jp:phr:wifi','jp:price:680','jp:time:7:30','jp:num:47']
        .forEach(id => s[id]={t:'jp',due:t,ivl:0,ease:2.5,reps:0,lapses:0,seen:0,ok:0});
      localStorage.setItem('kz3:srs', JSON.stringify(s)); localStorage.setItem('kz3:settings', JSON.stringify({jaSpeed:4})); }""")
    pg.reload(); pg.wait_for_timeout(1000)
    app.go('#/r/jp', 800)
    seen = {}
    for _ in range(900):
        st = pg.evaluate(AUTO_R); seen[st] = seen.get(st, 0) + 1
        if st == 'done': break
        pg.wait_for_timeout(120)
    srs = pg.evaluate("JSON.parse(localStorage.getItem('kz3:srs'))")
    graded = sum(1 for v in srs.values() if v['seen'] > 0)
    print('review states', seen, '| graded', graded, 'of', len(srs))
    # audio over HTTP
    codes = pg.evaluate("""async () => { const idx = await (await fetch('audio/ja/index.json')).json(); const f = Object.values(idx); const pick = f.filter((_, i) => i % 25 === 0);
        const r = await Promise.all(pick.map(x => fetch('audio/ja/' + x).then(r => r.status))); return [pick.length, r.filter(c => c === 200).length]; }""")
    print('audio http sample', codes)
    # one clip actually decodes / plays
    played = pg.evaluate("""async () => { const idx = await (await fetch('audio/ja/index.json')).json(); const a = new Audio('audio/ja/' + idx['こんにちは']); await a.play(); await new Promise(r => setTimeout(r, 300)); return !a.paused || a.ended; }""")
    print('clip plays', played)
    pg.emulate_media(color_scheme='dark')
    app.go('#/u/jp/jp-05/1', 3500); app.shot('/tmp/jpd_talk.png')
    app.go('#/u/jp/jp-01', 700); pg.click('[data-n]'); pg.click('[data-n]'); pg.wait_for_timeout(300); app.shot('/tmp/jpd_kana.png')
    app.go('#/u/jp/jp-19/3', 1500); app.shot('/tmp/jpd_menu.png')
    print('errors', app.errors)
