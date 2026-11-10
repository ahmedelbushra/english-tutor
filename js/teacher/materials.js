// "My materials": the teacher adds own words and questions to any unit. They feed homework, practice and Teach mode.
import { h, uid, toast, download } from '../util.js';
import { loadAll, getMaterials, setMaterials, kindLabel } from '../content.js';
import { saveRemote } from '../api.js';

const TYPES = {
  mc: { label: 'Multiple choice', fields: [['prompt', 'Question (use ___ for a blank)', 'Butterflies ___ in cold seasons.'], ['answer', 'Correct answer', 'aren’t seen'], ['wrong', 'Wrong answers (comma separated)', 'don’t see, isn’t seen']] },
  gap: { label: 'Fill the gap', fields: [['prompt', 'Sentence with ___', 'Honey ___ by bees.'], ['hint', 'Hint (optional)', '(make)'], ['answer', 'Correct answer(s), separated by |', 'is made'], ['bank', 'Word bank (optional, comma separated, include the answer)', 'is made, are made, makes']] },
  order: { label: 'Order the words', fields: [['answer', 'The correct sentence', 'The desert is where camels live.']] },
  transform: { label: 'Rewrite the sentence', fields: [['instruction', 'Instruction', 'Make it passive.'], ['prompt', 'Sentence', 'Bees make honey.'], ['answer', 'Correct answer(s), separated by |', 'Honey is made by bees.']] },
  fix: { label: 'Right or wrong?', fields: [['sentence', 'Sentence', 'Insects is eaten by birds.'], ['answer', 'Correct version (same as above if it is right)', 'Insects are eaten by birds.']] },
};

export async function materialsView(root) {
  const units = await loadAll();
  let unitId = units[1]?.id || units[0].id;
  let tab = 'questions', type = 'mc';
  const page = h('div', { class: 'page' });
  root.replaceChildren(page);

  function paint() {
    const m = getMaterials();
    const mine = m[unitId] || { vocab: [], items: [] };
    const u = units.find((x) => x.id === unitId);
    page.replaceChildren(
      h('h1', null, '✏️ My materials'),
      h('p', { class: 'muted' }, 'Add your own words and questions to any unit. They appear in homework (as “Teacher’s questions”), practice and Teach mode.'),
      h('div', { class: 'row', style: { marginBottom: '14px' } },
        h('select', { style: { maxWidth: '320px' }, onchange: (e) => { unitId = e.target.value; paint(); } }, units.map((x) => h('option', { value: x.id, selected: x.id === unitId }, `${x.emoji} ${x.unit === 0 || x.unit === 9 ? x.title : `Unit ${x.unit}: ${x.title}`}`))),
        h('div', { class: 'tabs' }, [['questions', `🧩 Questions (${mine.items.length})`], ['words', `🔤 Words (${mine.vocab.length})`]].map(([k, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; paint(); } }, l))),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => download('my-materials.json', JSON.stringify(getMaterials(), null, 2), 'application/json') }, '⬇ Backup'),
        h('label', { class: 'btn small' }, '⬆ Restore', h('input', { type: 'file', accept: '.json', class: 'hidden', onchange: restore }))),
      h('div', { class: 'grid two', style: { alignItems: 'start' } },
        tab === 'questions' ? questionForm() : wordForm(u),
        h('div', { class: 'card' }, h('h3', null, tab === 'questions' ? 'Your questions' : 'Your words'),
          (tab === 'questions' ? mine.items : mine.vocab).length ? h('div', { class: 'step-list' }, (tab === 'questions' ? mine.items : mine.vocab).map((x, i) => h('div', { class: 'step-row', style: { '--unit': u.color } },
            h('div', { class: 'txt' }, tab === 'questions' ? [h('span', { class: 'badge' }, kindLabel(x.type)), h('div', { class: 'd' }, x.prompt || x.sentence || x.answer)] : [h('div', { class: 'd' }, `${x.emoji || '⭐'} ${x.word}: ${x.meaning}`)]),
            h('button', { class: 'btn icon small ghost', title: 'Delete', onclick: () => { if (!confirm('Delete this?')) return; (tab === 'questions' ? mine.items : mine.vocab).splice(i, 1); save(unitId, mine); } }, '🗑'))))
            : h('div', { class: 'empty' }, 'Nothing yet. Add one on the left.'))));
  }

  function questionForm() {
    const t = TYPES[type];
    const inputs = {};
    const expl = h('input', { type: 'text', placeholder: 'Why is this the answer? (one short sentence)' });
    return h('div', { class: 'card stack' }, h('h3', null, 'Add a question'),
      h('div', { class: 'tabs' }, Object.entries(TYPES).map(([k, v]) => h('button', { class: 'tab' + (type === k ? ' on' : ''), onclick: () => { type = k; paint(); } }, v.label))),
      t.fields.map(([k, label, ph]) => h('label', { class: 'field' }, h('span', null, label), inputs[k] = h('input', { type: 'text', placeholder: ph }))),
      h('label', { class: 'field' }, h('span', null, 'Explanation'), expl),
      h('button', { class: 'btn primary', onclick: () => {
        const v = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
        const item = build(type, v, expl.value.trim());
        if (typeof item === 'string') return toast(item, 'bad');
        const m = getMaterials(); const mine = m[unitId] || { vocab: [], items: [] };
        mine.items.push(item); save(unitId, mine); toast('Question added', 'good');
      } }, '＋ Add question'));
  }

  function wordForm(u) {
    const f = {};
    const field = (k, label, ph) => h('label', { class: 'field' }, h('span', null, label), f[k] = h('input', { type: 'text', placeholder: ph }));
    const cats = [...new Set(u.vocab.map((v) => v.cat))];
    return h('div', { class: 'card stack' }, h('h3', null, 'Add a word'),
      field('word', 'Word', 'scorpion'), field('emoji', 'Emoji (optional)', '🦂'), field('meaning', 'Simple meaning', 'a small desert animal with a sting'),
      field('example', 'Example sentence', 'A scorpion is hiding under the rock.'),
      h('label', { class: 'field' }, h('span', null, 'Group (for “sort the words”)'), f.cat = h('input', { type: 'text', list: 'cats', placeholder: cats[0] || 'My words' }), h('datalist', { id: 'cats' }, cats.map((c) => h('option', { value: c })))),
      h('button', { class: 'btn primary', onclick: () => {
        const v = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
        if (!v.word || !v.meaning || !v.example) return toast('Word, meaning and example are needed', 'bad');
        const m = getMaterials(); const mine = m[unitId] || { vocab: [], items: [] };
        mine.vocab.push({ word: v.word, emoji: v.emoji || '⭐', meaning: v.meaning, example: v.example, cat: v.cat || cats[0] || 'My words', set: 1, pos: '' });
        save(unitId, mine); toast('Word added', 'good');
      } }, '＋ Add word'));
  }

  function save(id, mine) {
    const m = getMaterials(); m[id] = mine; setMaterials(m);
    saveRemote('materials', m).catch((e) => toast('Saved here, not synced: ' + e.message, 'bad'));
    loadAll().then((list) => { units.splice(0, units.length, ...list); paint(); });
  }
  function restore(e) {
    const file = e.target.files[0]; if (!file) return;
    file.text().then((t) => { const m = JSON.parse(t); setMaterials(m); saveRemote('materials', m).catch(() => {}); toast('Materials restored', 'good'); loadAll().then((list) => { units.splice(0, units.length, ...list); paint(); }); })
      .catch(() => toast('That file is not a materials backup', 'bad'));
  }
  paint();
}

