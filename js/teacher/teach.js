// Teach mode: screen-share friendly slides for one unit + one-on-one lesson tools (timer, stars, notes).
import { h, shuffle, store, first } from '../util.js';
import { loadUnit } from '../content.js';
import { speak, stopSpeaking } from '../tts.js';
import { sayBtn } from '../exercises.js';
import { getStudent, saveStudent, addNote } from '../students.js';

export async function teachView(root, unitId, studentId) {
  const u = await loadUnit(unitId);
  const student = studentId ? getStudent(studentId) : null;
  document.documentElement.style.setProperty('--unit', u.color);
  const slides = buildSlides(u, studentId);
  let i = Math.min(store.get(`slide.${u.id}`, 0), slides.length - 1);

  const stage = h('div', { class: 'slide' });
  const dots = h('div', { class: 'teach-dots' });
  const counter = h('span', { class: 'muted small', style: { minWidth: '70px' } });
  const panelHost = h('div');
  const exit = () => { stopSpeaking(); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen?.(); location.hash = student ? `#/t/s/${student.id}` : '#/t/library'; };
  const wrap = h('div', { class: 'teach' },
    h('div', { class: 'teach-top' },
      h('span', { style: { fontSize: '1.6rem' } }, u.emoji),
      h('span', { class: 'title', style: { color: 'var(--unit)' } }, u.label),
      student ? h('span', { class: 'who' }, '· ', h('span', null, student.emoji), student.name) : null,
      h('span', { class: 'spacer' }),
      h('div', { class: 'tools-bar' },
        h('button', { class: 'btn small', onclick: () => togglePanel('timer') }, '⏱ Timer'),
        h('button', { class: 'btn small', onclick: () => togglePanel('stars') }, '⭐ Stars'),
        h('button', { class: 'btn small', onclick: () => togglePanel('notes') }, '📝 Notes'),
        h('button', { class: 'btn small icon', title: 'Full screen (F)', onclick: fullscreen }, '⛶'),
        h('button', { class: 'btn small icon', title: 'Exit', onclick: exit }, '✕'))),
    stage,
    h('div', { class: 'teach-bottom' },
      h('button', { class: 'btn', onclick: () => go(i - 1) }, '← Back'), dots, counter,
      h('button', { class: 'btn primary', onclick: () => go(i + 1) }, 'Next →')),
    panelHost);
  root.replaceChildren(wrap);

  function go(n) {
    if (n < 0 || n >= slides.length) return;
    stopSpeaking();
    i = n; store.set(`slide.${u.id}`, i);
    const s = slides[i];
    stage.replaceChildren(h('div', { class: 'slide-in' }, s.render()));
    stage.scrollTop = 0;
    dots.replaceChildren(...slides.map((sl, k) => h('button', { class: k === i ? 'on' : '', title: sl.name, 'aria-label': sl.name, onclick: () => go(k) })));
    counter.textContent = `${i + 1} / ${slides.length}`;
  }
  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(i - 1);
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'Escape') { const z = document.querySelector('.zoom'); if (z) z.remove(); else if (panelHost.firstChild) panelHost.replaceChildren(); }
    else if ((e.key === 'r' || e.key === 'R') && stage.querySelector('[data-reveal]')) stage.querySelector('[data-reveal]').click();
    else if ((e.key === 'n' || e.key === 'N') && stage.querySelector('[data-next]')) stage.querySelector('[data-next]').click();
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', onKey); stopSpeaking(); }, { once: true });

  let openPanel = '';
  function togglePanel(kind) {
    if (openPanel === kind) { openPanel = ''; return panelHost.replaceChildren(); }
    openPanel = kind;
    panelHost.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, { timer: '⏱ Timer', stars: '⭐ Stars', notes: '📝 Lesson notes' }[kind]),
        h('button', { class: 'btn icon small ghost', onclick: () => { openPanel = ''; panelHost.replaceChildren(); } }, '✕')),
      kind === 'timer' ? timerTool() : kind === 'stars' ? starsTool(student) : notesTool(student, u)));
  }
  go(i);
}

