// Singing track: entry point (see SPEC.md track contract).
import { tone, playSeq } from '../../core/audio.js';
import { noteName } from '../../core/music.js';
import { $, esc, micGate, shuffle, pick, rnd, sleep } from '../../core/ui.js';
import { GAMES, R } from './games.js';
import { UNITS } from './units.js';
import { EXTRAS } from './extras.js';
import { SONGS, INTERVALS, songNotes, tonicFor } from './songs.js';
import { VoiceListener, hintFor } from './voice.js';
import { Meter } from './lanes.js';
import { useSingingCss } from './session.js';

const ART = '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#fff8f0" stroke-width="6" opacity=".25">' +
  [44, 84, 124, 164, 204].map(r => `<circle cx="318" cy="84" r="${r}"/>`).join('') +
  '</g><path d="M0 220 C60 190 90 250 150 215 S240 170 300 205 S370 240 400 215" stroke="#fff8f0" stroke-width="5" fill="none" opacity=".55"/>' +
  '<rect x="300" y="52" width="36" height="58" rx="18" fill="#fff8f0" opacity=".92"/><path d="M290 96a28 28 0 0 0 56 0M318 124v22M304 146h28" stroke="#fff8f0" stroke-width="6" fill="none" stroke-linecap="round" opacity=".92"/></svg>';

const SOL = { 0: 'Do', 2: 'Re', 4: 'Mi', 5: 'Fa', 7: 'So', 9: 'La', 11: 'Ti', 12: 'Do↑' };

// ---------- review: one quick question per due item ----------
function askChoice(stage, { title, prompt, opts, answer, play, after }) {
  return new Promise(res => {
    stage.innerHTML = `<div class="sg-game"><div class="hud"><span>${esc(title)}</span></div><div class="qbox"><p>${prompt}</p><button class="btn ghost" data-x="re">Play again</button></div>
      <div class="opts ${opts.length > 4 ? '' : 'one'}">${opts.map((o, i) => `<button class="opt" data-i="${i}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div><div class="feedback" id="fb"></div></div>`;
    setTimeout(play, 250); let done = false;
    stage.onclick = e => {
      if (e.target.closest('[data-x]')) return play();
      const b = e.target.closest('[data-i]'); if (!b || done) return; done = true;
      const ok = opts[+b.dataset.i].v === answer; b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) stage.querySelectorAll('[data-i]').forEach(x => { if (opts[+x.dataset.i].v === answer) x.classList.add('right'); });
      const fb = $('#fb', stage); fb.style.color = ok ? 'var(--ok)' : 'var(--bad)'; fb.textContent = ok ? 'Yes!' : (after || 'Not quite.');
      setTimeout(() => res(ok), ok ? 900 : 2200);
    };
  });
}
async function askSing(stage, v, target, label) {
  stage.innerHTML = `<div class="sg-game"><div class="sg-target"><div><span class="muted small">${esc(label)}</span><br><b>${noteName(target)}</b></div><button class="btn ghost" id="h">Hear it</button></div><div class="sg-meterbox" id="mb"></div><div class="sg-fill"><b id="f"></b></div><div class="feedback" id="fb">Listen, then sing.</div></div>`;
  const m = new Meter($('#mb', stage), { window: 5 }); m.setTarget(target);
  tone(target, { dur: 1.1 }); $('#h', stage).onclick = () => tone(target, { dur: 1.1 });
  return new Promise(res => {
    let fill = 0, last = 0; const t0 = performance.now() + 1100;
    v.cbs = [];
    v.on(s => {
      m.push(s.midi); m.draw();
      const dt = last ? Math.min(0.1, s.now - last) : 0; last = s.now;
      if (performance.now() < t0) return;
      if (s.midi) { const c = 100 * (s.midi - target); if (Math.abs(c) <= 50) fill += dt; else fill = Math.max(0, fill - dt * 0.4); const h = hintFor(c); $('#fb', stage).textContent = h.text; }
      $('#f', stage).style.width = Math.min(100, fill * 100) + '%';
      const el = (performance.now() - t0) / 1000;
      if (fill >= 1 || el > 10) { v.cbs = []; m.destroy(); res(fill >= 1); }
    });
  });
}

