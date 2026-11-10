// Interactive exercise renderers.
// render(step, ctx) → { el, ready(): bool, check(): Result }
//   ctx.changed()  → tell the player the "Check" button state may have changed
//   ctx.submit()   → auto-submit (used by tap-to-answer types)
//   ctx.opts       → { bank: bool (prefer word banks) }
// Result: { score: 0..1 | null (not auto-marked), given, expected, explanation, subs?, almost? }
import { h, check, first, shuffle, rng, hashStr, norm } from './util.js';
import { speak, canListen, listen, speechMatch } from './tts.js';
import { kindLabel } from './content.js';

export function sayBtn(text, label = 'Listen') {
  return h('button', { class: 'say', type: 'button', title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); speak(typeof text === 'function' ? text() : text); } }, '🔊');
}
const head = (step) => h('div', { class: 'step-kind' }, kindLabel(step.kind),
  step.section && step.section.toLowerCase() !== kindLabel(step.kind).toLowerCase() ? h('span', { class: 'muted' }, '· ' + step.section) : null);
const KEYS = ['A', 'B', 'C', 'D', 'E'];

/** Show a sentence with ___ replaced by a visible blank. */
function withBlank(text, fill = '') {
  const parts = String(text).split('___');
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) out.push(h('span', { class: 'blank' }, fill || ' '), parts[i]);
  return out;
}

// ---------------------------------------------------------------- choice (mc / vmc / fix / tf)
function choice({ step, ctx, prompt, options, correctIndex, given = (i) => options[i].text, expected, explanation, instr }) {
  let chosen = -1;
  const btns = options.map((o, i) => h('button', { class: 'opt', type: 'button', onclick: () => { if (chosen !== -1) return; chosen = i; ctx.submit(); } },
    h('span', { class: 'key' }, o.key || KEYS[i]), h('span', null, o.text)));
  const el = h('div', { class: 'step' }, head(step), instr ? h('div', { class: 'instr' }, instr) : null, prompt, h('div', { class: 'opts' + (options.length > 2 && options.every((o) => o.text.length < 18) ? ' cols' : '') }, btns));
  return {
    el, ready: () => chosen !== -1,
    check() {
      btns.forEach((b, i) => { b.disabled = true; if (i === correctIndex) b.classList.add('right'); else if (i === chosen) b.classList.add('wrong'); });
      return { score: chosen === correctIndex ? 1 : 0, given: given(chosen), expected, explanation };
    },
    key(k) { const i = KEYS.indexOf(k.toUpperCase()); if (i > -1 && i < btns.length) btns[i].click(); },
  };
}

function mc(step, ctx) {
  const it = step.item;
  const r = rng(hashStr(step.ref + (ctx.attempt || 0)));
  const opts = shuffle(it.options, r);
  return choice({
    step, ctx, prompt: h('div', { class: 'prompt' }, withBlank(it.prompt), ' ', sayBtn(() => it.prompt.replace('___', it.answer))),
    options: opts.map((t) => ({ text: t })), correctIndex: opts.indexOf(it.answer), expected: it.answer, explanation: it.explanation,
  });
}

function vmc(step, ctx) {
  const { word, reverse, options } = step.item;
  if (reverse) {
    return choice({
      step, ctx, instr: 'Which word matches the meaning?',
      prompt: h('div', { class: 'prompt' }, '“', word.meaning, '”'),
      options: options.map((v) => ({ text: v.word })), correctIndex: options.indexOf(word),
      expected: `${word.word} = ${word.meaning}`, explanation: word.example,
    });
  }
  return choice({
    step, ctx, instr: 'What does this word mean?',
    prompt: h('div', { class: 'prompt' }, h('span', { style: { fontSize: '2rem' } }, word.emoji), ' ', word.word, ' ', sayBtn(word.word)),
    options: options.map((v) => ({ text: v.meaning })), correctIndex: options.indexOf(word),
    expected: `${word.word} = ${word.meaning}`, explanation: word.example,
  });
}

function fix(step, ctx) {
  const it = step.item;
  return choice({
    step, ctx, instr: 'Is this sentence correct?',
    prompt: h('div', { class: 'prompt' }, '“', it.sentence, '”'),
    options: [{ key: '✔', text: 'Correct' }, { key: '✘', text: 'It has a mistake' }],
    correctIndex: it.correct ? 0 : 1, given: (i) => (i === 0 ? 'Correct' : 'Has a mistake'),
    expected: it.correct ? `Correct: ${it.answer}` : `Correct version: ${it.answer}`, explanation: it.explanation,
  });
}

