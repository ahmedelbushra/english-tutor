// #/r/<code>: a result link a student pasted into the lesson chat. Opening it saves the result for the tutor.
import { h, toast, fmtTime } from '../util.js';
import { decodeResult, getStudents, getStudent, saveResult, newStudent, getHomeworks } from '../students.js';
import { store } from '../util.js';

export async function importView(root, code) {
  let r;
  try { r = await decodeResult(code); } catch {
    return root.replaceChildren(h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' }, h('div', { class: 'big-emoji-line' }, '🧩'), h('h2', null, 'This result link is incomplete'), h('p', { class: 'muted' }, 'Part of the link may be missing. Ask your student to copy the whole message again.'))));
  }
  const hw = getHomeworks().find((x) => x.id === r.homeworkId);
  let target = (r.studentId && getStudent(r.studentId)) || getStudents().find((s) => s.name.trim().toLowerCase() === String(r.student).trim().toLowerCase()) || null;
  const already = store.get('localResults', []).some((x) => x.submissionId === r.submissionId);
  const pick = h('select', null, h('option', { value: '' }, '➕ New student: ' + r.student), getStudents().map((s) => h('option', { value: s.id, selected: target && s.id === target.id }, `${s.emoji} ${s.name}`)));

  const save = () => {
    let s = pick.value ? getStudent(pick.value) : null;
    if (!s) s = newStudent({ name: r.student || 'New student' });
    const ok = saveResult({ ...r, studentId: s.id, homeworkTitle: r.homeworkTitle || hw?.title || 'Homework' });
    toast(ok ? `Saved to ${s.name}’s progress` : 'This result was already saved', ok ? 'good' : '');
    location.hash = `#/t/s/${s.id}`;
  };
  root.replaceChildren(h('div', { class: 'page narrow' }, h('div', { class: 'card glass stack center' },
    h('p', { class: 'eyebrow' }, 'Homework result'),
    h('div', { class: 'avatar xl' }, target ? target.emoji : '🎒'),
    h('h1', { class: 'display' }, r.student || 'Student'),
    h('p', { class: 'lead' }, r.homeworkTitle || hw?.title || ''),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('span', { class: `score-chip ${r.percent >= 75 ? 'hi' : r.percent >= 50 ? 'mid' : 'lo'}` }, `${Math.round(r.percent)}%`),
      r.retryPercent > r.percent ? h('span', { class: 'badge good' }, `${Math.round(r.retryPercent)}% after retry`) : null,
      h('span', { class: 'badge' }, `⏱ ${fmtTime(r.timeSec)}`),
      (r.writing || []).length ? h('span', { class: 'badge warn' }, '✍️ writing to mark') : null),
    already ? h('div', { class: 'notice info' }, 'You already saved this result.') : null,
    h('label', { class: 'field', style: { textAlign: 'left' } }, h('span', null, 'Save to'), pick),
    h('button', { class: 'btn primary big', onclick: save }, already ? 'Open student page' : '💾 Save result'))));
}
