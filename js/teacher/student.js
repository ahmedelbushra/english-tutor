// One student's page: progress orbit, skills, homework history, lesson notes.
import { h, fmtDate, toast } from '../util.js';
import { loadAll, loadCourses } from '../content.js';
import { getStudent, saveStudent, newStudent, addNote, resultsFor, homeworksFor, mastery, SKILLS, AVATARS, hwStatus, statusBadge } from '../students.js';

export async function studentView(root, id) {
  const st = getStudent(id);
  if (!st) return root.replaceChildren(h('div', { class: 'page narrow' }, h('div', { class: 'card empty' }, h('span', { class: 'big-emoji' }, '🔭'), h('p', null, 'This student isn’t in your studio on this device.'), h('a', { class: 'btn', href: '#/t' }, 'Back to studio'))));
  const units = (await loadAll(st.course)).filter(Boolean);
  const res = resultsFor(id);
  const m = mastery(res);
  const hws = homeworksFor(id);
  const unitById = Object.fromEntries(units.map((u) => [u.id, u]));
  const next = units.find((u) => !m.unit[u.id] && u.unit > 0) || units.find((u) => (m.unit[u.id]?.pct ?? 1) < 0.75) || units[1];

  // timeline: results + homework still waiting
  const items = [
    ...res.map((r) => ({ at: r.submittedAt, r })),
    ...hws.filter((hw) => !res.some((r) => r.homeworkId === hw.id)).map((hw) => ({ at: hw.created, hw })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const noteIn = h('textarea', { placeholder: 'What did you cover? What should you practise next time?', style: { minHeight: '90px' } });
  const noteUnit = h('select', null, h('option', { value: '' }, 'No unit'), units.map((u) => h('option', { value: u.id }, u.label)));

  root.replaceChildren(h('div', { class: 'page' },
    h('a', { href: '#/t', class: 'small' }, '← Studio'),
    h('div', { class: 'profile-head', style: { margin: '12px 0 22px' } },
      h('span', { class: 'avatar xl', style: { margin: 0 } }, st.emoji),
      h('div', { style: { flex: 1, minWidth: '200px' } },
        h('p', { class: 'eyebrow' }, [st.level || 'Grade 6', units[0]?.course.title].filter(Boolean).join(' · ')),
        h('h1', null, st.name),
        st.goal ? h('p', { class: 'lead', style: { margin: '4px 0 0' } }, '🎯 ', st.goal) : null),
      h('div', { class: 'row' },
        next ? h('a', { class: 'btn primary', href: `#/t/teach/${encodeURIComponent(next.id)}/${st.id}` }, `▶ Teach ${next.unit === 0 || next.unit === 9 ? next.title : 'Unit ' + next.unit}`) : null,
        res[0] ? h('a', { class: 'btn', href: `#/t/review/${encodeURIComponent(res[0].homeworkId)}/${res[0].submissionId}`, title: `Review “${res[0].homeworkTitle}” together` }, '🎓 Review last homework') : null,
        h('a', { class: 'btn', href: `#/t/build//${st.id}` }, '＋ Homework'),
        h('button', { class: 'btn ghost', onclick: () => studentForm(st) }, '✎ Edit'))),

    h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, 'Progress orbit'), h('span', { class: 'muted small' }, `${m.answered} questions answered`)),
          h('p', { class: 'muted small' }, 'The ring around each unit fills as your student gets questions right. Click a unit to teach it.'),
          h('div', { class: 'orbit' }, units.map((u) => {
            const x = m.unit[u.id];
            return h('a', { href: `#/t/teach/${encodeURIComponent(u.id)}/${st.id}`, style: { '--unit': u.color }, title: `Teach ${u.label}` },
              h('span', { class: 'planet ring' + (x ? '' : ' dim'), style: { '--p': x ? Math.round(x.pct * 100) : 0 } }, u.emoji),
              h('span', { class: 'nm' }, u.unit === 0 || u.unit === 9 ? u.title : `${u.unit}. ${u.title}`),
              h('span', { class: 'pc' }, x ? `${Math.round(x.pct * 100)}%` : 'not started'));
          }))),
        h('div', { class: 'card' }, h('h3', null, 'Homework'),
          items.length ? h('div', { class: 'timeline' }, items.map(({ r, hw }) => r
            ? h('a', { class: 'tl', href: `#/t/homework/${encodeURIComponent(r.homeworkId)}` },
              h('span', { class: 'ic' }, (r.writing || []).length && !r.mark ? '✍️' : '✅'),
              h('div', { style: { minWidth: 0 } }, h('div', { class: 't' }, r.homeworkTitle), h('div', { class: 'muted small' }, `${fmtDate(r.submittedAt)} · ${Math.round((r.timeSec || 0) / 60)} min${(r.writing || []).length ? (r.mark ? ` · writing ${r.mark}` : ' · writing to mark') : ''}`)),
              h('span', { class: `score-chip ${r.percent >= 75 ? 'hi' : r.percent >= 50 ? 'mid' : 'lo'}` }, `${Math.round(r.percent)}%`))
            : h('a', { class: 'tl', href: `#/t/homework/${encodeURIComponent(hw.id)}` },
              h('span', { class: 'ic' }, '⏳'),
              h('div', { style: { minWidth: 0 } }, h('div', { class: 't' }, hw.title), h('div', { class: 'muted small' }, `sent ${fmtDate(hw.created)}`)),
              statusBadge(hwStatus(hw), h))))
            : h('div', { class: 'empty' }, 'No homework yet. ', h('a', { href: `#/t/build//${st.id}` }, 'Make the first one')))),

      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', null, 'Skills'),
          SKILLS.map(([k, label, icon]) => {
            const x = m.skill[k];
            const p = x.pct == null ? null : Math.round(x.pct * 100);
            return h('div', { class: 'skill' }, h('span', null, icon),
              h('div', null, h('div', { class: 'nm' }, label), h('div', { class: 'bar' + (p == null ? '' : p < 50 ? ' bad' : p < 75 ? ' mid' : '') }, h('i', { style: { width: `${p ?? 0}%` } }))),
              h('span', { class: p == null ? 'muted small' : `pct ${p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo'}` }, p == null ? '–' : `${p}%`));
          }),
          weakest(m) ? h('div', { class: 'notice info small', style: { marginTop: '12px' } }, '💡 Focus next: ', h('b', null, weakest(m))) : null),
        h('div', { class: 'card stack' }, h('h3', null, 'Lesson notes'),
          noteIn, h('div', { class: 'row' }, noteUnit, h('button', { class: 'btn primary small', onclick: () => { if (!noteIn.value.trim()) return; addNote(st.id, noteIn.value, noteUnit.value); toast('Note saved', 'good'); studentView(root, id); } }, 'Save note')),
          (st.notes || []).length ? h('div', { class: 'stack' }, st.notes.slice(0, 20).map((n) => h('div', { class: 'note' },
            h('div', { class: 'when' }, fmtDate(n.at), n.unit && unitById[n.unit] ? ` · ${unitById[n.unit].label}` : ''), h('div', { style: { whiteSpace: 'pre-wrap' } }, n.text))))
            : h('p', { class: 'muted small', style: { margin: 0 } }, 'Notes you write here (or during a lesson) appear in this list.')))),
  ));
}

