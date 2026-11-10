// Student homework player (#/hw/<code>) and free practice (#/practice/<unit>).
import { h, clear, store, confetti, fmtTime, uid, decodeObj } from '../util.js';
import { packsFor, resolve, isScored, loadUnit } from '../content.js';
import { render } from '../exercises.js';
import { submitResult, flushOutbox, settings } from '../api.js';
import { encodeResult, decodeResult } from '../students.js';
import { generate, PRESETS } from '../generator.js';
import { stopSpeaking } from '../tts.js';

export async function homeworkView(root, code) {
  let cfg;
  // new links are compressed ('z…' / 'j…'); older links are plain base64 JSON ('eyJ…')
  try { cfg = /^[zj]/.test(code) ? await decodeResult(code) : decodeObj(code); } catch { return root.replaceChildren(errorBox('This homework link is broken. Ask your teacher to send it again.')); }
  root.replaceChildren(h('div', { class: 'empty' }, 'Loading your homework…'));
  let packs;
  try { packs = await packsFor(cfg.i); } catch { return root.replaceChildren(errorBox('Could not load the lessons. Check your internet and try again.')); }
  const steps = cfg.i.map((r) => resolve(r, packs, cfg.x || {})).filter(Boolean);
  if (!steps.length) return root.replaceChildren(errorBox('This homework has no questions.'));
  flushOutbox();
  welcome(root, cfg, steps);
}

export async function practiceView(root, unitId) {
  root.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
  let p;
  try { p = await loadUnit(unitId); } catch { return root.replaceChildren(errorBox('Unit not found.')); }
  const refs = generate({ packs: [p], counts: PRESETS.quick, seed: uid() });
  const packs = { [p.id]: p };
  const steps = refs.map((r) => resolve(r, packs)).filter(Boolean);
  const cfg = { id: 'practice', t: `Practice · ${p.title}`, practice: true, o: { bank: 1, retry: 1 } };
  run(root, cfg, steps, { name: store.get('student', {}).name || 'Me', cls: '' });
}

function errorBox(msg) {
  return h('div', { class: 'welcome-box card center' }, h('div', { class: 'big-emoji-line' }, '😕'), h('h2', null, 'Oops!'), h('p', null, msg), h('a', { class: 'btn', href: '#/' }, 'Home'));
}

function welcome(root, cfg, steps) {
  const unit = steps[0].unit;
  document.documentElement.style.setProperty('--unit', unit.color);
  const me = store.get('student', {});
  const done = store.get('myResults', []).filter((r) => r.homeworkId === cfg.id);
  const known = cfg.n || '';
  const name = h('input', { type: 'text', value: known || me.name || '', placeholder: 'Write your name', autocomplete: 'name', maxlength: 60 });
  const units = [...new Set(steps.map((s) => s.unit))];
  const mins = Math.max(5, Math.round(steps.length * 1.1));
  const start = () => {
    const n = name.value.trim().replace(/\s+/g, ' ');
    if (n.length < 2) { name.focus(); name.classList.add('invalid'); return; }
    store.set('student', { name: n });
    run(root, cfg, steps, { name: n, id: cfg.s || '' });
  };
  const counts = {};
  steps.forEach((s) => { const k = kindGroup(s.kind); counts[k] = (counts[k] || 0) + 1; });
  root.replaceChildren(h('div', { class: 'welcome-box' }, h('div', { class: 'card glass stack' },
    h('div', { class: 'center' },
      h('div', { class: 'planet-row' }, units.map((u) => h('span', { class: 'planet sm', style: { '--unit': u.color } }, u.emoji))),
      h('p', { class: 'eyebrow' }, units.map((u) => u.label).join(' + ')),
      h('h1', { class: 'display' }, known ? `Hi ${known.split(' ')[0]}! 👋` : 'Ready for your mission?'),
      h('p', { class: 'lead' }, cfg.t || 'Homework'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('span', { class: 'badge brand' }, `🧭 ${steps.length} tasks`), h('span', { class: 'badge' }, `⏱ about ${mins} min`),
        null),
      h('div', { class: 'mission-list' }, Object.entries(counts).map(([k, n]) => h('span', null, `${k} × ${n}`))),
      done.length ? h('div', { class: 'notice info' }, `✅ You finished this before (${Math.round(done[done.length - 1].percent)}%). You can do it again.`) : null),
    known ? null : h('label', { class: 'field' }, h('span', null, 'Your name'), name),
    h('button', { class: 'btn primary big', style: { width: '100%' }, onclick: start }, '🚀 Start'),
    h('p', { class: 'muted small center', style: { margin: 0 } }, 'Take your time. You can try again when you make a mistake.'),
    cfg.practice ? null : h('p', { class: 'small center', style: { margin: 0 } }, '📨 At the end, you’ll send your result to your teacher in the chat.'))));
  if (!known) name.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
}

