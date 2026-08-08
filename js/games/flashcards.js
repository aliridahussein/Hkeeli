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

  start(shell) {
    const queue = progress.getDueCards(shell.phrases, CONFIG.games.flashcardSession);
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
      const setGradingVisible = (visible) => {
        again.disabled = !visible;
        gotIt.disabled = !visible;
      };

      card.addEventListener('click', () => {
        flipped = !flipped;
        card.dataset.flipped = String(flipped);
        if (flipped) {
          setGradingVisible(true);
        } else {
          playPhrase(phrase);
        }
      });

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
      setGradingVisible(false);

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
      shell.renderActions(again, gotIt);
      playPhrase(phrase);
    };

    showCard();
  }
};
