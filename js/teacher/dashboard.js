// Homework: everything sent, results that came back, answer review and writing marks.
import { h, store, fmtDate, fmtTime, download, escapeCsv, toast, uid } from '../util.js';
import { packsFor, resolve, describe, kindLabel } from '../content.js';
import { connected, fetchAll, saveMark, deleteHomework } from '../api.js';
import { getStudents, getStudent, getHomeworks, getResults, newStudent, saveResult, decodeResult, hwStatus, statusBadge } from '../students.js';
import { shareBox } from './builder.js';

const pctClass = (p) => (p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo');

/** Pull results from the optional Google Sheet into local storage. */
async function syncRemote() {
  if (!connected()) return '';
  try {
    const d = await fetchAll();
    let n = 0;
    for (const r of d.results) if (saveResult({ ...r, studentId: r.studentId || matchStudent(r.student)?.id || '' })) n++;
    return n ? `${n} new result(s) from Google Sheets` : '';
  } catch (e) { return `Google Sheets: ${e.message}`; }
}
const matchStudent = (name) => getStudents().find((s) => s.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());

export async function dashboardView(root, hwId) {
  if (hwId) return detail(root, hwId);
  const note = await syncRemote();
  const students = getStudents();
  const results = getResults();
  const filter = store.get('hwFilter', '');
  const list = getHomeworks().filter((hw) => hw.id !== 'preview' && (!filter || hw.studentId === filter));
  // results whose homework isn't in the list (e.g. made on another device)
  const known = new Set(getHomeworks().map((x) => x.id));
  const orphans = results.filter((r) => !known.has(r.homeworkId) && (!filter || r.studentId === filter));
  const paste = h('input', { type: 'text', placeholder: 'Paste the student’s message or result link here' });
  const importPasted = async () => {
    const m = paste.value.match(/#\/r\/([A-Za-z0-9_-]+)/);
    if (!m) return toast('No result link found in that text', 'bad');
    try { await decodeResult(m[1]); location.hash = `#/r/${m[1]}`; } catch { toast('That result link is incomplete. Ask the student to copy it again', 'bad'); }
  };

  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'hello' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Homework'), h('h1', null, 'Missions & results')),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/t/build' }, '＋ New homework'),
        results.length ? h('button', { class: 'btn', onclick: () => exportAll() }, '⬇ Export') : null)),
    note ? h('div', { class: 'notice info', style: { margin: '10px 0' } }, note) : null,
    h('div', { class: 'card', style: { margin: '18px 0' } },
      h('h3', null, '📥 Got a result in the chat?'),
      h('p', { class: 'muted small' }, 'Usually you just click the link your student sends. If that doesn’t open this app, paste their message here.'),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, paste, h('button', { class: 'btn primary', onclick: importPasted }, 'Add result'))),
    students.length ? h('div', { class: 'tabs', style: { marginBottom: '14px' } },
      h('button', { class: 'tab' + (!filter ? ' on' : ''), onclick: () => { store.set('hwFilter', ''); dashboardView(root); } }, 'All'),
      students.map((s) => h('button', { class: 'tab' + (filter === s.id ? ' on' : ''), onclick: () => { store.set('hwFilter', s.id); dashboardView(root); } }, `${s.emoji} ${s.name}`))) : null,
    list.length || orphans.length
      ? h('div', { class: 'timeline' },
        list.map((hw) => {
          const rs = results.filter((r) => r.homeworkId === hw.id).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
          const st = hw.studentId && getStudent(hw.studentId);
          const r = rs[0];
          return h('a', { class: 'tl', href: `#/t/homework/${encodeURIComponent(hw.id)}` },
            h('span', { class: 'ic' }, st ? st.emoji : '🌐'),
            h('div', { style: { minWidth: 0 } }, h('div', { class: 't' }, hw.title),
              h('div', { class: 'muted small' }, [st ? st.name : 'Any student', `sent ${fmtDate(hw.created)}`, rs.length > 1 && `${rs.length} attempts`].filter(Boolean).join(' · '))),
            statusBadge(hwStatus(hw, results), h));
        }),
        orphans.map((r) => h('a', { class: 'tl', href: `#/t/homework/${encodeURIComponent(r.homeworkId)}` },
          h('span', { class: 'ic' }, getStudent(r.studentId)?.emoji || '🎒'),
          h('div', null, h('div', { class: 't' }, r.homeworkTitle), h('div', { class: 'muted small' }, `${r.student} · ${fmtDate(r.submittedAt)}`)),
          h('span', { class: `score-chip ${pctClass(r.percent)}` }, `${Math.round(r.percent)}%`))))
      : h('div', { class: 'card empty' }, h('span', { class: 'big-emoji' }, '🛰️'), h('p', null, 'No homework yet.'),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn primary', href: '#/t/build' }, 'Build the first mission'),
          h('button', { class: 'btn', onclick: () => { demoData(); dashboardView(root); } }, '🧪 Try with demo data')))));
}

