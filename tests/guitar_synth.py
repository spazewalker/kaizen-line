"""Synthetic guitar audio for tests (Karplus-Strong)."""
import numpy as np
SR = 48000
OPEN = [40, 45, 50, 55, 59, 64]
SHAPES = {'Em':[0,2,2,0,0,0],'Am':[-1,0,2,2,1,0],'C':[-1,3,2,0,1,0],'G':[3,2,0,0,0,3],'D':[-1,-1,0,2,3,2],
          'E':[0,2,2,1,0,0],'A':[-1,0,2,2,2,0],'Dm':[-1,-1,0,2,3,1],'F':[1,3,3,2,1,1]}
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
rng = np.random.default_rng(7)
def ks(m, dur=2.0, decay=0.4985):
    f = hz(m); N = int(round(SR / f)); n = int(SR * dur)
    r = rng.uniform(-1, 1, N)
    for _ in range(2): r[1:] = 0.5 * (r[1:] + r[:-1])
    out = np.zeros(n); p = 0
    buf = r.copy()
    # vectorised-ish KS loop
    for i in range(n):
        nx = p + 1 if p + 1 < N else 0
        v = buf[p]; buf[p] = decay * (buf[p] + buf[nx]); out[i] = v; p = nx
    return out
_cache = {}
def note(m, dur=2.0):
    k = (m, dur)
    if k not in _cache: _cache[k] = ks(m, dur)
    return _cache[k]
def strum(frets, dur=2.0, spread=0.03, vel=0.25, up=False):
    idx = [i for i in range(6) if frets[i] >= 0]
    if up: idx = idx[::-1]
    out = np.zeros(int(SR * (dur + 0.3)))
    for k, s in enumerate(idx):
        o = int(k * spread * SR); x = note(OPEN[s] + frets[s], dur) * vel
        out[o:o + len(x)] += x[:len(out) - o]
    return out
def click(t_len=0.04, f=1500, vol=0.4):
    n = int(SR * t_len); tt = np.arange(n) / SR
    return vol * np.sign(np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 80)
def place(track, x, t):
    o = int(t * SR); e = min(len(track), o + len(x)); track[o:e] += x[:e - o]
def noise(n, lvl=0.003): return rng.normal(0, lvl, n)
def save(path, x):
    from harness import write_wav
    x = x / max(1.0, np.abs(x).max() / 0.9)
    write_wav(path, x, SR)
def pure(m, dur=1.4, cents=0.0, vel=0.3):
    """Exact-pitch plucked tone (additive, decaying harmonics)."""
    f = hz(m) * 2 ** (cents / 1200); n = int(SR * dur); t = np.arange(n) / SR
    x = np.zeros(n)
    for h in range(1, 9):
        if f * h > SR / 2: break
        x += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) * (0.9 ** h) / h * np.exp(-t * (1.5 + h * 0.6))
    x *= np.minimum(1, t / 0.004)
    return x * vel