const review = {
  batch: 15,
  run(stage, ids, ctx) {
    useSingingCss();
    let alive = true, v = null;
    (async () => {
      const needsMic = ids.some(id => id.startsWith('sg:skill:') && id !== 'sg:skill:ear');
      let hasMic = false;
      if (needsMic) { hasMic = await micGate(stage, { why: 'Some review items ask you to sing a note.', allowSkip: true }); if (hasMic) { v = new VoiceListener(); await v.start(); } }
      const learnedSongs = Object.keys(SONGS).filter(s => ctx.srs.has(`sg:song:${s}`));
      const learnedIv = Object.keys(INTERVALS).map(Number).filter(i => ctx.srs.has(`sg:interval:${i}`));
      let right = 0, n = 0;
      for (const id of shuffle(ids)) {
        if (!alive) return;
        const [, kind, key] = id.split(':');
        const { l, h } = R();
        let ok = false;
        const title = `Review ${n + 1} of ${ids.length}`;
        if (kind === 'interval') {
          const iv = +key, pool = [...new Set([iv, ...shuffle(learnedIv.filter(x => x !== iv)), ...shuffle([2, 3, 4, 5, 7, 12].filter(x => x !== iv))])].slice(0, 4).sort((a, b) => a - b);
          const a = l + rnd(Math.max(1, h - l - iv + 1));
          ok = await askChoice(stage, { title, prompt: 'Which interval is this?', opts: pool.map(p => ({ label: INTERVALS[p].name, sub: INTERVALS[p].anchor, v: p })), answer: iv, play: () => { tone(a, { dur: 0.7 }); tone(a + iv, { at: 0.8, dur: 0.9 }); }, after: `It was a ${INTERVALS[iv].name}. Think ${INTERVALS[iv].anchor}.` });
        } else if (kind === 'scale') {
          const pool = key === 'dorem' ? [0, 2, 4] : [0, 2, 4, 5, 7, 9, 11];
          const t = tonicFor([0, 12], l, h), d = pick(pool.filter(x => x));
          ok = await askChoice(stage, { title, prompt: 'Do Mi So Do sets the key. Which step is the last note?', opts: pool.map(p => ({ label: SOL[p], v: p })), answer: d, play: () => { playSeq([t, t + 4, t + 7, t + 12], { gap: 0.22, dur: 0.25 }); tone(t + d, { at: 1.3, dur: 1 }); }, after: `It was ${SOL[d]}.` });
        } else if (kind === 'song') {
          const opts = shuffle([key, ...shuffle((learnedSongs.length >= 3 ? learnedSongs : Object.keys(SONGS)).filter(s => s !== key)).slice(0, 3)]);
          const ns = songNotes(key, { low: l, high: h }).slice(0, 7);
          ok = await askChoice(stage, { title, prompt: 'Which song starts like this?', opts: opts.map(s => ({ label: SONGS[s].title, v: s })), answer: key, play: () => ns.forEach(x => tone(x.midi, { at: x.t, dur: x.dur })), after: `It was ${SONGS[key].title}.` });
        } else if (kind === 'skill' && hasMic && key !== 'ear') {
          ok = await askSing(stage, v, l + 1 + rnd(Math.max(1, h - l - 1)), `${title} · match this note`);
        } else {
          const a = l + 2 + rnd(Math.max(1, h - l - 4)), up = Math.random() < 0.5, b = a + (up ? 2 : -2);
          ok = await askChoice(stage, { title, prompt: 'Is the second note higher or lower?', opts: [{ label: 'Higher', v: true }, { label: 'Lower', v: false }], answer: up, play: () => { tone(a, { dur: 0.6 }); tone(b, { at: 0.75, dur: 0.6 }); } });
        }
        if (!alive) return;
        ctx.grade(id, ok ? 2 : 0); n++; if (ok) right++;
      }
      if (v) v.stop();
      ctx.finish(n ? right / n : 1);
    })();
    return () => { alive = false; if (v) v.stop(); };
  },
};

export default {
  id: 'sg', name: 'Singing', color: '#b0650a', art: ART,
  units: UNITS, games: GAMES, review, extras: EXTRAS,
};
