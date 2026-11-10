// Text-to-speech and speech recognition using the browser's built-in voices (no cost, works offline on most devices).
import { store } from './util.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voice = null;

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const wanted = store.get('voice');
  return voices.find((v) => v.name === wanted)
    || voices.find((v) => /en[-_]US/i.test(v.lang) && /natural|google|samantha|aria|jenny/i.test(v.name))
    || voices.find((v) => /en[-_]US/i.test(v.lang))
    || voices[0] || null;
}
if (synth) { voice = pickVoice(); synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); }); }

export const canSpeak = () => !!synth;
export function englishVoices() { return synth ? synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang)) : []; }
export function setVoice(name) { store.set('voice', name); voice = pickVoice(); }

export function speak(text, { rate = 0.9, onend } = {}) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/___/g, 'blank'));
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-US';
  u.rate = rate;
  if (onend) u.onend = onend;
  synth.speak(u);
}
export const stopSpeaking = () => synth && synth.cancel();

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canListen = () => !!Rec;

/** Listen once; resolves with the best transcript ('' if nothing heard). */
export function listen({ timeoutMs = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!Rec) return reject(new Error('unsupported'));
    const r = new Rec();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 3;
    let done = false;
    const finish = (txt) => { if (!done) { done = true; try { r.stop(); } catch { /* */ } resolve(txt); } };
    r.onresult = (e) => {
      const alts = Array.from(e.results[0]).map((a) => a.transcript);
      finish(alts.join(' | '));
    };
    r.onerror = (e) => { if (!done) { done = true; reject(new Error(e.error || 'error')); } };
    r.onend = () => finish('');
    setTimeout(() => finish(''), timeoutMs);
    r.start();
  });
}

/** Share of target words heard in the transcript (0..1). */
export function speechMatch(target, heard) {
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const t = words(target);
  const got = new Set(words(heard));
  if (!t.length) return 0;
  return t.filter((w) => got.has(w)).length / t.length;
}
