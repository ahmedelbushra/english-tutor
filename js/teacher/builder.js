// Homework builder: pick a student + units + skills → generated set → tweak → copy a message for the lesson chat.
import { h, store, uid, toast } from '../util.js';
import { loadAll, resolve, describe, kindLabel, isScored } from '../content.js';
import { generate, alternative, PRESETS } from '../generator.js';
import { saveHomework, settings } from '../api.js';
import { getStudents, getStudent, resultsFor, mastery, encodeResult } from '../students.js';

const COUNTERS = [
  ['vocab', '🔤 Vocabulary games', 0, 12], ['grammar', '🧩 Grammar questions', 0, 30], ['wordWork', '🔧 Word work', 0, 6],
  ['reading', '📖 Reading texts', 0, 3], ['writing', '✍️ Writing task', 0, 1],
];

export async function builderView(root, unitId, studentId) {
  root.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
  const students = getStudents();
  let student = (studentId && getStudent(studentId)) || null;
  const all = await loadAll(student?.course);
  const byId = Object.fromEntries(all.map((u) => [u.id, u]));
  const last = store.get('builderPrefs', {});
  // default unit: the requested one, else the student's least-mastered started unit, else last used
  let suggested = null;
  if (!unitId && student) {
    const m = mastery(resultsFor(student.id));
    suggested = all.filter((u) => m.unit[u.id]).sort((a, b) => m.unit[a.id].pct - m.unit[b.id].pct)[0]?.id || all.find((u) => u.unit === 1)?.id;
  }
  const state = {
    units: new Set(unitId && byId[unitId] ? [unitId] : suggested ? [suggested] : (last.units || []).filter((u) => byId[u])),
    grammar: null, // null = all points of chosen units
    preset: last.preset || 'full',
    counts: { ...PRESETS[last.preset || 'full'], ...(last.counts || {}) },
    bank: last.bank ?? true, retry: last.retry ?? true,
    refs: [], title: '',
  };
  if (!state.units.size) state.units.add(all[1]?.id || all[0].id);

  const left = h('div', { class: 'stack' });
  const right = h('div', { class: 'stack' });
  root.replaceChildren(h('div', { class: 'page' },
    h('p', { class: 'eyebrow' }, 'Homework'), h('h1', null, 'Build a homework mission'), h('p', { class: 'lead' }, 'Choose who it’s for, the units and the skills. Swap any question you don’t like, then copy the message into your lesson chat.'),
    h('div', { class: 'card', style: { margin: '18px 0' } }, h('h3', null, 'For'),
      h('div', { class: 'who-pick' },
        students.map((st) => h('button', { type: 'button', class: student?.id === st.id ? 'on' : '', onclick: () => { location.hash = `#/t/build/${[...state.units][0] ? encodeURIComponent([...state.units][0]) : ''}/${st.id}`; } }, h('span', { class: 'avatar' }, st.emoji), st.name)),
        h('button', { type: 'button', class: student ? '' : 'on', onclick: () => { location.hash = '#/t/build'; } }, h('span', { class: 'avatar' }, '🌐'), 'Any student'),
        !students.length ? h('span', { class: 'muted small' }, 'Tip: add students in the Studio to personalise homework and track their progress.') : null)),
    h('div', { class: 'builder' }, left, right)));

  const packs = () => [...state.units].map((u) => byId[u]);
  const packMap = () => Object.fromEntries(packs().map((p) => [p.id, p]));

  function paintLeft() {
    const gKeys = packs().flatMap((p) => p.grammar.map((g) => ({ key: `${p.id}.${g.id}`, p, g })));
    left.replaceChildren(
      h('div', { class: 'card' }, h('h3', null, 'Units'),
        h('div', { class: 'unit-pick' }, all.map((u) => h('label', { class: state.units.has(u.id) ? 'on' : '', style: { '--unit': u.color } },
          h('input', { type: 'checkbox', checked: state.units.has(u.id), onchange: (e) => { e.target.checked ? state.units.add(u.id) : state.units.delete(u.id); if (!state.units.size) state.units.add(u.id); state.grammar = null; paintLeft(); regenerate(); } }),
          h('span', null, u.emoji), h('span', null, u.unit === 0 || u.unit === 9 ? u.title : `${u.unit}. ${u.title}`))))),
      h('div', { class: 'card' }, h('h3', null, 'Grammar points'),
        h('div', { class: 'stack', style: { marginTop: '6px' } }, gKeys.map(({ key, p, g }) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !state.grammar || state.grammar.has(key), onchange: (e) => {
            state.grammar = state.grammar || new Set(gKeys.map((x) => x.key));
            e.target.checked ? state.grammar.add(key) : state.grammar.delete(key); regenerate();
          } }), h('span', null, g.title, ' ', h('span', { class: 'muted small' }, `(${p.unit === 0 || p.unit === 9 ? p.title : 'U' + p.unit}, ${g.items.length})`)))))),
      h('div', { class: 'card' }, h('h3', null, 'What to practise'),
        h('div', { class: 'tabs', style: { margin: '8px 0 10px' } }, Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'tab' + (state.preset === k ? ' on' : ''), title: p.note, onclick: () => { state.preset = k; state.counts = { ...p }; paintLeft(); regenerate(); } }, p.label))),
        COUNTERS.map(([k, label, min, max]) => h('div', { class: 'counter' }, h('span', { style: { fontWeight: 700 } }, label),
          h('div', { class: 'ctl' }, h('button', { class: 'btn icon small', 'aria-label': 'less', onclick: () => { state.counts[k] = Math.max(min, (state.counts[k] || 0) - 1); state.preset = ''; paintLeft(); regenerate(); } }, '−'),
            h('b', null, state.counts[k] || 0),
            h('button', { class: 'btn icon small', 'aria-label': 'more', onclick: () => { state.counts[k] = Math.min(max, (state.counts[k] || 0) + 1); state.preset = ''; paintLeft(); regenerate(); } }, '+')))),
        h('div', { class: 'stack', style: { marginTop: '10px' } },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!state.counts.flash, onchange: (e) => { state.counts.flash = e.target.checked; regenerate(); } }), 'Start with vocabulary flashcards'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.bank, onchange: (e) => { state.bank = e.target.checked; } }), 'Easier gap-fills (word bank instead of typing)'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.retry, onchange: (e) => { state.retry = e.target.checked; } }), '“Try again” round for wrong answers'))),
    );
  }

  function regenerate() {
    state.refs = generate({ packs: packs(), grammarIds: state.grammar, counts: state.counts, seed: uid() });
    if (!state.titleTouched) state.title = autoTitle();
    paintRight();
  }
  const autoTitle = () => {
    const ps = packs();
    return ps.length === 1 ? `${ps[0].unit === 0 || ps[0].unit === 9 ? ps[0].title : `Unit ${ps[0].unit}: ${ps[0].title}`}` + (state.preset ? ` · ${PRESETS[state.preset].label}` : '') : `Review: Units ${ps.map((p) => p.unit).join(', ')}`;
  };

  function paintRight() {
    const pm = packMap();
    const steps = state.refs.map((r) => resolve(r, pm));
    const scored = steps.filter((s) => s && isScored(s.kind)).length;
    const title = h('input', { type: 'text', value: state.title, oninput: (e) => { state.title = e.target.value; state.titleTouched = true; } });
    right.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, `Questions (${steps.length})`),
          h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${scored} auto-marked · ~${Math.max(5, Math.round(steps.length * 1.1))} min`),
            h('button', { class: 'btn small', onclick: regenerate }, '🎲 New mix'))),
        steps.length ? h('div', { class: 'step-list', style: { marginTop: '12px' } }, steps.map((s, i) => stepRow(s, i))) : h('div', { class: 'empty' }, 'Choose at least one skill on the left.')),
      h('div', { class: 'card stack' }, h('h3', null, 'Details'),
        h('label', { class: 'field' }, h('span', null, 'Title the student sees'), title),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => { const w = window.open('', '_blank'); const url = await link(true); if (w) w.location = url; else location.href = url; } }, '👀 Preview'),
          h('button', { class: 'btn primary big', onclick: create, disabled: !steps.length }, student ? `✨ Create ${student.name.split(' ')[0]}’s homework` : '✨ Create homework'))),
      h('div', { id: 'share' }));
  }

  function stepRow(s, i) {
    if (!s) return h('div', { class: 'step-row' }, 'Missing question');
    const move = (d) => { const j = i + d; if (j < 0 || j >= state.refs.length) return; [state.refs[i], state.refs[j]] = [state.refs[j], state.refs[i]]; paintRight(); };
    return h('div', { class: 'step-row', style: { '--unit': s.unit.color } },
      h('span', { class: 'n' }, i + 1),
      h('div', { class: 'txt' }, h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'badge' }, kindLabel(s.kind)), h('span', { class: 'muted small' }, s.section)), h('div', { class: 'd', title: describe(s) }, describe(s))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn icon small ghost move', title: 'Move up', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'btn icon small ghost move', title: 'Move down', onclick: () => move(1) }, '↓'),
        h('button', { class: 'btn icon small ghost', title: 'Swap for another question', onclick: () => { const alt = alternative(s.ref, packMap(), new Set(state.refs)); if (alt) { state.refs[i] = alt; paintRight(); } else toast('No other question of this kind'); } }, '🔄'),
        h('button', { class: 'btn icon small ghost', title: 'Remove', onclick: () => { state.refs.splice(i, 1); paintRight(); } }, '✕')));
  }

  function config(preview) {
    const pm = packMap();
    const x = {};
    for (const r of state.refs) if (r.includes('.c.')) { const s = resolve(r, pm); if (s) x[r.split('.')[2]] = s.item; }
    return {
      v: 1, id: preview ? 'preview' : (state.id ||= uid(8)), t: state.title.trim() || autoTitle(), s: student?.id, n: student?.name,
      e: preview ? undefined : settings().endpoint || undefined, i: state.refs, x: Object.keys(x).length ? x : undefined, o: { bank: state.bank ? 1 : 0, retry: state.retry ? 1 : 0 },
    };
  }
  const base = () => location.href.split('#')[0];
  // compressed (deflate) so the link pasted in the chat stays short
  const link = async (preview) => `${base()}#/hw/${await encodeResult(config(preview))}`;

  async function create() {
    state.id = uid(8);
    const cfg = config(false);
    const url = await link(false);
    store.set('builderPrefs', { units: [...state.units], preset: state.preset, counts: state.counts, bank: state.bank, retry: state.retry });
    const hw = { id: cfg.id, title: cfg.t, studentId: student?.id || '', studentName: student?.name || '', created: new Date().toISOString(), refs: cfg.i, units: [...state.units], link: url };
    try { await saveHomework(hw); } catch (e) { toast('Saved here, but not to Google Sheets: ' + e.message, 'bad'); }
    shareBox(document.getElementById('share'), hw);
    document.getElementById('share').scrollIntoView({ behavior: 'smooth' });
  }

  paintLeft();
  regenerate();
}

