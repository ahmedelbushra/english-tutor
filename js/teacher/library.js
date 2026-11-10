// Library: every book (course) and its units, with teach / homework / try actions.
import { h } from '../util.js';
import { loadAll, loadCourses } from '../content.js';

export async function libraryView(root, courseId) {
  const courses = await loadCourses();
  const course = courses.find((c) => c.id === courseId) || courses[0];
  const units = await loadAll(course.id);
  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'hello' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Library'), h('h1', null, course.title), h('p', { class: 'lead', style: { margin: 0 } }, `${course.level} · ${units.length} units · ${course.about}`)),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/t/materials' }, '✎ My own questions'))),
    courses.length > 1 ? h('div', { class: 'tabs', style: { margin: '14px 0' } }, courses.map((c) => h('a', { class: 'tab' + (c.id === course.id ? ' on' : ''), href: `#/t/library/${c.id}`, style: { textDecoration: 'none' } }, `${c.emoji} ${c.title}`))) : null,
    h('div', { class: 'grid three', style: { marginTop: '18px' } },
      units.map((u) => {
        const nQ = u.grammar.reduce((a, g) => a + g.items.length, 0) + u.wordWork.items.length + u.custom.length;
        return h('div', { class: 'card unit-card', style: { '--unit': u.color } },
          h('div', { class: 'row', style: { gap: '14px', flexWrap: 'nowrap' } },
            h('span', { class: 'planet' }, u.emoji),
            h('div', { style: { minWidth: 0 } }, h('span', { class: 'num' }, u.unit === 0 ? 'Welcome' : u.unit === 9 ? 'Review' : `Unit ${u.unit}`), h('h3', { style: { margin: '2px 0 0' } }, u.title))),
          h('p', { class: 'muted small', style: { margin: 0 } }, u.summary),
          h('div', { class: 'small', style: { fontWeight: 500 } }, '🧩 ', u.grammar.map((g) => g.title).join(' · ')),
          h('div', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'badge' }, `${u.vocab.length} words`), h('span', { class: 'badge' }, `${nQ} questions`), h('span', { class: 'badge' }, `${u.reading.length} readings`)),
          h('div', { class: 'row', style: { marginTop: 'auto', paddingTop: '6px' } },
            h('a', { class: 'btn small unit', href: `#/t/teach/${encodeURIComponent(u.id)}` }, '▶ Teach'),
            h('a', { class: 'btn small', href: `#/t/build/${encodeURIComponent(u.id)}` }, '＋ Homework'),
            h('a', { class: 'btn small ghost', href: `#/practice/${encodeURIComponent(u.id)}`, target: '_blank', title: 'Try it as a student (new tab)' }, '👀 Try')));
      }),
      h('div', { class: 'card add-card', style: { cursor: 'default' } }, h('div', null, h('div', { class: 'plus' }, '📚'), h('p', { style: { fontWeight: 600, margin: '6px 0 4px' } }, 'More books coming'),
        h('p', { class: 'small', style: { margin: 0, maxWidth: '240px' } }, 'Each new book becomes its own course here, with its own units, questions and homework.')))),
  ));
}
