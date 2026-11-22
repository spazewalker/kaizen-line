"""Screenshots of key Japanese screens at iPad and phone sizes."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import App
def snap(w, h, tag):
    with App(width=w, height=h) as app:
        pg = app.page
        # pretend some progress so reviews and chart have data
        pg.evaluate("""() => { const s={}; const today=Math.floor(Date.UTC(new Date().getFullYear(),new Date().getMonth(),new Date().getDate())/86400000);
          ['あ','い','う','え','お','か','き','く','け','こ'].forEach((k,i)=>s['jp:kana:'+k]={t:'jp',due:today,ivl:i*3,ease:2.5,reps:i?2:0,lapses:0,seen:3,ok:2});
          ['jp:word:mizu','jp:word:ocha','jp:word:kohi','jp:phr:koreo','jp:phr:mizuo','jp:word:eki','jp:price:680'].forEach(id=>s[id]={t:'jp',due:today,ivl:1,ease:2.5,reps:1,lapses:0,seen:1,ok:1});
          localStorage.setItem('kz3:srs', JSON.stringify(s)); localStorage.setItem('kz3:progress', JSON.stringify({'jp-01':{stars:3},'jp-02':{stars:2}})); }""")
        pg.reload(); pg.wait_for_timeout(900)
        app.go('#/t/jp', 700); app.shot(f'/tmp/jps_{tag}_track.png')
        app.go('#/u/jp/jp-01', 700); app.shot(f'/tmp/jps_{tag}_l1.png')
        pg.click('[data-n]'); pg.wait_for_timeout(300); pg.click('[data-n]'); pg.wait_for_timeout(300); app.shot(f'/tmp/jps_{tag}_kana.png', full=True)
        app.go('#/u/jp/jp-03', 700); pg.click('[data-n]'); pg.wait_for_timeout(300); app.shot(f'/tmp/jps_{tag}_pattern.png', full=True)
        for uid, k, name in [('jp-02', 1, 'rain'), ('jp-01', 2, 'memory'), ('jp-05', 1, 'talk'), ('jp-19', 3, 'menu'), ('jp-03', 2, 'builder'), ('jp-07', 2, 'numbers'), ('jp-08', 3, 'dictation'), ('jp-03', 3, 'speak'), ('jp-01', 1, 'listen')]:
            app.go(f'#/u/jp/{uid}/{k}', 2600)
            if name == 'memory': pg.click('.jp-mc >> nth=0'); pg.wait_for_timeout(300)
            if name == 'talk': pg.wait_for_timeout(2500)
            if name == 'builder': pg.click('.jp-tile >> nth=0'); pg.wait_for_timeout(200)
            app.shot(f'/tmp/jps_{tag}_{name}.png')
        app.go('#/x/jp/chart', 700); app.shot(f'/tmp/jps_{tag}_chart.png')
        app.go('#/x/jp/phrasebook', 700); app.shot(f'/tmp/jps_{tag}_phrasebook.png')
        app.go('#/x/jp/drill', 1500); app.shot(f'/tmp/jps_{tag}_drill.png')
        app.go('#/r/jp', 2000); app.shot(f'/tmp/jps_{tag}_review.png')
        print(tag, 'errors', app.errors)
snap(820, 1180, 'ipad'); snap(390, 844, 'phone')