function kindGroup(kind) {
  return { flash: '🃏 Word cards', match: '🔤 Words', sort: '🔤 Words', vmc: '🔤 Words', spell: '🔤 Words', reading: '📖 Reading', speak: '🎤 Speaking', writing: '✍️ Writing' }[kind] || '🧩 Grammar';
}

/** Main loop. */
function run(root, cfg, steps, who) {
  const t0 = Date.now();
  const results = new Map(); // ref → { first, retry }
  let queue = steps.map((s) => ({ step: s, retry: false }));
  let idx = 0, stars = 0, streak = 0, retryRoundAdded = false;
  const bar = h('i');
  const starEl = h('span', { class: 'stars' }, '⭐ 0');
  const streakEl = h('span', { class: 'streak' });
  const host = h('div');
  const primary = h('button', { class: 'btn primary big' }, 'Check');
  const actionbar = h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-in' }, primary));
  const quit = h('a', { class: 'btn icon ghost', href: '#/', title: 'Leave', onclick: (e) => { if (!confirm('Leave this homework? Your answers will be lost.')) e.preventDefault(); } }, '✕');
  root.replaceChildren(h('div', { class: 'player' }, h('div', { class: 'player-head' }, quit, h('div', { class: 'progress', role: 'progressbar' }, bar), streakEl, starEl), host), actionbar);

  let ctrl, phase = 'answer', current;
  const ctx = { opts: { bank: !!(cfg.o && cfg.o.bank) }, changed: () => paintButton(), submit: () => doCheck() };

  function show() {
    stopSpeaking();
    if (idx >= queue.length) {
      const wrong = (cfg.o?.retry ?? 1) && !retryRoundAdded ? queue.filter((q) => !q.retry && isRetryable(q.step) && results.get(q.step.ref)?.first < 1) : [];
      retryRoundAdded = true;
      if (wrong.length) {
        queue.push(...wrong.map((q) => ({ step: q.step, retry: true })));
        host.replaceChildren(h('div', { class: 'step center' }, h('div', { class: 'big-emoji-line' }, '💪'), h('h2', null, 'Try again round'),
          h('p', { class: 'muted' }, `Let’s fix ${wrong.length} question${wrong.length > 1 ? 's' : ''} you missed. You can do it!`)));
        phase = 'interlude'; primary.textContent = 'Let’s go'; primary.disabled = false;
        return;
      }
      return finish();
    }
    current = queue[idx];
    document.documentElement.style.setProperty('--unit', current.step.unit.color);
    ctx.attempt = current.retry ? 1 : 0;
    ctrl = render(current.step, ctx);
    const parts = [ctrl.el];
    if (current.retry) parts.unshift(h('div', { class: 'badge warn', style: { marginBottom: '8px' } }, '↺ Second try'));
    host.replaceChildren(...parts);
    phase = 'answer';
    paintButton();
    bar.style.width = `${(idx / queue.length) * 100}%`;
    setTimeout(() => ctrl.focus && ctrl.focus(), 50);
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  function paintButton() {
    if (phase !== 'answer') return;
    const ready = ctrl.ready();
    primary.disabled = !ready;
    primary.classList.toggle('primary', ready);
    primary.textContent = ready ? (ctrl.readyLabel || (ctrl.silent ? 'Continue' : current.step.kind === 'writing' ? 'Send my writing' : 'Check')) : (ctrl.notReadyHint || 'Check');
  }
  function doCheck() {
    if (phase !== 'answer' || !ctrl.ready()) return;
    const res = ctrl.check();
    if (res.almost) {
      host.querySelector('.feedback')?.remove();
      ctrl.el.append(h('div', { class: 'feedback warn' }, h('strong', { class: 't' }, 'Almost! 🤏'), 'Check your spelling and try again.'));
      return;
    }
    phase = 'feedback';
    const ref = current.step.ref;
    const rec = results.get(ref) || { step: current.step };
    if (current.retry) rec.retry = res.score; else { rec.first = res.score; rec.given = res.given; rec.subs = res.subs; rec.writing = res.writing ? res.given : undefined; }
    results.set(ref, rec);
    if (res.score === 1) { streak++; stars += current.retry ? 1 : 2; } else if (res.score !== null) streak = 0;
    starEl.textContent = `⭐ ${stars}`;
    streakEl.textContent = streak >= 3 ? `🔥 ${streak}` : '';
    if (!ctrl.silent) ctrl.el.append(feedback(res));
    primary.textContent = idx + 1 >= queue.length ? 'Finish' : 'Continue';
    primary.disabled = false; primary.classList.add('primary');
    primary.focus({ preventScroll: true });
    if (ctrl.silent) next();
  }
  function next() { idx++; show(); }
  primary.onclick = () => {
    if (phase === 'answer') return doCheck();
    if (phase === 'interlude') { phase = 'answer'; return show(); }
    next();
  };
  const onKey = (e) => {
    if (!document.body.contains(root) || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') { e.preventDefault(); primary.click(); }
    else if (phase === 'answer' && ctrl.key) ctrl.key(e.key);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', onKey); stopSpeaking(); }, { once: true });
  show();

  async function finish() {
    actionbar.remove();
    bar.style.width = '100%';
    const scored = steps.filter((s) => isScored(s.kind) && results.get(s.ref)?.first != null);
    const firstSum = scored.reduce((a, s) => a + results.get(s.ref).first, 0);
    const finalSum = scored.reduce((a, s) => { const r = results.get(s.ref); return a + Math.max(r.first, r.retry ?? 0); }, 0);
    const percent = scored.length ? Math.round((firstSum / scored.length) * 100) : 100;
    const retryPercent = scored.length ? Math.round((finalSum / scored.length) * 100) : 100;
    const timeSec = Math.round((Date.now() - t0) / 1000);
    const details = [];
    for (const s of steps) {
      const r = results.get(s.ref); if (!r) continue;
      details.push({ r: s.ref, s: r.first, rs: r.retry, g: String(r.given ?? '').slice(0, 140) });
      (r.subs || []).forEach((x) => details.push({ r: x.ref, s: x.score, g: String(x.given ?? '').slice(0, 80) }));
    }
    const writing = steps.filter((s) => results.get(s.ref)?.writing).map((s) => ({ r: s.ref, prompt: s.item.prompt, text: results.get(s.ref).writing }));
    const submissionId = uid(10);
    const payload = { submissionId, homeworkId: cfg.id, homeworkTitle: cfg.t, studentId: who.id || '', student: who.name, percent, retryPercent, correct: Math.round(firstSum * 10) / 10, total: scored.length, timeSec, details, writing, refs: cfg.i, submittedAt: new Date().toISOString() };

    const msg = percent >= 90 ? ['Mission complete!', '🏆'] : percent >= 75 ? ['Great job!', '🌟'] : percent >= 50 ? ['Good effort!', '👍'] : ['Keep practising!', '💪'];
    const missed = steps.filter((s) => { const r = results.get(s.ref); return r && r.first != null && r.first < 1; });
    const sendBox = cfg.practice ? null : h('div', { class: 'send-card' }, h('div', { class: 'empty' }, 'Preparing your result…'));
    host.replaceChildren(h('div', { class: 'step score-hero' },
      scoreRing(percent), h('h1', { class: 'display' }, msg[1], ' ', msg[0]),
      h('p', { class: 'lead' }, `⭐ ${stars} stars · ⏱ ${fmtTime(timeSec)}`, retryPercent > percent ? ` · after the try-again round: ${retryPercent}%` : ''),
      sendBox,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
        cfg.practice ? h('button', { class: 'btn primary', onclick: () => location.reload() }, '↺ Practise again') : null,
        cfg.practice ? h('a', { class: 'btn', href: '#/' }, 'Home') : null)),
    missed.length ? h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, '🧠 Remember these'), h('ul', { class: 'remember' }, missed.slice(0, 12).map((s) => h('li', null, reviewLine(s))))) : null);
    window.scrollTo({ top: 0 });
    if (percent >= 75) confetti();
    if (cfg.practice) return;

    // keep a copy on the student's device (so they can copy the result again later)
    const mine = store.get('myResults', []); mine.push(payload); store.set('myResults', mine.slice(-30));
    const code = await encodeResult(payload);
    const link = `${location.href.split('#')[0]}#/r/${code}`;
    const text = `✅ I finished my homework: ${cfg.t}
⭐ Score: ${percent}%
🔗 My result: ${link}`;
    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard); // remind them before closing without sending
    const copied = () => { window.removeEventListener('beforeunload', guard); sendBox.classList.add('done'); };
    const copyBtn = h('button', { class: 'btn primary big pulse', style: { width: '100%' }, onclick: async () => {
      try { await navigator.clipboard.writeText(text); copyBtn.textContent = '✅ Copied! Now paste it in the chat'; copyBtn.classList.remove('pulse'); copyBtn.classList.add('good'); copied(); }
      catch { area.classList.remove('hidden'); area.select(); copied(); }
    } }, '📋 Copy my result');
    const area = h('textarea', { class: 'hidden', readonly: true, style: { minHeight: '90px', marginTop: '10px', fontSize: '.8rem' } }); area.value = text;
    sendBox.replaceChildren(
      h('h3', null, '📨 Last step: send your result to your teacher'),
      h('p', { class: 'small', style: { margin: '0 0 8px' } }, 'Your teacher can only see your work after you send it.'),
      h('ol', { class: 'send-steps' }, h('li', null, 'Tap ', h('b', null, 'Copy my result')), h('li', null, 'Open your lesson chat (Preply)'), h('li', null, 'Paste it and send')),
      copyBtn, area,
      h('button', { class: 'btn ghost small', style: { marginTop: '6px' }, onclick: () => { area.classList.toggle('hidden'); area.select(); } }, 'Show the text'));
    const endpoint = cfg.e || settings().endpoint;
    if (endpoint) submitResult(payload, endpoint).catch(() => {});
  }
}