// ---------------------------------------------------------------- typed / bank gap
function gap(step, ctx) {
  const it = step.item;
  const answers = Array.isArray(it.answer) ? it.answer : [it.answer];
  const useBank = ctx.opts.bank && Array.isArray(it.bank) && it.bank.length > 1;
  let value = '', tries = 0;
  const blank = () => h('span', { class: 'blank' }, value || ' ');
  const promptEl = h('div', { class: 'prompt' });
  const paint = () => {
    promptEl.replaceChildren(...String(it.prompt).split('___').flatMap((p, i) => (i ? [blank(), p] : [p])),
      it.hint ? h('span', { class: 'hint' }, ' ', it.hint) : '');
  };
  paint();
  let input, bankBtns = [];
  const body = [];
  if (useBank) {
    const r = rng(hashStr(step.ref));
    bankBtns = shuffle(it.bank, r).map((w) => h('button', { class: 'chip', type: 'button', onclick: () => { value = w; bankBtns.forEach((b) => b.classList.toggle('sel', b.textContent === w)); paint(); ctx.changed(); } }, w));
    body.push(h('div', { class: 'instr' }, 'Tap the right word(s):'), h('div', { class: 'chips' }, bankBtns));
  } else {
    input = h('input', { type: 'text', class: 'answer-in', placeholder: 'Type the missing word(s)…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      oninput: () => { value = input.value; paint(); ctx.changed(); }, onkeydown: (e) => { if (e.key === 'Enter' && value.trim()) { e.preventDefault(); ctx.submit(); } } });
    body.push(input);
  }
  const el = h('div', { class: 'step' }, head(step), promptEl, body);
  return {
    el, focus: () => input && input.focus(), ready: () => value.trim().length > 0,
    check() {
      let res = check(value, answers);
      if (useBank && res === 'almost') res = 'wrong'; // tapped options can't have typos
      tries++;
      if (res === 'almost' && tries === 1) return { almost: true };
      const score = res === 'right' ? 1 : res === 'almost' ? 0.5 : 0;
      if (input) { input.disabled = true; input.classList.add(score === 1 ? 'right' : 'wrong'); }
      bankBtns.forEach((b) => { b.disabled = true; if (answers.map(norm).includes(norm(b.textContent))) b.classList.add('right'); else if (b.classList.contains('sel')) b.classList.add('wrong'); });
      return { score, given: value, expected: it.prompt.replace('___', first(answers)), explanation: it.explanation };
    },
  };
}

// ---------------------------------------------------------------- order the words
function order(step, ctx) {
  const it = step.item;
  const full = it.answer.trim();
  const punct = /[.?!]$/.test(full) ? full.slice(-1) : '';
  const words = (punct ? full.slice(0, -1) : full).split(/\s+/);
  const proper = step.unit.proper || new Set();
  const firstWord = words[0];
  if (!proper.has(firstWord.replace(/[^A-Za-z]/g, '')) && firstWord !== 'I') words[0] = firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
  const r = rng(hashStr(step.ref));
  let tokens = shuffle(words.map((w, i) => ({ w, i })), r);
  if (tokens.every((t, k) => t.i === k) && tokens.length > 1) tokens = [...tokens.slice(1), tokens[0]];
  const built = [];
  const line = h('div', { class: 'line-zone' });
  const pool = h('div', { class: 'chips' });
  const chipEls = tokens.map((t) => h('button', { class: 'chip', type: 'button', onclick: () => { built.push(t); paint(); ctx.changed(); } }, t.w));
  pool.append(...chipEls);
  function paint() {
    line.replaceChildren(...(built.length ? built.map((t, k) => h('button', { class: 'chip', type: 'button', onclick: () => { built.splice(k, 1); paint(); ctx.changed(); } }, t.w)) : [h('span', { class: 'placeholder' }, 'Tap the words in the right order')]),
      built.length ? h('span', { style: { fontWeight: 800, fontSize: '1.3rem' } }, punct) : '');
    chipEls.forEach((c, k) => c.classList.toggle('used', built.includes(tokens[k])));
  }
  paint();
  const sentence = () => built.map((t) => t.w).join(' ') + punct;
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, 'Make a sentence.'), line, pool,
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { built.length = 0; paint(); ctx.changed(); } }, '↺ Start again')));
  return {
    el, ready: () => built.length === tokens.length,
    check() {
      const ok = check(sentence(), [it.answer, ...(it.alt || [])]) === 'right';
      line.classList.add(ok ? 'right' : 'wrong');
      line.querySelectorAll('button').forEach((b) => (b.disabled = true));
      chipEls.forEach((b) => (b.disabled = true));
      return { score: ok ? 1 : 0, given: sentence(), expected: it.answer, explanation: it.explanation };
    },
  };
}

