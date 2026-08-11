/**
 * What Do You Reply? — someone says a line, you pick the natural response.
 *
 * Like Order the Conversation, this reads the `dialogue` arrays rather than
 * loose phrases: it drills the half of a conversation the other games never
 * touch. Knowing what "shu akhbarak?" means is not the same as knowing that
 * "mashe l-7al" is what comes out of your mouth next.
 *
 * Distractors are drawn from *other* units. Lines from the same short dialogue
 * are the tempting choice, but with only four lines per conversation several of
 * them genuinely could follow — an ambiguous question teaches nothing.
 *
 * Like Order the Conversation it calls shell.addScore() but not shell.record():
 * dialogue lines aren't phrases, and their ids would pollute the spaced-
 * repetition store with cards no flashcard will ever show.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { shuffle, sample, optionKey } from './shared.js';
import { bindChoiceKeys } from './keyboard.js';

export default {
  id: 'reply',
  icon: '🗨️',
  titleKey: 'games.replyTitle',
  blurbKey: 'games.replyBlurb',
  minPhrases: 1,

  start(shell) {
    const pairs = buildPairs(shell);
    if (!pairs.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      shell.renderActions();
      return;
    }

    const round = sample(pairs, shell.roundSize(CONFIG.games.roundLength, pairs.length));
    let index = 0;
    // Read fresh on every keypress, so the keys always drive the live question.
    let keyState = {};
    bindChoiceKeys(shell, () => keyState);

    const question = () => {
      shell.clearFeedback();
      const { prompt, answer, unitId } = round[index];
      const options = shuffle([answer, ...pickDistractors(shell, answer, unitId)]);
      let answered = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play',
        'aria-label': `${t('game.playAudio')}: ${prompt.translit}`
      });
      playBtn.addEventListener('click', () => playPhrase(prompt, playBtn));

      const said = el(
        'div',
        { class: 'reply-said' },
        el('span', { class: 'reply-speaker', 'aria-hidden': 'true' }, prompt.speaker || 'A'),
        lineText(prompt),
        playBtn
      );

      const optionButtons = options.map((line, i) =>
        el(
          'button',
          { type: 'button', class: 'option option-reply' },
          el('span', { class: 'key', 'aria-hidden': 'true' }, optionKey(i)),
          lineText(line)
        )
      );

      const nextBtn = el('button', { class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;

      optionButtons.forEach((button, i) => {
        button.addEventListener('click', () => {
          if (answered) return;
          answered = true;

          const correct = options[i].id === answer.id;
          optionButtons.forEach((other, j) => {
            other.disabled = true;
            if (options[j].id === answer.id) other.dataset.state = 'correct';
            else if (j === i) other.dataset.state = 'wrong';
          });

          shell.addScore(correct);
          shell.showFeedback(
            correct ? 'ok' : 'bad',
            correct ? t('game.correct') : t('game.wrong'),
            `${answer.ar} — ${answer.translit} — ${answer.en}`
          );
          playPhrase(answer, playBtn);
          nextBtn.hidden = false;
          nextBtn.focus();
        });
      });

      keyState = { options: optionButtons, next: nextBtn };

      shell.renderBoard(
        el('p', { class: 'prompt-hint center-text' }, t('game.replyPrompt')),
        said,
        // Stacked, not the usual two columns: each option is three lines tall.
        el('div', { class: 'options options-stacked' }, optionButtons)
      );
      shell.renderActions(
        el(
          'button',
          {
            class: 'btn-secondary',
            'aria-label': t('game.replay'),
            onClick: () => playPhrase(prompt, playBtn)
          },
          t('game.replayShort')
        ),
        nextBtn
      );

      // Hearing the line first is half the exercise.
      playPhrase(prompt, playBtn);
    };

    function advance() {
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else question();
    }

    question();
  }
};

/** Every adjacent (line, next line) pair in the units currently in scope. */
function buildPairs(shell) {
  const scoped = shell.unitId
    ? shell.units.filter((unit) => unit.id === shell.unitId)
    : shell.units;

  return scoped.flatMap((unit) => {
    const lines = unit.dialogue || [];
    return lines
      .slice(0, -1)
      .map((prompt, i) => ({ prompt, answer: lines[i + 1], unitId: unit.id }));
  });
}

/**
 * Three wrong replies, taken from other units so that no distractor could
 * honestly be argued to fit. Falls back to the whole bank if the course is ever
 * down to a single unit with dialogue.
 */
function pickDistractors(shell, answer, unitId) {
  const count = CONFIG.games.optionCount - 1;
  const usable = (units) =>
    units.flatMap((unit) => unit.dialogue || []).filter((line) => line.en !== answer.en);

  const elsewhere = usable(shell.units.filter((unit) => unit.id !== unitId));
  const pool = elsewhere.length >= count ? elsewhere : usable(shell.units);
  return sample(pool, count);
}

/** Arabic + transliteration + English, the way dialogue reads everywhere else. */
function lineText(line) {
  return el(
    'span',
    { class: 'reply-text' },
    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
    el('span', { class: 'translit', dir: 'ltr' }, line.translit),
    el('span', { class: 'reply-en' }, line.en)
  );
}
