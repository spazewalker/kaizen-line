"""Generate Japanese speech clips with pyopenjtalk.
Input: /tmp/ja_texts.json from tools/ja_texts.mjs. Output: audio/ja/<id>.mp3 + audio/ja/index.json (text -> file).
Uses the kanji form for better prosody when its reading matches the kana; reports reading mismatches."""
import json, hashlib, os, subprocess, sys, re, tempfile
import numpy as np, pyopenjtalk
from concurrent.futures import ProcessPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'ja')
os.makedirs(OUT, exist_ok=True)
data = json.load(open('/tmp/ja_texts.json'))
texts, kj = data['texts'], data['kj']
OVERRIDE = {}  # text -> tts input, for readings pyopenjtalk gets wrong
if os.path.exists(os.path.join(ROOT, 'tools', 'ja_overrides.json')):
    OVERRIDE = json.load(open(os.path.join(ROOT, 'tools', 'ja_overrides.json')))

def fid(t): return 'j' + hashlib.sha1(t.encode()).hexdigest()[:9] + '.mp3'
def ph(t): return pyopenjtalk.g2p(t).lower().replace(' ', '').replace('pau', '')

def make(t):
    src = OVERRIDE.get(t)
    if not src:
        src = t
        k = kj.get(t)
        if k:
            try:
                if ph(k) == ph(t): src = k
            except Exception: pass
    path = os.path.join(OUT, fid(t))
    if os.path.exists(path) and not os.environ.get('FORCE'): return t, fid(t), src
    x, sr = pyopenjtalk.tts(src.replace(' ', ''))
    x = x.astype(np.float64) / 32768.0
    a = np.abs(x); thr = a.max() * 0.02
    idx = np.where(a > thr)[0]
    pad = int(0.04 * sr)
    x = x[max(0, idx[0] - pad): idx[-1] + pad] if len(idx) else x
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    x = x * (10 ** (-18 / 20) / rms)
    pk = np.abs(x).max()
    if pk > 0.95: x = x * 0.95 / pk
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f: wav = f.name
    import wave
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '40k', path], check=True)
    os.unlink(wav)
    return t, fid(t), src

if __name__ == '__main__':
    with ProcessPoolExecutor(8) as ex: res = list(ex.map(make, texts, chunksize=16))
    index = {t: f for t, f, _ in res}
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    used = set(index.values())
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f not in used: os.unlink(os.path.join(OUT, f))
    print(len(index), 'clips')