// ---------------------------------------------------------------- transform (rewrite)
function transform(step, ctx) {
  const it = step.item;
  let tries = 0;
  const input = h('textarea', { class: 'answer-in', rows: 2, placeholder: 'Write the new sentence…', autocapitalize: 'sentences', spellcheck: 'false', style: { minHeight: '90px' },
    oninput: () => ctx.changed(), onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) { e.preventDefault(); ctx.submit(); } } });
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, it.instruction),
    h('div', { class: 'prompt' }, '“', it.prompt, '” ', sayBtn(it.prompt)), input);
  return {
    el, focus: () => input.focus(), ready: () => input.value.trim().split(/\s+/).length >= 2,
    check() {
      const res = check(input.value, it.answer);
      tries++;
      if (res === 'almost' && tries === 1) return { almost: true };
      const score = res === 'right' ? 1 : res === 'almost' ? 0.5 : 0;
      input.disabled = true; input.classList.add(score === 1 ? 'right' : 'wrong');
      return { score, given: input.value.trim(), expected: first(it.answer), explanation: it.explanation };
    },
  };
}

// ---------------------------------------------------------------- vocabulary: flashcards
function flash(step, ctx) {
  const words = step.item.words;
  let i = 0, seen = new Set([0]);
  const card = h('div', { class: 'flash-card', role: 'button', tabindex: 0, 'aria-label': 'Flip card', onclick: () => { card.classList.toggle('flip'); }, onkeydown: (e) => { if (e.key === ' ') { e.preventDefault(); card.classList.toggle('flip'); } } });
  const dots = h('div', { class: 'dots' });
  const counter = h('span', { class: 'muted small' });
  function paint() {
    const w = words[i];
    card.classList.remove('flip');
    card.replaceChildren(h('div', { class: 'flash-inner' },
      h('div', { class: 'flash-face' }, h('div', { class: 'em' }, w.emoji), h('div', { class: 'w' }, w.word), sayBtn(w.word), h('div', { class: 'muted small' }, 'Tap to see the meaning')),
      h('div', { class: 'flash-face back' }, h('div', { class: 'w', style: { fontSize: '1.6rem' } }, w.word), h('div', { class: 'm' }, w.meaning), h('div', { class: 'ex' }, '“', w.example, '”'), sayBtn(w.example, 'Listen to the example'))));
    dots.replaceChildren(...words.map((_, k) => h('i', { class: k === i ? 'on' : '' })));
    counter.textContent = `${i + 1} / ${words.length}`;
    speak(w.word);
  }
  const go = (d) => { i = (i + d + words.length) % words.length; seen.add(i); paint(); ctx.changed(); };
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, 'Listen, look and learn these words. Tap a card to flip it.'), dots, card,
    h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => go(-1) }, '← Back'), counter, h('button', { class: 'btn', type: 'button', onclick: () => go(1) }, 'Next →')));
  setTimeout(paint, 0);
  return {
    el, ready: () => seen.size >= words.length, readyLabel: 'I know these words', notReadyHint: 'Look at every card first',
    check: () => ({ score: null, given: 'viewed', expected: '', explanation: '' }), silent: true,
    key(k) { if (k === 'ArrowRight') go(1); if (k === 'ArrowLeft') go(-1); },
  };
}

