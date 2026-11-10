// Review with student: screen-share slides that walk through the mistakes in one homework result.
// Each slide: the question, the student's answer, then (on R) the correct answer + explanation,
// and (on N) a similar practice question on the same grammar point.
import { h, first, store } from '../util.js';
import { packsFor, resolve, kindLabel } from '../content.js';
import { speak, stopSpeaking } from '../tts.js';
import { getResults, getHomeworks, getStudent } from '../students.js';
import { fullscreen, practiceSlide, blanked, timerTool, starsTool, notesTool } from './teach.js';

export async function reviewView(root, hwId, submissionId) {
  const all = getResults().filter((r) => r.homeworkId === hwId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const r = all.find((x) => x.submissionId === submissionId) || all[0];
  if (!r) return root.replaceChildren(h('div', { class: 'page narrow' }, h('div', { class: 'card empty' }, 'No result to review yet.')));
  const hw = getHomeworks().find((x) => x.id === hwId);
  const student = getStudent(r.studentId);
  const refs = [...new Set([...(hw?.refs || r.refs || []), ...(r.details || []).map((d) => d.r.replace(/\.q\d+$/, ''))])];
  const packs = await packsFor(refs);
  const firstUnit = resolve(refs[0], packs)?.unit;
  if (firstUnit) document.documentElement.style.setProperty('--unit', firstUnit.color);

  // mistakes, in homework order; reading questions are reviewed one by one
  const mistakes = [];
  for (const d of r.details || []) {
    if (d.s == null || d.s >= 1) continue;
    const isSub = /\.q\d+$/.test(d.r);
    const step = resolve(d.r.replace(/\.q\d+$/, ''), packs);
    if (!step) continue;
    if (step.kind === 'reading' && !isSub) continue; // its sub-questions carry the detail
    mistakes.push({ d, step, q: isSub ? step.item.questions[Number(d.r.split('.q').pop())] : null });
  }
  const slides = [
    { name: 'Start', render: () => intro(r, student, mistakes.length) },
    ...mistakes.map((m, i) => ({ name: `Mistake ${i + 1}`, render: () => mistakeSlide(m, i, mistakes.length, packs) })),
    ...(r.writing || []).map((w) => ({ name: 'Writing', render: () => writingSlide(w, r, packs) })),
    { name: 'Finish', render: () => finish(r, student, mistakes, packs) },
  ];

  let i = 0;
  const stage = h('div', { class: 'slide' });
  const dots = h('div', { class: 'teach-dots' });
  const counter = h('span', { class: 'muted small', style: { minWidth: '70px' } });
  const panelHost = h('div');
  const back = student ? `#/t/s/${student.id}` : `#/t/homework/${encodeURIComponent(hwId)}`;
  const exit = () => { stopSpeaking(); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen?.(); location.hash = back; };
  let openPanel = '';
  const togglePanel = (kind) => {
    if (openPanel === kind) { openPanel = ''; return panelHost.replaceChildren(); }
    openPanel = kind;
    panelHost.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, { timer: '⏱ Timer', stars: '⭐ Stars', notes: '📝 Lesson notes' }[kind]),
        h('button', { class: 'btn icon small ghost', onclick: () => { openPanel = ''; panelHost.replaceChildren(); } }, '✕')),
      kind === 'timer' ? timerTool() : kind === 'stars' ? starsTool(student) : notesTool(student, firstUnit || { id: '' })));
  };
  root.replaceChildren(h('div', { class: 'teach' },
    h('div', { class: 'teach-top' },
      h('span', { style: { fontSize: '1.4rem' } }, '🎓'),
      h('span', { class: 'title', style: { color: 'var(--unit)' } }, 'Homework review'),
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
    panelHost));

  function go(n) {
    if (n < 0 || n >= slides.length) return;
    stopSpeaking();
    i = n;
    stage.replaceChildren(h('div', { class: 'slide-in' }, slides[i].render()));
    stage.scrollTop = 0;
    dots.replaceChildren(...slides.map((s, k) => h('button', { class: k === i ? 'on' : '', title: s.name, 'aria-label': s.name, onclick: () => go(k) })));
    counter.textContent = `${i + 1} / ${slides.length}`;
  }
  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(i - 1);
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'Escape' && panelHost.firstChild) panelHost.replaceChildren();
    else if ((e.key === 'r' || e.key === 'R') && stage.querySelector('[data-reveal]')) [...stage.querySelectorAll('[data-reveal]')].pop().click(); // latest question on screen
    else if ((e.key === 'n' || e.key === 'N') && stage.querySelector('[data-similar]')) stage.querySelector('[data-similar]').click();
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', onKey); stopSpeaking(); }, { once: true });
  go(0);
}

