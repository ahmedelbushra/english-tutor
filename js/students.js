// Students (one-on-one learners), their results, notes and mastery. All stored in the tutor's browser.
import { store, uid } from './util.js';

export const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐨', '🐸', '🦉', '🐬', '🦄', '🐙', '🦋', '🐢', '🐧', '🦖', '🚀', '🌟', '⚡', '🌙'];
export const SKILLS = [
  ['vocab', 'Vocabulary', '🔤'], ['grammar', 'Grammar', '🧩'], ['reading', 'Reading', '📖'], ['writing', 'Writing', '✍️'],
];

// ---------- students ----------
export const getStudents = () => store.get('students', []).filter((s) => !s.archived);
export const getStudent = (id) => store.get('students', []).find((s) => s.id === id) || null;
export function saveStudent(s) {
  const all = store.get('students', []);
  const i = all.findIndex((x) => x.id === s.id);
  if (i === -1) all.push(s); else all[i] = s;
  store.set('students', all);
  return s;
}
export function newStudent(data) {
  return saveStudent({ id: uid(6), created: new Date().toISOString(), course: 'tg3', notes: [], stars: 0, emoji: AVATARS[Math.floor(Math.random() * AVATARS.length)], ...data });
}
export function addNote(studentId, text, unit) {
  const s = getStudent(studentId); if (!s || !text.trim()) return;
  s.notes = [{ id: uid(5), at: new Date().toISOString(), text: text.trim(), unit: unit || '' }, ...(s.notes || [])];
  saveStudent(s);
}

// ---------- results ----------
export const getResults = () => store.get('localResults', []);
export function resultsFor(studentId) {
  const s = getStudent(studentId);
  const nameKey = s ? s.name.trim().toLowerCase() : null;
  return getResults().filter((r) => r.studentId === studentId || (!r.studentId && nameKey && String(r.student).trim().toLowerCase() === nameKey))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}
/** Save an imported result; returns false if it was already saved. */
export function saveResult(rec) {
  const all = getResults();
  if (all.some((r) => r.submissionId === rec.submissionId)) return false;
  all.push(rec); store.set('localResults', all.slice(-2000));
  return true;
}
export const getHomeworks = () => store.get('homeworks', []);
export const homeworksFor = (studentId) => getHomeworks().filter((h) => h.studentId === studentId);

/** Which skill a ref belongs to (from the ref itself, no content needed). */
export function skillOf(ref) {
  const part = ref.split('.')[1] || '';
  if (/^v[fmtcs]$/.test(part)) return 'vocab';
  if (/^r\d+$/.test(part)) return 'reading';
  if (part === 'sp') return 'speaking';
  if (part === 'wr') return 'writing';
  return 'grammar'; // g1, g2, w (word work), c (teacher questions)
}
export const unitOf = (ref) => ref.split('.')[0];

/**
 * Mastery per unit and per skill from a list of results (newest first).
 * Uses each question's most recent score; reading sub-questions count individually.
 */
export function mastery(results) {
  const latest = new Map();
  for (const r of results) for (const d of r.details || []) {
    if (d.s == null || latest.has(d.r)) continue;
    if (/\.r\d+$/.test(d.r) && (r.details || []).some((x) => x.r.startsWith(d.r + '.q'))) continue; // use sub-questions instead
    latest.set(d.r, Number(d.s));
  }
  const byUnit = {}, bySkill = {};
  for (const [ref, s] of latest) {
    const u = normUnit(unitOf(ref)), k = skillOf(ref);
    (byUnit[u] ||= []).push(s); (bySkill[k] ||= []).push(s);
  }
  // writing marks typed by the tutor ("8/10", "80%", "8")
  for (const r of results) {
    const m = parseMark(r.mark);
    if (m != null) (bySkill.writing ||= []).push(m);
  }
  const avg = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    unit: Object.fromEntries(Object.entries(byUnit).map(([k, v]) => [k, { pct: avg(v), n: v.length }])),
    skill: Object.fromEntries(SKILLS.map(([k]) => [k, { pct: avg(bySkill[k]), n: (bySkill[k] || []).length }])),
    answered: latest.size,
  };
}
export const normUnit = (u) => (u.includes(':') ? u : `tg3:${u}`);
export function parseMark(m) {
  if (m == null || m === '') return null;
  const s = String(m).trim();
  let x = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (x) return Math.max(0, Math.min(1, Number(x[1]) / Number(x[2])));
  x = s.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (x) { const n = Number(x[1]); return Math.max(0, Math.min(1, n > 10 ? n / 100 : n / 10)); }
  return null;
}

// ---------- result links (student → tutor via the Preply chat) ----------
async function deflate(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
const b64u = (bytes) => { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Compact, compressed code: "z" + deflate(JSON), or "j" + plain JSON where compression is missing. */
export async function encodeResult(obj) {
  const json = JSON.stringify(obj);
  const z = await deflate(json).catch(() => null);
  return z ? 'z' + b64u(z) : 'j' + b64u(new TextEncoder().encode(json));
}
export async function decodeResult(code) {
  const bytes = unb64u(code.slice(1));
  const text = code[0] === 'z' ? await inflate(bytes) : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

/** Status of a homework: done (with its latest result) or waiting (with days since it was sent). No deadlines. */
export function hwStatus(hw, results = getResults()) {
  const rs = results.filter((r) => r.homeworkId === hw.id).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  if (rs.length) return { kind: 'done', result: rs[0], attempts: rs.length };
  return { kind: 'waiting', days: Math.floor((Date.now() - new Date(hw.created)) / 864e5) };
}
export function statusBadge(st, h) {
  if (st.kind === 'done') { const p = Math.round(st.result.percent); return h('span', { class: `score-chip ${p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo'}` }, `✓ ${p}%`); }
  return h('span', { class: 'badge warn' }, st.days > 0 ? `⏳ waiting · ${st.days}d` : '⏳ waiting');
}