async function detail(root, hwId) {
  const hw = getHomeworks().find((x) => x.id === hwId);
  const rs = getResults().filter((r) => r.homeworkId === hwId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const refs = hw?.refs || rs[0]?.refs || [];
  let packs = {};
  try { packs = await packsFor(refs); } catch { /* content missing */ }
  const st = (hw?.studentId && getStudent(hw.studentId)) || (rs[0]?.studentId && getStudent(rs[0].studentId));
  const shareHost = h('div');
  const title = hw?.title || rs[0]?.homeworkTitle || 'Homework';

  root.replaceChildren(h('div', { class: 'page' },
    h('a', { href: st ? `#/t/s/${st.id}` : '#/t/homework', class: 'small' }, st ? `← ${st.name}` : '← Homework'),
    h('div', { class: 'hello', style: { marginTop: '10px' } },
      h('div', null, h('p', { class: 'eyebrow' }, st ? `${st.emoji} ${st.name}` : 'Homework'), h('h1', null, title),
        h('p', { class: 'muted', style: { margin: 0 } }, [hw && `sent ${fmtDate(hw.created)}`, `${refs.length} tasks`].filter(Boolean).join(' · '))),
      h('div', { class: 'row' },
        hw?.link ? h('button', { class: 'btn', onclick: () => shareBox(shareHost, hw) }, '📋 Send again') : null,
        rs.length ? h('button', { class: 'btn', onclick: () => print() }, '🖨 Print') : null,
        hw ? h('button', { class: 'btn ghost', onclick: async () => { if (confirm('Delete this homework from your list? Results already received stay in the student’s progress.')) { await deleteHomework(hw.id).catch(() => {}); location.hash = '#/t/homework'; } } }, 'Delete') : null)),
    shareHost,
    rs.length ? null : h('div', { class: 'card empty', style: { marginTop: '18px' } }, h('span', { class: 'big-emoji' }, '⏳'), h('p', null, 'No result yet.'), h('p', { class: 'small' }, 'When your student finishes, they paste a result link in the chat. Click it and it appears here.')),
    rs.map((r, k) => attempt(r, k, rs.length, packs))));
}

function attempt(r, k, n, packs) {
  const rows = (r.details || []).filter((d) => !/\.q\d+$/.test(d.r));
  const mark = h('input', { type: 'text', value: r.mark ?? '', placeholder: 'e.g. 8/10', style: { maxWidth: '120px' } });
  const comment = h('input', { type: 'text', value: r.comment ?? '', placeholder: 'Comment for yourself (optional)' });
  return h('div', { class: 'card', style: { marginTop: '18px' } },
    h('div', { class: 'row between' },
      h('h3', { style: { margin: 0 } }, n > 1 ? `Attempt ${n - k} · ${fmtDate(r.submittedAt)}` : `Result · ${fmtDate(r.submittedAt)}`),
      h('div', { class: 'row' }, h('span', { class: `score-chip ${pctClass(r.percent)}` }, `${Math.round(r.percent)}%`),
        r.retryPercent > r.percent ? h('span', { class: 'badge good' }, `${Math.round(r.retryPercent)}% after retry`) : null,
        h('span', { class: 'badge' }, `⏱ ${fmtTime(r.timeSec)}`))),
    h('div', { class: 'table-wrap', style: { marginTop: '12px' } }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Task'), h('th', null, 'Their answer'), h('th', null, 'Retry'))),
      h('tbody', null, rows.map((d) => {
        const step = resolve(d.r, packs);
        const subs = (r.details || []).filter((x) => x.r.startsWith(d.r + '.q'));
        return h('tr', null,
          h('td', null, d.s == null ? '•' : d.s >= 1 ? '✅' : d.s > 0 ? '🟡' : '❌'),
          h('td', null, h('span', { class: 'badge', style: { marginRight: '6px' } }, step ? kindLabel(step.kind) : ''), step ? describe(step) : d.r,
            subs.length ? h('div', { class: 'muted small' }, `Questions: ${subs.map((x) => (x.s ? '✓' : '✗')).join(' ')}`) : null),
          h('td', { class: d.s != null && d.s < 1 ? '' : 'muted' }, d.s != null && d.s < 1 ? h('span', { style: { color: 'var(--bad)' } }, d.g || '') : d.s == null ? '' : 'correct'),
          h('td', { class: 'muted small' }, d.rs != null ? (d.rs >= 1 ? 'fixed ✓' : 'still wrong') : ''));
      })))),
    (r.writing || []).length ? h('div', { style: { marginTop: '16px' } }, h('h3', null, '✍️ Writing'),
      r.writing.map((w) => [h('div', { class: 'muted small' }, w.prompt), h('div', { class: 'writing-ans' }, w.text), h('div', { class: 'muted small' }, `${(w.text.match(/\S+/g) || []).length} words`)]),
      h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'nowrap' } }, mark, comment,
        h('button', { class: 'btn small primary', onclick: async () => {
          const all = getResults(); const x = all.find((y) => y.submissionId === r.submissionId);
          if (x) { x.mark = mark.value.trim(); x.comment = comment.value.trim(); store.set('localResults', all); }
          saveMark(r.submissionId, mark.value.trim(), comment.value.trim()).catch(() => {});
          toast('Mark saved', 'good');
        } }, 'Save mark'))) : null);
}

