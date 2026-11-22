// Sing-along engine: Performer (clock + guide + scoring) and startSingSession (full practice screen).
import { getCtx, tone, click, unlock } from '../../core/audio.js';
import { mic } from '../../core/mic.js';
import { settings } from '../../core/store.js';
import { noteName } from '../../core/music.js';
import { $, esc, micGate, loop, bar } from '../../core/ui.js';
import { VoiceListener, hintFor } from './voice.js';
import { scoreFrame, noteHit, noteBias, resetNote, summarize, fitShift } from './score.js';
import { Lanes, palette } from './lanes.js';

export function useSingingCss() {
  if (!document.querySelector('link[data-css=sg]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/singing.css'; l.dataset.css = 'sg';
    document.head.append(l);
  }
}

/**
 * Drives one pass over a list of target notes.
 * Song time runs from the synth clock (or an <audio> element). Voice frames are scored against notes.
 */
export class Performer {
  constructor(o) {
    this.o = { speed: 1, guide: true, guideOct: 0, octaveAgnostic: false, scoring: true, countIn: 4, bpm: 90, guideGain: 0.2, ...o };
    this.notes = o.notes;
    this.lanes = o.lanes;
    this.el = o.audioEl || null;
    this.running = false;
    this.loopR = null;
    this.ctx = getCtx();
    this.from = 0;
    this.endT = o.endT ?? (this.notes.length ? Math.max(...this.notes.map(n => n.t + n.dur)) : 0);
  }
  get spb() { return 60 / this.o.bpm; }
  /** song time at AudioContext time ct */
  songAt(ct) {
    if (this.el) return this.elT + (ct - this.elCt) * this.o.speed * (this.el.paused ? 0 : 1);
    return (ct - this.t0) * this.o.speed;
  }
  songNow() { return this.running ? this.songAt(this.ctx.currentTime) : this.pausedAt ?? 0; }
  start(fromT = 0, { countIn = this.o.countIn } = {}) {
    const ct = this.ctx.currentTime;
    this.notes.forEach(n => { n._sched = false; });
    if (this.el) {
      this.el.currentTime = Math.max(0, fromT);
      this.el.playbackRate = this.o.speed; this.el.preservesPitch = true; this.el.webkitPreservesPitch = true;
      this.el.play().catch(() => {});
      this.elT = this.el.currentTime; this.elCt = ct;
    } else {
      const lead = countIn * this.spb;
      this.t0 = ct + 0.12 - (fromT - lead) / this.o.speed;
      for (let k = 0; k < countIn; k++) click(this.t0 + (fromT - lead + k * this.spb) / this.o.speed, k === 0);
    }
    this.running = true;
    this.from = this.notes.findIndex(n => n.t + n.dur >= fromT); if (this.from < 0) this.from = this.notes.length;
  }
  pause() { if (!this.running) return; this.pausedAt = this.songNow(); this.running = false; if (this.el) this.el.pause(); }
  resume() { if (this.running) return; this.start(this.pausedAt ?? 0, { countIn: this.el ? 0 : 2 }); }
  setSpeed(s) {
    const now = this.songNow(); this.o.speed = s;
    if (this.el) { this.el.playbackRate = s; this.elT = this.el.currentTime; this.elCt = this.ctx.currentTime; }
    else if (this.running) this.t0 = this.ctx.currentTime - now / s;
    this.notes.forEach(n => { n._sched = false; });
  }
  setLoop(a, b) { this.loopR = a == null ? null : { a, b }; }
  /** call every animation frame */
  tick() {
    const ct = this.ctx.currentTime;
    if (this.el && this.running && !this.el.paused) { this.elT = this.el.currentTime; this.elCt = ct; }
    const now = this.songNow();
    if (this.lanes) this.lanes.time = now;
    if (!this.running) return now;
    // guide tones (look-ahead)
    if (this.o.guide) {
      for (let i = this.from; i < this.notes.length; i++) {
        const n = this.notes[i]; if (n.t > now + 0.35) break;
        if (!n._sched && !n.silent && n.t >= now - 0.02) { n._sched = true; tone(n.midi + this.o.guideOct, { at: Math.max(0, (n.t - now) / this.o.speed), dur: n.dur / this.o.speed, gain: this.o.guideGain }); }
      }
    }
    // finish notes
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > now) break;
      if (!n._fin && now > n.t + n.dur + 0.12) {
        n._fin = true;
        if (this.o.scoring && !n.skip) {
          n.hit = noteHit(n) ?? 0;
          n.best = Math.max(n.best ?? 0, n.hit);
          if (this.o.onNoteDone) this.o.onNoteDone(n);
        }
        if (i === this.from) this.from++;
      }
    }
    if (this.loopR && now > this.loopR.b + 0.3) {
      this.notes.forEach(n => { if (n.t >= this.loopR.a - 0.01 && n.t < this.loopR.b) { resetNote(n); n._fin = false; } });
      this.start(this.loopR.a - (this.el ? 1 : 0), { countIn: this.el ? 0 : 2 });
      if (this.lanes) this.lanes.clearTrail();
      return now;
    }
    if (!this.loopR && now > this.endT + 0.8 && !this.ended) { this.ended = true; this.running = false; if (this.el) this.el.pause(); if (this.o.onEnd) this.o.onEnd(); }
    return now;
  }
  /** feed a voice frame (from VoiceListener) */
  voice(s) {
    if (!this.running) return null;
    const st = this.songAt(s.t);
    let res = null;
    if (this.o.scoring) res = scoreFrame(this.notes, st, s.midi, { octaveAgnostic: this.o.octaveAgnostic, from: Math.max(0, this.from - 1) });
    let cents = res && res.note && !res.note.skip ? res.cents : null;
    if (cents == null && s.midi) {
      // nearest target in time, for colour only
      const n = this.notes.find(x => x.t <= st + 0.25 && x.t + x.dur >= st - 0.25);
      if (n) { cents = 100 * (s.midi - n.midi); if (this.o.octaveAgnostic) cents = ((((cents + 600) % 1200) + 1200) % 1200) - 600; }
    }
    if (this.lanes) { this.lanes.push(st, s.midi, cents); this.lanes.cur = { midi: s.midi, cents }; }
    return { songT: st, cents, note: res && res.note };
  }
  stop() { this.running = false; if (this.el) { this.el.pause(); } }
}