function build(type, v, explanation) {
  const id = uid(5);
  const ex = explanation || 'Check the rule for this unit.';
  const list = (s) => s.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  switch (type) {
    case 'mc': {
      const wrong = list(v.wrong);
      if (!v.prompt || !v.answer || wrong.length < 2) return 'Add the question, the answer and at least 2 wrong answers';
      return { id, type, prompt: v.prompt, options: [v.answer, ...wrong.slice(0, 3)], answer: v.answer, explanation: ex };
    }
    case 'gap': {
      if (!v.prompt.includes('___')) return 'The sentence needs ___ where the gap is';
      const answer = v.answer.split('|').map((x) => x.trim()).filter(Boolean);
      if (!answer.length) return 'Add the correct answer';
      const bank = v.bank ? list(v.bank) : undefined;
      if (bank && !bank.includes(answer[0])) bank.unshift(answer[0]);
      return { id, type, prompt: v.prompt, hint: v.hint || undefined, answer, bank, explanation: ex };
    }
    case 'order':
      if (v.answer.split(/\s+/).length < 3) return 'Write a sentence with at least 3 words';
      return { id, type, answer: /[.?!]$/.test(v.answer) ? v.answer : v.answer + '.', explanation: ex };
    case 'transform': {
      const answer = v.answer.split('|').map((x) => x.trim()).filter(Boolean);
      if (!v.instruction || !v.prompt || !answer.length) return 'Fill in all three boxes';
      return { id, type, instruction: v.instruction, prompt: v.prompt, answer, explanation: ex };
    }
    case 'fix':
      if (!v.sentence) return 'Add the sentence';
      return { id, type, sentence: v.sentence, answer: v.answer || v.sentence, correct: !v.answer || v.answer.trim() === v.sentence.trim(), explanation: ex };
  }
  return 'Unknown type';
}