function exportAll() {
  const head = ['Student', 'Homework', 'Score %', 'After retry %', 'Time (s)', 'Submitted', 'Writing mark'];
  const csv = [head, ...getResults().map((r) => [getStudent(r.studentId)?.name || r.student, r.homeworkTitle, Math.round(r.percent), r.retryPercent ?? '', r.timeSec, r.submittedAt, r.mark ?? ''])].map((x) => x.map(escapeCsv).join(',')).join('\n');
  download('homework-results.csv', '﻿' + csv);
}

/** A demo student with two finished homeworks so the tutor can see how everything looks. */
function demoData() {
  const st = newStudent({ name: 'Sara (demo)', emoji: '🦊', level: 'Grade 6', goal: 'Speak confidently in class' });
  const mk = (title, refs, skill, daysAgo) => {
    const hw = { id: 'demo' + uid(4), title, studentId: st.id, studentName: st.name, due: '', created: new Date(Date.now() - (daysAgo + 2) * 864e5).toISOString(), refs, units: [refs[0].split('.')[0]], link: '' };
    store.set('homeworks', [hw, ...getHomeworks()]);
    const details = refs.filter((r) => !r.includes('.wr.')).map((r) => ({ r, s: Math.random() < skill + (r.includes('.g2.') ? -0.25 : 0.05) ? 1 : 0, g: 'demo answer' }));
    const sc = details.filter((d) => !/\.q\d/.test(d.r));
    const percent = Math.round((sc.reduce((a, d) => a + d.s, 0) / sc.length) * 100);
    saveResult({ submissionId: uid(10), homeworkId: hw.id, homeworkTitle: title, studentId: st.id, student: st.name, percent, retryPercent: Math.min(100, percent + 12), total: sc.length, timeSec: 640, submittedAt: new Date(Date.now() - daysAgo * 864e5).toISOString(), details, refs,
      writing: refs.some((r) => r.includes('.wr.')) ? [{ r: refs.find((x) => x.includes('.wr.')), prompt: 'Write about an animal environment.', text: 'The desert is where camels live. It is hot and dry. Camels are seen in the desert every day.' }] : [] });
  };
  mk('Unit 1: Living Things · Quick check', ['tg3:u1.vm.0-1-2-3-4', 'tg3:u1.vc.5', 'tg3:u1.g1.0', 'tg3:u1.g1.1', 'tg3:u1.g1.2', 'tg3:u1.g2.0', 'tg3:u1.g2.1', 'tg3:u1.g2.2', 'tg3:u1.wr.0'], 0.8, 6);
  mk('Unit 2: Lifestyles · Grammar focus', ['tg3:u2.g1.0', 'tg3:u2.g1.1', 'tg3:u2.g1.2', 'tg3:u2.g1.3', 'tg3:u2.g2.0', 'tg3:u2.g2.1', 'tg3:u2.g2.2', 'tg3:u2.vs.3'], 0.6, 1);
  toast('Demo student “Sara (demo)” added. Remove her any time from her page', 'good');
}