/** Split notes into phrases at rests (for looping). */
export function phrases(notes, gap = 0.45) {
  const out = []; let cur = [];
  notes.forEach((n, i) => {
    const prev = notes[i - 1];
    if (prev && (n.t - (prev.t + prev.dur) > gap || cur.length >= 10)) { out.push(cur); cur = []; }
    cur.push(n);
  });
  if (cur.length) out.push(cur);
  return out.map((p, i) => ({ i, a: p[0].t, b: p[p.length - 1].t + p[p.length - 1].dur, notes: p }));
}

/**
 * Full sing-along practice screen. See SPEC.md.
 * session = { title, audioUrl?, bpm?, notes:[{t,dur,midi,conf?}], key?, transpose?, range?: {t0,t1} (practise one section; default loop) }
 * ctx: shell ctx (finish optional), or Song Lab ctx.
 * Extra session fields used by built-in games: guide (bool), octaveAgnostic, keyTonic, onDone(result), compact, label
 */
export function startSingSession(stage, session, ctx = {}) {
  useSingingCss();
  let alive = true, stopLoop = null, voice = null, perf = null, lanes = null, el = null;
  const S = settings.get();
  const cleanup = () => {
    alive = false;
    if (stopLoop) stopLoop();
    if (voice) voice.stop();
    if (perf) perf.stop();
    if (el) { el.pause(); el.src = ''; }
    if (lanes) lanes.destroy();
  };
  const baseNotes = (session.notes || []).map(n => ({ t: n.t, dur: Math.max(0.12, n.dur), midi: n.midi, conf: n.conf, label: n.label }));
  const octOnly = !!session.audioUrl;
  let shift = session.transpose ?? fitShift(baseNotes.filter(n => (n.conf ?? 1) >= 0.4).map(n => n.midi), S.vocalLow, S.vocalHigh, { octavesOnly: octOnly });

  (async () => {
    const hasMic = await micGate(stage, {
      why: 'The app listens to your voice and draws it on the lanes, so you see right away if you are on the note.',
      tips: 'Tip: use headphones if you sing with the original recording, so the mic hears only you.',
      allowSkip: true,
    });
    if (!alive) return;
    const phr = phrases(baseNotes);
    stage.innerHTML = `<div class="sg-session ${session.compact ? 'compact' : ''}">
      <div class="sg-head"><b>${esc(session.title || 'Sing along')}</b><span class="pill" id="sgkey"></span></div>
      <div class="playfield sg-pf" id="pf"><div class="sg-over" id="over"></div></div>
      <div class="sg-read"><span class="sg-note" id="rn">–</span><span class="sg-hint" id="rh">${hasMic ? 'Sing when the bar reaches the red line.' : 'Listen mode: the mic is off, so nothing is scored.'}</span><span class="sg-acc" id="ra"></span></div>
      <div id="prog">${bar(0)}</div>
      <div class="sg-ctrls">
        <button class="btn primary" id="pp">Start</button><button class="btn ghost" id="rs">Restart</button>
        <label class="sg-sel">Speed <select id="sp">${[1, 0.9, 0.75, 0.6, 0.5].map(v => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}</select></label>
        ${phr.length > 1 || session.range ? `<label class="sg-sel">Loop <select id="lp"><option value="">${session.range ? 'Play section once' : 'Whole song'}</option>${session.range ? '<option value="sec" selected>Loop this section</option>' : ''}${phr.map(p => `<option value="${p.i}">Phrase ${p.i + 1}</option>`).join('')}</select></label>` : ''}
        <span class="sg-tr"><button class="btn ghost sm" id="tdn" aria-label="Lower">−</button><span id="trv"></span><button class="btn ghost sm" id="tup" aria-label="Higher">+</button></span>
        <label class="tog"><input type="checkbox" id="gd" ${session.guide ?? !session.audioUrl ? 'checked' : ''}> Guide notes</label>
        <label class="tog"><input type="checkbox" id="oa" ${session.octaveAgnostic ?? octOnly ? 'checked' : ''}> Any octave counts</label>
      </div></div>`;
    lanes = new Lanes($('#pf', stage), { keyTonic: session.keyTonic ?? null });
    const notes = baseNotes.map(n => ({ ...n }));
    const apply = () => {
      notes.forEach((n, i) => { n.midi = baseNotes[i].midi + shift; n.skip = (n.conf ?? 1) < 0.4; resetNote(n); n._fin = false; n.hit = null; });
      lanes.setNotes(notes);
      $('#trv', stage).textContent = shift ? `${shift > 0 ? '+' : ''}${shift}` : 'Key 0';
      const ms = notes.map(n => n.midi);
      $('#sgkey', stage).textContent = ms.length ? `${noteName(Math.min(...ms))}–${noteName(Math.max(...ms))}` : '';
    };
    apply();
    if (session.audioUrl) { el = new Audio(session.audioUrl); el.setAttribute('playsinline', ''); el.preload = 'auto'; }
    const bpm = session.bpm || 90;
    const mk = () => new Performer({
      notes, lanes, audioEl: el, bpm, speed: +$('#sp', stage).value, guide: $('#gd', stage).checked,
      octaveAgnostic: $('#oa', stage).checked, scoring: hasMic,
      onNoteDone: n => { if (n.hit >= 0.7) lanes.burst(n.t + n.dur, n.midi, palette().ok); updAcc(); },
      onEnd: () => finishScreen(), endT: session.range && session.range.t1 > session.range.t0 ? session.range.t1 : undefined,
    });
    perf = mk();
    if (hasMic) { voice = new VoiceListener(); await voice.start(); voice.on(s => {
      const r = perf.voice(s);
      if (s.midi) {
        $('#rn', stage).textContent = noteName(s.midi);
        if (r && r.cents != null) { const h = hintFor(r.cents); const rh = $('#rh', stage); rh.textContent = h.text; rh.className = 'sg-hint ' + h.cls; }
      } else if (lanes) lanes.cur = null;
    }); }
    const updAcc = () => { const s = summarize(notes); if (s.count) $('#ra', stage).textContent = `${Math.round(s.acc * 100)}%`; };
    const progEl = $('#prog', stage);
    let started = false;
    stopLoop = loop(dt => {
      if (!alive) return;
      const now = perf.tick();
      lanes.draw(dt);
      if (perf.endT) progEl.firstChild.firstChild.style.width = Math.max(0, Math.min(100, now / perf.endT * 100)) + '%';
    });
    const pp = $('#pp', stage);
    pp.onclick = async () => {
      await unlock();
      if (!started) { started = true; const lpv = $('#lp', stage); if (lpv && lpv.value !== '') setLoopFrom(lpv.value); perf.start(Math.max(0, loopStart() - (el ? 2 : 0))); pp.textContent = 'Pause'; return; }
      if (perf.running) { perf.pause(); pp.textContent = 'Resume'; } else { perf.resume(); pp.textContent = 'Pause'; }
    };
    $('#rs', stage).onclick = () => { perf.stop(); apply(); lanes.clearTrail(); perf = mk(); const lp = $('#lp', stage); if (lp && lp.value !== '') setLoopFrom(lp.value); started = true; perf.start(Math.max(0, loopStart() - (el ? 2 : 0))); pp.textContent = 'Pause'; };
    $('#sp', stage).onchange = e => perf.setSpeed(+e.target.value);
    $('#gd', stage).onchange = e => { perf.o.guide = e.target.checked; };
    $('#oa', stage).onchange = e => { perf.o.octaveAgnostic = e.target.checked; };
    const rng = session.range && session.range.t1 > session.range.t0 ? session.range : null;
    const seg = v => v === 'sec' ? { a: rng.t0, b: rng.t1 } : { a: phr[+v].a, b: phr[+v].b };
    const loopStart = () => { const lp = $('#lp', stage); return lp && lp.value !== '' ? seg(lp.value).a : rng ? rng.t0 : (notes[0]?.t ?? 0); };
    const setLoopFrom = v => { if (v === '') perf.setLoop(null); else { const g = seg(v); perf.setLoop(g.a, g.b); } };
    const lp = $('#lp', stage); if (lp) lp.onchange = e => { setLoopFrom(e.target.value); if (e.target.value !== '') { perf.stop(); perf = mk(); setLoopFrom(e.target.value); started = true; perf.start(Math.max(0, seg(e.target.value).a - (el ? 1 : 0)), { countIn: el ? 0 : 2 }); pp.textContent = 'Pause'; } };
    const tr = d => { if (perf.running) return ctx.toast && ctx.toast('Pause first to change the key.'); shift += octOnly ? 12 * d : d; apply(); };
    $('#tdn', stage).onclick = () => tr(-1); $('#tup', stage).onclick = () => tr(1);

    function finishScreen() {
      if (!alive) return;
      const s = summarize(notes);
      const scored = notes.filter(n => n.hit != null && !n.skip);
      const sorted = scored.slice().sort((a, b) => a.hit - b.hit);
      const worst = sorted.slice(0, 3), best = sorted.slice(-3).reverse();
      const bias = s.bias;
      const tip = !hasMic ? 'Turn on the mic next time to get a score.' : Math.abs(bias) < 15 ? 'Your pitch centre is accurate.' : bias < 0 ? `On average you sing ${Math.round(-bias)} cents flat. Aim a little higher and keep the air flowing.` : `On average you sing ${Math.round(bias)} cents sharp. Relax the throat and aim a little lower.`;
      const res = { acc: s.acc, count: s.count, bias };
      if (session.onDone) { cleanup(); session.onDone(res); return; }
      const over = $('#over', stage);
      over.innerHTML = `<div class="sg-sum card"><div class="bignum">${hasMic ? Math.round(s.acc * 100) + '%' : '—'}</div><p>${hasMic ? `${s.count} notes scored.` : 'Listen mode.'} ${tip}</p>
        ${hasMic && scored.length ? `<p class="small">Best: ${best.map(n => `${noteName(n.midi)} ${Math.round(n.hit * 100)}%`).join(', ')}<br>Practise: ${worst.map(n => `${noteName(n.midi)} ${Math.round(n.hit * 100)}%`).join(', ')}</p>` : ''}
        <div class="row"><button class="btn ghost" id="again">Again</button>${ctx.finish ? '<button class="btn primary" id="done">Continue</button>' : ''}</div></div>`;
      over.classList.add('on');
      $('#again', over).onclick = () => { over.classList.remove('on'); over.innerHTML = ''; $('#rs', stage).click(); };
      const d = $('#done', over); if (d) d.onclick = () => ctx.finish(hasMic ? s.acc : 0.5, { lines: [tip] });
    }
    if (session.autoStart) pp.click();
  })();
  return cleanup;
}
