// Validates every unit pack in content/g6 against docs/CONTENT_FORMAT.md.
// Usage: node tools/validate.mjs [u1 u2 ...]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2);
const ids = only.length ? only : Array.from({ length: 10 }, (_, i) => `u${i}`);
let errors = 0, warnings = 0;
const err = (u, m) => { errors++; console.log(`  ERROR ${u}: ${m}`); };
const warn = (u, m) => { warnings++; console.log(`  warn  ${u}: ${m}`); };
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const norm = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();

function checkItem(u, where, it, allowed) {
  const at = `${where} (${it && it.type}) "${(it && (it.prompt || it.sentence || it.statement || it.answer)) || ''}".slice`;
  const loc = `${where}`;
  if (!it || !allowed.includes(it.type)) return err(u, `${loc}: type must be one of ${allowed.join('/')}`);
  if (!str(it.explanation)) err(u, `${loc}: missing explanation`);
  switch (it.type) {
    case 'mc':
      if (!str(it.prompt)) err(u, `${loc}: mc needs prompt`);
      if (!Array.isArray(it.options) || it.options.length < 3 || it.options.length > 4) err(u, `${loc}: mc needs 3-4 options`);
      else {
        if (!it.options.includes(it.answer)) err(u, `${loc}: mc answer "${it.answer}" not in options`);
        if (new Set(it.options.map(norm)).size !== it.options.length) err(u, `${loc}: mc duplicate options`);
      }
      break;
    case 'gap': {
      if (!str(it.prompt) || (it.prompt.match(/___/g) || []).length !== 1) err(u, `${loc}: gap prompt needs exactly one ___`);
      const ans = Array.isArray(it.answer) ? it.answer : [it.answer];
      if (!ans.length || !ans.every(str)) err(u, `${loc}: gap needs answer`);
      if (it.bank) {
        if (!Array.isArray(it.bank) || it.bank.length < 2) err(u, `${loc}: bank must be an array`);
        else if (!it.bank.some((b) => ans.map(norm).includes(norm(b)))) err(u, `${loc}: bank must contain the answer`);
      }
      break;
    }
    case 'order': {
      if (!str(it.answer)) { err(u, `${loc}: order needs answer`); break; }
      const n = it.answer.trim().split(/\s+/).length;
      if (n < 3 || n > 12) warn(u, `${loc}: order sentence has ${n} words`);
      if (!/[.?!]$/.test(it.answer.trim())) err(u, `${loc}: order answer must end with . ? or !`);
      break;
    }
    case 'transform':
      if (!str(it.instruction) || !str(it.prompt)) err(u, `${loc}: transform needs instruction + prompt`);
      if (!Array.isArray(it.answer) || !it.answer.length || !it.answer.every(str)) err(u, `${loc}: transform answer must be a non-empty array`);
      break;
    case 'fix':
      if (!str(it.sentence) || typeof it.correct !== 'boolean' || !str(it.answer)) err(u, `${loc}: fix needs sentence, correct (bool), answer`);
      else if (it.correct && norm(it.answer) !== norm(it.sentence)) err(u, `${loc}: fix correct=true but answer differs`);
      else if (!it.correct && norm(it.answer) === norm(it.sentence)) err(u, `${loc}: fix correct=false but answer equals sentence`);
      break;
    case 'tf':
      if (!str(it.statement) || typeof it.answer !== 'boolean') err(u, `${loc}: tf needs statement + boolean answer`);
      break;
  }
}

