/**
 * Listen & Choose — hear a phrase, pick its English meaning.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { sample, buildOptions, optionKey } from './shared.js';

export default {
  id: 'listen',
  icon: '🎧',
  titleKey: 'games.listenTitle',
  blurbKey: 'games.listenBlurb',
  minPhrases: 4,

  start(shell) {
    const round = sample(shell.phrases, Math.min(CONFIG.games.roundLength, shell.phrases.length));
    let index = 0;

    const question = () => {
      shell.clearFeedback();
      const phrase = round[index];
      const options = buildOptions(phrase, shell.phrases);
      let answered = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play',
        'aria-label': t('game.replay')
      });
      playBtn.addEventListener('click', () => playPhrase(phrase, playBtn));

      const prompt = el(
        'div',
        { class: 'prompt' },
        playBtn,
        el('p', { class: 'prompt-hint' }, t('game.listenPrompt'))
      );

      const optionButtons = options.map((option, i) =>
        el(
          'button',
          { type: 'button', class: 'option' },
          el('span', { class: 'key', 'aria-hidden': 'true' }, optionKey(i)),
          el('span', {}, option.en)
        )
      );

      const nextBtn = el(
        'button',
        { class: 'btn-primary', onClick: advance },
        t(index + 1 === round.length ? 'game.check' : 'game.next')
      );
      nextBtn.hidden = true;

      optionButtons.forEach((button, i) => {
        button.addEventListener('click', () => {
          if (answered) return;
          answered = true;

          const chosen = options[i];
          const correct = chosen.id === phrase.id;

          optionButtons.forEach((other, j) => {
            other.disabled = true;
            if (options[j].id === phrase.id) other.dataset.state = 'correct';
            else if (j === i) other.dataset.state = 'wrong';
          });

          shell.record(phrase.id, correct);
          shell.showFeedback(
            correct ? 'ok' : 'bad',
            correct ? t('game.correct') : t('game.wrong'),
            `${phrase.ar} — ${phrase.translit} — ${phrase.en}`
          );
          nextBtn.hidden = false;
          nextBtn.focus();
        });
      });

      shell.renderBoard(prompt, el('div', { class: 'options' }, optionButtons));
      shell.renderActions(
        el(
          'button',
          { class: 'btn-secondary', onClick: () => playPhrase(phrase, playBtn) },
          t('game.replay')
        ),
        nextBtn
      );

      // Autoplay the prompt — this is a listening exercise, after all.
      playPhrase(phrase, playBtn);
    };

    function advance() {
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else question();
    }

    question();
  }
};
