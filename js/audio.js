/**
 * Hkeeli — pronunciation playback.
 *
 * Every play in the app goes through `playPhrase()`. The lookup order is:
 *
 *   1. the phrase's own recording, resolved against CONFIG.audioBase
 *   2. speech synthesis in an Arabic voice (temporary stand-in)
 *   3. a toast explaining there's no audio yet — never an exception
 *
 * The day real recordings land, dropping the mp3s in and (optionally) pointing
 * CONFIG.audioBase at a CDN is the whole migration. No caller changes.
 */

import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { toast } from './toast.js';

/** phrase.id -> 'file' | 'tts' — so a 404 is probed once, not every tap. */
const resolved = new Map();
let currentAudio = null;
let noticeShown = false;

/**
 * Absolute-ish URL for a phrase recording. The one place paths are built.
 *
 * A phrase may carry a second, slower recording as `audioSlow`. There is no
 * synthetic stand-in for it: a slow button that plays the same speed teaches
 * nothing, so callers ask `hasSlowAudio()` first and simply don't offer the
 * control until the recording exists.
 */
export function audioUrl(phrase, { slow = false } = {}) {
  if (!phrase) return null;
  const file = slow ? phrase.audioSlow : phrase.audio;
  if (!file) return null;
  if (/^(https?:)?\/\//.test(file)) return file; // already hosted
  return `${CONFIG.audioBase}${file}`;
}

/** Does this phrase have a real slow recording? */
export function hasSlowAudio(phrase) {
  return Boolean(phrase && phrase.audioSlow);
}

function stopAll() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function pickArabicVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  for (const locale of CONFIG.ttsLocales) {
    const match = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(locale.toLowerCase()));
    if (match) return match;
  }
  return null;
}

/**
 * Voices load asynchronously in most browsers; on a cold first tap the list is
 * often empty. Wait briefly rather than speaking in the wrong accent.
 */
function voicesReady() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    if (window.speechSynthesis.getVoices().length) return resolve();
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 600);
  });
}

function speak(phrase) {
  if (!CONFIG.ttsFallback || !('speechSynthesis' in window)) {
    toast(t('audio.ttsUnsupported'));
    return Promise.resolve(false);
  }

  return voicesReady().then(
    () =>
      new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(phrase.ar || phrase.translit);
        const voice = pickArabicVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice ? voice.lang : CONFIG.ttsLocales[0];
        utterance.rate = CONFIG.ttsRate;
        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);

        if (CONFIG.showTtsNotice && !noticeShown) {
          noticeShown = true;
          toast(t('audio.ttsNotice'));
        }
        window.speechSynthesis.speak(utterance);
      })
  );
}

function playFile(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.addEventListener('ended', () => resolve(true), { once: true });
    audio.addEventListener('error', () => resolve(false), { once: true });
    audio.play().catch(() => resolve(false));
  });
}

/**
 * Play a phrase. Optionally pass the button that triggered it and it gets a
 * `data-state="playing"` pulse for the duration.
 *
 * @param {object} phrase  a phrase object from lessons.json
 * @param {HTMLElement} [trigger]
 * @param {{slow?: boolean}} [options]  play the slow recording, if there is one
 * @returns {Promise<boolean>} whether anything was actually heard
 */
export async function playPhrase(phrase, trigger, { slow = false } = {}) {
  if (!phrase) return false;
  stopAll();
  if (trigger) trigger.dataset.state = 'playing';

  try {
    const url = audioUrl(phrase, { slow });
    // Keyed per speed: a missing slow file says nothing about the normal one.
    const cacheKey = `${phrase.id}:${slow ? 'slow' : 'normal'}`;
    const known = resolved.get(cacheKey);

    if (url && known !== 'tts') {
      const played = await playFile(url);
      if (played) {
        resolved.set(cacheKey, 'file');
        return true;
      }
      resolved.set(cacheKey, 'tts'); // file is missing — don't probe it again
    }

    const spoken = await speak(phrase);
    if (!spoken) toast(t('audio.unavailable'));
    return spoken;
  } finally {
    if (trigger) delete trigger.dataset.state;
  }
}

export { stopAll as stopAudio };
