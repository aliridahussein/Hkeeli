/**
 * Order the Conversation — put a scrambled dialogue back in sequence.
 *
 * The only game that works on whole units rather than loose phrases: it reads
 * the `dialogue` arrays in lessons.json, which every unit already carries for
 * the Learn page. Turn-taking is the one thing the other games can't teach —
 * knowing "shu akhbarak" doesn't tell you when it lands in a conversation.
 *
 * Tap-to-place, mirroring Match: identical with finger and mouse, no drag
 * surface, keyboard reachable.
 *
 * Note it does *not* call shell.record() — dialogue lines aren't phrases, and
 * writing them into the spaced-repetition store would pollute the phrase
 * scheduling with ids that no flashcard will ever show.
 */

import { t, pick } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { shuffle } from './shared.js';

const ROUND_LENGTH = 3;

export default {
  id: 'order',
  icon: '💬',
  titleKey: 'games.orderTitle',
  blurbKey: 'games.orderBlurb',
  minPhrases: 1,

  start(shell) {
    // A dialogue is only worth ordering if there's a real sequence to it.
    const withDialogue = shell.units.filter((unit) => (unit.dialogue || []).length >= 3);
    const scoped = shell.unitId
      ? withDialogue.filter((unit) => unit.id === shell.unitId)
      : withDialogue;

    if (!scoped.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      shell.renderActions();
      return;
    }

    const round = shuffle(scoped).slice(0, Math.min(ROUND_LENGTH, scoped.length));
    let index = 0;

    const question = () => {
      shell.clearFeedback();
      const unit = round[index];
      const correctOrder = unit.dialogue;
      const bank = shuffle(correctOrder);
      const placed = [];
      let checked = false;

      shell.setPosition(index + 1, round.length);

      const checkBtn = el('button', { class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;

      const render = () => {
        const sequence = el(
          'ol',
          { class: 'order-sequence' },
          ...correctOrder.map((_, slot) => {
            const line = placed[slot];
            if (!line) {
              return el('li', { class: 'order-empty' }, `${slot + 1}`);
            }
            const state = checked
              ? line.id === correctOrder[slot].id
                ? 'correct'
                : 'wrong'
              : null;
            return el(
              'li',
              {},
              lineButton(line, slot + 1, {
                state,
                disabled: checked,
                onSelect: () => {
                  placed.splice(slot, 1);
                  bank.push(line);
                  render();
                }
              })
            );
          })
        );

        const remaining = bank.filter((line) => !placed.includes(line));
        const bankList = el(
          'div',
          { class: 'order-bank' },
          ...remaining.map((line) =>
            lineButton(line, null, {
              disabled: checked,
              onSelect: () => {
                placed.push(line);
                playPhrase(line);
                render();
              }
            })
          )
        );

        shell.renderBoard(
          el('p', { class: 'prompt-hint center-text' }, t('game.orderPrompt')),
          el('p', { class: 'order-unit' }, `${t('learn.unitLabel')} ${unit.order} — ${pick(unit.title)}`),
          sequence,
          remaining.length ? bankList : null,
          !checked && remaining.length === 0
            ? el('p', { class: 'prompt-hint center-text' }, t('game.orderRemoveHint'))
            : null
        );

        checkBtn.disabled = placed.length !== correctOrder.length || checked;
        shell.renderActions(checkBtn, nextBtn);
      };

      checkBtn.addEventListener('click', () => {
        if (checked) return;
        checked = true;

        const rightPlaces = placed.filter((line, i) => line.id === correctOrder[i].id).length;
        const perfect = rightPlaces === correctOrder.length;

        shell.addScore(perfect);
        render();
        shell.showFeedback(
          perfect ? 'ok' : 'bad',
          perfect ? t('game.correct') : t('game.wrong'),
          t('game.orderResult', { right: rightPlaces, total: correctOrder.length })
        );

        nextBtn.hidden = false;
        checkBtn.disabled = true;
        nextBtn.focus();
      });

      render();
    };

    function advance() {
      index += 1;
      if (index >= round.length) shell.finish(shell.score, round.length);
      else question();
    }

    question();
  }
};

/**
 * One dialogue line. The play control is a *sibling* of the select button, not
 * a child: a button inside a button is invalid and swallows keyboard focus.
 */
function lineButton(line, position, { state, disabled, onSelect }) {
  const select = el(
    'button',
    {
      type: 'button',
      class: 'order-line',
      dataset: state ? { state } : {},
      disabled: disabled || undefined
    },
    position
      ? el('span', { class: 'order-index', 'aria-hidden': 'true' }, String(position))
      : el('span', { class: 'order-speaker', 'aria-hidden': 'true' }, line.speaker || 'A'),
    el(
      'span',
      { class: 'order-text' },
      el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
      el('span', { class: 'translit', dir: 'ltr' }, line.translit),
      el('span', { class: 'order-en' }, line.en)
    )
  );
  select.addEventListener('click', onSelect);

  const play = el('button', {
    type: 'button',
    class: 'play order-play',
    'aria-label': `${t('game.playAudio')}: ${line.translit}`
  });
  play.addEventListener('click', () => playPhrase(line, play));

  return el('div', { class: 'order-row' }, select, play);
}
