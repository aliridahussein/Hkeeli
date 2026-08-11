/**
 * Daily Flashcards — flip Lebanese ↔ English, self-grade.
 *
 * The session is drawn from the spaced-repetition queue in js/storage.js:
 * overdue cards first, then cards never seen. "Got it" promotes a card up a
 * Leitner box; "Still learning" sends it back to box 0 and re-queues it in
 * this session.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { progress } from '../storage.js';

export default {
  id: 'cards',
  icon: '🃏',
  titleKey: 'games.cardsTitle',
  blurbKey: 'games.cardsBlurb',
  minPhrases: 1,
  // Self-graded review, not a quiz — see GameShell's `mode`.
  hudMode: 'review',

  start(shell) {
    const queue = progress.getDueCards(
      shell.phrases,
      shell.roundSize(CONFIG.games.flashcardSession, shell.phrases.length)
    );
    if (!queue.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      return;
    }

    const total = queue.length;
    let seen = 0;
    let flipped = false;

    const showCard = () => {
      shell.clearFeedback();
      const phrase = queue[0];
      const state = progress.getPhraseState(phrase.id);
      flipped = false;

      shell.setPosition(seen + 1, total);

      const badge = el(
        'span',
        { class: 'srs-badge' },
        state.seen === 0 ? t('game.srsNew') : state.box >= 3 ? t('game.srsLearned') : t('game.srsDue')
      );

      const card = el(
        'button',
        {
          type: 'button',
          class: 'flashcard',
          'aria-label': t('game.flip'),
          dataset: { flipped: 'false' }
        },
        el(
          'div',
          { class: 'flashcard-inner' },
          el(
            'div',
            { class: 'flashcard-face flashcard-front' },
            badge,
            el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
            el('span', { class: 'translit', dir: 'ltr' }, phrase.translit),
            el('span', { class: 'flashcard-hint' }, t('game.flip'))
          ),
          el(
            'div',
            { class: 'flashcard-face flashcard-back' },
            el('span', { class: 'card-en' }, phrase.en),
            el('span', { class: 'translit', dir: 'ltr' }, phrase.translit),
            el('span', { class: 'flashcard-hint' }, t('game.flashcardBack'))
          )
        )
      );

      const gotIt = el('button', { class: 'btn-ok' }, t('game.gotIt'));
      const again = el('button', { class: 'btn-again' }, t('game.stillLearning'));
      const reveal = el('button', { class: 'btn-primary' }, t('game.showAnswer'));

      /* You can only grade a card you've actually seen the answer to. Rather
         than showing the two grading buttons in a disabled state — which reads
         as "broken" more than "not yet" — the action bar swaps: reveal first,
         then grade. */
      const setFlipped = (next) => {
        flipped = next;
        card.dataset.flipped = String(next);
        card.setAttribute('aria-label', t(next ? 'game.flipBack' : 'game.flip'));
        if (next) shell.renderActions(again, gotIt);
        else shell.renderActions(reveal);
      };

      card.addEventListener('click', () => {
        setFlipped(!flipped);
        if (!flipped) playPhrase(phrase);
      });
      reveal.addEventListener('click', () => setFlipped(true));

      const grade = (known) => {
        shell.record(phrase.id, known);
        queue.shift();
        // A card the learner didn't know comes back later in the same session.
        if (!known) queue.push(phrase);
        seen += 1;

        if (seen >= total || !queue.length) shell.finish(shell.score, total);
        else showCard();
      };

      gotIt.addEventListener('click', () => grade(true));
      again.addEventListener('click', () => grade(false));

      shell.renderBoard(
        card,
        el(
          'div',
          { class: 'center-text' },
          el(
            'button',
            {
              class: 'btn-secondary btn-small',
              onClick: () => playPhrase(phrase)
            },
            t('game.playAudio')
          )
        )
      );
      setFlipped(false);
      playPhrase(phrase);
    };

    showCard();
  }
};
