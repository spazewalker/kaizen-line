"""Render original demo songs for Song Lab (and ground truth JSON for tests).
Usage: python3 tools/make_demos.py            -> audio/demo/*.mp3 + tests/fixtures/*.json + *.wav
All music here is original (simple progressions + generated melodies). Deterministic (seeded).
"""
import json, os, subprocess, numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'demo'); FIX = os.path.join(ROOT, 'tests', 'fixtures')
os.makedirs(OUT, exist_ok=True); os.makedirs(FIX, exist_ok=True)
PCS = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
SHAPES = {  # guitar voicings low E..high e (-1 muted)
    'C': [-1, 3, 2, 0, 1, 0], 'D': [-1, -1, 0, 2, 3, 2], 'Dm': [-1, -1, 0, 2, 3, 1], 'E': [0, 2, 2, 1, 0, 0], 'Em': [0, 2, 2, 0, 0, 0],
    'E7': [0, 2, 0, 1, 0, 0], 'F': [1, 3, 3, 2, 1, 1], 'G': [3, 2, 0, 0, 0, 3], 'A': [-1, 0, 2, 2, 2, 0], 'Am': [-1, 0, 2, 2, 1, 0],
    'A7': [-1, 0, 2, 0, 2, 0], 'Bm': [-1, 2, 4, 4, 3, 2], 'Am7': [-1, 0, 2, 0, 1, 0],
}
OPEN = [40, 45, 50, 55, 59, 64]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)


def chord_pcs(name):
    root = name[:2] if len(name) > 1 and name[1] in '#b' else name[:1]
    q = name[len(root):]
    iv = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10]}[q]
    return PCS[root], [(PCS[root] + i) % 12 for i in iv]


def pluck(f, dur, vel, rng):
    n = int(dur * SR); t = np.arange(n) / SR; y = np.zeros(n)
    B = 0.00008
    for h in range(1, 14):
        fh = f * h * np.sqrt(1 + B * h * h)
        if fh > SR / 2.3: break
        amp = (1 / h) * (0.9 if h % 5 else 0.5) * (1 + 0.15 * rng.standard_normal())
        rate = 1.4 + 0.55 * h + f / 400
        y += amp * np.sin(2 * np.pi * fh * t + rng.uniform(0, 6.28)) * np.exp(-t * rate)
    att = np.minimum(1, t / 0.004)
    return y * att * vel


def strum(buf, t0, shape, up, vel, rng, dur=1.6):
    order = [5, 4, 3, 2, 1, 0] if up else [0, 1, 2, 3, 4, 5]
    k = 0
    for s in order:
        if shape[s] < 0: continue
        if up and k >= 4: break
        st = int((t0 + k * (0.012 if up else 0.016)) * SR)
        y = pluck(hz(OPEN[s] + shape[s]), dur, vel * (0.7 if up else 1) * (1 - 0.05 * k), rng)
        e = min(len(buf), st + len(y)); buf[st:e] += y[:e - st]; k += 1


def bass(buf, t0, midi, dur, vel):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(midi)
    y = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t * 2.2) * np.minimum(1, t / 0.006)
    y[-200:] *= np.linspace(1, 0, 200)
    st = int(t0 * SR); e = min(len(buf), st + n); buf[st:e] += vel * y[:e - st]


def kick(buf, t0, rng):
    n = int(0.3 * SR); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 11)
    st = int(t0 * SR); e = min(len(buf), st + n); buf[st:e] += 0.9 * y[:e - st]


def noise_hit(buf, t0, dur, decay, vel, rng, hp=0.0):
    n = int(dur * SR); t = np.arange(n) / SR; y = rng.standard_normal(n)
    if hp: y = np.diff(np.concatenate([[0], y]))  # crude high-pass
    y *= np.exp(-t * decay) * vel
    st = int(t0 * SR); e = min(len(buf), st + n); buf[st:e] += y[:e - st]


def voice(buf, t0, midi, dur, vel, rng):
    n = int(dur * SR); t = np.arange(n) / SR; f0 = hz(midi)
    vib = 1 + 0.010 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, np.maximum(0, (t - 0.15) / 0.2))
    ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
    y = np.zeros(n)
    for h in range(1, 10):
        fh = f0 * h
        form = np.exp(-((fh - 650) / 500) ** 2) + 0.6 * np.exp(-((fh - 1100) / 400) ** 2) + 0.25
        y += form / h ** 0.7 * np.sin(h * ph)
    env = np.minimum(1, t / 0.04) * np.minimum(1, (dur - t) / 0.06)
    st = int(t0 * SR); e = min(len(buf), st + n); buf[st:e] += vel * y[:e - st] * env


