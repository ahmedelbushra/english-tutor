// Settings: teacher name, Google Sheets connection, class lists, voice, backup.
import { h, store, toast, download } from '../util.js';
import { settings, saveSettings, testConnection, saveRemote } from '../api.js';
import { englishVoices, setVoice, speak } from '../tts.js';
import { setMaterials } from '../content.js';

export function settingsView(root) {
  const s = settings();
  const name = h('input', { type: 'text', value: s.teacher || '', placeholder: 'e.g. Ms. Nouf' });
  const endpoint = h('input', { type: 'url', value: s.endpoint || '', placeholder: 'https://script.google.com/macros/s/…/exec' });
  const key = h('input', { type: 'password', value: s.key || '', placeholder: 'The TEACHER_KEY you wrote in Code.gs' });
  const status = h('div', { class: 'small' });
  const voices = englishVoices();
  const voiceSel = h('select', { onchange: (e) => { setVoice(e.target.value); speak('Hello class! Let’s learn English.'); } },
    h('option', { value: '' }, 'Automatic'), voices.map((v) => h('option', { value: v.name, selected: store.get('voice') === v.name }, `${v.name} (${v.lang})`)));

  root.replaceChildren(h('div', { class: 'page narrow stack' },
    h('p', { class: 'eyebrow' }, 'Settings'), h('h1', null, 'Your studio'),
    h('div', { class: 'notice info' }, '🔒 Your students, notes and results are saved privately in this browser on this computer. Use ', h('b', null, 'Download backup'), ' now and then, and to move to another computer.'),
    h('div', { class: 'card stack' }, h('h3', null, '👋 You'),
      h('label', { class: 'field' }, h('span', null, 'Your name (shown in your studio)'), name),
      h('button', { class: 'btn primary', onclick: () => { saveSettings({ teacher: name.value.trim() }); toast('Saved', 'good'); } }, 'Save')),

    h('details', { class: 'card fold' }, h('summary', null, '🔌 Advanced (optional): collect results automatically in Google Sheets'),
      h('div', { class: 'stack', style: { marginTop: '14px' } },
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Not needed for Preply. Students send results by pasting a link in the chat. Only set this up if you want results to arrive without that step (see docs/SETUP.md).'),
      h('label', { class: 'field' }, h('span', null, 'Web app URL'), endpoint),
      h('label', { class: 'field' }, h('span', null, 'Teacher key'), key),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => {
          const ep = endpoint.value.trim(), k = key.value.trim();
          if (ep && !/^https:\/\/script\.google(usercontent)?\.com\//.test(ep)) return toast('That doesn’t look like an Apps Script URL', 'bad');
          saveSettings({ endpoint: ep, key: k });
          if (!ep) { status.textContent = 'Disconnected. Results will be saved on each device only.'; return; }
          status.textContent = 'Testing…';
          try {
            const r = await testConnection(ep, k);
            status.textContent = r.teacher ? '✅ Connected. New homework links will send results to your Sheet.' : '⚠️ Connected, but the teacher key is wrong, so you can’t read results.';
          } catch (e) { status.textContent = '❌ Could not connect: ' + e.message + '. Check the URL and that the deployment is set to “Anyone”.'; }
        } }, 'Save & test'),
        status),
      h('div', { class: 'notice small' }, 'Only homework links created after connecting send results automatically.'))),

    h('div', { class: 'card stack' }, h('h3', null, '🔊 Voice'),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'The voice used to read words and sentences on this device. Students’ devices use their own best English voice.'),
      voices.length ? voiceSel : h('p', { class: 'muted' }, 'No English voices found on this device yet. Try reloading the page.')),

    h('div', { class: 'card stack' }, h('h3', null, '💾 Backup'),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'One file with your students, notes, homework, results and your own questions. Restore it on any computer.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { backupNow(); toast('Backup downloaded', 'good'); } }, '⬇ Download backup'),
        h('span', { class: 'muted small' }, store.get('lastBackup') ? `Last backup: ${new Date(store.get('lastBackup')).toLocaleDateString()}` : 'No backup yet'),
        h('label', { class: 'btn' }, '⬆ Restore backup', h('input', { type: 'file', accept: '.json', class: 'hidden', onchange: (e) => restore(e.target.files[0]) })))),
  ));
}

function parseRoster(text) {
  const out = {};
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    for (const line of lines) {
      const m = line.match(/^([^:]{1,20}):\s*(.+)$/);
      if (m) { out[m[1].trim()] = m[2].split(',').map((x) => x.trim()).filter(Boolean); }
    }
    if (!lines.some((l) => /^[^:]{1,20}:/.test(l)) && lines.length > 1) out[lines[0]] = lines.slice(1);
  }
  return out;
}
/** Download a full backup file and remember when it was made. */
export function backupNow() {
  const day = new Date().toISOString().slice(0, 10);
  download(`tutor-studio-backup-${day}.json`, JSON.stringify(backup(), null, 2), 'application/json');
  store.set('lastBackup', Date.now());
}
/** True when there's data worth saving and no backup in the last 7 days. */
export function backupDue() {
  const hasData = store.get('students', []).length || store.get('localResults', []).length;
  const last = store.get('lastBackup', 0);
  return !!hasData && Date.now() - last > 7 * 864e5;
}
function backup() {
  const s = { ...store.get('settings', {}) }; delete s.key;
  return { settings: s, students: store.get('students', []), roster: store.get('roster', {}), materials: store.get('materials', {}), homeworks: store.get('homeworks', []), localResults: store.get('localResults', []), marks: store.get('marks', {}) };
}
function restore(file) {
  if (!file) return;
  file.text().then((t) => {
    const b = JSON.parse(t);
    if (b.settings) saveSettings(b.settings);
    if (b.roster) store.set('roster', b.roster);
    if (b.students) store.set('students', b.students);
    if (b.materials) setMaterials(b.materials);
    if (b.homeworks) store.set('homeworks', b.homeworks);
    if (b.localResults) store.set('localResults', b.localResults);
    if (b.marks) store.set('marks', b.marks);
    toast('Backup restored', 'good');
    location.reload();
  }).catch(() => toast('That file is not a backup', 'bad'));
}
