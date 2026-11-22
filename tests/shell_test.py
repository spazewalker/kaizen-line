import sys; sys.path.insert(0, 'tests')
from harness import App
with App() as app:
    app.shot('/tmp/shell_home.png')
    app.go('#/settings'); app.shot('/tmp/shell_settings.png', full=True)
    app.page.click('#sc'); app.page.wait_for_timeout(300)
    print('audio state:', app.page.inner_text('#ast'))
    print('errors:', [e for e in app.errors if 'track load failed' not in e and 'songlab' not in e and 'Failed to fetch dynamically' not in e and 'index.js' not in e])
