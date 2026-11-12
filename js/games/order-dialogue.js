/**
 * Order the Conversation — put a scrambled dialogue back in sequence.
 *
 * It reads the `dialogue` arrays in lessons.json, which every unit already
 * carries for the Lessons page. Turn-taking is the one thing the other games
 * can't teach — knowing "shu akhbarak" doesn't tell you when it lands.
 *
 * The board is a conversation being assembled. The lines wait below as cards;
 * tap one and it *travels up into the thread* as a chat bubble on its
 * speaker's side, and the next empty turn appears beneath it. Tap a bubble to
 * send it back down. Movement is FLIP (see js/motion.js): the board re-renders
 * from state on every tap, and the tiles animate between where they were and
 * where they now are.
 *
 * Note it does *not* call shell.record() — dialogue lines aren't phrases, and
 * writing them into the spaced-repetition store would pollute the phrase
 * scheduling with ids that no flashcard will ever show.
 */

import { t, pick } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { flip } from '../motion.js';
import { shuffle } from './shared.js';
import { chatBubble, playControl, speakerOf } from './chat.js';

const ROUND_LENGTH = 3;

export default {
  id: 'order',
  icon: 'thread',
  titleKey: 'games.orderTitle',
  blurbKey: 'games.orderBlurb',
  minPhrases: 1,

  start(shell) {
    // A dialogue is only worth ordering if there's a real sequence to it.
    const withDialogue = shell.units.filter((unit) => (unit.dialogue || []).length >= 3);
    const scoped = shell.unitId ? withDialogue.filter((unit) => unit.id === shell.unitId) : withDialogue;

    if (!scoped.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      shell.renderActions();
      return;
    }

    const round = shuffle(scoped).slice(0, shell.roundSize(ROUND_LENGTH, scoped.length));
    let index = 0;

    const question = () => {
      shell.clearFeedback();
      const unit = round[index];

      /* Lines are wrapped in tokens with a key rather than tagged directly:
         the line objects are the shared, cached lesson data, and a key has to
         be unique per round for FLIP to match a card to its bubble. Order is
         checked by token identity — never by a line `id`, which dialogue
         lines don't carry (comparing undefined with undefined scored every
         placement correct). */
      const tokens = unit.dialogue.map((line, i) => ({ line, key: `turn-${index}-${i}` }));
      const bank = shuffle(tokens);
      const placed = [];
      let checked = false;

      shell.setPosition(index + 1, round.length);

      const checkBtn = el('button', { type: 'button', class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { type: 'button', class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;

      const move = (mutate) => {
        shell.cue('place');
        flip(shell.board, () => {
          mutate();
          render();
        });
      };

      const render = () => {
        const thread = el(
          'div',
          { class: 'chat order-thread' },
          ...placed.map((token, slot) => {
            const who = speakerOf(token.line, shell.cast);
            return chatBubble(token.line, {
              who: who.who,
              name: who.name,
              flip: token.key,
              state: checked ? (token === tokens[slot] ? 'correct' : 'wrong') : null,
              disabled: checked,
              label: `${t('game.orderTakeBack')}: ${token.line.translit}`,
              onSelect: checked ? null : () => move(() => placed.splice(slot, 1))
            });
          }),
          // The empty turns still to fill, so the thread reads as a
          // conversation with gaps rather than a list that happens to be short.
          ...tokens.slice(placed.length).map((_, i) =>
            el(
              'div',
              { class: 'chat-ghost', 'aria-hidden': 'true' },
              el('span', {}, t('game.orderTurn', { n: placed.length + i + 1 }))
            )
          )
        );

        const remaining = bank.filter((token) => !placed.includes(token));
        const bankList = remaining.length
          ? el(
              'div',
              { class: 'order-bank', role: 'group', 'aria-label': t('game.orderBank') },
              ...remaining.map((token) => lineCard(token, shell.cast, () => {
                move(() => placed.push(token));
                playPhrase(token.line);
              }))
            )
          : null;

        shell.renderBoard(
          el('p', { class: 'game-instruction' }, t('game.orderPrompt')),
          shell.unitId ? null : el('p', { class: 'order-unit' }, `${t('learn.unitLabel')} ${unit.order} — ${pick(unit.title)}`),
          thread,
          bankList,
          !checked && !remaining.length ? el('p', { class: 'game-hint' }, t('game.orderRemoveHint')) : null
        );

        checkBtn.disabled = checked || placed.length !== tokens.length;
      };

      checkBtn.addEventListener('click', () => {
        if (checked || placed.length !== tokens.length) return;
        checked = true;

        const rightPlaces = placed.filter((token, i) => token === tokens[i]).length;
        const perfect = rightPlaces === tokens.length;

        shell.addScore(perfect, checkBtn);
        render();
        shell.showFeedback(
          perfect ? 'ok' : 'bad',
          perfect ? t('game.correct') : t('game.wrong'),
          t('game.orderResult', { right: rightPlaces, total: tokens.length })
        );

        checkBtn.hidden = true;
        nextBtn.hidden = false;
        nextBtn.focus({ preventScroll: true });
      });

      shell.renderActions(checkBtn, nextBtn);
      render();
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
 * A line waiting in the bank. The play control is a sibling of the select
 * button, not a child: a button inside a button is invalid and swallows focus.
 */
function lineCard(token, cast, onSelect) {
  const who = speakerOf(token.line, cast);
  const select = el(
    'button',
    { type: 'button', class: 'line-card-select' },
    el('span', { class: 'line-card-who', dataset: { who: who.who } }, who.name || ''),
    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, token.line.ar),
    el('span', { class: 'translit', dir: 'ltr' }, token.line.translit),
    el('span', { class: 'order-en' }, token.line.en)
  );
  select.addEventListener('click', onSelect);

  return el(
    'div',
    { class: 'line-card', dataset: { flip: token.key } },
    select,
    playControl(token.line, 'line-card-play')
  );
}
