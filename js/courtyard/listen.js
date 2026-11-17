/**
 * Hkeeli courtyard — listening, honestly.
 *
 * In the courtyard a line is either heard in a real recording or read as
 * text. There is no synthetic stand-in here: these lines appear beside the
 * teacher's corner and inside "your first conversation", where a computer
 * voice would pass for hers (and reads Lebanese as Modern Standard Arabic —
 * see README, "What the owner still has to supply").
 *
 * `listenControl(item)` checks once, quietly, whether the recording named in
 * lessons.json exists. If it does, the visitor gets Listen → Stop → Listen
 * again. If it doesn't, they get one plain line saying so, and the Arabic,
 * transliteration and meaning beside it are the experience. The day an mp3
 * lands at the named path, the button appears — no code or data change.
 *
 * Only one line plays at a time: starting a line stops the one before, and
 * leaving a place stops whatever is playing (index.js calls `stopListening`).
 */

import { t } from '../i18n.js';
import { el } from '../ui.js';
import { icon } from '../icons.js';
import { audioUrl, playPhrase, stopAudio } from '../audio.js';

/** url → Promise<boolean>, so each recording is probed once per visit. */
const probes = new Map();

/** Does the recording named for this item exist? Probed once per visit. */
export function hasRecording(item) {
  const url = audioUrl(item);
  if (!url) return Promise.resolve(false);
  if (!probes.has(url)) {
    probes.set(
      url,
      fetch(url, { method: 'HEAD', cache: 'no-cache' })
        .then((res) => res.ok && /^audio\//.test(res.headers.get('content-type') || 'audio/'))
        .catch(() => false)
    );
  }
  return probes.get(url);
}

let active = null;

/** Stop whatever courtyard line is playing and reset its control. */
export function stopListening() {
  stopAudio();
  if (active) active.reset();
  active = null;
}

/**
 * @param {object} item   a phrase or dialogue line ({ar, translit, en, audio?})
 * @param {object} [options]
 * @param {boolean} [options.quietWhenMissing]  render nothing instead of the
 *   "no recording yet" line (for places that already say it once for all)
 * @param {() => void} [options.onMissing]  told when there is no recording,
 *   so a panel can say it once for all its lines
 * @returns {HTMLElement}
 */
export function listenControl(item, { quietWhenMissing = false, onMissing = null } = {}) {
  const wrap = el('div', { class: 'listen', dataset: { state: 'checking' } });
  const label = el('span', { class: 'listen-label' }, t('courtyard.audio.listen'));
  const glyph = el('span', { class: 'listen-glyph', 'aria-hidden': 'true' }, icon('play', { size: 16 }));
  const button = el(
    'button',
    { type: 'button', class: 'listen-btn', 'aria-label': t('courtyard.audio.listenTo', { text: item.translit }) },
    glyph,
    label
  );
  button.hidden = true;
  const note = el('p', { class: 'listen-note' }, t('courtyard.audio.noRecording'));
  note.hidden = true;
  wrap.append(button, note);

  const control = {
    reset() {
      wrap.dataset.state = 'ready';
      glyph.replaceChildren(icon('play', { size: 16 }));
      label.textContent = played ? t('courtyard.audio.again') : t('courtyard.audio.listen');
      button.setAttribute('aria-label', `${label.textContent}: ${item.translit}`);
    }
  };
  let played = false;

  hasRecording(item).then((ok) => {
    if (ok) {
      wrap.dataset.state = 'ready';
      button.hidden = false;
    } else {
      wrap.dataset.state = 'missing';
      note.hidden = quietWhenMissing;
      onMissing?.();
    }
  });

  button.addEventListener('click', async () => {
    if (wrap.dataset.state === 'playing') {
      stopListening();
      return;
    }
    if (active && active !== control) active.reset();
    active = control;
    wrap.dataset.state = 'playing';
    glyph.replaceChildren(icon('stop', { size: 16 }));
    label.textContent = t('courtyard.audio.stop');
    button.setAttribute('aria-label', `${t('courtyard.audio.stop')}: ${item.translit}`);
    const heard = await playPhrase(item, null, { tts: false });
    // A stop mid-line never resolves here; if this line is still the active
    // one when it does, it finished on its own.
    if (active === control) {
      played = played || heard;
      active = null;
      control.reset();
      if (!heard) {
        wrap.dataset.state = 'missing';
        button.hidden = true;
        note.hidden = false;
      }
    }
  });

  return wrap;
}
