// Loads unit packs and resolves exercise references ("refs") into concrete steps.
//
// Ref grammar (kept short because refs travel inside homework links):
//   u1.g1.5          grammar point g1, item 5
//   u1.w.3           word-work item 3
//   u1.r1            reading text r1 (all its questions in one step)
//   u1.wr.0          writing prompt 0
//   u1.sp.2          speaking sentence 2
//   u1.vf.0-3-5      vocab flashcards (word indexes)
//   u1.vm.0-3-5-8    vocab match (word ↔ meaning)
//   u1.vc.7          vocab meaning multiple-choice for word 7
//   u1.vs.7          vocab listen & spell word 7
//   u1.vt.0-3-5-8-9  vocab sort into categories
//   u1.c.<id>        teacher's own item (custom materials)
// Every ref starts with the unit key, e.g. "tg3:u1.g1.5".
import { store, rng, shuffle, hashStr } from './util.js';

// Courses (books) live in content/courses.json. Unit keys are "<course>:<unit>", e.g. "tg3:u1".
// Refs without a course prefix (old links) default to the first course.
let coursesP = null;
export function loadCourses() {
  coursesP ||= fetch('content/courses.json', { cache: 'no-cache' }).then((r) => r.json()).catch((e) => { coursesP = null; throw e; });
  return coursesP;
}
export async function getCourse(id) { const list = await loadCourses(); return list.find((c) => c.id === id) || list[0]; }
const cache = new Map();

