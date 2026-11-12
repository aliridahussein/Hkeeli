/**
 * Match the Phrase — pair Lebanese with English.
 *
 * Tap-to-pair is the primary interaction, deliberately: it behaves identically
 * with a finger and a mouse, needs no drag surface, and stays keyboard
 * reachable. (Drag-and-drop would be a pointer-only path — see README.)
 *
 * A right pair is its own feedback: both tiles flash green, settle, and step
 * back. The verdict bar only rises for a wrong pair, where it has something
 * to teach — what the phrase you picked actually means.
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { sample, shuffle } from './shared.js';
import { phraseLine } from './chat.js';

export default {
  id: 'match',
  icon: 'link',
  titleKey: 'games.matchTitle',
  blurbKey: 'games.matchBlurb',
  minPhrases: 4,

  start(shell) {
    const pairs = sample(shell.phrases, shell.roundSize(CONFIG.games.matchPairs, shell.phrases.length));
    const total = pairs.length;
    let matched = 0;
    let selected = null; // { phrase, button, side }

    shell.setPosition(1, total);
    shell.setProgress(0);

    const leftItems = shuffle(pairs).map((phrase) =>
      buildItem(phrase, 'ar', () => el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar))
    );
    const rightItems = shuffle(pairs).map((phrase) =>
      buildItem(phrase, 'en', () => el('span', { class: 'match-en' }, phrase.en))
    );

    function buildItem(phrase, side, content) {
      const button = el(
        'button',
        { type: 'button', class: 'match-item', 'data-phrase': phrase.id, 'data-side': side },
        content(),
        side === 'ar' ? el('span', { class: 'translit', dir: 'ltr' }, phrase.translit) : null
      );
      button.addEventListener('click', () => choose(phrase, button, side));
      return button;
    }

    function clearSelection() {
      if (selected && selected.button.dataset.state === 'selected') {
        delete selected.button.dataset.state;
      }
      selected = null;
    }

    function choose(phrase, button, side) {
      // Tapping the same tile again deselects it.
      if (selected && selected.button === button) {
        clearSelection();
        return;
      }

      // First tile, or swapping to another tile on the same side.
      if (!selected || selected.side === side) {
        clearSelection();
        selected = { phrase, button, side };
        button.dataset.state = 'selected';
        shell.cue('place');
        if (side === 'ar') playPhrase(phrase);
        return;
      }

      const correct = selected.phrase.id === phrase.id;
      const partner = selected;
      clearSelection();

      if (correct) {
        button.dataset.state = 'matched';
        partner.button.dataset.state = 'matched';
        [button, partner.button].forEach((node) => node.setAttribute('disabled', ''));
        matched += 1;
        shell.record(phrase.id, true, button);
        shell.setProgress(matched / total);
        shell.clearFeedback();
        playPhrase(phrase);

        if (matched === total) {
          setTimeout(() => shell.finish(shell.score, total), 650);
        }
        return;
      }

      // Wrong pair: flash both, record against the phrase the learner picked.
      shell.record(phrase.id, false, button);
      shell.showFeedback('bad', t('game.wrong'), phraseLine(phrase, { parts: ['ar', 'en'], sep: ' = ' }));
      [button, partner.button].forEach((node) => {
        node.dataset.state = 'wrong';
        setTimeout(() => {
          if (node.dataset.state === 'wrong') delete node.dataset.state;
        }, 520);
      });
    }

    shell.renderBoard(
      el('p', { class: 'game-instruction' }, t('game.matchPrompt')),
      el(
        'div',
        { class: 'match-grid' },
        el('div', { class: 'match-col', role: 'group', 'aria-label': t('game.matchLebanese') }, el('h3', {}, t('game.matchLebanese')), leftItems),
        el('div', { class: 'match-col', role: 'group', 'aria-label': t('game.matchEnglish') }, el('h3', {}, t('game.matchEnglish')), rightItems)
      )
    );

    shell.renderActions();
  }
};
