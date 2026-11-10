// Builds homework / quiz sets (lists of refs) from unit packs.
import { rng, shuffle, uid } from './util.js';

export const PRESETS = {
  quick: { label: 'Quick check', note: '≈10 min', vocab: 3, grammar: 5, reading: 0, wordWork: 1, writing: 0, flash: false },
  full: { label: 'Full unit', note: '≈25 min', vocab: 5, grammar: 10, reading: 1, wordWork: 2, writing: 1, flash: true },
  grammar: { label: 'Grammar focus', note: '≈15 min', vocab: 0, grammar: 14, reading: 0, wordWork: 0, writing: 0, flash: false },
  vocab: { label: 'Vocabulary focus', note: '≈10 min', vocab: 8, grammar: 0, reading: 0, wordWork: 2, writing: 0, flash: true },
  reading: { label: 'Reading & writing', note: '≈20 min', vocab: 2, grammar: 2, reading: 2, wordWork: 0, writing: 1, flash: false },
};

/**
 * opts: { packs: [pack], grammarIds: Set('u1.g1',...) | null (all), counts: {vocab, grammar, reading, wordWork, writing, flash}, seed }
 * returns refs[] in a sensible teaching order: flashcards → vocab → grammar → word work → reading → writing
 */
export function generate({ packs, grammarIds = null, counts, seed = uid() }) {
  const rand = rng(seed);
  const out = { flash: [], vocab: [], grammar: [], wordWork: [], reading: [], writing: [] };
  const split = (n) => spread(n, packs.length, rand); // share a count across chosen units

  // Vocabulary
  const vShares = split(counts.vocab || 0);
  packs.forEach((p, pi) => {
    const idx = shuffle(p.vocab.map((_, i) => i), rand);
    if (counts.flash && idx.length) out.flash.push(`${p.id}.vf.${idx.slice(0, Math.min(8, idx.length)).join('-')}`);
    out.vocab.push(...vocabSteps(p, vShares[pi], rand));
  });

  // Grammar: round-robin across points and item types so a set is varied.
  const points = packs.flatMap((p) => p.grammar.map((g) => ({ p, g, key: `${p.id}.${g.id}` })))
    .filter((x) => !grammarIds || grammarIds.has(x.key));
  const customs = packs.flatMap((p) => p.custom.map((c) => `${p.id}.c.${c.id}`));
  const gShares = spread(counts.grammar || 0, points.length + (customs.length ? 1 : 0), rand);
  points.forEach((pt, i) => out.grammar.push(...variedItems(pt.g.items, gShares[i], rand).map((n) => `${pt.key}.${n}`)));
  if (customs.length) out.grammar.push(...shuffle(customs, rand).slice(0, gShares[points.length]));
  out.grammar = interleave(out.grammar, rand);

  // Word work, reading, writing, speaking
  const wwShares = split(counts.wordWork || 0);
  packs.forEach((p, pi) => out.wordWork.push(...shuffle(p.wordWork.items.map((_, i) => i), rand).slice(0, wwShares[pi]).map((i) => `${p.id}.w.${i}`)));
  const readings = shuffle(packs.flatMap((p) => p.reading.map((r) => `${p.id}.${r.id}`)), rand);
  out.reading = readings.slice(0, counts.reading || 0);
  const writings = shuffle(packs.flatMap((p) => p.writing.map((_, i) => `${p.id}.wr.${i}`)), rand);
  out.writing = writings.slice(0, counts.writing || 0);
  // speaking tasks are switched off (tutor preference)

  return [...out.flash, ...out.vocab, ...out.grammar, ...out.wordWork, ...out.reading, ...out.writing];
}