function intro(r, student, n) {
  const p = Math.round(r.percent);
  return h('div', { class: 'center' },
    h('div', { class: 'huge' }, student ? student.emoji : '🎓'),
    h('p', { class: 'eyebrow', style: { marginTop: '18px' } }, 'Let’s review your homework'),
    h('h1', null, r.homeworkTitle),
    h('div', { class: 'row', style: { justifyContent: 'center', margin: '16px 0' } },
      h('span', { class: `score-chip ${p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo'}`, style: { fontSize: '1.6rem', padding: '10px 22px' } }, `${p}%`),
      r.retryPercent > r.percent ? h('span', { class: 'badge good' }, `${Math.round(r.retryPercent)}% after the try-again round`) : null),
    h('p', { class: 'lead' }, n ? `We have ${n} question${n > 1 ? 's' : ''} to look at together. 💪` : 'No mistakes at all. Amazing! 🏆'),
    n ? h('p', { class: 'muted' }, 'Press → to start · R shows the answer · N gives a similar question') : null);
}

// ---------------------------------------------------------------- one mistake
function mistakeSlide(m, i, n, packs) {
  const { d, step, q } = m;
  const it = step.item;
  const reveal = h('div', { class: 'hidden', style: { marginTop: '18px' } });
  const show = (...kids) => reveal.append(...kids.filter(Boolean));
  const theirs = (txt) => h('div', { class: 'ex-list' }, h('div', { style: { borderColor: 'var(--bad)' } },
    h('span', { class: 'badge bad' }, 'Your answer'), h('span', { style: { color: 'var(--bad)', fontWeight: 600 } }, txt || '(no answer)')));
  const correct = (txt) => h('div', { class: 'reveal' }, '✅ ', txt);
  const why = (txt) => (txt ? h('p', { class: 'lead muted', style: { marginTop: '8px' } }, '💡 ', txt) : null);
  let body = [];

  if (q) { // reading question
    const text = h('div', { class: 'reading-text hidden', style: { fontSize: 'clamp(1rem, 2vw, 1.3rem)' } }, it.text.split(/\n\n+/).map((p) => h('p', null, p)));
    const answer = q.type === 'tf' ? (q.answer ? 'True' : 'False') : first(q.answer);
    const given = q.type === 'tf' ? (d.g === 'true' ? 'True' : d.g === 'false' ? 'False' : d.g) : d.g;
    body = [h('p', { class: 'eyebrow' }, `📖 ${it.title}`),
      h('div', { class: 'big-q' }, q.type === 'tf' ? ['True or false? ', q.statement] : blanked(q.prompt)),
      q.type === 'mc' ? h('div', { class: 'ex-list' }, q.options.map((o) => h('div', { 'data-opt': o }, o))) : null,
      theirs(given),
      h('button', { class: 'btn small', style: { marginTop: '12px' }, onclick: () => text.classList.toggle('hidden') }, '📖 Show the text'), text];
    show(correct(answer), why(q.explanation));
  } else {
    switch (step.kind) {
      case 'mc':
        body = [h('div', { class: 'big-q' }, blanked(it.prompt)), h('div', { class: 'ex-list' }, it.options.map((o) => h('div', { 'data-opt': o, style: o === d.g ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : null }, o, o === d.g ? ' ✗' : '')))];
        show(correct(it.prompt.includes('___') ? it.prompt.replace('___', it.answer) : it.answer), why(it.explanation));
        break;
      case 'gap':
        body = [h('div', { class: 'big-q' }, blanked(it.prompt), it.hint ? h('span', { class: 'muted' }, ' ', it.hint) : null), theirs(d.g)];
        show(correct(it.prompt.replace('___', first(it.answer))), why(it.explanation));
        break;
      case 'order':
        body = [h('p', { class: 'lead muted' }, 'Put the words in order'), theirs(d.g)];
        show(correct(it.answer), why(it.explanation));
        break;
      case 'transform':
        body = [h('p', { class: 'lead muted' }, it.instruction), h('div', { class: 'big-q' }, '“', it.prompt, '”'), theirs(d.g)];
        show(correct(first(it.answer)), why(it.explanation));
        break;
      case 'fix':
        body = [h('p', { class: 'lead muted' }, 'Is this sentence right or wrong?'), h('div', { class: 'big-q' }, '“', it.sentence, '”'), theirs(d.g === 'Correct' ? 'It’s correct' : 'It has a mistake')];
        show(correct(it.correct ? 'It’s correct!' : it.answer), why(it.explanation));
        break;
      case 'vmc': case 'spell': {
        const w = it.word;
        body = [h('div', { class: 'huge', style: { fontSize: 'clamp(3rem, 8vw, 5rem)' } }, w.emoji),
          h('div', { class: 'big-q' }, step.kind === 'spell' ? 'How do we spell this word?' : `What does “${w.word}” mean?`), theirs(d.g)];
        show(correct(step.kind === 'spell' ? w.word : `${w.word} = ${w.meaning}`), why(`“${w.example}”`),
          h('button', { class: 'btn', onclick: () => speak(w.word) }, '🔊 Say it'));
        break;
      }
      case 'match': case 'sort': {
        const ws = it.words;
        body = [h('div', { class: 'big-q' }, step.kind === 'match' ? 'Match the words and meanings' : 'Sort the words into groups'), theirs(d.g)];
        show(step.kind === 'match'
          ? h('div', { class: 'ex-list' }, ws.map((w) => h('div', null, h('span', null, w.emoji), h('b', null, w.word), h('span', { class: 'muted' }, w.meaning))))
          : h('div', { class: 'ex-list' }, [...new Set(ws.map((w) => w.cat))].map((c) => h('div', null, h('b', null, c, ':'), ws.filter((w) => w.cat === c).map((w) => w.word).join(', ')))));
        break;
      }
      default:
        body = [h('div', { class: 'big-q' }, kindLabel(step.kind)), theirs(d.g)];
    }
  }
  if (d.rs != null) body.push(h('p', { class: 'small', style: { marginTop: '10px' } }, d.rs >= 1 ? '↺ Fixed it in the try-again round 👍' : '↺ Still wrong in the try-again round'));

  // similar question from the same grammar point / word work / custom set
  const similarItems = similarPool(step);
  const similarHost = h('div', { style: { marginTop: '24px' } });
  return [
    h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, `${kindLabel(step.kind)}`), h('span', { class: 'badge brand' }, `${i + 1} of ${n} · ${q ? 'Reading' : step.section}`)),
    ...body, reveal,
    h('div', { class: 'row', style: { marginTop: '18px' } },
      h('button', { class: 'btn big', 'data-reveal': '', onclick: () => { reveal.classList.remove('hidden'); document.querySelectorAll('[data-opt]').forEach((x) => { if (x.dataset.opt === (q ? q.answer : it.answer)) { x.style.borderColor = 'var(--good)'; x.style.color = 'var(--good)'; } }); } }, '👀 Show the answer (R)'),
      similarItems.length ? h('button', { class: 'btn primary big', 'data-similar': '', onclick: () => { similarHost.replaceChildren(...practiceSlide('🎯 Try a similar one', similarItems).filter(Boolean)); similarHost.scrollIntoView({ behavior: 'smooth' }); } }, '🎯 Similar question (N)') : null),
    similarHost,
  ];
}