SONGS = [
    dict(id='paper-lanterns', title='Paper Lanterns (demo)', bpm=96, key='G major', strum='D.DU.UDU', seed=1,
         parts=[('Intro', ['G', 'D', 'Em', 'C'], False), ('Verse', ['G', 'D', 'Em', 'C'] * 2, True),
                ('Chorus', ['C', 'D', 'G', 'Em'] * 2, True), ('Verse', ['G', 'D', 'Em', 'C'] * 2, True), ('Chorus', ['C', 'D', 'G', 'Em'] * 2, True)]),
    dict(id='night-express', title='Night Express (demo)', bpm=120, key='A minor', strum='DUDUDUDU', seed=2,
         parts=[('Intro', ['Am', 'Am', 'F', 'G'], False), ('Verse', ['Am', 'F', 'C', 'G'] * 2, True),
                ('Chorus', ['F', 'G', 'Am', 'E7'] * 2, True), ('Verse', ['Am', 'F', 'C', 'G'] * 2, True), ('Chorus', ['F', 'G', 'Am', 'E7'] * 2, True)]),
    dict(id='morning-ferry', title='Morning Ferry (demo)', bpm=84, key='D major', strum='D.D.DUDU', seed=3,
         parts=[('Intro', ['D', 'D', 'G', 'A'], False), ('Verse', ['D', 'Bm', 'G', 'A'] * 2, True),
                ('Chorus', ['G', 'A7', 'D', 'Bm'] * 2, True), ('Verse', ['D', 'Bm', 'G', 'A'] * 2, True)]),
]
RHYTHMS = [[(0, 1), (1, 1), (2, 2)], [(0, 1.5), (1.5, .5), (2, 1), (3, 1)], [(0, 2), (2, 1), (3, 1)], [(0, 1), (1, 1), (2, 1)], [(.5, 1.5), (2, 2)]]


def render(S):
    rng = np.random.default_rng(S['seed'])
    spb = 60 / S['bpm']; lead = 0.5
    bars = [(p[0], c, p[2]) for p in S['parts'] for c in p[1]]
    total = lead + len(bars) * 4 * spb + 2.5
    gtr, bs, dr, vo = (np.zeros(int(total * SR)) for _ in range(4))
    beats, beat_chords, notes, sections = [], [], [], []
    tonic_pc = PCS[S['key'].split()[0]]
    scale = [0, 2, 4, 5, 7, 9, 11] if 'major' in S['key'] else [0, 2, 3, 5, 7, 8, 10]
    scale_m = [m for m in range(58, 78) if (m - tonic_pc) % 12 in scale]
    prev = 67; last_sec = None
    for b, (sec, ch, sing) in enumerate(bars):
        t_bar = lead + b * 4 * spb
        if sec != last_sec or (b and bars[b - 1][0] != sec):
            sections.append({'name': sec, 't0': round(t_bar, 4)}); last_sec = sec
        root, pcs = chord_pcs(ch)
        for i in range(4):
            beats.append(round(t_bar + i * spb, 4)); beat_chords.append(ch)
        for k, d in enumerate(S['strum']):
            if d == '.': continue
            strum(gtr, t_bar + k * spb / 2 + rng.normal(0, .004), SHAPES[ch], d == 'U', 0.22 if k % 2 == 0 else 0.16, rng)
        for i in (0, 2) if S['bpm'] < 110 else (0, 1, 2, 3):
            bass(bs, t_bar + i * spb, 40 + (root - 4) % 12, spb * (2 if S['bpm'] < 110 else 1) * .95, 0.5)
        for i in range(4):
            if i % 2 == 0: kick(dr, t_bar + i * spb, rng)
            else: noise_hit(dr, t_bar + i * spb, 0.2, 18, 0.25, rng)
            for e in (0, .5): noise_hit(dr, t_bar + (i + e) * spb, 0.05, 70, 0.06, rng, hp=1)
        if sing:
            rh = RHYTHMS[(b * 3 + S['seed']) % len(RHYTHMS)]
            for j, (on, ln) in enumerate(rh):
                tones = [m for m in scale_m if m % 12 in pcs] if j == 0 or rng.random() < .6 else scale_m
                cand = sorted(tones, key=lambda m: abs(m - prev) + rng.random() * 2)
                m = cand[0] if abs(cand[0] - prev) > 0 or rng.random() < .3 else cand[1]
                prev = m
                t = t_bar + on * spb; dur = ln * spb * 0.92
                voice(vo, t, m, dur, 0.16, rng)
                notes.append({'t': round(t, 4), 'dur': round(dur, 4), 'midi': int(m)})
    end = lead + len(bars) * 4 * spb
    for i, s in enumerate(sections): s['t1'] = round(sections[i + 1]['t0'] if i + 1 < len(sections) else end, 4)
    mix = 0.8 * gtr + 0.8 * bs + 0.55 * dr + 1.7 * vo
    mix /= np.max(np.abs(mix)) * 1.12
    truth = dict(id=S['id'], title=S['title'], bpm=S['bpm'], key=S['key'], beats=beats, beatChords=beat_chords, melody=notes, sections=sections, duration=total)
    return mix, truth


def write(mix, truth):
    import wave
    wav = os.path.join(FIX, truth['id'] + '.wav')
    a = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
    mp3 = os.path.join(OUT, truth['id'] + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
    json.dump(truth, open(os.path.join(FIX, truth['id'] + '.json'), 'w'))
    return mp3


if __name__ == '__main__':
    idx = []
    for S in SONGS:
        mix, truth = render(S)
        p = write(mix, truth)
        idx.append({'id': S['id'], 'title': S['title'], 'file': 'audio/demo/' + S['id'] + '.mp3', 'bpm': S['bpm'], 'key': S['key'], 'duration': round(truth['duration'], 1)})
        print(S['id'], round(truth['duration'], 1), 's', os.path.getsize(p) // 1024, 'KB')
    json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
