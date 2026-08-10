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
import sentenceBuilder from './sentence-builder.js';
import orderDialogue from './order-dialogue.js';
import reply from './reply.js';
import flashcards from './flashcards.js';

export const GAMES = [
  listenChoose,
  match,
  fillBlank,
  sentenceBuilder,
  orderDialogue,
  reply,
  flashcards
];

export function getGame(id) {
  return GAMES.find((game) => game.id === id) || GAMES[0];
}

/**
 * The games grouped by the skill they train.
 *
 * Seven equally-weighted tiles is a menu, not a recommendation — grouping them
 * lets a learner pick by what they want to get better at instead of by icon.
 * Every game appears exactly once; a game added to GAMES but not to a group
 * would vanish from the picker, so `ungroupedGames()` catches that.
 */
export const GAME_GROUPS = [
  { id: 'listening', titleKey: 'practice.skillListening', games: ['listen'] },
  { id: 'understanding', titleKey: 'practice.skillUnderstanding', games: ['match', 'blank'] },
  { id: 'building', titleKey: 'practice.skillBuilding', games: ['build', 'order'] },
  { id: 'responding', titleKey: 'practice.skillResponding', games: ['reply'] },
  { id: 'remembering', titleKey: 'practice.skillRemembering', games: ['cards'] }
];

/** Any game missing from GAME_GROUPS, so nothing silently disappears. */
export function ungroupedGames() {
  const grouped = new Set(GAME_GROUPS.flatMap((group) => group.games));
  return GAMES.filter((game) => !grouped.has(game.id));
}

export class GameShell {
  /**
   * @param {HTMLElement} host    container the shell renders into
   * @param {object} game         a game module
   * @param {Array} phrases       the phrase bank (already scoped to the unit
   *                              filter, if one is active)
   * @param {object} [context]    { units, unitId } for games that need whole
   *                              units rather than loose phrases, plus an
   *                              optional `roundLength` cap — Daily Practice
   *                              runs the same games in short bursts.
   */
  constructor(host, game, phrases, context = {}) {
    this.host = host;
    this.game = game;
    this.phrases = phrases;
    this.units = context.units || [];
    this.unitId = context.unitId || null;
    this.roundLength = context.roundLength || null;
    this.cleanups = [];
    this.score = 0;
    this.streak = 0;
    this.again = 0;
    /* 'quiz' games have right and wrong answers, so a score and a streak mean
       something. 'review' games (flashcards) are self-graded: showing a score
       there rewards pressing "Got it", which is exactly the judgement the
       spaced-repetition scheduler depends on being honest. So they count
       what's known and what's coming back instead. */
    this.mode = game.hudMode === 'review' ? 'review' : 'quiz';
    this.#build();
  }

  #build() {
    const isReview = this.mode === 'review';
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
        el('span', {}, `${t(isReview ? 'game.card' : 'game.question')} `, this.positionEl),
        el('span', {}, `${t(isReview ? 'game.known' : 'game.score')} `, this.scoreEl),
        el('span', {}, `${t(isReview ? 'game.toReview' : 'game.streak')} `, this.streakEl)
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

  /**
   * How many questions (or cards, or pairs) this round should ask for.
   * Games call this instead of reading CONFIG directly, so a shorter round can
   * be requested — by Daily Practice — without any game knowing about it.
   */
  roundSize(preferred, available) {
    return Math.max(1, Math.min(this.roundLength || preferred, available));
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
      this.again += 1;
    }
    this.scoreEl.textContent = String(this.score);
    // In review mode the second stat is "how many are coming back", not a streak.
    this.streakEl.textContent = String(this.mode === 'review' ? this.again : this.streak);
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

    const isReview = this.mode === 'review';
    const ratio = total ? score / total : 0;
    const remark =
      ratio === 1 ? 'game.summaryPerfect' : ratio >= 0.6 ? 'game.summaryGood' : 'game.summaryKeep';

    this.renderBoard(
      el(
        'div',
        { class: 'summary' },
        el('div', { class: 'score-ring' }, `${score}/${total}`),
        el('h3', {}, t(isReview ? 'game.summaryReviewTitle' : 'game.summaryTitle')),
        el(
          'p',
          {},
          isReview
            ? t('game.summaryReviewBody', { known: score, again: this.again })
            : t('game.summaryBody', { score, total })
        ),
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
    this.again = 0;
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
