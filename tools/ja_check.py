"""Compare pyopenjtalk's reading of each clip source with our romaji. Prints mismatches."""
import json, os, re, sys, pyopenjtalk
sys.path.insert(0, os.path.dirname(__file__))
ro = json.load(open('/tmp/ja_ro.json')); kj = json.load(open('/tmp/ja_texts.json'))['kj']
ov = json.load(open('tools/ja_overrides.json')) if os.path.exists('tools/ja_overrides.json') else {}
def ph(t): return pyopenjtalk.g2p(t).lower().replace(' ', '').replace('pau', '')
def norm_mine(r):
    r = r.lower()
    for a, b in {'ā': 'aa', 'ī': 'ii', 'ū': 'uu', 'ē': 'ee', 'ō': 'oo'}.items(): r = r.replace(a, b)
    r = re.sub(r"[^a-z]", '', r)
    r = re.sub(r'([kstpgbdmhfrjc])\1', r'cl\1', r)  # kk -> clk
    r = r.replace('tch', 'clch')
    return r.replace('ei', 'ee')
def norm_g(g): return g.replace('ei', 'ee')
bad = []
for t, r in ro.items():
    src = ov.get(t)
    if not src:
        src = t; k = kj.get(t)
        if k and ph(k) == ph(t): src = k
    g = norm_g(ph(src.replace(' ', ''))); m = norm_mine(r)
    if g != m: bad.append((t, r, g, m))
for b in bad: print(' | '.join(b))
print(len(bad), 'mismatches of', len(ro))
