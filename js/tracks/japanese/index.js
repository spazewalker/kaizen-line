// Japanese track: listening-first lessons, games, spaced reviews, tools.
import { UNITS } from './units.js';
import { GAMES } from './games.js';
import { review } from './review.js';
import { EXTRAS } from './extras.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-css=jp]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/japanese.css'; l.dataset.css = 'jp';
  document.head.append(l);
}

const art = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<circle cx="300" cy="74" r="48" fill="#fff8f0" opacity=".92"/>
<path d="M50 236 L170 96 Q180 85 190 96 L310 236Z" fill="#8f1f12" opacity=".55"/>
<path d="M146 124 L170 96 Q180 85 190 96 L214 124 L199 117 L189 129 L179 116 L166 128Z" fill="#fff8f0" opacity=".88"/>
<g fill="#7a1a0f" opacity=".75"><rect x="40" y="150" width="70" height="9" rx="2"/><rect x="46" y="164" width="58" height="6"/><rect x="52" y="159" width="7" height="80"/><rect x="91" y="159" width="7" height="80"/></g>
<path d="M0 236 Q50 214 100 236 T200 236 T300 236 T400 236 V300 H0Z" fill="#b52d1b"/>
<text x="330" y="270" font-size="44" fill="#fff8f0" opacity=".25" font-family="M PLUS Rounded 1c" font-weight="800">あ</text></svg>`;

export default {
  id: 'jp', name: 'Japanese', color: '#d93a26', art,
  units: UNITS, games: GAMES, review, extras: EXTRAS,
};