export function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---------------------------------------------------------------- slides
function buildSlides(u, studentId) {
  const S = [];
  S.push({ name: 'Title', render: () => h('div', { class: 'center' },
    h('div', { class: 'huge' }, u.emoji),
    h('h1', { style: { color: 'var(--unit)', marginTop: '16px' } }, u.title),
    h('p', { class: 'lead muted' }, u.unit === 0 ? 'Welcome back!' : u.unit === 9 ? 'End-of-year review' : `Unit ${u.unit}`),
    h('div', { class: 'big-q' }, '🤔 ', u.bigQuestion)) });

  S.push({ name: 'Warm-up', render: () => {
    let shown = 0;
    const list = h('div', { class: 'ex-list' });
    const btn = h('button', { class: 'btn primary big', 'data-reveal': '', onclick: () => { if (shown < u.warmup.length) { list.append(h('div', null, h('span', { style: { fontSize: '1.4em' } }, '💬'), u.warmup[shown])); shown++; } if (shown >= u.warmup.length) btn.disabled = true; } }, 'Next question (R)');
    return [h('h2', null, '💬 Warm-up: let’s talk'), list, h('div', { style: { marginTop: '18px' } }, btn)];
  } });

  for (const set of [1, 2]) {
    const words = u.vocab.filter((v) => v.set === set);
    if (!words.length) continue;
    S.push({ name: `Words ${set}`, render: () => [
      h('div', { class: 'row between' }, h('h2', null, `🔤 New words ${set === 2 ? '(part 2)' : ''}`), h('button', { class: 'btn', onclick: () => sayAll(words) }, '🔊 Say them all')),
      h('p', { class: 'lead muted' }, 'Tap a word to make it big.'),
      h('div', { class: 'vgrid' }, words.map((w) => h('div', { class: 'vcard', role: 'button', tabindex: 0, onclick: () => zoomWord(w, words) }, h('div', { class: 'em' }, w.emoji), h('div', { class: 'w' }, w.word)))),
    ] });
  }

  for (const g of u.grammar) {
    S.push({ name: g.title, render: () => [
      h('h2', null, '🧩 ', g.title),
      h('div', { class: 'rule-box' }, h('div', null, g.rule), h('div', { class: 'form-line' }, g.form)),
      h('div', { class: 'ex-list' }, g.examples.map((ex) => h('div', null, sayBtn(ex), h('span', null, highlight(ex))))),
    ] });
    S.push({ name: `${g.title}: practice`, render: () => practiceSlide(`🎯 Practice: ${g.title}`, g.items) });
  }
  if (u.wordWork?.items?.length) {
    S.push({ name: u.wordWork.title, render: () => [h('h2', null, '🔧 ', u.wordWork.title), h('div', { class: 'rule-box', style: { marginBottom: '18px' } }, u.wordWork.rule), practiceSlide('', u.wordWork.items)] });
  }
  if (u.reading.length) S.push({ name: 'Reading', render: () => {
    // one slide for all texts: pick which one to read together
    const host = h('div');
    const tabs = h('div', { class: 'tabs', style: { marginBottom: '16px' } });
    const show = (k) => {
      store.set(`reading.${u.id}`, k);
      tabs.replaceChildren(...u.reading.map((r, j) => h('button', { class: 'tab' + (j === k ? ' on' : ''), onclick: () => show(j) }, `📖 ${r.title}`)));
      host.replaceChildren(...readingSlide(u.reading[k]));
    };
    show(Math.min(store.get(`reading.${u.id}`, 0), u.reading.length - 1));
    return [u.reading.length > 1 ? tabs : null, host];
  } });
  if (u.custom.length) S.push({ name: 'My questions', render: () => practiceSlide('⭐ My questions', u.custom) });
  S.push({ name: 'Word wheel', render: () => wheelSlide(u) });
  for (const w of u.writing) S.push({ name: 'Writing', render: () => {
    const model = h('div', { class: 'rule-box hidden', style: { marginTop: '16px' } }, h('div', { class: 'muted small' }, 'Example answer'), w.model);
    return [h('h2', null, '✍️ Writing'), h('div', { class: 'big-q' }, w.prompt), h('p', { class: 'lead muted' }, '💡 ', w.hint, ` · at least ${w.minWords} words`),
      h('button', { class: 'btn big', 'data-reveal': '', onclick: () => model.classList.toggle('hidden') }, '👀 Show an example (R)'), model];
  } });
  S.push({ name: 'Finish', render: () => h('div', { class: 'center' }, h('div', { class: 'huge' }, '🌟'), h('h1', null, 'Great lesson!'),
    h('p', { class: 'lead muted' }, 'Send a homework mission for this unit in one click.'), h('a', { class: 'btn primary big', href: `#/t/build/${encodeURIComponent(u.id)}/${studentId || ''}` }, '＋ Homework for this unit')) });
  return S;
}