/** Vocabulary steps for one unit: match → sort → meaning/spell alternating. */
function vocabSteps(p, n, rand) {
  if (!n || p.vocab.length < 4) return [];
  const steps = [];
  const pool = shuffle(p.vocab.map((_, i) => i), rand);
  let cursor = 0;
  const take = (k) => { const out = []; for (let i = 0; i < k; i++) out.push(pool[(cursor++) % pool.length]); return out; };
  const cats = groupBy(p.vocab.map((v, i) => ({ v, i })), (x) => x.v.cat);
  const catNames = Object.keys(cats).filter((c) => cats[c].length >= 2);
  const plan = ['match', catNames.length >= 2 ? 'sort' : 'vc', 'vc', 'vs', 'vc', 'vs', 'match', 'vs', 'vc', 'vs'];
  for (let s = 0; s < n; s++) {
    const kind = plan[s % plan.length];
    if (kind === 'match') steps.push(`${p.id}.vm.${take(5).join('-')}`);
    else if (kind === 'sort') {
      const two = shuffle(catNames, rand).slice(0, Math.min(3, catNames.length));
      const per = two.length === 2 ? 3 : 2;
      const ids = two.flatMap((c) => shuffle(cats[c], rand).slice(0, per).map((x) => x.i));
      steps.push(`${p.id}.vt.${shuffle(ids, rand).join('-')}`);
    } else if (kind === 'vs') {
      // spelling: prefer single words without spaces/punctuation
      let i = take(1)[0], guard = 0;
      while (/[^a-zA-Z-]/.test(p.vocab[i].word) && guard++ < pool.length) i = take(1)[0];
      steps.push(`${p.id}.vs.${i}`);
    } else steps.push(`${p.id}.vc.${take(1)[0]}`);
  }
  return steps;
}

/** Pick n item indexes, cycling through item types so we get variety. */
function variedItems(items, n, rand) {
  const byType = groupBy(shuffle(items.map((it, i) => ({ it, i })), rand), (x) => x.it.type);
  const types = shuffle(Object.keys(byType), rand);
  const out = [];
  while (out.length < Math.min(n, items.length)) {
    let added = false;
    for (const t of types) { if (out.length >= n) break; const x = byType[t].shift(); if (x) { out.push(x.i); added = true; } }
    if (!added) break;
  }
  return out;
}

/** Re-order so the same item type rarely appears twice in a row. */
function interleave(refs, rand) { return shuffle(refs, rand); }

/** Split n into k near-equal integer parts (random remainder placement). */
export function spread(n, k, rand = Math.random) {
  if (k <= 0) return [];
  const base = Math.floor(n / k), extra = n - base * k;
  const parts = Array(k).fill(base);
  shuffle([...Array(k).keys()], rand).slice(0, extra).forEach((i) => parts[i]++);
  return parts;
}
function groupBy(arr, fn) { return arr.reduce((m, x) => ((m[fn(x)] ||= []).push(x), m), {}); }

/** Suggest a different ref of the same kind (for the builder's "swap" button). */
export function alternative(ref, packs, exclude) {
  const [u, part] = ref.split('.');
  const p = packs[u];
  if (!p) return null;
  const rand = Math.random;
  let candidates = [];
  if (/^g\d+$/.test(part)) candidates = p.grammar.find((g) => g.id === part).items.map((_, i) => `${u}.${part}.${i}`);
  else if (part === 'w') candidates = p.wordWork.items.map((_, i) => `${u}.w.${i}`);
  else if (/^r\d+$/.test(part)) candidates = p.reading.map((r) => `${u}.${r.id}`);
  else if (part === 'wr') candidates = p.writing.map((_, i) => `${u}.wr.${i}`);
  else if (part === 'sp') candidates = p.speaking.map((_, i) => `${u}.sp.${i}`);
  else if (part === 'c') candidates = p.custom.map((c) => `${u}.c.${c.id}`);
  else if (['vc', 'vs'].includes(part)) candidates = p.vocab.map((_, i) => `${u}.${part}.${i}`);
  else if (['vm', 'vf', 'vt'].includes(part)) return vocabSteps(p, part === 'vm' ? 1 : part === 'vt' ? 2 : 1, rand).find((r) => r.includes(`.${part}.`)) || (part === 'vf' ? `${u}.vf.${shuffle(p.vocab.map((_, i) => i)).slice(0, 8).join('-')}` : null);
  const pool = candidates.filter((c) => !exclude.has(c));
  return pool.length ? pick1(pool) : null;
}
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
