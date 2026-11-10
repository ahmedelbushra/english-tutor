// Talks to the teacher's Google Apps Script web app (backend/Code.gs).
// Without a connection everything still works locally (results saved on this device only).
import { store, uid } from './util.js';

export const settings = () => ({ endpoint: '', key: '', teacher: '', school: '', ...(window.TA_CONFIG || {}), ...store.get('settings', {}) });
export const saveSettings = (s) => store.set('settings', { ...store.get('settings', {}), ...s });
export const connected = () => !!settings().endpoint;

async function post(url, body) {
  const opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) };
  try {
    const r = await fetch(url, opts);
    const j = await r.json();
    if (j && j.ok === false) throw new Error(j.error || 'Server refused');
    return j;
  } catch (e) {
    if (e.message && /refused|key/i.test(e.message)) throw e;
    // Some browsers block reading the redirect; send blind as a fallback.
    await fetch(url, { ...opts, mode: 'no-cors' });
    return { ok: true, blind: true };
  }
}
async function get(url, params) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${url}?${q}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// ---------- student side ----------
/** Submit a homework result. Always keeps a local copy; queues if offline. */
export async function submitResult(result, endpoint) {
  const rec = { ...result, submissionId: result.submissionId || uid(10), submittedAt: new Date().toISOString() };
  const mine = store.get('myResults', []);
  mine.push(rec); store.set('myResults', mine.slice(-50));
  const local = store.get('localResults', []);
  local.push(rec); store.set('localResults', local.slice(-500));
  if (!endpoint) return { ok: true, local: true };
  try {
    await post(endpoint, { action: 'submit', ...rec });
    return { ok: true };
  } catch {
    const box = store.get('outbox', []);
    box.push({ endpoint, rec }); store.set('outbox', box);
    return { ok: false, queued: true };
  }
}
export async function flushOutbox() {
  const box = store.get('outbox', []);
  if (!box.length || !navigator.onLine) return 0;
  const left = [];
  for (const x of box) { try { await post(x.endpoint, { action: 'submit', ...x.rec }); } catch { left.push(x); } }
  store.set('outbox', left);
  return box.length - left.length;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => flushOutbox());

// ---------- teacher side ----------
function need() {
  const s = settings();
  if (!s.endpoint) throw new Error('Not connected to Google Sheets yet (Settings).');
  if (!s.key) throw new Error('Teacher key missing (Settings).');
  return s;
}
export async function fetchAll() {
  const s = need();
  return get(s.endpoint, { action: 'all', key: s.key });
}
export async function saveHomework(hw) {
  const list = store.get('homeworks', []).filter((x) => x.id !== hw.id);
  list.unshift(hw); store.set('homeworks', list.slice(0, 200));
  if (connected()) { const s = settings(); if (s.key) await post(s.endpoint, { action: 'saveHomework', key: s.key, homework: hw }); }
}
export async function deleteHomework(id) {
  store.set('homeworks', store.get('homeworks', []).filter((x) => x.id !== id));
  if (connected()) { const s = settings(); if (s.key) await post(s.endpoint, { action: 'deleteHomework', key: s.key, id }); }
}
export async function saveMark(submissionId, mark, comment) {
  const marks = store.get('marks', {}); marks[submissionId] = { mark, comment }; store.set('marks', marks);
  if (connected()) { const s = settings(); if (s.key) await post(s.endpoint, { action: 'mark', key: s.key, submissionId, mark, comment }); }
}
export async function saveRemote(kind, data) {
  if (!connected()) return;
  const s = settings();
  if (s.key) await post(s.endpoint, { action: 'save', key: s.key, kind, data });
}
export async function testConnection(endpoint, key) {
  return get(endpoint, { action: 'ping', key });
}