/** Accepts "tg3:u1" or legacy "u1". */
export async function loadUnit(key) {
  const courses = await loadCourses();
  const [cid, uid] = key.includes(':') ? key.split(':') : [courses[0].id, key];
  const full = `${cid}:${uid}`;
  if (!cache.has(full)) {
    const course = courses.find((c) => c.id === cid);
    if (!course) throw new Error(`Course ${cid} not found`);
    cache.set(full, fetch(`${course.dir}/${uid}.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`Unit ${full} not found`); return r.json(); })
      .then((p) => prepare(p, course))
      .catch((e) => { cache.delete(full); throw e; }));
  }
  return cache.get(full);
}
/** All units of one course (default: first course). */
export async function loadAll(courseId) {
  const course = await getCourse(courseId);
  const res = await Promise.allSettled(course.units.map((u) => loadUnit(`${course.id}:${u}`)));
  return res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

function prepare(p, course) {
  p.file = p.id;
  p.id = `${course.id}:${p.id}`; // globally unique key used in every ref
  p.course = course;
  p.label = p.unit === 0 || p.unit === 9 ? p.title : `Unit ${p.unit} · ${p.title}`;
  // Merge the teacher's custom vocab/questions for this unit.
  const mine = getMaterials()[p.id] || { vocab: [], items: [] };
  p.vocab = [...p.vocab, ...mine.vocab.map((v) => ({ ...v, custom: true, set: v.set || 1, cat: v.cat || 'My words', pos: v.pos || '', emoji: v.emoji || '⭐' }))];
  p.custom = mine.items || [];
  p.proper = properNouns(p);
  return p;
}

/** Words that appear capitalised mid-sentence → keep their capital letter in word-order chips. */
function properNouns(p) {
  const set = new Set(['I']);
  const texts = [
    ...p.reading.map((r) => r.text),
    ...p.grammar.flatMap((g) => [...g.examples, ...g.items.map((i) => [i.prompt, i.answer, i.sentence].flat().join(' '))]),
    ...p.vocab.map((v) => v.example),
  ];
  for (const t of texts) {
    // only words capitalised in the MIDDLE of a sentence (after a lowercase word or comma) count as names
    for (const m of String(t).matchAll(/[a-z,]\s+([A-Z][a-zA-Z]+)/g)) set.add(m[1]);
  }
  return set;
}

// ---------- teacher's custom materials ----------
export function getMaterials() { return store.get('materials', {}); }
export function setMaterials(m) { store.set('materials', m); for (const id of [...cache.keys()]) cache.delete(id); }

// ---------- ref resolution ----------
const KIND_LABEL = {
  mc: 'Choose', gap: 'Fill the gap', order: 'Order the words', transform: 'Rewrite', fix: 'Right or wrong?',
  reading: 'Reading', writing: 'Writing', speak: 'Say it', flash: 'Learn the words', match: 'Match',
  vmc: 'Word meaning', spell: 'Listen & spell', sort: 'Sort the words',
};
export const kindLabel = (k) => KIND_LABEL[k] || k;

/**
 * Resolve one ref into a step: { ref, kind, unit, item, label, section }
 * `extra` holds custom items carried inside a homework link (x map).
 */
export function resolve(ref, packs, extra = {}) {
  const [uid, part, rest] = ref.split('.');
  const p = packs[uid];
  if (!p) return null;
  const base = { ref, unit: p };
  const words = (s) => s.split('-').map(Number).map((i) => p.vocab[i]).filter(Boolean);
  if (/^g\d+$/.test(part)) {
    const g = p.grammar.find((x) => x.id === part);
    const item = g && g.items[Number(rest)];
    return item && { ...base, kind: item.type, item, section: g.title };
  }
  switch (part) {
    case 'w': { const item = p.wordWork.items[Number(rest)]; return item && { ...base, kind: item.type, item, section: p.wordWork.title }; }
    case 'wr': { const item = p.writing[Number(rest)]; return item && { ...base, kind: 'writing', item, section: 'Writing' }; }
    case 'sp': { const s = p.speaking[Number(rest)]; return s && { ...base, kind: 'speak', item: { text: s }, section: 'Speaking' }; }
    case 'vf': return { ...base, kind: 'flash', item: { words: words(rest) }, section: 'Vocabulary' };
    case 'vm': return { ...base, kind: 'match', item: { words: words(rest) }, section: 'Vocabulary' };
    case 'vt': return { ...base, kind: 'sort', item: { words: words(rest) }, section: 'Vocabulary' };
    case 'vs': { const w = p.vocab[Number(rest)]; return w && { ...base, kind: 'spell', item: { word: w }, section: 'Vocabulary' }; }
    case 'vc': {
      const w = p.vocab[Number(rest)];
      if (!w) return null;
      const r = rng(hashStr(ref));
      const others = shuffle(p.vocab.filter((v) => v !== w && v.meaning !== w.meaning), r).slice(0, 3);
      const reverse = r() < 0.5; // half the time: show meaning, choose the word
      return { ...base, kind: 'vmc', section: 'Vocabulary', item: { word: w, reverse, options: shuffle([w, ...others], r) } };
    }
    case 'c': {
      const item = extra[rest] || p.custom.find((c) => c.id === rest);
      return item && { ...base, kind: item.type, item, section: 'Teacher’s questions' };
    }
  }
  if (/^r\d+$/.test(part)) {
    const r = p.reading.find((x) => x.id === part);
    return r && { ...base, kind: 'reading', item: r, section: 'Reading' };
  }
  return null;
}

/** Short one-line description of a step (for builder lists and result analysis). */
export function describe(step) {
  if (!step) return '(missing question)';
  const it = step.item;
  switch (step.kind) {
    case 'mc': return it.prompt;
    case 'gap': return it.prompt + (it.hint ? ` ${it.hint}` : '');
    case 'order': return it.answer;
    case 'transform': return `${it.instruction} ${it.prompt}`;
    case 'fix': return it.sentence;
    case 'reading': return `“${it.title}” (${it.questions.length} questions)`;
    case 'writing': return it.prompt;
    case 'speak': return it.text;
    case 'flash': case 'match': case 'sort': return it.words.map((w) => w.word).join(', ');
    case 'vmc': return `Meaning of “${it.word.word}”`;
    case 'spell': return `Spell “${it.word.word}”`;
    default: return step.ref;
  }
}

/** Is this step auto-marked? (writing and flashcards are not) */
export const isScored = (kind) => !['flash', 'writing'].includes(kind);

/** Load every unit a list of refs needs. */
export async function packsFor(refs) {
  const ids = [...new Set(refs.map((r) => r.split('.')[0]))];
  const list = await Promise.all(ids.map(loadUnit));
  // index by both the requested id (maybe legacy "u1") and the full key
  return Object.fromEntries(ids.flatMap((id, i) => [[id, list[i]], [list[i].id, list[i]]]));
}