export function shareBox(host, hw) {
  const first = (hw.studentName || '').split(' ')[0];
  const msg = `${first ? `Hi ${first}! ` : ''}📚 Your English homework: ${hw.title}
👉 ${hw.link}

When you finish, tap “Copy my result” and paste it here in our chat 😊`;
  const qr = h('div', { class: 'qr' });
  host.replaceChildren(h('div', { class: 'card stack', style: { borderColor: 'color-mix(in srgb, var(--good) 50%, transparent)' } },
    h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, '✅ Ready to send'), hw.studentId ? h('a', { class: 'small', href: `#/t/s/${hw.studentId}` }, `Open ${first || 'student'}’s page`) : null),
    h('div', { class: 'share-box' },
      h('div', { class: 'stack' },
        h('div', { class: 'msg-preview' }, msg),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => copy(msg, 'Message copied. Paste it in the Preply chat') }, '📋 Copy message for the chat'),
          h('button', { class: 'btn', onclick: () => copy(hw.link, 'Link copied') }, '🔗 Copy link only'),
          h('a', { class: 'btn ghost', href: hw.link, target: '_blank', rel: 'noopener' }, '👀 Open')),
        h('p', { class: 'muted small', style: { margin: 0 } }, 'Paste the message into your Preply lesson chat. The student opens the link on any phone or computer; no account needed.')),
      h('div', { class: 'center' }, qr, h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'or scan on a phone')))));
  makeQR(qr, hw.link);
}

async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg, 'good'); }
  catch { prompt('Copy this:', text); }
}

let qrLib;
function makeQR(el, text) {
  qrLib ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
  qrLib.then(() => { el.replaceChildren(); new window.QRCode(el, { text, width: 130, height: 130, correctLevel: window.QRCode.CorrectLevel.L }); })
    .catch(() => { el.replaceChildren('QR unavailable offline'); });
}

