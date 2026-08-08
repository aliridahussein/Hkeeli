/**
 * Hkeeli — game registry and shared shell.
 *
 * The shell owns everything the four games have in common: the heading, the
 * score/streak readout, the progress bar, the feedback banner, the sticky
 * action bar, and the end-of-round summary. A game module only implements its
 * own board.
 *
 * Every game draws from the same phrase bank (js/data.js), so any phrase added
 * to lessons.json becomes playable everywhere with no code change.
 */

import { t } from '../i18n.js';
import { el, clear } from '../ui.js';
import { progress } from '../storage.js';
import listenChoose from './listen-choose.js';
import match from './match.js';
import fillBlank from './fill-blank.js';
import flashcards from './flashcards.js';

export const GAMES = [listenChoose, match, fillBlank, flashcards];

export function getGame(id) {
  return GAMES.find((game) => game.id === id) || GAMES[0];
}

export class GameShell {
  /**
   * @param {HTMLElement} host    container the shell renders into
   * @param {object} game         a game module
   * @param {Array} phrases       the phrase bank
   */
  constructor(host, game, phrases) {
    this.host = host;
    this.game = game;
    this.phrases = phrases;
    this.cleanups = [];
    this.score = 0;
    this.streak = 0;
    this.#build();
  }

  #build() {
    this.titleEl = el('h2', {}, t(this.game.titleKey));
    this.scoreEl = el('b', {}, '0');
    this.streakEl = el('b', {}, '0');
    this.positionEl = el('b', {}, '—');
    this.progressFill = el('div', { class: 'progress-fill' });
    this.board = el('div', { class: 'game-board' });
    this.actions = el('div', { class: 'game-actions' });

    // Announced to screen readers so feedback isn't purely visual.
    this.feedbackEl = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    this.feedbackEl.hidden = true;

    const hud = el(
      'div',
      { class: 'game-hud' },
      this.titleEl,
      el(
        'div',
        { class: 'hud-stats' },
        el('span', {}, `${t('game.question')} `, this.positionEl),
        el('span', {}, `${t('game.score')} `, this.scoreEl),
        el('span', {}, `${t('game.streak')} `, this.streakEl)
      )
    );

    clear(this.host).append(
      el(
        'div',
        { class: 'game-shell' },
        hud,
        el('div', { class: 'progress-track' }, this.progressFill),
        this.board,
        this.actions
      )
    );
    this.board.append(this.feedbackEl);
  }

  /* ---- state readouts ---- */

  setPosition(index, total) {
    this.positionEl.textContent = total ? `${index}/${total}` : '—';
    this.setProgress(total ? (index - 1) / total : 0);
  }

  setProgress(fraction) {
    this.progressFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  addScore(correct) {
    if (correct) {
      this.score += 1;
      this.streak += 1;
    } else {
      this.streak = 0;
    }
    this.scoreEl.textContent = String(this.score);
    this.streakEl.textContent = String(this.streak);
  }

  /* ---- board / actions ---- */

  renderBoard(...nodes) {
    clear(this.board).append(this.feedbackEl, ...nodes.flat().filter(Boolean));
  }

  renderActions(...nodes) {
    clear(this.actions).append(...nodes.flat().filter(Boolean));
  }

  showFeedback(tone, title, detail) {
    clear(this.feedbackEl).append(
      el('span', {}, title),
      detail ? el('span', { class: 'feedback-detail' }, detail) : null
    );
    this.feedbackEl.dataset.tone = tone;
    this.feedbackEl.hidden = false;
  }

  clearFeedback() {
    this.feedbackEl.hidden = true;
    clear(this.feedbackEl);
  }

  /* ---- persistence (never localStorage directly) ---- */

  record(phraseId, correct) {
    progress.recordAnswer(this.game.id, phraseId, correct);
    this.addScore(correct);
  }

  /* ---- end of round ---- */

  finish(score = this.score, total = 0) {
    progress.recordSession(this.game.id, score, total);
    this.setProgress(1);
    this.positionEl.textContent = total ? `${total}/${total}` : '—';

    const ratio = total ? score / total : 0;
    const remark =
      ratio === 1 ? 'game.summaryPerfect' : ratio >= 0.6 ? 'game.summaryGood' : 'game.summaryKeep';

    this.renderBoard(
      el(
        'div',
        { class: 'summary' },
        el('div', { class: 'score-ring' }, `${score}/${total}`),
        el('h3', {}, t('game.summaryTitle')),
        el('p', {}, t('game.summaryBody', { score, total })),
        el('p', {}, t(remark)),
        el('p', { class: 'prompt-hint' }, t('game.progressSaved'))
      )
    );
    this.renderActions(
      el('button', { class: 'btn-primary', onClick: () => this.restart() }, t('game.restart'))
    );
  }

  restart() {
    this.destroy();
    this.score = 0;
    this.streak = 0;
    this.#build();
    this.game.start(this);
  }

  onCleanup(fn) {
    this.cleanups.push(fn);
  }

  destroy() {
    this.cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        /* a broken teardown shouldn't block switching games */
      }
    });
    this.cleanups = [];
  }
}
