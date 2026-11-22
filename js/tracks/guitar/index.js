// Guitar track: stations, games, review and tools. Listens through the mic.
import { UNITS } from './units.js';
import { GAMES, qChord, qNote, qString, qPattern } from './games.js';
import { EXTRAS } from './extras.js';
import { useGuitarCss } from './fretboard.js';

if (typeof document !== 'undefined') useGuitarCss();

const art = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g transform="rotate(-28 310 150)"><rect x="296" y="-80" width="30" height="200" fill="#141c40"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="296" y="${-60 + i * 22}" width="30" height="2" fill="#5a6390"/>`).join('')}
  <circle cx="311" cy="175" r="62" fill="#141c40"/><circle cx="311" cy="245" r="80" fill="#141c40"/><circle cx="311" cy="180" r="22" fill="#27346a"/>
  <rect x="286" y="240" width="50" height="10" fill="#0b1030"/>
  ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${301 + i * 4}" y1="-80" x2="${301 + i * 4}" y2="245" stroke="#fff8f0" stroke-width="${1.6 - i * 0.18}" opacity=".75"/>`).join('')}</g>
  <g fill="#d93a26" opacity=".9"><circle cx="70" cy="60" r="6"/><circle cx="96" cy="44" r="4"/></g>
  <path d="M40 92 q30 -34 60 0 t60 0" stroke="#fff8f0" stroke-width="3" fill="none" opacity=".35"/></svg>`;

const PATTERNS = ['D.D.D.D.', 'DUDUDUDU', 'D.DU.UDU', 'D.D.DUDU', 'D.DUD.D.'];

const review = {
  batch: 20,
  run(stage, ids, ctx) {
    useGuitarCss();
    let alive = true;
    (async () => {
      let ok = 0, n = 0;
      const chords = ids.filter(i => i.startsWith('gt:chord:')).map(i => i.split(':')[2]);
      const pool = [...new Set([...chords, 'Em', 'Am', 'E', 'A', 'D', 'G', 'C', 'Dm'])];
      for (const id of ids) {
        if (!alive) return;
        const [, kind, a, b] = id.split(':');
        stage.innerHTML = `<div class="hud"><span>Review ${n + 1} / ${ids.length}</span><span>${ok} right</span></div><div id="q"></div>`;
        const q = stage.querySelector('#q');
        let r;
        if (kind === 'chord') r = await qChord(q, a, { pool });
        else if (kind === 'note') r = await qNote(q, +a, +b, { frets: Math.max(5, +b + 1) });
        else if (kind === 'string') r = await qString(q, +a);
        else if (kind === 'pattern') r = await qPattern(q, a, PATTERNS);
        else { ctx.grade(id, 2); continue; }
        n++; if (r) ok++;
        ctx.grade(id, r ? 2 : 0);
      }
      if (alive) ctx.finish(n ? ok / n : 1, { lines: ['Missed items come back sooner. Right ones wait longer.'] });
    })();
    return () => { alive = false; };
  },
};

export default {
  id: 'gt', name: 'Guitar', color: '#27346a', art,
  units: UNITS, games: GAMES, review, extras: EXTRAS,
};
