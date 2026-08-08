/**
 * Match the Phrase — pair Lebanese with English.
 *
 * Tap-to-pair is the primary interaction, deliberately: it behaves identically
 * with a finger and a mouse, needs no drag surface, and stays keyboard
 * reachable. (Drag-and-drop would be a mouse-only path — see README.)
 */

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { el } from '../ui.js';
import { playPhrase } from '../audio.js';
import { sample, shuffle } from './shared.js';

export default {
  id: 'match',
  icon: '🔗',
  titleKey: 'games.matchTitle',
  blurbKey: 'games.matchBlurb',
  minPhrases: 4,

  start(shell) {
    const pairs = sample(shell.phrases, Math.min(CONFIG.games.matchPairs, shell.phrases.length));
    const total = pairs.length;
    let matched = 0;
    let selected = null; // { phraseId, button, side }

    shell.setPosition(0, total);

    const leftItems = shuffle(pairs).map((phrase) =>
      buildItem(phrase, 'ar', () =>
        el(
          'span',
          { class: 'arabic', dir: 'rtl', lang: 'ar' },
          phrase.ar
        )
      )
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
        if (side === 'ar') playPhrase(phrase);
        return;
      }

      const correct = selected.phrase.id === phrase.id;
      const partner = selected;
      clearSelection();

      if (correct) {
        button.dataset.state = 'matched';
        partner.button.dataset.state = 'matched';
        matched += 1;
        shell.record(phrase.id, true);
        shell.setPosition(matched, total);
        shell.showFeedback('ok', t('game.correct'), `${phrase.translit} — ${phrase.en}`);
        playPhrase(phrase);

        if (matched === total) {
          shell.showFeedback('ok', t('game.matchDone'));
          setTimeout(() => shell.finish(shell.score, total), 700);
        }
        return;
      }

      // Wrong pair: flash both, record against the phrase the learner picked.
      shell.record(phrase.id, false);
      shell.showFeedback('bad', t('game.wrong'), `${phrase.ar} = ${phrase.en}`);
      [button, partner.button].forEach((node) => {
        node.dataset.state = 'wrong';
        setTimeout(() => {
          if (node.dataset.state === 'wrong') delete node.dataset.state;
        }, 500);
      });
    }

    shell.renderBoard(
      el('p', { class: 'prompt-hint center-text' }, t('game.matchPrompt')),
      el(
        'div',
        { class: 'match-grid' },
        el('div', { class: 'match-col' }, el('h3', {}, t('game.matchLebanese')), leftItems),
        el('div', { class: 'match-col' }, el('h3', {}, t('game.matchEnglish')), rightItems)
      )
    );

    shell.renderActions(
      el('button', { class: 'btn-secondary', onClick: () => shell.restart() }, t('game.restart'))
    );
  }
};
