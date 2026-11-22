"""Shared test harness for Kaizen Line.
Usage (python):
    from harness import App
    with App(mic_wav='/tmp/x.wav') as app:      # mic_wav optional: fake microphone input (loops)
        pg = app.page                           # playwright sync page, viewport iPad-ish 820x1180
        app.go('#/t/gt')                        # navigate by hash
        app.shot('/tmp/a.png')
        print(app.errors)                       # page errors + console errors
Run a server-less file? No: it starts `python -m http.server` on a free port (ES modules need http).
Fake mic: Chromium flags --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>.
WAV must be 16-bit PCM; mono or stereo; 48 kHz recommended. It loops.
"""
import subprocess, socket, time, os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

class App:
    def __init__(self, mic_wav=None, width=820, height=1180, mobile=False):
        self.mic_wav, self.w, self.h, self.mobile = mic_wav, width, height, mobile
        self.errors = []
    def __enter__(self):
        self.port = free_port()
        self.srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(self.port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.6)
        self.pw = sync_playwright().start()
        args = ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream']
        if self.mic_wav:
            args += ['--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={self.mic_wav}']
        self.browser = self.pw.chromium.launch(args=args)
        self.ctx = self.browser.new_context(viewport={'width': self.w, 'height': self.h}, permissions=['microphone'], has_touch=self.mobile)
        self.page = self.ctx.new_page()
        self.page.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
        self.page.on('console', lambda m: m.type == 'error' and self.errors.append('console: ' + m.text))
        self.base = f'http://127.0.0.1:{self.port}/'
        self.page.goto(self.base)
        self.page.wait_for_timeout(800)
        return self
    def go(self, hash_, wait=500):
        self.page.evaluate(f"location.hash={hash_!r}")
        self.page.wait_for_timeout(wait)
    def shot(self, path, full=False):
        self.page.screenshot(path=path, full_page=full)
    def __exit__(self, *a):
        try: self.browser.close(); self.pw.stop()
        finally: self.srv.terminate()

def write_wav(path, samples, sr=48000):
    """samples: list/array of floats -1..1 (mono)."""
    import numpy as np, wave
    a = (np.clip(np.asarray(samples, dtype=np.float64), -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(a.tobytes())
