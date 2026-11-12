/**
 * Sentence Builder — assemble a sentence from scrambled word tiles.
 *
 * Order the Conversation works at the level of whole lines; this works at the
 * level of words inside one line. It's the only game that asks a learner to
 * *produce* Lebanese word order rather than recognise it, which is the gap
 * between understanding "baddi 2ahwe wasat" and being able to say it.
 *
 * The prompt is the English meaning plus the audio — deliberately no Arabic
 * script and no transliteration, or the answer would just be there to copy.
 *
 * Tiles move. Tap one in the bank and it travels up onto the sentence line;
 * tap one on the line and it travels back. The board still re-renders from
 * state on every tap — FLIP (js/motion.js) is what turns that into motion.
 *
 * Material comes from two places: phrases of three words or more, and the
 * dialogue lines. Only the phrases go through shell.record(), since only they
 * have ids the spaced-repetition store knows about.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { flip } from '../motion.js';
import { shuffle, sample } from './shared.js';
import { bindChoiceKeys } from './keyboard.js';
import { phraseLine, latin } from './chat.js';

const MIN_WORDS = 3;

export default {
  id: 'build',
  icon: 'tiles',
  titleKey: 'games.buildTitle',
  blurbKey: 'games.buildBlurb',
  minPhrases: 1,

  start(shell) {
    const pool = buildItems(shell);
    if (!pool.length) {
      shell.renderBoard(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
      shell.renderActions();
      return;
    }

    const round = sample(pool, shell.roundSize(CONFIG.games.roundLength, pool.length));
    let index = 0;

    /* The only key this game wants is Enter: it checks a full sentence, then
       advances. Passing no options leaves A–D alone. */
    let keyState = {};
    bindChoiceKeys(shell, () => keyState);

    const question = () => {
      shell.clearFeedback();
      const item = round[index];
      // Keys are per question, so a tile can never FLIP-match a tile from the
      // previous sentence during the hand-off.
      const bank = shuffle(item.tokens.map((text, i) => ({ text, key: `w-${index}-${i}` })));
      const placed = [];
      let checked = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play play-lg',
        'aria-label': `${t('game.playAudio')}: ${item.en}`
      });
      playBtn.addEventListener('click', () => playPhrase(item.source, playBtn));

      const checkBtn = el('button', { type: 'button', class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { type: 'button', class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;
      keyState = { next: checkBtn };

      const move = (mutate) => {
        shell.cue('place');
        flip(shell.board, () => {
          mutate();
          render();
        });
      };

      const render = () => {
        const line = el(
          'div',
          { class: 'builder-line', dir: 'ltr', dataset: { empty: String(!placed.length) } },
          ...(placed.length
            ? placed.map((token, slot) =>
                tile(token, {
                  state: checked ? (token.text === item.tokens[slot] ? 'correct' : 'wrong') : null,
                  disabled: checked,
                  label: t('game.buildRemove'),
                  onSelect: () => move(() => placed.splice(slot, 1))
                })
              )
            : [el('span', { class: 'builder-placeholder' }, t('game.buildEmpty'))])
        );

        const remaining = bank.filter((token) => !placed.includes(token));
        const bankRow = el(
          'div',
          { class: 'builder-bank', dir: 'ltr', role: 'group', 'aria-label': t('game.buildBank') },
          ...remaining.map((token) =>
            tile(token, {
              disabled: checked,
              label: t('game.buildAdd'),
              onSelect: () => move(() => placed.push(token))
            })
          )
        );

        shell.renderBoard(
          el('p', { class: 'game-instruction' }, t('game.buildPrompt')),
          el(
            'div',
            { class: 'say-this' },
            el('span', { class: 'say-this-label' }, t('game.buildSay')),
            el('p', { class: 'say-this-en' }, item.en),
            playBtn
          ),
          line,
          bankRow,
          !checked && !remaining.length ? el('p', { class: 'game-hint' }, t('game.buildRemoveHint')) : null
        );

        checkBtn.disabled = checked || placed.length !== item.tokens.length;
      };

      checkBtn.addEventListener('click', () => {
        if (checked || placed.length !== item.tokens.length) return;
        checked = true;

        // Compare by text, not identity: a sentence with a repeated word is
        // still right when the two copies are swapped.
        const correct = placed.every((token, i) => token.text === item.tokens[i]);

        if (item.isPhrase) shell.record(item.id, correct, checkBtn);
        else shell.addScore(correct, checkBtn);

        render();
        shell.showFeedback(
          correct ? 'ok' : 'bad',
          correct ? t('game.correct') : [`${t('game.wrong')} ${t('game.theAnswerWas')} `, latin(item.translit)],
          phraseLine(item)
        );
        playPhrase(item.source, playBtn);

        checkBtn.hidden = true;
        nextBtn.hidden = false;
        keyState = { next: nextBtn };
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
 * Everything in scope that's long enough to be worth rebuilding.
 *
 * Transliterations carrying a slash ("kifak / kifik") are skipped: the slash is
 * an editorial "or", not a word, and tiling it up would teach nonsense.
 */
function buildItems(shell) {
  const scoped = shell.unitId ? shell.units.filter((u) => u.id === shell.unitId) : shell.units;
  // In a scene the learner says their own lines, never the other person's —
  // "say it yourself" over the waiter's "what would you like?" made no sense.
  const you = shell.cast && shell.cast.you;

  const usable = (source, isPhrase) => {
    const tokens = tokenize(source.translit);
    return tokens ? { ...toItem(source), tokens, isPhrase, source } : null;
  };

  return [
    ...shell.phrases.map((phrase) => usable(phrase, true)),
    ...scoped.flatMap((unit) =>
      (unit.dialogue || [])
        .filter((line) => !you || (line.speaker || 'A') === you)
        .map((line) => usable(line, false))
    )
  ].filter(Boolean);
}

function toItem(source) {
  return { id: source.id, ar: source.ar, translit: source.translit, en: source.en };
}

function tokenize(translit) {
  const text = String(translit || '').trim();
  if (!text || text.includes('/')) return null;
  const tokens = text.split(/\s+/);
  return tokens.length >= MIN_WORDS ? tokens : null;
}

/** One word tile. `data-flip` is what lets it travel between bank and line. */
function tile(token, { state, disabled, label, onSelect }) {
  const button = el(
    'button',
    {
      type: 'button',
      class: 'builder-chip',
      'aria-label': `${label}: ${token.text}`,
      dataset: { flip: token.key, ...(state ? { state } : {}) },
      disabled: disabled || undefined
    },
    token.text
  );
  button.addEventListener('click', onSelect);
  return button;
}
