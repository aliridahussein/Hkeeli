/**
 * Sentence Builder — assemble a sentence from scrambled word chips.
 *
 * Order the Conversation works at the level of whole lines; this works at the
 * level of words inside one line. It's the only game that asks a learner to
 * *produce* Lebanese word order rather than recognise it, which is the gap
 * between understanding "baddi 2ahwe wasat" and being able to say it.
 *
 * The prompt is the English meaning plus the audio — deliberately no Arabic
 * script and no transliteration, or the answer would just be there to copy.
 *
 * Material comes from two places: phrases of three words or more, and the
 * dialogue lines (which are longer, and thin the pool out much less when a
 * single unit is selected). Only the phrases go through shell.record(), since
 * only they have ids the spaced-repetition store knows about.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { shuffle, sample } from './shared.js';
import { bindChoiceKeys } from './keyboard.js';

const MIN_WORDS = 3;

export default {
  id: 'build',
  icon: '🧩',
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

    const round = sample(pool, Math.min(CONFIG.games.roundLength, pool.length));
    let index = 0;

    /* The only key this game wants is Enter: it checks a full sentence, then
       advances. Passing no options leaves A–D alone. */
    let keyState = {};
    bindChoiceKeys(shell, () => keyState);

    const question = () => {
      shell.clearFeedback();
      const item = round[index];
      const bank = shuffle(item.tokens.map((text, i) => ({ text, key: `${i}-${text}` })));
      const placed = [];
      let checked = false;

      shell.setPosition(index + 1, round.length);

      const playBtn = el('button', {
        type: 'button',
        class: 'play',
        'aria-label': `${t('game.playAudio')}: ${item.en}`
      });
      playBtn.addEventListener('click', () => playPhrase(item.source, playBtn));

      const checkBtn = el('button', { class: 'btn-primary' }, t('game.check'));
      const nextBtn = el('button', { class: 'btn-primary', onClick: advance }, t('game.next'));
      nextBtn.hidden = true;
      keyState = { next: checkBtn };

      const render = () => {
        const line = el(
          'div',
          { class: 'builder-line', dir: 'ltr' },
          ...(placed.length
            ? placed.map((token, slot) =>
                chip(token.text, {
                  state: checked ? (token.text === item.tokens[slot] ? 'correct' : 'wrong') : null,
                  // Walks the correct-answer pop along the sentence (see games.css).
                  index: slot,
                  disabled: checked,
                  label: t('game.buildRemove'),
                  onSelect: () => {
                    placed.splice(slot, 1);
                    render();
                  }
                })
              )
            : [el('span', { class: 'builder-placeholder' }, t('game.buildEmpty'))])
        );

        const remaining = bank.filter((token) => !placed.includes(token));
        const bankRow = el(
          'div',
          { class: 'builder-bank', dir: 'ltr' },
          ...remaining.map((token) =>
            chip(token.text, {
              disabled: checked,
              label: t('game.buildAdd'),
              onSelect: () => {
                placed.push(token);
                render();
              }
            })
          )
        );

        shell.renderBoard(
          el('p', { class: 'prompt-hint center-text' }, t('game.buildPrompt')),
          el('div', { class: 'builder-target' }, el('p', { class: 'builder-en' }, item.en), playBtn),
          line,
          remaining.length ? bankRow : null,
          !checked && !remaining.length
            ? el('p', { class: 'prompt-hint center-text' }, t('game.buildRemoveHint'))
            : null
        );

        checkBtn.disabled = checked || placed.length !== item.tokens.length;
        shell.renderActions(checkBtn, nextBtn);
      };

      checkBtn.addEventListener('click', () => {
        if (checked || placed.length !== item.tokens.length) return;
        checked = true;

        // Compare by text, not identity: a sentence with a repeated word is
        // still right when the two copies are swapped.
        const correct = placed.every((token, i) => token.text === item.tokens[i]);

        if (item.isPhrase) shell.record(item.id, correct);
        else shell.addScore(correct);

        render();
        shell.showFeedback(
          correct ? 'ok' : 'bad',
          correct ? t('game.correct') : `${t('game.wrong')} ${t('game.theAnswerWas')} “${item.translit}”`,
          `${item.ar} — ${item.translit} — ${item.en}`
        );
        playPhrase(item.source, playBtn);

        nextBtn.hidden = false;
        keyState = { next: nextBtn };
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
 * Everything in scope that's long enough to be worth rebuilding.
 *
 * Transliterations carrying a slash ("kifak / kifik") are skipped: the slash is
 * an editorial "or", not a word, and chipping it up would teach nonsense.
 */
function buildItems(shell) {
  const scoped = shell.unitId ? shell.units.filter((u) => u.id === shell.unitId) : shell.units;

  const usable = (source, isPhrase) => {
    const tokens = tokenize(source.translit);
    return tokens ? { ...toItem(source), tokens, isPhrase, source } : null;
  };

  return [
    ...shell.phrases.map((phrase) => usable(phrase, true)),
    ...scoped.flatMap((unit) => (unit.dialogue || []).map((line) => usable(line, false)))
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

/** One word. Tapping a placed chip takes it back out; tapping a bank chip plays it in. */
function chip(text, { state, disabled, label, index, onSelect }) {
  const button = el(
    'button',
    {
      type: 'button',
      class: 'builder-chip',
      'aria-label': `${label}: ${text}`,
      dataset: state ? { state } : {},
      disabled: disabled || undefined
    },
    text
  );
  if (index != null) button.style.setProperty('--i', String(index));
  button.addEventListener('click', onSelect);
  return button;
}