// ---------------------------------------------------------------- vocabulary: match word ↔ meaning
function match(step, ctx) {
  const words = step.item.words;
  const r = rng(hashStr(step.ref));
  const right = shuffle(words, r);
  let selL = null, mistakes = 0, done = 0;
  const leftBtns = words.map((w) => h('button', { class: 'opt', type: 'button', onclick: () => { selL = w; leftBtns.forEach((b) => b.classList.toggle('sel', b === leftBtnOf(w))); speak(w.word); } }, h('span', null, w.emoji), h('span', null, w.word)));
  const leftBtnOf = (w) => leftBtns[words.indexOf(w)];
  const rightBtns = right.map((w) => h('button', { class: 'opt', type: 'button', onclick: (e) => {
    if (!selL) return;
    const b = e.currentTarget;
    if (selL === w) {
      b.classList.add('done'); leftBtnOf(w).classList.add('done'); leftBtnOf(w).classList.remove('sel'); selL = null; done++;
      if (done === words.length) ctx.submit();
    } else { mistakes++; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
  } }, w.meaning));
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, 'Tap a word, then tap its meaning.'),
    h('div', { class: 'match-grid' }, h('div', { class: 'match-col' }, leftBtns), h('div', { class: 'match-col' }, rightBtns)));
  return {
    el, ready: () => done === words.length, notReadyHint: 'Match all the words',
    check: () => ({ score: Math.max(0, (words.length - mistakes) / words.length), given: `${mistakes} wrong tries`, expected: words.map((w) => `${w.word} = ${w.meaning}`).join(' · '), explanation: mistakes ? 'Look at the words you mixed up and say them again.' : 'Perfect matching!' }),
  };
}

// ---------------------------------------------------------------- vocabulary: sort into categories
function sort(step, ctx) {
  const words = step.item.words;
  const cats = [...new Set(words.map((w) => w.cat))];
  const placed = new Map(); // word → cat
  let sel = null;
  const pool = h('div', { class: 'chips' });
  const bucketEls = cats.map((c) => h('div', { class: 'bucket', role: 'button', tabindex: 0, onclick: () => { if (sel) { placed.set(sel, c); sel = null; paint(); ctx.changed(); } } }, h('h4', null, c), h('div', { class: 'in' })));
  function paint() {
    pool.replaceChildren(...words.filter((w) => !placed.has(w)).map((w) => h('button', { class: 'chip' + (sel === w ? ' sel' : ''), type: 'button', onclick: () => { sel = sel === w ? null : w; paint(); } }, `${w.emoji} ${w.word}`)));
    if (!pool.children.length) pool.append(h('span', { class: 'muted' }, 'All words placed. Press Check!'));
    bucketEls.forEach((b, k) => {
      b.classList.toggle('ready', !!sel);
      b.querySelector('.in').replaceChildren(...words.filter((w) => placed.get(w) === cats[k]).map((w) => h('button', { class: 'chip', type: 'button', onclick: (e) => { e.stopPropagation(); if (sel) { placed.set(sel, cats[k]); sel = null; } else placed.delete(w); paint(); ctx.changed(); } }, w.word)));
    });
  }
  paint();
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, 'Tap a word, then tap the group it belongs to.'), pool, h('div', { class: 'buckets' }, bucketEls));
  return {
    el, ready: () => placed.size === words.length, notReadyHint: 'Place every word',
    check() {
      let ok = 0;
      bucketEls.forEach((b, k) => b.querySelectorAll('.chip').forEach((chip) => {
        const w = words.find((x) => x.word === chip.textContent);
        const good = w && w.cat === cats[k]; if (good) ok++;
        chip.classList.add(good ? 'right' : 'wrong'); chip.disabled = true;
      }));
      bucketEls.forEach((b) => (b.onclick = null));
      return { score: ok / words.length, given: `${ok}/${words.length} in the right group`, expected: cats.map((c) => `${c}: ${words.filter((w) => w.cat === c).map((w) => w.word).join(', ')}`).join(' · '), explanation: 'Words in the same group have something in common.' };
    },
  };
}