const isRetryable = (step) => isScored(step.kind) && !['speak', 'match', 'sort'].includes(step.kind);

function feedback(res) {
  if (res.writing) return h('div', { class: 'feedback good' }, h('strong', { class: 't' }, '📝 Saved for your teacher'), h('div', null, res.explanation), h('div', { class: 'writing-ans', style: { marginTop: '8px' } }, res.expected));
  if (res.score === null) return h('div', { class: 'feedback good' }, h('strong', { class: 't' }, 'Well done! 👏'), res.explanation);
  const good = res.score === 1, part = res.score > 0 && res.score < 1;
  const titles = good ? ['Correct! 🎉', 'Excellent! ⭐', 'Well done! 👏', 'Perfect! 💯'] : part ? ['Nearly there! 👍'] : ['Not quite 🙂'];
  return h('div', { class: `feedback ${good ? 'good' : part ? 'warn' : 'bad'}` },
    h('strong', { class: 't' }, titles[Math.floor(Math.random() * titles.length)]),
    !good && res.expected ? h('div', null, 'Answer: ', h('span', { class: 'ans' }, res.expected)) : null,
    res.explanation ? h('div', { class: 'small', style: { marginTop: '4px' } }, '💡 ', res.explanation) : null);
}

function reviewLine(s) {
  const it = s.item;
  switch (s.kind) {
    case 'mc': return it.prompt.includes('___') ? it.prompt.replace('___', '[' + it.answer + ']') : `${it.prompt} → ${it.answer}`;
    case 'gap': return it.prompt.replace('___', '[' + (Array.isArray(it.answer) ? it.answer[0] : it.answer) + ']');
    case 'order': return it.answer;
    case 'transform': return `${it.prompt} → ${it.answer[0]}`;
    case 'fix': return it.answer;
    case 'vmc': case 'spell': return `${it.word.word}: ${it.word.meaning}`;
    case 'reading': return `Reading: “${it.title}”`;
    case 'speak': return `Say: ${it.text}`;
    case 'match': case 'sort': return it.words.map((w) => w.word).join(', ');
    default: return s.ref;
  }
}

function scoreRing(p) {
  const r = 70, c = 2 * Math.PI * r;
  const color = p >= 75 ? 'var(--good)' : p >= 50 ? 'var(--warn)' : 'var(--bad)';
  const svg = `<svg viewBox="0 0 170 170" width="170" height="170"><circle cx="85" cy="85" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="16"/><circle cx="85" cy="85" r="${r}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition:stroke-dashoffset 1.2s ease-out"/></svg>`;
  const el = h('div', { class: 'score-ring', html: svg }, h('div', { class: 'num' }, `${p}%`));
  requestAnimationFrame(() => requestAnimationFrame(() => { const arc = el.querySelectorAll('circle')[1]; if (arc) arc.style.strokeDashoffset = String(c * (1 - p / 100)); }));
  return el;
}

export { clear };