function sayAll(words) {
  let k = 0;
  const next = () => { if (k < words.length) speak(words[k++].word, { rate: 0.85, onend: () => setTimeout(next, 450) }); };
  next();
}

function zoomWord(w, words) {
  document.querySelector('.zoom')?.remove();
  const idx = words.indexOf(w);
  const z = h('div', { class: 'zoom', onclick: (e) => { if (e.target === z) z.remove(); } },
    h('div', { class: 'zoom-card' },
      h('div', { class: 'em' }, w.emoji), h('div', { class: 'w' }, w.word),
      h('div', { class: 'muted' }, w.pos),
      h('div', { class: 'm' }, w.meaning), h('div', { class: 'ex' }, '“', w.example, '”'),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } },
        h('button', { class: 'btn', onclick: () => zoomWord(words[(idx - 1 + words.length) % words.length], words) }, '←'),
        h('button', { class: 'btn primary', onclick: () => speak(w.word) }, '🔊 Word'),
        h('button', { class: 'btn', onclick: () => speak(w.example) }, '🔊 Sentence'),
        h('button', { class: 'btn', onclick: () => zoomWord(words[(idx + 1) % words.length], words) }, '→'),
        h('button', { class: 'btn ghost', onclick: () => z.remove() }, 'Close'))));
  document.body.append(z);
  speak(w.word);
}