// ---------------------------------------------------------------- vocabulary: listen & spell
function spell(step, ctx) {
  const w = step.item.word;
  let tries = 0;
  const input = h('input', { type: 'text', class: 'answer-in', placeholder: 'Type the word you hear…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: () => ctx.changed(), onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); ctx.submit(); } } });
  const el = h('div', { class: 'step' }, head(step),
    h('div', { class: 'big-emoji-line' }, w.emoji),
    h('div', { class: 'row', style: { justifyContent: 'center', marginBottom: '12px' } },
      h('button', { class: 'btn primary', type: 'button', onclick: () => speak(w.word, { rate: 0.8 }) }, '🔊 Play word'),
      h('button', { class: 'btn', type: 'button', onclick: () => speak(w.word, { rate: 0.45 }) }, '🐢 Slowly')),
    h('div', { class: 'instr center' }, 'Hint: ', w.meaning), input);
  setTimeout(() => speak(w.word, { rate: 0.8 }), 350);
  return {
    el, focus: () => input.focus(), ready: () => input.value.trim().length > 0,
    check() {
      const res = check(input.value, w.word);
      tries++;
      if (res === 'almost' && tries === 1) return { almost: true };
      const score = res === 'right' ? 1 : 0;
      input.disabled = true; input.classList.add(score ? 'right' : 'wrong');
      return { score, given: input.value.trim(), expected: w.word, explanation: w.example };
    },
  };
}

// ---------------------------------------------------------------- reading
function reading(step, ctx) {
  const r = step.item;
  const answers = r.questions.map(() => null);
  const qEls = r.questions.map((q, qi) => {
    const set = (v) => { answers[qi] = v; ctx.changed(); };
    let ui;
    if (q.type === 'tf') {
      const bs = [true, false].map((v) => h('button', { class: 'opt', type: 'button', onclick: () => { bs.forEach((b) => b.classList.remove('sel')); bs[v ? 0 : 1].classList.add('sel'); set(v); } }, v ? '✔ True' : '✘ False'));
      ui = h('div', { class: 'opts cols' }, bs); ui._btns = bs;
    } else if (q.type === 'mc') {
      const opts = shuffle(q.options, rng(hashStr(step.ref + qi)));
      const bs = opts.map((o) => h('button', { class: 'opt', type: 'button', onclick: (e) => { bs.forEach((b) => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); set(o); } }, o));
      ui = h('div', { class: 'opts' }, bs); ui._btns = bs; ui._opts = opts;
    } else {
      const inp = h('input', { type: 'text', class: 'answer-in', placeholder: 'Type your answer…', autocomplete: 'off', oninput: () => set(inp.value.trim() || null) });
      ui = inp;
    }
    const box = h('div', { class: 'q' }, h('div', { class: 'qp' }, `${qi + 1}. `, q.type === 'tf' ? q.statement : withBlank(q.prompt)), ui);
    box._ui = ui;
    return box;
  });
  const el = h('div', { class: 'step' }, head(step),
    h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, r.title), h('span', { class: 'badge brand' }, r.genre)),
    h('div', { class: 'row', style: { margin: '8px 0' } }, h('button', { class: 'btn small', type: 'button', onclick: () => speak(r.text.replace(/\n+/g, ' '), { rate: 0.9 }) }, '🔊 Read it to me')),
    h('div', { class: 'reading-text' }, r.text.split(/\n\n+/).map((p) => h('p', null, p))),
    h('div', { class: 'instr' }, 'Answer the questions:'), qEls);
  return {
    el, ready: () => answers.every((a) => a !== null && a !== ''), notReadyHint: 'Answer every question',
    check() {
      const subs = r.questions.map((q, qi) => {
        const a = answers[qi], ui = qEls[qi]._ui;
        let ok;
        if (q.type === 'tf') { ok = a === q.answer; ui._btns.forEach((b, k) => { b.disabled = true; if ((k === 0) === q.answer) b.classList.add('right'); else if (b.classList.contains('sel')) b.classList.add('wrong'); }); }
        else if (q.type === 'mc') { ok = a === q.answer; ui._btns.forEach((b, k) => { b.disabled = true; if (ui._opts[k] === q.answer) b.classList.add('right'); else if (b.classList.contains('sel')) b.classList.add('wrong'); }); }
        else { ok = check(a, q.answer) !== 'wrong'; ui.disabled = true; ui.classList.add(ok ? 'right' : 'wrong'); }
        const exp = q.type === 'tf' ? (q.answer ? 'True' : 'False') : first(q.answer);
        qEls[qi].querySelector('.qp').append(h('span', { class: `badge ${ok ? 'good' : 'bad'} mark` }, ok ? '✔' : `✘ ${exp}`));
        return { ref: `${step.ref}.q${qi}`, score: ok ? 1 : 0, given: String(a) };
      });
      const n = subs.filter((s) => s.score).length;
      return { score: n / subs.length, given: `${n}/${subs.length} correct`, expected: '', explanation: n === subs.length ? 'You understood the whole text!' : 'Read the text again to find the answers you missed.', subs };
    },
  };
}

