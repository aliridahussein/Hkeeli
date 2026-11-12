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
import { bindChoiceKeys } from './keyboard.js';
import { phraseLine, latin } from './chat.js';

export default {
  id: 'blank',
  icon: 'pencil',
  titleKey: 'games.blankTitle',
  blurbKey: 'games.blankBlurb',
  minPhrases: 4,

  start(shell) {
    const usable = shell.phrases.filter((phrase) => deriveBlank(phrase));
    if (!usable.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      shell.renderActions();
      return;
    }

    const round = sample(usable, shell.roundSize(CONFIG.games.roundLength, usable.length));
    let index = 0;
    let typing = true; // remembered across questions within a round

    /* Keys only drive the multiple-choice mode; while the text input is
       focused, bindChoiceKeys stands down so letters type normally. */
    let keyState = {};
    bindChoiceKeys(shell, () => keyState);

    const question = () => {
      shell.clearFeedback();
      const phrase = round[index];
      const blank = deriveBlank(phrase);
      let answered = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play play-lg',
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
        { class: 'blank-card' },
        el('div', { class: 'blank-card-top' },
          el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, blank.ar || phrase.ar),
          playBtn
        ),
        sentence,
        // The hint is translated UI copy and follows the page; the fallback is
        // the phrase's English and has to stay LTR on an Arabic page.
        blank.hint
          ? el('p', { class: 'blank-hint' }, hintText(blank))
          : el('p', { class: 'blank-hint option-en' }, `“${phrase.en}”`)
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

      const checkBtn = el('button', { type: 'button', class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { type: 'button', class: 'btn-primary', onClick: advance }, t('game.next'));
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

      const settle = (correct, given, origin = null) => {
        if (answered) return;
        answered = true;
        input.disabled = true;
        checkBtn.hidden = true;
        choiceButtons.forEach((button, i) => {
          button.disabled = true;
          if (choices[i] === blank.answer) button.dataset.state = 'correct';
          else if (choices[i] === given) button.dataset.state = 'wrong';
        });

        shell.record(phrase.id, correct, origin);
        shell.showFeedback(
          correct ? 'ok' : 'bad',
          correct ? t('game.correct') : [`${t('game.wrong')} ${t('game.theAnswerWas')} `, latin(blank.answer)],
          phraseLine(phrase)
        );
        playPhrase(phrase, playBtn);
        nextBtn.hidden = false;
        nextBtn.focus();
      };

      checkBtn.addEventListener('click', () => {
        settle(isAnswerAcceptable(input.value, blank.answer, phrase.accept), input.value, checkBtn);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (answered) advance();
          else checkBtn.click();
        }
      });
      choiceButtons.forEach((button, i) => {
        button.addEventListener('click', () => settle(choices[i] === blank.answer, choices[i], button));
      });

      keyState = { options: choiceButtons, next: nextBtn };

      shell.renderBoard(el('p', { class: 'game-instruction' }, t('game.blankPrompt')), prompt, input, choiceWrap, toggle);
      shell.renderActions(checkBtn, nextBtn);
      applyMode();
      if (typing) input.focus();
    };

    function advance() {
      if (shell.transitioning) return; // see listen-choose.js
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else shell.transitionTo(question);
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
