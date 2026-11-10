// App shell: hash router + top bar.
import { h, $ } from './util.js';
import { homeworkView, practiceView } from './student/player.js';
import { loadAll } from './content.js';

const app = $('#app');
const topbar = $('#topbar');

const TUTOR_NAV = [['#/t', 'Studio'], ['#/t/library', 'Library'], ['#/t/homework', 'Homework'], ['#/t/settings', 'Settings']];

function bar(mode) {
  const here = location.hash || '#/';
  const active = (href) => (href === '#/t' ? here === '#/t' || here.startsWith('#/t/s/') : here.startsWith(href) || (href === '#/t/library' && (here.startsWith('#/t/materials') || here.startsWith('#/t/teach'))) || (href === '#/t/homework' && (here.startsWith('#/t/build') || here.startsWith('#/t/review'))));
  const nav = mode === 'tutor' ? h('nav', { class: 'nav', 'aria-label': 'Main' }, TUTOR_NAV.map(([href, label]) => h('a', { href, class: active(href) ? 'on' : '' }, label))) : null;
  topbar.replaceChildren(h('div', { class: 'topbar-in' },
    h('a', { class: 'logo', href: mode === 'tutor' ? '#/t' : '#/' }, h('span', { class: 'logo-mark', 'aria-hidden': 'true' }), h('span', { class: 'long' }, mode === 'tutor' ? 'Tutor Studio' : 'English Galaxy')),
    nav, h('span', { class: 'spacer' }),
    h('button', { class: 'btn icon ghost small', title: 'Light / dark', 'aria-label': 'Switch light or dark mode', onclick: toggleTheme }, '◐')));
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ta.theme', next); } catch { /* */ }
}
try { const t = localStorage.getItem('ta.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* */ }

async function route() {
  const hash = location.hash || '#/';
  const [, a, b, c, d] = hash.split('/');
  document.documentElement.style.removeProperty('--unit');
  window.scrollTo(0, 0);
  try {
    if (a === 'hw' && b) { bar('student'); return homeworkView(app, hash.slice(5)); }
    if (a === 'practice' && b) { bar('student'); return practiceView(app, decodeURIComponent(b)); }
    if (a === 'r' && b) { bar('tutor'); return (await import('./teacher/import.js')).importView(app, hash.slice(4)); }
    if (a === 't') {
      bar('tutor');
      if (!b) return (await import('./teacher/home.js')).homeView(app);
      if (b === 's' && c) return (await import('./teacher/student.js')).studentView(app, c);
      if (b === 'library') return (await import('./teacher/library.js')).libraryView(app, c && decodeURIComponent(c));
      if (b === 'teach' && c) return (await import('./teacher/teach.js')).teachView(app, decodeURIComponent(c), d);
      if (b === 'review' && c) return (await import('./teacher/review.js')).reviewView(app, decodeURIComponent(c), d);
      if (b === 'build') return (await import('./teacher/builder.js')).builderView(app, c && decodeURIComponent(c), d);
      if (b === 'homework') return (await import('./teacher/dashboard.js')).dashboardView(app, c && decodeURIComponent(c));
      if (b === 'materials') return (await import('./teacher/materials.js')).materialsView(app);
      if (b === 'settings') return (await import('./teacher/settings.js')).settingsView(app);
    }
    bar('student');
    landing();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'page narrow' }, h('div', { class: 'notice' }, 'Something went wrong: ', e.message)));
  }
}

async function landing() {
  const units = await loadAll();
  app.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'hero' },
      h('div', { class: 'planet-row' }, units.slice(1, 6).map((u) => h('span', { class: 'planet sm', style: { '--unit': u.color } }, u.emoji))),
      h('h1', { class: 'display' }, 'Explore your English galaxy'),
      h('p', { class: 'sub' }, 'Pick a planet to practise. Homework from your teacher opens with its own link.')),
    h('div', { class: 'grid' }, units.map((u) => h('a', { class: 'card unit-card', href: `#/practice/${encodeURIComponent(u.id)}`, style: { '--unit': u.color } },
      h('div', { class: 'row between' }, h('span', { class: 'num' }, u.unit === 0 ? 'Start' : u.unit === 9 ? 'Review' : `Unit ${u.unit}`), h('span', { class: 'planet sm' }, u.emoji)),
      h('h3', null, u.title), h('span', { class: 'muted small' }, u.bigQuestion)))),
    h('p', { class: 'center small', style: { marginTop: '40px' } }, h('a', { href: '#/t', class: 'muted' }, 'Tutor studio →'))));
}

window.addEventListener('hashchange', route);
route();