// ---------------------------------------------------------------- speaking
function speakStep(step, ctx) {
  const target = step.item.text;
  let best = 0, heard = '', triesLeft = 3, selfDone = false;
  const status = h('div', { class: 'center muted', style: { minHeight: '48px', marginTop: '12px', fontWeight: 700 } });
  const supported = canListen();
  const mic = h('button', { class: 'mic', type: 'button', 'aria-label': 'Start speaking', onclick: async () => {
    if (mic.classList.contains('live') || triesLeft <= 0) return;
    mic.classList.add('live'); status.textContent = 'Listening… say the sentence now.';
    try {
      const t = await listen();
      triesLeft--;
      const s = speechMatch(target, t);
      if (s > best) { best = s; heard = t.split(' | ')[0]; }
      status.textContent = t ? `I heard: “${t.split(' | ')[0]}” ${s >= 0.75 ? '🎉' : '— try again!'}` : 'I didn’t hear anything. Try again closer to the microphone.';
      if (best >= 0.75 || triesLeft <= 0) { ctx.changed(); if (best >= 0.75) ctx.submit(); }
      else ctx.changed();
    } catch (e) {
      status.textContent = 'The microphone is not available. Read the sentence aloud 3 times, then tap “I said it”.';
      fallback.classList.remove('hidden'); mic.classList.add('hidden');
    } finally { mic.classList.remove('live'); }
  } }, '🎤');
  const fallback = h('button', { class: 'btn' + (supported ? ' hidden' : ''), type: 'button', onclick: () => { selfDone = true; ctx.changed(); ctx.submit(); } }, '✔ I said it 3 times');
  if (!supported) mic.classList.add('hidden');
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'instr' }, supported ? 'Listen, then tap the microphone and say the sentence.' : 'Listen, then read the sentence aloud 3 times.'),
    h('div', { class: 'prompt center' }, target, ' ', sayBtn(target)),
    h('div', { class: 'center' }, mic, fallback), status);
  return {
    el, ready: () => selfDone || best >= 0.75 || triesLeft <= 0, notReadyHint: 'Say the sentence first',
    check() {
      if (selfDone) return { score: null, given: 'self-checked', expected: target, explanation: 'Great practice! Keep reading aloud every day.' };
      const score = best >= 0.75 ? 1 : best >= 0.5 ? 0.5 : 0;
      return { score, given: heard || '(nothing heard)', expected: target, explanation: score === 1 ? 'Clear and correct!' : 'Listen again and copy the sounds slowly.' };
    },
  };
}

// ---------------------------------------------------------------- writing
function writing(step, ctx) {
  const w = step.item;
  const min = w.minWords || 30;
  const ta = h('textarea', { placeholder: 'Write here…', spellcheck: 'true', oninput: () => { paint(); ctx.changed(); } });
  const wc = h('span', { class: 'wc' });
  const count = () => (ta.value.trim().match(/\S+/g) || []).length;
  const paint = () => { const n = count(); wc.textContent = `${n} / ${min} words`; wc.classList.toggle('ok', n >= min); };
  paint();
  const el = h('div', { class: 'step' }, head(step), h('div', { class: 'prompt' }, w.prompt), h('div', { class: 'notice info small', style: { marginBottom: '12px' } }, '💡 ', w.hint), ta,
    h('div', { class: 'row between', style: { marginTop: '8px' } }, wc, h('span', { class: 'muted small' }, 'Your teacher will read and mark this.')));
  return {
    el, focus: () => ta.focus(), ready: () => count() >= Math.min(min, Math.max(8, Math.round(min * 0.6))), notReadyHint: `Write at least ${Math.min(min, Math.max(8, Math.round(min * 0.6)))} words`,
    check() { ta.disabled = true; return { score: null, given: ta.value.trim(), expected: w.model, explanation: 'Compare your writing with this example:', writing: true }; },
  };
}

export const RENDERERS = { mc, vmc, fix, gap, order, transform, flash, match, sort, spell, reading, speak: speakStep, writing };
export function render(step, ctx) {
  const fn = RENDERERS[step.kind];
  if (!fn) return { el: h('div', { class: 'step' }, 'Unknown exercise'), ready: () => true, check: () => ({ score: null }) };
  return fn(step, ctx);
}
