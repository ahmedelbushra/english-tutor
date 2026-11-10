/**
 * English Teaching Assistant: results backend (Google Apps Script).
 *
 * Paste this whole file into Extensions → Apps Script of a new Google Sheet,
 * change TEACHER_KEY below, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Full steps: docs/SETUP.md
 *
 * Students can only ADD results. Reading results, saving homework, marks and
 * materials all require the TEACHER_KEY.
 */
const TEACHER_KEY = 'change-me-to-a-secret-word';

const RESULT_HEADERS = ['Received', 'Submission ID', 'Homework ID', 'Homework', 'Class', 'Student', 'Score %',
  'After retry %', 'Correct', 'Out of', 'Time (s)', 'Late', 'Details', 'Writing', 'Teacher mark', 'Comment'];
const HW_HEADERS = ['Created', 'Homework ID', 'Title', 'Class', 'Due', 'Link', 'Config'];
const MAX_CELL = 45000;

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json({ ok: true, teacher: p.key === TEACHER_KEY });
    requireKey(p.key);
    if (p.action === 'all') {
      return json({ ok: true, results: readResults(), homeworks: readHomeworks(), store: readStore() });
    }
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    switch (d.action) {
      case 'submit': return json(addResult(d));
      case 'saveHomework': requireKey(d.key); return json(saveHomework(d.homework));
      case 'deleteHomework': requireKey(d.key); return json(deleteHomework(d.id));
      case 'mark': requireKey(d.key); return json(saveMark(d.submissionId, d.mark, d.comment));
      case 'save': requireKey(d.key); return json(saveStore(d.kind, d.data));
      default: return json({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- results ----------
function addResult(d) {
  const sh = sheet('Results', RESULT_HEADERS);
  const id = clean(d.submissionId, 40);
  // ignore exact duplicate submissions (offline queue retries)
  if (id && sh.getLastRow() > 1) {
    const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; });
    if (ids.indexOf(id) !== -1) return { ok: true, duplicate: true };
  }
  sh.appendRow([
    new Date(), id, clean(d.homeworkId, 40), clean(d.homeworkTitle, 200), clean(d.className, 60), clean(d.student, 80),
    num(d.percent), num(d.retryPercent), num(d.correct), num(d.total), num(d.timeSec), d.late ? 'yes' : '',
    clean(JSON.stringify(d.details || []), MAX_CELL), clean(JSON.stringify(d.writing || []), MAX_CELL), '', '',
  ]);
  return { ok: true };
}

function readResults() {
  const sh = sheet('Results', RESULT_HEADERS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, RESULT_HEADERS.length).getValues().map(function (r) {
    return {
      submittedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), submissionId: r[1], homeworkId: r[2],
      homeworkTitle: r[3], className: r[4], student: r[5], percent: r[6], retryPercent: r[7], correct: r[8], total: r[9],
      timeSec: r[10], late: r[11] === 'yes', details: parse(r[12], []), writing: parse(r[13], []), mark: r[14], comment: r[15],
    };
  });
}

function saveMark(submissionId, mark, comment) {
  const sh = sheet('Results', RESULT_HEADERS);
  if (sh.getLastRow() < 2) return { ok: false, error: 'No results' };
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === submissionId) {
      sh.getRange(i + 2, 15, 1, 2).setValues([[clean(mark, 20), clean(comment, 1000)]]);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Submission not found' };
}

// ---------- homeworks ----------
function saveHomework(hw) {
  const sh = sheet('Homeworks', HW_HEADERS);
  deleteHomework(hw.id);
  sh.appendRow([new Date(), clean(hw.id, 40), clean(hw.title, 200), clean(hw.className, 60), clean(hw.due, 20), clean(hw.link, MAX_CELL), clean(JSON.stringify(hw), MAX_CELL)]);
  return { ok: true };
}
function deleteHomework(id) {
  const sh = sheet('Homeworks', HW_HEADERS);
  for (let r = sh.getLastRow(); r >= 2; r--) if (sh.getRange(r, 2).getValue() === id) sh.deleteRow(r);
  return { ok: true };
}
function readHomeworks() {
  const sh = sheet('Homeworks', HW_HEADERS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 7, sh.getLastRow() - 1, 1).getValues().map(function (r) { return parse(r[0], null); }).filter(Boolean);
}

// ---------- key/value store (materials, class lists) ----------
function saveStore(kind, data) {
  if (['materials', 'roster'].indexOf(kind) === -1) return { ok: false, error: 'Unknown store' };
  const sh = sheet('Store', ['Kind', 'Data', 'Updated']);
  const text = JSON.stringify(data);
  if (text.length > MAX_CELL) return { ok: false, error: 'Too large' };
  const last = sh.getLastRow();
  for (let r = 2; r <= last; r++) {
    if (sh.getRange(r, 1).getValue() === kind) { sh.getRange(r, 2, 1, 2).setValues([[text, new Date()]]); return { ok: true }; }
  }
  sh.appendRow([kind, text, new Date()]);
  return { ok: true };
}
function readStore() {
  const sh = sheet('Store', ['Kind', 'Data', 'Updated']);
  const out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { out[r[0]] = parse(r[1], null); });
  return out;
}

// ---------- helpers ----------
function requireKey(k) {
  if (TEACHER_KEY === 'change-me-to-a-secret-word') throw new Error('Set TEACHER_KEY in Code.gs first');
  if (k !== TEACHER_KEY) throw new Error('Wrong teacher key');
}
function sheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e7f5ff');
  }
  return sh;
}
function clean(v, max) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop formula injection
  return s.slice(0, max || 500);
}
function num(v) { const n = Number(v); return isFinite(n) ? n : ''; }
function parse(s, fallback) { try { return JSON.parse(s); } catch (e) { return fallback; } }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
