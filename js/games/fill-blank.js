/**
 * Fill the Blank — complete the sentence.
 *
 * Two input modes, both always available: type the answer, or pick from
 * choices. Typing is checked leniently (see normalizeAnswer) because there is
 * no single correct way to write Lebanese in Latin script.
 */

import { CONFIG } from '../config.js';
import { t, pick } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { deriveBlank } from '../data.js';
import { sample, shuffle, isAnswerAcceptable, optionKey } from './shared.js';

export default {
  id: 'blank',
  icon: '✏️',
  titleKey: 'games.blankTitle',
  blurbKey: 'games.blankBlurb',
  minPhrases: 4,

  start(shell) {
    const usable = shell.phrases.filter((phrase) => deriveBlank(phrase));
    if (!usable.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      return;
    }

    const round = sample(usable, Math.min(CONFIG.games.roundLength, usable.length));
    let index = 0;
    let typing = true; // remembered across questions within a round

    const question = () => {
      shell.clearFeedback();
      const phrase = round[index];
      const blank = deriveBlank(phrase);
      let answered = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play',
        'aria-label': `${t('game.playAudio')}: ${phrase.translit}`
      });
      playBtn.addEventListener('click', () => playPhrase(phrase, playBtn));

      const sentence = el(
        'p',
        { class: 'blank-sentence', dir: 'ltr' },
        ...String(blank.translit)
          .split('___')
          .flatMap((part, i) => (i === 0 ? [part] : [el('span', { class: 'blank-slot' }), part]))
      );

      const prompt = el(
        'div',
        { class: 'prompt' },
        el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, blank.ar || phrase.ar),
        sentence,
        playBtn,
        el('p', { class: 'prompt-hint' }, blank.hint ? hintText(blank) : `“${phrase.en}”`)
      );

      const input = el('input', {
        type: 'text',
        class: 'answer-input',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': t('game.blankPrompt')
      });
      input.placeholder = t('game.blankPlaceholder');

      const choices = buildChoices(blank.answer, usable);
      const choiceButtons = choices.map((choice, i) =>
        el(
          'button',
          { type: 'button', class: 'option' },
          el('span', { class: 'key', 'aria-hidden': 'true' }, optionKey(i)),
          el('span', { dir: 'ltr' }, choice)
        )
      );
      const choiceWrap = el('div', { class: 'options' }, choiceButtons);

      const modeBtn = el('button', { type: 'button' });
      const toggle = el('div', { class: 'mode-toggle' }, modeBtn);

      const checkBtn = el('button', { class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;

      const applyMode = () => {
        input.hidden = !typing;
        checkBtn.hidden = !typing || answered;
        choiceWrap.hidden = typing;
        modeBtn.textContent = t(typing ? 'game.useChoices' : 'game.useTyping');
      };
      modeBtn.addEventListener('click', () => {
        if (answered) return;
        typing = !typing;
        applyMode();
        if (typing) input.focus();
      });

      const settle = (correct, given) => {
        if (answered) return;
        answered = true;
        input.disabled = true;
        checkBtn.hidden = true;
        choiceButtons.forEach((button, i) => {
          button.disabled = true;
          if (choices[i] === blank.answer) button.dataset.state = 'correct';
          else if (choices[i] === given) button.dataset.state = 'wrong';
        });

        shell.record(phrase.id, correct);
        shell.showFeedback(
          correct ? 'ok' : 'bad',
          correct ? t('game.correct') : `${t('game.wrong')} ${t('game.theAnswerWas')} “${blank.answer}”`,
          `${phrase.ar} — ${phrase.translit} — ${phrase.en}`
        );
        playPhrase(phrase, playBtn);
        nextBtn.hidden = false;
        nextBtn.focus();
      };

      checkBtn.addEventListener('click', () => {
        settle(isAnswerAcceptable(input.value, blank.answer, phrase.accept), input.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (answered) advance();
          else checkBtn.click();
        }
      });
      choiceButtons.forEach((button, i) => {
        button.addEventListener('click', () => settle(choices[i] === blank.answer, choices[i]));
      });

      shell.renderBoard(prompt, input, choiceWrap, toggle);
      shell.renderActions(checkBtn, nextBtn);
      applyMode();
      if (typing) input.focus();
    };

    function advance() {
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else question();
    }

    question();
  }
};

function hintText(blank) {
  return blank.hint ? pick(blank.hint) : '';
}

/** Correct word plus three plausible single-word distractors. */
function buildChoices(answer, pool) {
  const words = new Set();
  pool.forEach((phrase) => {
    String(phrase.translit)
      .split(/[\s/]+/)
      .filter((word) => word.length > 1)
      .forEach((word) => words.add(word));
  });
  words.delete(answer);

  return shuffle([answer, ...sample([...words], CONFIG.games.optionCount - 1)]);
}
