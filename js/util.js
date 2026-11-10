// Small shared helpers: DOM building, seeded randomness, answer checking, storage, UI feedback.

/** h('div', {class:'x', onclick: fn}, child, 'text', [more]) → HTMLElement */
export function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) node.style.setProperty(p, val); else node.style[p] = val; }
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  append(node, kids);
  return node;
}
function append(node, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(node, k);
    else node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

// ---------- randomness ----------
export function hashStr(s) {
  let h1 = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 3432918353); h1 = (h1 << 13) | (h1 >>> 19); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 = Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^= h1 >>> 16) >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hashStr(String(seed));
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
export const uid = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// ---------- answer checking ----------
const CONTRACTIONS = [
  // contractions typed without the apostrophe (very common for young learners)
  [/\b(is|are|was|were|has|have|had|do|does|did|could|should|would|must)nt\b/g, "$1n't"], [/\bcant\b/g, "can't"], [/\bwont\b/g, "won't"], [/\bim\b/g, "i'm"],
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'], [/'re\b/g, ' are'], [/'ve\b/g, ' have'], [/'ll\b/g, ' will'], [/\bi'm\b/g, 'i am'], [/'d\b/g, ' would'],
];
/** Canonical form for comparing typed answers: case, quotes, spaces, commas, final punctuation, contractions. */
export function norm(s) {
  let t = String(s ?? '').toLowerCase().normalize('NFKC').replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t.replace(/[,;:"]/g, ' ').replace(/\s+([.?!])/g, '$1').replace(/[.?!]+\s*$/, '').replace(/\s+/g, ' ').trim();
}
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** → 'right' | 'almost' (small typo) | 'wrong' */
export function check(given, accepted) {
  const g = norm(given);
  const list = (Array.isArray(accepted) ? accepted : [accepted]).map(norm);
  if (!g) return 'wrong';
  if (list.includes(g)) return 'right';
  // a missing/extra ending (leave/leaves, walk/walked) is a grammar mistake, not a typo
  if (list.some((a) => a.startsWith(g) || g.startsWith(a))) return 'wrong';
  const best = Math.min(...list.map((a) => levenshtein(g, a)));
  const len = Math.min(...list.map((a) => a.length));
  if (len >= 4 && best === 1) return 'almost';
  if (len >= 14 && best === 2) return 'almost';
  return 'wrong';
}
export const first = (a) => (Array.isArray(a) ? a[0] : a);

// ---------- storage (never throws) ----------
export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem('ta.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem('ta.' + key, JSON.stringify(val)); } catch { /* private mode */ } },
  del(key) { try { localStorage.removeItem('ta.' + key); } catch { /* ignore */ } },
};

// ---------- base64url JSON (for homework links) ----------
export function encodeObj(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeObj(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

// ---------- feedback ----------
export function toast(msg, kind = '') {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(wrap); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}
export function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas', { class: 'confetti' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  const W = (c.width = innerWidth), H = (c.height = innerHeight);
  const colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8', '#ff922b'];
  const parts = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: pick(colors), a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (++frame < 160) requestAnimationFrame(tick); else c.remove();
  })();
}
export function fmtDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? '' : x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function fmtTime(sec) {
  sec = Math.round(sec || 0);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}
export function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
export function escapeCsv(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
