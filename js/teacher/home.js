// Tutor studio home: students first, then homework waiting for results, then the library.
import { h, fmtDate, store } from '../util.js';
import { loadAll, loadCourses } from '../content.js';
import { settings } from '../api.js';
import { getStudents, resultsFor, homeworksFor, mastery, getHomeworks, getResults, hwStatus, statusBadge } from '../students.js';
import { studentForm } from './student.js';
import { backupDue, backupNow } from './settings.js';

export async function homeView(root) {
  const [units, courses] = await Promise.all([loadAll(), loadCourses()]);
  const s = settings();
  const students = getStudents();
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const results = getResults();
  const waiting = getHomeworks().filter((hw) => hw.studentId && !results.some((r) => r.homeworkId === hw.id))
    .map((hw) => ({ hw, st: hwStatus(hw, results) })).sort((a, b) => b.st.days - a.st.days).slice(0, 8);

  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'hello' },
      h('div', null, h('p', { class: 'eyebrow' }, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })),
        h('h1', null, `${hello}${s.teacher ? ', ' + s.teacher.split(' ')[0] : ''}`),
        h('p', { class: 'lead', style: { margin: 0 } }, students.length ? `${students.length} student${students.length > 1 ? 's' : ''} in your studio.` : 'Add your first student to start tracking lessons and homework.')),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/t/build' }, '＋ New homework'))),

    backupDue() ? h('div', { class: 'notice row between', style: { marginTop: '16px' } },
      h('span', null, '💾 Your studio is only saved in this browser. ', h('b', null, store.get('lastBackup') ? 'It’s been over a week since your last backup.' : 'You haven’t made a backup yet.')),
      h('button', { class: 'btn small primary', onclick: (e) => { backupNow(); e.currentTarget.closest('.notice').remove(); } }, '⬇ Download backup')) : null,
    h('div', { class: 'section-title' }, h('h2', null, 'Students')),
    h('div', { class: 'grid three' },
      students.map((st) => studentCard(st, units)),
      h('button', { class: 'card add-card', onclick: () => studentForm() }, h('div', null, h('div', { class: 'plus' }, '+'), h('div', null, 'Add a student')))),

    waiting.length ? [h('div', { class: 'section-title' }, h('h2', null, 'Waiting for results'), h('a', { href: '#/t/homework', class: 'small' }, 'All homework')),
      h('div', { class: 'card' }, h('div', { class: 'waiting' }, waiting.map(({ hw, st: status }) => {
        const st = students.find((x) => x.id === hw.studentId);
        return h('div', { class: 'w' }, h('span', { class: 'avatar', style: { width: '38px', height: '38px', fontSize: '1.2rem' } }, st ? st.emoji : '🎒'),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, hw.title), h('div', { class: 'muted small' }, `${st ? st.name : 'Student'} · sent ${fmtDate(hw.created)}`)),
          statusBadge(status, h));
      })), h('p', { class: 'muted small', style: { margin: '12px 0 0' } }, 'You’ll know a student has finished when their result message arrives in your Preply chat. Click the link in it and it moves from this list to their page.'))] : null,

    h('div', { class: 'section-title' }, h('h2', null, 'Library'), h('a', { href: '#/t/library', class: 'small' }, 'Open library')),
    courses.map((c) => h('a', { class: 'card link course-card', href: '#/t/library', style: { '--unit': c.color } },
      h('span', { class: 'planet lg' }, c.emoji),
      h('div', null, h('p', { class: 'eyebrow', style: { color: c.color } }, c.level), h('h3', { class: 'display', style: { fontSize: '1.2rem' } }, c.title), h('p', { class: 'muted small', style: { margin: '0 0 10px' } }, c.about),
        h('div', { class: 'mini-orbit' }, units.filter((u) => u.course.id === c.id).map((u) => h('span', { class: 'planet', title: u.label, style: { '--unit': u.color } }, u.emoji)))))),
  ));
}

function studentCard(st, units) {
  const res = resultsFor(st.id);
  const m = mastery(res);
  const hws = homeworksFor(st.id);
  const last = res[0];
  const overall = Object.values(m.unit).filter((x) => x.pct != null);
  const avg = overall.length ? Math.round((overall.reduce((a, x) => a + x.pct, 0) / overall.length) * 100) : null;
  const courseUnits = units.filter((u) => u.course.id === (st.course || 'tg3'));
  return h('div', { class: 'card student-card' },
    h('a', { href: `#/t/s/${st.id}`, class: 'top', style: { textDecoration: 'none', color: 'inherit' } },
      h('span', { class: 'avatar' }, st.emoji),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('h3', null, st.name), h('div', { class: 'meta' }, [st.level || 'Grade 6', st.goal].filter(Boolean).join(' · '))),
      avg != null ? h('span', { class: `score-chip ${avg >= 75 ? 'hi' : avg >= 50 ? 'mid' : 'lo'}`, title: 'Average mastery' }, `${avg}%`) : null),
    h('div', { class: 'mini-orbit', 'aria-label': 'Unit mastery' }, courseUnits.map((u) => {
      const x = m.unit[u.id];
      return h('span', { class: 'planet ring' + (x ? '' : ' dim'), title: `${u.label}${x ? `: ${Math.round(x.pct * 100)}%` : ''}`, style: { '--unit': u.color, '--p': x ? Math.round(x.pct * 100) : 0 } }, u.emoji);
    })),
    h('div', { class: 'meta' }, last ? `Last homework: ${last.homeworkTitle} · ${Math.round(last.percent)}% · ${fmtDate(last.submittedAt)}` : hws.length ? `${hws.length} homework sent, no results yet` : 'No homework yet'),
    h('div', { class: 'row' },
      h('a', { class: 'btn small primary', href: `#/t/s/${st.id}` }, 'Open'),
      h('a', { class: 'btn small', href: `#/t/build//${st.id}` }, '＋ Homework')));
}