function weakest(m) {
  const list = SKILLS.map(([k, label]) => [label, m.skill[k]]).filter(([, x]) => x.pct != null && x.n >= 3).sort((a, b) => a[1].pct - b[1].pct);
  return list.length && list[0][1].pct < 0.8 ? `${list[0][0]} (${Math.round(list[0][1].pct * 100)}%)` : '';
}

/** Add / edit a student in a modal. */
export async function studentForm(st = null) {
  const courses = await loadCourses();
  let emoji = st?.emoji || AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const name = h('input', { type: 'text', value: st?.name || '', placeholder: 'e.g. Sara', maxlength: 60 });
  const level = h('input', { type: 'text', value: st?.level || 'Grade 6', placeholder: 'e.g. Grade 6' });
  const goal = h('input', { type: 'text', value: st?.goal || '', placeholder: 'e.g. Confident speaking, pass final exams' });
  const course = h('select', null, courses.map((c) => h('option', { value: c.id, selected: (st?.course || 'tg3') === c.id }, `${c.emoji} ${c.title} (${c.level})`)));
  const pick = h('div', { class: 'avatar-pick' });
  const paintPick = () => pick.replaceChildren(...AVATARS.map((a) => h('button', { type: 'button', class: a === emoji ? 'on' : '', 'aria-label': a, onclick: () => { emoji = a; paintPick(); } }, a)));
  paintPick();
  const close = () => modal.remove();
  const save = () => {
    if (!name.value.trim()) { name.classList.add('invalid'); name.focus(); return; }
    const data = { name: name.value.trim(), level: level.value.trim(), goal: goal.value.trim(), course: course.value, emoji };
    const saved = st ? saveStudent({ ...st, ...data }) : newStudent(data);
    close(); toast(st ? 'Student updated' : `${saved.name} added`, 'good');
    location.hash = `#/t/s/${saved.id}`;
    if (st) window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const modal = h('div', { class: 'modal', onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'modal-card stack', role: 'dialog', 'aria-label': st ? 'Edit student' : 'Add a student' },
      h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, st ? 'Edit student' : 'Add a student'), h('button', { class: 'btn icon ghost', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('label', { class: 'field' }, h('span', null, 'Name (students see this on their homework)'), name),
      h('div', { class: 'field' }, h('span', { style: { display: 'block', marginBottom: '6px', color: 'var(--muted)' } }, 'Avatar'), pick),
      h('div', { class: 'grid two' }, h('label', { class: 'field' }, h('span', null, 'Level'), level), h('label', { class: 'field' }, h('span', null, 'Book'), course)),
      h('label', { class: 'field' }, h('span', null, 'Goal (optional)'), goal),
      h('div', { class: 'row end' },
        st ? h('button', { class: 'btn ghost', onclick: () => { if (confirm(`Remove ${st.name} from your studio? Their results stay in your backup.`)) { saveStudent({ ...st, archived: true }); close(); location.hash = '#/t'; } } }, 'Remove') : null,
        h('button', { class: 'btn primary', onclick: save }, st ? 'Save' : 'Add student'))));
  document.body.append(modal);
  name.focus();
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}
