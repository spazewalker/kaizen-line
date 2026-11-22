// Daily SRS review: mixes question formats by item type.
import { ITEMS } from './data/items.js';
import { morae } from './data/kana.js';
import { speak, preload, hasClip } from './audio.js';
import { mcRound, buildRound, distractors, quality, tilesFor, showRo } from './engine.js';
import { shuffle, pick, esc } from '../../core/ui.js';

function formatsFor(it) {
  switch (it.kind) {
    case 'kana': return ['hearKana', 'readKana'];
    case 'word': return morae(it.jp).length <= 6 ? ['hearMeaning', 'saySeen', 'enToJp', 'dictate'] : ['hearMeaning', 'saySeen', 'enToJp'];
    case 'phr': return it.tokens?.length >= 2 ? ['hearMeaning', 'enToJp', 'build'] : ['hearMeaning', 'enToJp'];
    default: return ['hearExact'];
  }
}

async function ask(stage, it, fmt, pool, hudHtml) {
  const opts = key => shuffle([it, ...distractors(it, pool, 3, key)]);
  switch (fmt) {
    case 'hearKana': { const o = opts('jp'); return mcRound(stage, { hud: hudHtml, prompt: '<p class="muted">Which kana did you hear?</p>', audio: it.jp, options: o.map(x => ({ v: x.id, html: `<span class="jp jp-opt" lang="ja">${esc(x.jp)}</span>` })), answer: it.id, cols: 4, big: true, explain: `${esc(it.jp)} = ${esc(it.ro)}` }); }
    case 'readKana': { const o = opts('ro'); return mcRound(stage, { hud: hudHtml, prompt: `<div class="bigglyph" lang="ja">${esc(it.jp)}</div>`, options: o.map(x => ({ v: x.id, html: esc(x.ro) })), answer: it.id, after: it.jp, cols: 4, explain: `${esc(it.jp)} = ${esc(it.ro)}` }); }
    case 'hearMeaning': { const o = opts('en'); return mcRound(stage, { hud: hudHtml, prompt: '<p class="muted">Listen. What does it mean?</p>', audio: it.jp, options: o.map(x => ({ v: x.id, html: esc(x.en) })), answer: it.id, explain: `<span lang="ja">${esc(it.jp)}</span> = ${esc(it.en)}` }); }
    case 'saySeen': { const o = opts('en'); return mcRound(stage, { hud: hudHtml, prompt: `<div class="jp-say-big" lang="ja">${esc(it.jp)}</div>${showRo() ? `<p class="ro">${esc(it.ro)}</p>` : ''}`, options: o.map(x => ({ v: x.id, html: esc(x.en) })), answer: it.id, after: it.jp, explain: esc(it.en) }); }
    case 'enToJp': { const o = opts('jp'); return mcRound(stage, { hud: hudHtml, prompt: `<p class="muted">How do you say it?</p><p class="jp-en">${esc(it.en)}</p>`, options: o.map(x => ({ v: x.id, html: `<span class="jp" lang="ja">${esc(x.jp)}</span>${showRo() ? `<small>${esc(x.ro)}</small>` : ''}` })), answer: it.id, after: it.jp, cols: 1 }); }
    case 'dictate': { const { answer, tiles } = tilesFor(it.jp, 3); const r = await buildRound(stage, { hud: hudHtml, prompt: `<p class="muted">Listen and build it.</p><p class="jp-hint">${esc(it.en)}</p>`, audio: it.jp, answer, tiles }); return { ok: r.ok, ms: r.ms, half: r.half }; }
    case 'build': { const r = await buildRound(stage, { hud: hudHtml, prompt: `<p class="muted">Build:</p><p class="jp-en">${esc(it.en)}</p>`, answer: it.tokens, tiles: shuffle([...it.tokens, pick(['は', 'を', 'に', 'で', 'が'].filter(p => !it.tokens.includes(p)))]), joiner: ' ', after: it.jp, autoCheck: false }); return { ok: r.ok, ms: r.ms, half: r.half }; }
    default: { const pool2 = Object.values(ITEMS).filter(x => x.kind === it.kind && x.id !== it.id); const o = shuffle([it, ...shuffle(pool2).slice(0, 3)]); return mcRound(stage, { hud: hudHtml, prompt: '<p class="muted">What did you hear?</p>', audio: it.jp, options: o.map(x => ({ v: x.id, html: esc(x.shown || x.en) })), answer: it.id, explain: esc(it.shown || it.en) }); }
  }
}

export const review = {
  batch: 20,
  run(stage, ids, ctx) {
    let dead = false;
    (async () => {
      const its = ids.map(id => ITEMS[id]).filter(Boolean);
      const pool = Object.values(ITEMS).filter(x => ctx.srs.has(x.id));
      preload(its.map(x => x.jp));
      let right = 0;
      const queue = shuffle(its);
      const again = [];
      for (let i = 0; i < queue.length; i++) {
        if (dead) return;
        const it = queue[i];
        const fmts = formatsFor(it).filter(f => f !== 'hearExact' || hasClip(it.jp));
        const r = await ask(stage, it, pick(fmts), pool, `<span>Review ${i + 1} / ${queue.length}</span><span>${right} right</span>`);
        if (dead) return;
        ctx.grade(it.id, r.ok ? quality(true, r.ms, 4000) : r.half ? 1 : 0);
        if (r.ok) right++; else if (!again.includes(it)) again.push(it);
      }
      // missed items once more, ungraded, so the session ends on a correct answer
      for (const it of again) {
        if (dead) return;
        const f = it.kind === 'kana' ? 'hearKana' : (it.kind === 'word' || it.kind === 'phr') ? 'hearMeaning' : 'hearExact';
        await ask(stage, it, f, pool, '<span>One more time</span><span></span>');
      }
      if (!dead) ctx.finish(right / Math.max(1, queue.length));
    })().catch(e => { console.error(e); stage.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
    return () => { dead = true; };
  },
};
