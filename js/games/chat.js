/**
 * Hkeeli — conversation pieces.
 *
 * A line of dialogue renders the same way everywhere it appears — in What Do
 * You Reply?, in Order the Conversation and in the transcript at the end of a
 * scene — so a conversation always looks like a conversation: two sides, a
 * face on each, the Arabic first, and a play button on every line.
 *
 * Kept out of games/index.js on purpose: the games import these, and the
 * registry imports the games, so living there would make a circular import.
 */

import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { icon } from '../icons.js';

/**
 * Who is speaking, for a line in a dialogue.
 *
 * In a scene the cast is known: the learner is one speaker (`cast.you`) and
 * the other has a name — "Waiter", "Teta". Outside a scene there is no "you",
 * so speaker A sits on one side and B on the other, the way any chat app
 * alternates, and neither is named.
 *
 * @returns {{ who: 'you'|'them', name: string }}
 */
export function speakerOf(line, cast) {
  const speaker = line.speaker || 'A';
  if (cast && cast.you) {
    return speaker === cast.you
      ? { who: 'you', name: cast.youLabel || t('scene.you') }
      : { who: 'them', name: cast.them || '' };
  }
  return { who: speaker === 'B' ? 'you' : 'them', name: speaker };
}

/**
 * A line as a chat row: avatar, bubble, play button.
 *
 * @param {object} line  { ar, translit, en, speaker }
 * @param {object} [options]
 *   who       'you' | 'them'
 *   name      shown as the avatar's initial and read to screen readers
 *   playable  include a play button (default true)
 *   flip      a data-flip key, for lines that travel (Order the Conversation)
 *   flipFrom  where a new bubble flies in from (the reply you picked)
 *   state     'correct' | 'wrong' once checked
 *   onSelect  makes the bubble itself a button (a placed line you can take
 *             back out); the play control stays a sibling, never a child —
 *             a button inside a button is invalid and swallows focus
 *   label     accessible name for that button
 */
export function chatBubble(line, options = {}) {
  const {
    who = 'them',
    name = '',
    playable = true,
    flip = null,
    flipFrom = null,
    state = null,
    onSelect = null,
    label = '',
    disabled = false
  } = options;

  const content = [
    name ? el('span', { class: 'visually-hidden' }, `${name}: `) : null,
    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
    el('span', { class: 'translit', dir: 'ltr' }, line.translit),
    el('span', { class: 'chat-en' }, line.en)
  ];

  const bubble = onSelect
    ? el(
        'button',
        {
          type: 'button',
          class: 'chat-bubble chat-bubble--button',
          'aria-label': label || null,
          disabled: disabled || undefined,
          onClick: onSelect
        },
        ...content
      )
    : el('div', { class: 'chat-bubble' }, ...content);

  return el(
    'div',
    {
      class: 'chat-row',
      dataset: {
        who,
        ...(flip ? { flip } : {}),
        ...(flipFrom ? { flipFrom } : {}),
        ...(state ? { state } : {})
      }
    },
    // A named speaker gets their initial; an unnamed one a plain figure, so
    // an empty circle never reads as a missing image.
    el('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, name ? initial(name) : icon('person', { size: 16 })),
    bubble,
    playable ? playControl(line) : null
  );
}

/**
 * A phrase written inline in a sentence — the verdict bar's
 * "بدي قهوة وسط — baddi 2ahwe wasat — I want a medium-sweet coffee".
 *
 * Each script is its own isolated run with its own direction, and the order
 * of the runs follows the page. One plain string can't do both: forced LTR
 * scrambles the reading order on the Arabic page, and left to the page's
 * direction an English sentence ending in "?" renders as "?How's your
 * health" there, because the trailing punctuation joins the RTL run around
 * it.
 *
 * @param {object} line  { ar, translit, en }
 * @param {object} [options]
 *   parts   which of ar / translit / en to show, in order
 *   prefix  translated UI copy to lead with ("The answer was")
 *   sep     between the pieces
 * @returns {Array<Node|string>}  for GameShell.showFeedback()
 */
export function phraseLine(line, { parts = ['ar', 'translit', 'en'], prefix = '', sep = ' — ' } = {}) {
  const pieces = parts
    .filter((part) => line[part])
    .map((part) =>
      part === 'ar'
        ? el('bdi', { dir: 'rtl', lang: 'ar' }, line.ar)
        : part === 'translit' && prefix
          ? latin(line.translit)
          : el('bdi', { dir: 'ltr' }, line[part])
    );

  const out = prefix ? [prefix, ' '] : [];
  pieces.forEach((piece, i) => out.push(...(i ? [sep, piece] : [piece])));
  return out;
}

/** A transliteration quoted inside translated copy: “baddi 2ahwe”, isolated LTR. */
export function latin(text) {
  return el('bdi', { dir: 'ltr' }, `“${text}”`);
}

/** The first letter of a name, as a grapheme, so Arabic names work too. */
export function initial(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    return first ? first.segment.toLocaleUpperCase() : '';
  }
  return text.charAt(0).toLocaleUpperCase();
}

/**
 * A small play button bound to one line.
 *
 * It stops propagation because it often sits inside something else that is
 * tappable — a line in the bank you are choosing from — and hearing a line
 * must never also choose it.
 */
export function playControl(line, className = 'chat-play') {
  const button = el('button', {
    type: 'button',
    class: `play ${className}`,
    'aria-label': `${t('game.playAudio')}: ${line.translit}`
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    playPhrase(line, button);
  });
  return button;
}
