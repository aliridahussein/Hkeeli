/**
 * Listen & Choose — hear a phrase, pick its English meaning.
 *
 * The play button is the whole prompt, so it is the biggest thing on the
 * board, with rings that ripple out while it speaks. It plays on arrival and
 * replays on every tap; there is no separate "Replay" in the action bar,
 * because two controls that do the same thing make a learner wonder which one
 * is different.
 *
 * Answering is a single tap — no select-then-check — and the verdict bar
 * rises with the answer in all three scripts.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { sample, buildOptions, optionKey } from './shared.js';
import { bindChoiceKeys } from './keyboard.js';
import { phraseLine } from './chat.js';

export default {
  id: 'listen',
  icon: 'headphones',
  titleKey: 'games.listenTitle',
  blurbKey: 'games.listenBlurb',
  minPhrases: 4,

  start(shell) {
    const round = sample(shell.phrases, shell.roundSize(CONFIG.games.roundLength, shell.phrases.length));
    let index = 0;
    // Read fresh on every keypress, so the keys always drive the live question.
    let keyState = {};
    bindChoiceKeys(shell, () => keyState);

    const question = () => {
      shell.clearFeedback();
      const phrase = round[index];
      const options = buildOptions(phrase, shell.phrases);
      let answered = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play play-hero',
        'aria-label': t('game.replay')
      });
      playBtn.addEventListener('click', () => playPhrase(phrase, playBtn));

      const optionButtons = options.map((option, i) =>
        el(
          'button',
          { type: 'button', class: 'option' },
          el('span', { class: 'key', 'aria-hidden': 'true' }, optionKey(i)),
          el('span', { class: 'option-en' }, option.en)
        )
      );

      const nextBtn = el(
        'button',
        { type: 'button', class: 'btn-primary', onClick: advance },
        t(index + 1 === round.length ? 'game.finish' : 'game.next')
      );
      nextBtn.hidden = true;

      optionButtons.forEach((button, i) => {
        button.addEventListener('click', () => {
          if (answered) return;
          answered = true;

          const correct = options[i].id === phrase.id;

          optionButtons.forEach((other, j) => {
            other.disabled = true;
            if (options[j].id === phrase.id) other.dataset.state = 'correct';
            else if (j === i) other.dataset.state = 'wrong';
          });

          shell.record(phrase.id, correct, button);
          shell.showFeedback(
            correct ? 'ok' : 'bad',
            correct ? t('game.correct') : t('game.wrong'),
            phraseLine(phrase)
          );
          nextBtn.hidden = false;
          nextBtn.focus({ preventScroll: true });
        });
      });

      keyState = { options: optionButtons, next: nextBtn };

      shell.renderBoard(
        el(
          'div',
          { class: 'listen-hero' },
          el('div', { class: 'listen-hero-ring' }, playBtn),
          el('p', { class: 'game-instruction' }, t('game.listenPrompt'))
        ),
        el('div', { class: 'options', role: 'group', 'aria-label': t('game.listenPrompt') }, optionButtons)
      );
      shell.renderActions(nextBtn);

      // Autoplay the prompt — this is a listening exercise, after all.
      playPhrase(phrase, playBtn);
    };

    function advance() {
      /* The lock has to be read before `index` moves: pointer-events stops a
         second tap, but a programmatic activation — Enter on the focused Next
         button, assistive tech — still reaches this handler, and stepping the
         round twice walks `index` off the end of the array. */
      if (shell.transitioning) return;
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else shell.transitionTo(question);
    }

    question();
  }
};
