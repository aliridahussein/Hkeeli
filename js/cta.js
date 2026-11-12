/**
 * Hkeeli — the bridge from practising to booking.
 *
 * Finishing a round was the one moment on the site where a learner had just
 * proved something to themselves, and the only things offered were "play
 * again" and "choose a game". Every route to the teacher lived in the nav or
 * the footer. This module is the missing step.
 *
 * It is written to the voice the rest of the site already uses, which is the
 * reason it can be here at all:
 *
 *   - **It states what just happened, accurately.** The line a learner sees
 *     is derived from their actual round, so a bad round never gets told it
 *     went well. An overstated compliment after 2/8 reads as a sales script
 *     and costs more trust than it buys.
 *   - **It names the limit of the thing they just used.** Recognising a phrase
 *     is not saying it to a person. That gap is true, it is the reason a
 *     teacher exists, and saying it plainly is more persuasive than any
 *     adjective.
 *   - **It never blocks.** No modal, no interstitial, no countdown. It is a
 *     card under the summary with a link in it, and "play again" stays the
 *     primary action.
 *
 * Nothing here states a price, a duration or an availability — booking.js has
 * the same rule, and for the same reason: the site has no honest source for
 * any of them. The link goes to the booking section, which does.
 */

import { t } from './i18n.js';
import { el } from './ui.js';
import { track } from './analytics.js';
import { icon } from './icons.js';

/** Where the booking section lives, from anywhere on the site. */
const BOOK_HREF = 'index.html#book';

/**
 * How well the round went, as one of three bands. The copy differs per band
 * so the bridge can say something true rather than something flattering.
 *
 * `null` total (a flashcard review, which is self-graded) has no accuracy to
 * speak of, so it gets the neutral line.
 */
function band(score, total) {
  if (!total) return 'neutral';
  const ratio = score / total;
  if (ratio >= 0.8) return 'strong';
  if (ratio >= 0.4) return 'mixed';
  return 'early';
}

/**
 * The round-end bridge.
 *
 * @param {object} options
 * @param {string} options.from      where this was shown — 'game' | 'daily' | 'scene'
 * @param {number} [options.score]
 * @param {number} [options.total]
 * @param {string} [options.sceneId] names the situation, for the scene variant
 * @param {boolean} [options.withCta=true] false when the screen's main button
 *        is already the booking link — the card then carries the argument
 *        without a second copy of the same button
 * @returns {HTMLElement}
 */
export function bookingBridge({ from = 'game', score = 0, total = 0, sceneId = null, withCta = true } = {}) {
  const tone = band(score, total);

  /* A scene ends on a conversation the learner just held, so it gets its own
     line — "that was one conversation" only makes sense where there was one. */
  const headingKey = from === 'scene' ? 'bridge.sceneTitle' : `bridge.${tone}Title`;
  const bodyKey = from === 'scene' ? 'bridge.sceneBody' : `bridge.${tone}Body`;

  const link = withCta
    ? el(
        'a',
        {
          class: 'btn-secondary bridge-cta',
          href: BOOK_HREF,
          dataset: { event: 'booking_cta_clicked', from }
        },
        el('span', {}, t('bridge.cta')),
        icon('forward', { size: 18, className: 'icon-dir' })
      )
    : null;
  if (link) link.addEventListener('click', () => track('booking_cta_clicked', { from, scene: sceneId }));

  track('booking_cta_shown', { from, scene: sceneId });

  return el(
    'aside',
    { class: 'booking-bridge', dataset: { tone } },
    el('span', { class: 'bridge-mark', 'aria-hidden': 'true' }, icon('person', { size: 22 })),
    el('p', { class: 'bridge-eyebrow' }, t('bridge.eyebrow')),
    el('h3', { class: 'bridge-title' }, t(headingKey)),
    el('p', { class: 'bridge-body' }, t(bodyKey)),
    link,
    /* The honest footnote. The practice section is free and stays free; saying
       so is what makes the link above read as an offer rather than a gate. */
    el('p', { class: 'bridge-note' }, t('bridge.note'))
  );
}

export default { bookingBridge };