/** Bold the auxiliary/grammar words lightly: wrap words in examples that are typical targets. */
function highlight(sentence) {
  const targets = /\b(am|is|are|was|were|been|be|being|by|where|who|which|that|if|will|won't|going to|may|might|could|must|should|have to|has to|have|has|had|just|already|yet|ever|never|since|for|than|as|the most|more|less|a few|a little|said|told|asked|whether)\b/gi;
  const out = []; let last = 0;
  for (const m of sentence.matchAll(targets)) { out.push(sentence.slice(last, m.index), h('b', { style: { color: 'var(--unit)' } }, m[0])); last = m.index + m[0].length; }
  out.push(sentence.slice(last));
  return out;
}

/** Big-screen question cycler: show question → reveal answer → next. */
export function practiceSlide(title, items) {
  const order = shuffle(items.map((_, k) => k));
  let k = 0;
  const box = h('div');
  function paint() {
    const it = items[order[k % order.length]];
    const answer = h('div', { class: 'hidden', style: { marginTop: '14px' } });
    let q;
    switch (it.type) {
      case 'mc': q = [h('div', { class: 'big-q' }, blanked(it.prompt)), h('div', { class: 'ex-list' }, it.options.map((o, n) => h('div', { 'data-opt': o }, h('b', null, 'ABCD'[n]), o)))]; break;
      case 'gap': q = [h('div', { class: 'big-q' }, blanked(it.prompt), it.hint ? h('span', { class: 'muted' }, ' ', it.hint) : null), it.bank ? h('div', { class: 'chips' }, it.bank.map((b) => h('span', { class: 'chip' }, b))) : null]; break;
      case 'order': q = [h('div', { class: 'lead muted' }, 'Put the words in order:'), h('div', { class: 'chips', style: { fontSize: '1.4rem', margin: '18px 0' } }, shuffle(it.answer.replace(/[.?!]$/, '').split(/\s+/)).map((w) => h('span', { class: 'chip', style: { fontSize: '1.5rem' } }, w)))]; break;
      case 'transform': q = [h('div', { class: 'lead muted' }, it.instruction), h('div', { class: 'big-q' }, '“', it.prompt, '”')]; break;
      case 'fix': q = [h('div', { class: 'lead muted' }, 'Is this sentence right or wrong?'), h('div', { class: 'big-q' }, '“', it.sentence, '”')]; break;
      default: q = [h('div', { class: 'big-q' }, it.prompt || it.statement || '')];
    }
    const ans = it.type === 'fix' ? (it.correct ? '✔ Correct!' : `✘ ${it.answer}`) : it.type === 'gap' ? it.prompt.replace('___', first(it.answer)) : it.type === 'mc' ? it.prompt.includes('___') ? it.prompt.replace('___', it.answer) : it.answer : first(it.answer);
    answer.append(h('div', { class: 'reveal' }, '✅ ', ans), it.explanation ? h('p', { class: 'lead muted', style: { marginTop: '6px' } }, '💡 ', it.explanation) : null);
    box.replaceChildren(...q.filter(Boolean), answer,
      h('div', { class: 'row', style: { marginTop: '18px' } },
        h('button', { class: 'btn big', 'data-reveal': '', onclick: () => { answer.classList.remove('hidden'); box.querySelectorAll('[data-opt]').forEach((d) => { if (d.dataset.opt === it.answer) d.style.borderColor = 'var(--good)'; }); } }, '👀 Show answer (R)'),
        h('button', { class: 'btn primary big', 'data-next': '', onclick: () => { k++; paint(); } }, 'Next question (N) →'),
        h('span', { class: 'muted' }, `${(k % order.length) + 1} / ${order.length}`)));
  }
  paint();
  return [title ? h('h2', null, title) : null, box];
}
export const blanked = (t) => String(t).split('___').flatMap((p, n) => (n ? [h('span', { class: 'blank' }, ' '), p] : [p]));

function readingSlide(r) {
  const qs = h('div', { class: 'ex-list' });
  let n = 0;
  const btn = h('button', { class: 'btn primary', 'data-next': '', onclick: () => {
    const q = r.questions[n++]; if (!q) return;
    const a = q.type === 'tf' ? (q.answer ? 'True' : 'False') : first(q.answer);
    const ans = h('b', { class: 'hidden', style: { color: 'var(--good)' } }, ' → ', a);
    qs.append(h('div', { style: { cursor: 'pointer' }, onclick: () => ans.classList.toggle('hidden') }, `${n}.`, h('span', null, q.type === 'tf' ? `True or false? ${q.statement}` : blanked(q.prompt)), ans));
    if (n >= r.questions.length) btn.disabled = true;
  } }, 'Next question (N)');
  return [
    h('div', { class: 'row between' }, h('h2', null, '📖 ', r.title), h('button', { class: 'btn', onclick: () => speak(r.text.replace(/\n+/g, ' '), { rate: 0.9 }) }, '🔊 Read aloud')),
    h('div', { class: 'reading-text', style: { fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)', maxHeight: 'none' } }, r.text.split(/\n\n+/).map((p) => h('p', null, p))),
    h('div', { class: 'row' }, btn, h('span', { class: 'muted' }, 'Click a question to show its answer.')), qs,
  ];
}

function wheelSlide(u) {
  const words = shuffle(u.vocab).slice(0, 12);
  const size = 600;
  const canvas = h('canvas', { width: size, height: size });
  const ctx = canvas.getContext('2d');
  const colors = ['#ff6b6b', '#fcc419', '#51cf66', '#339af0', '#cc5de8', '#ff922b', '#20c997', '#f06595'];
  const seg = (2 * Math.PI) / words.length;
  words.forEach((w, k) => {
    ctx.beginPath(); ctx.moveTo(size / 2, size / 2); ctx.arc(size / 2, size / 2, size / 2 - 4, k * seg, (k + 1) * seg); ctx.closePath();
    ctx.fillStyle = colors[k % colors.length]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.rotate(k * seg + seg / 2); ctx.textAlign = 'right'; ctx.fillStyle = '#1c2233';
    ctx.font = `600 ${words.length > 10 ? 26 : 30}px Fredoka, sans-serif`; ctx.fillText(w.word.length > 14 ? w.word.slice(0, 13) + '…' : w.word, size / 2 - 24, 10); ctx.restore();
  });
  let angle = 0;
  const result = h('div', { class: 'picked' });
  const task = h('p', { class: 'lead center' });
  const tasks = ['Make a sentence with this word.', 'What does it mean? Explain in English.', 'Spell it without looking!', 'Act it out or draw it: the class guesses.', 'Use it in a question for a friend.'];
  const spin = () => {
    angle += 1440 + Math.random() * 360;
    canvas.style.transform = `rotate(${angle}deg)`;
    result.textContent = '…'; task.textContent = '';
    setTimeout(() => {
      const a = ((270 - (angle % 360)) + 360) % 360; // pointer at top
      const w = words[Math.floor((a * Math.PI) / 180 / seg) % words.length];
      result.textContent = `${w.emoji} ${w.word}`;
      task.textContent = tasks[Math.floor(Math.random() * tasks.length)];
      speak(w.word);
    }, 4050);
  };
  return [h('h2', null, '🎡 Word wheel'),
    h('div', { class: 'grid two', style: { alignItems: 'center' } },
      h('div', { class: 'wheel-wrap' }, h('div', { class: 'wheel-pointer' }, '🔻'), canvas),
      h('div', { class: 'center' }, result, task, h('button', { class: 'btn primary big', 'data-reveal': '', onclick: spin }, '🎡 Spin (R)')))];
}

// ---------------------------------------------------------------- tools
export function timerTool() {
  let left = 60, iv = null;
  const num = h('div', { class: 'timer-num' }, '1:00');
  const paint = () => { num.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; num.classList.toggle('end', left === 0); };
  const start = () => {
    clearInterval(iv);
    iv = setInterval(() => { if (!num.isConnected) return clearInterval(iv); left = Math.max(0, left - 1); paint(); if (!left) { clearInterval(iv); beep(); } }, 1000);
  };
  const set = (s) => { clearInterval(iv); left = s; paint(); };
  return h('div', { class: 'stack', style: { marginTop: '10px' } }, num,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, [30, 60, 120, 300].map((s) => h('button', { class: 'btn small', onclick: () => set(s) }, s < 60 ? `${s}s` : `${s / 60} min`))),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: start }, '▶ Start'), h('button', { class: 'btn', onclick: () => clearInterval(iv) }, '⏸ Pause')));
}
function beep() {
  try {
    const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); setTimeout(() => { o.stop(); a.close(); }, 700);
  } catch { /* no audio */ }
}