function similarPool(step) {
  const [, part] = step.ref.split('.');
  const u = step.unit;
  let items = [];
  if (/^g\d+$/.test(part)) items = u.grammar.find((g) => g.id === part)?.items || [];
  else if (part === 'w') items = u.wordWork.items;
  else if (part === 'c') items = u.custom;
  return items.filter((x) => x !== step.item);
}

function writingSlide(w, r, packs) {
  const step = resolve(w.r, packs);
  const model = h('div', { class: 'rule-box hidden', style: { marginTop: '16px' } }, h('div', { class: 'muted small' }, 'Example answer'), step?.item.model || '');
  return [
    h('h2', null, '✍️ Your writing'),
    h('p', { class: 'lead muted' }, w.prompt),
    h('div', { class: 'reading-text', style: { fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)', maxHeight: 'none', whiteSpace: 'pre-wrap' } }, w.text),
    h('p', { class: 'muted' }, `${(w.text.match(/\S+/g) || []).length} words`, r.mark ? ` · mark: ${r.mark}` : ''),
    h('div', { class: 'row' }, h('button', { class: 'btn big', 'data-reveal': '', onclick: () => model.classList.toggle('hidden') }, '👀 Show an example (R)')),
    model,
  ];
}

function finish(r, student, mistakes, packs) {
  // which grammar points had the most mistakes → suggest the next homework
  const counts = {};
  mistakes.forEach(({ step, q }) => { const k = q ? 'Reading' : step.section; counts[k] = (counts[k] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const unit = mistakes[0]?.step.unit;
  return h('div', { class: 'center' },
    h('div', { class: 'huge' }, '🌟'),
    h('h1', null, 'Great review!'),
    top.length ? h('p', { class: 'lead' }, 'Let’s keep practising: ', h('b', null, top.map(([k]) => k).join(', '))) : h('p', { class: 'lead' }, 'Everything was correct. Well done!'),
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } },
      student && unit ? h('a', { class: 'btn primary big', href: `#/t/build/${encodeURIComponent(unit.id)}/${student.id}` }, '＋ Practice homework') : null,
      student ? h('a', { class: 'btn big', href: `#/t/s/${student.id}` }, 'Back to ', student.name) : null),
    h('p', { class: 'muted small', style: { marginTop: '14px' } }, 'Tip: use 📝 Notes (top right) to save what you practised today.'));
}

export { store };