for (const id of ids) {
  const file = join(root, 'content', 'g6', `${id}.json`);
  if (!existsSync(file)) { console.log(`${id}: MISSING`); errors++; continue; }
  let p;
  try { p = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.log(`${id}: INVALID JSON ${e.message}`); errors++; continue; }
  const before = errors;
  const edge = p.unit === 0 || p.unit === 9;
  if (p.id !== id) err(id, `id should be "${id}"`);
  for (const k of ['title', 'emoji', 'color', 'bigQuestion', 'summary']) if (!str(p[k])) err(id, `missing ${k}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(p.color || '')) err(id, 'color must be #rrggbb');
  if (!Array.isArray(p.warmup) || p.warmup.length < 3) err(id, 'warmup needs >= 3 questions');

  // vocab
  if (!Array.isArray(p.vocab) || p.vocab.length < (edge ? 6 : 15)) err(id, `vocab too short (${p.vocab && p.vocab.length})`);
  const words = new Set();
  const cats = {};
  (p.vocab || []).forEach((v, i) => {
    for (const k of ['word', 'pos', 'cat', 'meaning', 'example', 'emoji']) if (!str(v[k])) err(id, `vocab[${i}] ${v.word || ''} missing ${k}`);
    if (![1, 2].includes(v.set)) err(id, `vocab[${i}] ${v.word} set must be 1 or 2`);
    if (words.has(norm(v.word))) err(id, `duplicate vocab word ${v.word}`);
    words.add(norm(v.word));
    if (str(v.example) && str(v.word)) {
      const stem = norm(v.word).split(/[ !]/)[0].slice(0, Math.max(3, norm(v.word).split(/[ !]/)[0].length - 2));
      if (!norm(v.example).includes(stem)) warn(id, `vocab ${v.word}: example doesn't seem to contain the word`);
    }
    cats[v.cat] = (cats[v.cat] || 0) + 1;
  });
  const catNames = Object.keys(cats);
  if (catNames.length < 2) err(id, 'vocab needs >= 2 categories');
  for (const c of catNames) if (cats[c] < 3) err(id, `category "${c}" has < 3 words`);

  // grammar
  if (!Array.isArray(p.grammar) || !p.grammar.length) err(id, 'grammar missing');
  (p.grammar || []).forEach((g, gi) => {
    const where = `grammar[${g.id || gi}]`;
    for (const k of ['id', 'title', 'rule', 'form']) if (!str(g[k])) err(id, `${where} missing ${k}`);
    if (!Array.isArray(g.examples) || g.examples.length < 2) err(id, `${where} needs >= 2 examples`);
    const items = g.items || [];
    const min = edge ? 12 : 20;
    if (items.length < min) err(id, `${where} has ${items.length} items (min ${min})`);
    const count = (t) => items.filter((x) => x.type === t).length;
    const need = edge ? { mc: 3, gap: 3, order: 2, transform: 1, fix: 2 } : { mc: 5, gap: 5, order: 4, transform: 3, fix: 3 };
    for (const [t, n] of Object.entries(need)) if (count(t) < n) err(id, `${where} needs >= ${n} ${t} (has ${count(t)})`);
    items.forEach((it, ii) => checkItem(id, `${where}.items[${ii}]`, it, ['mc', 'gap', 'order', 'transform', 'fix']));
  });

  // reading
  if (!Array.isArray(p.reading) || p.reading.length < (edge ? 1 : 2)) err(id, 'reading needs 2 texts');
  (p.reading || []).forEach((r, ri) => {
    const where = `reading[${ri}]`;
    for (const k of ['id', 'title', 'genre', 'text']) if (!str(r[k])) err(id, `${where} missing ${k}`);
    const wc = (r.text || '').split(/\s+/).length;
    if (wc < 100 || wc > 260) warn(id, `${where} text is ${wc} words`);
    if (!Array.isArray(r.questions) || r.questions.length < 4) err(id, `${where} needs >= 4 questions`);
    (r.questions || []).forEach((q, qi) => checkItem(id, `${where}.q[${qi}]`, q, ['mc', 'tf', 'gap']));
  });

  // word work
  if (!p.wordWork || !str(p.wordWork.title) || !str(p.wordWork.rule)) err(id, 'wordWork missing title/rule');
  else {
    if (!Array.isArray(p.wordWork.items) || p.wordWork.items.length < (edge ? 4 : 6)) err(id, 'wordWork needs >= 6 items');
    (p.wordWork.items || []).forEach((it, i) => checkItem(id, `wordWork[${i}]`, it, ['mc', 'gap']));
  }

  // writing + speaking
  if (!Array.isArray(p.writing) || p.writing.length < 1) err(id, 'writing missing');
  (p.writing || []).forEach((w, i) => { for (const k of ['prompt', 'hint', 'model']) if (!str(w[k])) err(id, `writing[${i}] missing ${k}`); if (!(w.minWords > 0)) err(id, `writing[${i}] minWords`); });
  if (!Array.isArray(p.speaking) || p.speaking.length < 5) err(id, 'speaking needs >= 5 sentences');

  const nItems = (p.grammar || []).reduce((a, g) => a + (g.items || []).length, 0);
  console.log(`${id} ${p.title}: ${p.vocab?.length || 0} words, ${(p.grammar || []).length} grammar pts, ${nItems} grammar items, ${(p.reading || []).length} readings — ${errors === before ? 'ok' : 'FAILED'}`);
}
console.log(errors ? `\n${errors} error(s), ${warnings} warning(s)` : `\nOK (${warnings} warning(s))`);
process.exit(errors ? 1 : 0);
