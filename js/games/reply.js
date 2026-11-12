/**
 * What Do You Reply? — someone says a line, you pick what comes out of your
 * mouth next.
 *
 * It reads the `dialogue` arrays rather than loose phrases: it drills the half
 * of a conversation the other games never touch. Knowing what "shu akhbarak?"
 * means is not the same as knowing that "mashe l-7al" is what you say next.
 *
 * It looks like a conversation because it is one: the line said to you
 * arrives as a bubble from the other side, your choices sit below as the
 * replies you could send, and the one you pick *flies up into the thread* as
 * your answer. Right or wrong, you see the exchange you just had.
 *
 * ## In a scene
 *
 * A scene knows which speaker is the learner (`shell.cast.you`), and the
 * question is only ever "what do *you* say" — so only pairs whose answer is
 * the learner's own line are asked. Without that filter, half the pairs in a
 * four-line dialogue asked the learner to produce the waiter's lines.
 *
 * Distractors come from *other* units: lines from the same short dialogue are
 * the tempting choice, but several of them could genuinely follow, and an
 * ambiguous question teaches nothing.
 *
 * Like Order the Conversation it calls shell.addScore() but not shell.record():
 * dialogue lines aren't phrases, and their ids would pollute the spaced-
 * repetition store with cards no flashcard will ever show.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { flip } from '../motion.js';
import { shuffle, sample, optionKey } from './shared.js';
import { bindChoiceKeys } from './keyboard.js';
import { chatBubble, speakerOf, phraseLine } from './chat.js';

export default {
  id: 'reply',
  icon: 'chat',
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

      /* Whoever says the prompt is "them" and whoever answers is "you" —
         always, in this game, because the learner is the one replying. A
         scene's cast supplies the other person's name. */
      const them = shell.cast ? speakerOf(prompt, shell.cast) : { who: 'them', name: '' };
      const you = { who: 'you', name: t('scene.you') };

      const thread = el('div', { class: 'chat' }, chatBubble(prompt, { who: 'them', name: them.name }));

      const nextBtn = el(
        'button',
        { type: 'button', class: 'btn-primary', onClick: advance },
        el('span', {}, t('game.next'))
      );
      nextBtn.hidden = true;

      const choiceButtons = options.map((line, i) => {
        const button = el(
          'button',
          { type: 'button', class: 'option reply-choice', dataset: { flip: `choice-${i}` } },
          el('span', { class: 'key', 'aria-hidden': 'true' }, optionKey(i)),
          el(
            'span',
            { class: 'reply-choice-text' },
            el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
            el('span', { class: 'translit', dir: 'ltr' }, line.translit),
            el('span', { class: 'reply-en' }, line.en)
          )
        );
        button.addEventListener('click', () => choose(i, button));
        return button;
      });

      function choose(i, button) {
        if (answered) return;
        answered = true;

        /* Identity, not `id`: dialogue lines in lessons.json have no id, so an
           id comparison was undefined === undefined — every option was marked
           correct. The options array holds the same objects the pairs were
           built from, so `===` is correct whatever the data carries. */
        const chosen = options[i];
        const correct = chosen === answer;

        choiceButtons.forEach((other, j) => {
          other.disabled = true;
          if (options[j] === answer) other.dataset.state = 'correct';
          else if (j === i) other.dataset.state = 'wrong';
        });

        // The picked reply leaves the list and lands in the conversation.
        flip(shell.board, () => {
          thread.append(
            chatBubble(chosen, {
              who: 'you',
              name: you.name,
              flipFrom: `choice-${i}`,
              state: correct ? 'correct' : 'wrong'
            })
          );
        });

        shell.addScore(correct, button);
        shell.showFeedback(
          correct ? 'ok' : 'bad',
          correct ? t('game.correct') : t('game.wrong'),
          correct
            ? phraseLine(answer, { parts: ['translit', 'en'] })
            : phraseLine(answer, { parts: ['translit', 'en'], prefix: t('game.theAnswerWas') })
        );
        playPhrase(answer);
        nextBtn.hidden = false;
        nextBtn.focus({ preventScroll: true });
      }

      keyState = { options: choiceButtons, next: nextBtn };

      shell.renderBoard(
        el('p', { class: 'game-instruction' }, t('game.replyPrompt')),
        thread,
        el('div', { class: 'options options-stacked reply-choices', role: 'group', 'aria-label': t('game.replyPrompt') }, choiceButtons)
      );
      shell.renderActions(nextBtn);

      // Hearing the line first is half the exercise.
      playPhrase(prompt);
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

/**
 * Every adjacent (line, next line) pair in the units in scope. In a scene,
 * only the pairs whose answer is the learner's own line.
 */
export function buildPairs(shell) {
  const scoped = shell.unitId ? shell.units.filter((unit) => unit.id === shell.unitId) : shell.units;
  const you = shell.cast && shell.cast.you;

  return scoped.flatMap((unit) => {
    const lines = unit.dialogue || [];
    return lines
      .slice(0, -1)
      .map((prompt, i) => ({ prompt, answer: lines[i + 1], unitId: unit.id }))
      .filter((pair) => !you || (pair.answer.speaker || 'A') === you);
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