export function starsTool(student) {
  let n = student ? student.stars || 0 : store.get('lessonStars', 0);
  const num = h('div', { class: 'star-count' }, `⭐ ${n}`);
  const set = (v) => {
    n = Math.max(0, v); num.textContent = `⭐ ${n}`;
    if (student) { const s = getStudent(student.id); s.stars = n; saveStudent(s); } else store.set('lessonStars', n);
  };
  return h('div', { class: 'stack', style: { marginTop: '10px' } }, num,
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn', onclick: () => set(n - 1) }, '−'),
      h('button', { class: 'btn primary big', onclick: () => { set(n + 1); beepStar(); } }, '＋ Give a star')),
    h('p', { class: 'muted small center', style: { margin: 0 } }, student ? `${student.name}’s stars are saved with their profile.` : 'Open Teach from a student’s page to save stars to their profile.'));
}
function beepStar() {
  try {
    const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination); o.type = 'triangle'; o.frequency.setValueAtTime(660, a.currentTime); o.frequency.linearRampToValueAtTime(1320, a.currentTime + 0.15);
    g.gain.value = 0.12; o.start(); setTimeout(() => { o.stop(); a.close(); }, 220);
  } catch { /* no audio */ }
}

export function notesTool(student, u) {
  const key = `draftNote.${student?.id || 'none'}`;
  const ta = h('textarea', { placeholder: 'What went well? What needs practice?', style: { minHeight: '150px' }, oninput: () => store.set(key, ta.value) });
  ta.value = store.get(key, '');
  return h('div', { class: 'stack', style: { marginTop: '10px' } }, ta,
    student ? h('button', { class: 'btn primary', style: { width: '100%' }, onclick: () => { if (!ta.value.trim()) return; addNote(student.id, ta.value, u.id); store.del(key); ta.value = ''; ta.placeholder = '✅ Saved to ' + student.name + '’s notes'; } }, `Save to ${student.name}’s notes`)
      : h('p', { class: 'muted small', style: { margin: 0 } }, 'Open Teach from a student’s page to save notes to their profile. This draft stays on this device.'));
}
