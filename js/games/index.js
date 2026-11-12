/**
 * Hkeeli — game registry and shared shell.
 *
 * The shell owns everything the seven games have in common: the heading, the
 * verdict bar, scoring and the streak, the hand-off between questions, and the
 * end-of-round summary. A game module only implements its own board.
 *
 * Every game draws from the same phrase bank (js/data.js), so any phrase added
 * to lessons.json becomes playable everywhere with no code change.
 *
 * ## Where a game lives
 *
 * Games run inside the play stage (js/stage.js). The shell renders its board
 * into the stage's scrolling content and its verdict bar into the stage's
 * footer, and reports progress and streak to the stage's top bar. Given no
 * stage, it renders a self-contained fallback — nothing in the shell assumes
 * one exists.
 *
 * ## The verdict bar
 *
 * The verdict and the button that acts on it are one element, pinned to the
 * bottom of the screen: idle, it holds whatever the game needs (Check, Show
 * answer); answered, it turns green or red, says what happened and offers the
 * way forward. It used to be a banner at the *top* of the board — four hundred
 * pixels from the option you had just tapped, and off-screen on a phone.
 *
 * The bar opens and closes on its own: a MutationObserver watches the action
 * row, so a game that reveals its Next button with `button.hidden = false`
 * opens the bar without knowing the bar exists. Tap-to-answer games (Listen,
 * Reply, Match) therefore have no bar at all until there is something to say.
 */

import { t } from '../i18n.js';
import { el, clear } from '../ui.js';
import { progress } from '../storage.js';
import { icon } from '../icons.js';
import { countUp, flyToken, swapBoard, sweepRing, indexChildren } from '../motion.js';
import { play as playCue } from '../sfx.js';
import { bookingBridge } from '../cta.js';
import { track } from '../analytics.js';
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

/** A streak worth a different sound. */
const MILESTONE = 5;

export class GameShell {
  /**
   * @param {HTMLElement} host    where the board renders
   * @param {object} game         a game module
   * @param {Array} phrases       the phrase bank, already scoped
   * @param {object} [context]
   *   units, unitId   whole units, for the dialogue games
   *   roundLength     cap on questions — scenes and Daily Practice run short rounds
   *   stage           the play stage, for progress, streak and the footer
   *   footer          where the verdict bar renders (defaults to the stage's)
   *   headless        omit the game's own heading (a scene step has its own)
   *   cast            { you: 'A'|'B', them: string, youLabel: string } — who is
   *                   who in a dialogue, so a scene can name the waiter
   *   session         the id of the session this game is a step of, if any
   *   onBack          "Done" on the summary — closes the stage
   */
  constructor(host, game, phrases, context = {}) {
    this.host = host;
    this.game = game;
    this.phrases = phrases;
    this.units = context.units || [];
    this.unitId = context.unitId || null;
    this.roundLength = context.roundLength || null;
    this.stage = context.stage || null;
    this.footerHost = context.footer || (this.stage && this.stage.footer) || null;
    this.headless = Boolean(context.headless);
    this.cast = context.cast || null;
    this.onBack = context.onBack || null;
    this.cleanups = [];
    this.score = 0;
    this.streak = 0;
    this.best = 0;
    this.again = 0;
    this.transitioning = false;
    /* 'quiz' games have right and wrong answers, so a streak means something.
       'review' games (flashcards) are self-graded: rewarding "Got it" with a
       streak would reward exactly the judgement the spaced-repetition
       scheduler depends on being honest. */
    this.mode = game.hudMode === 'review' ? 'review' : 'quiz';
    /* A standalone round ends with the bridge to booking; a round that is one
       step of a scene does not, or a six-step session would show it six times.
       StepShell turns it off. */
    this.showBridge = true;
    this.build();
    // A game inside a session is a step of that session, and the session
    // reports its own start and finish; counting it here too would double
    // every scene in a "rounds played" figure.
    if (!context.session) track('game_round_started', { game: game.id });
  }

  /* ---- structure -------------------------------------------------------- */

  build() {
    this.board = el('div', { class: 'game-board' });

    this.root = el(
      'div',
      { class: 'game', dataset: { game: this.game.id } },
      this.headless
        ? null
        : el(
            'header',
            { class: 'game-head' },
            el('span', { class: 'game-head-icon' }, icon(this.game.icon, { size: 22 })),
            el('h2', { class: 'game-head-title' }, t(this.game.titleKey))
          ),
      this.board
    );

    this.buildVerdict();
    clear(this.host).append(this.root);

    if (this.footerHost) clear(this.footerHost).append(this.verdict);
    else this.root.append(this.verdict);

    if (this.stage) this.stage.showStreak(this.mode === 'quiz');
  }

  buildVerdict() {
    this.verdictIcon = el('span', { class: 'verdict-icon', 'aria-hidden': 'true' });
    this.verdictTitle = el('span', { class: 'verdict-title' });
    this.verdictDetail = el('span', { class: 'verdict-detail' });
    this.feedbackEl = el(
      'div',
      { class: 'verdict-msg', role: 'status', 'aria-live': 'polite' },
      this.verdictIcon,
      el('span', { class: 'verdict-text' }, this.verdictTitle, this.verdictDetail)
    );
    this.actions = el('div', { class: 'verdict-actions' });

    this.verdict = el(
      'div',
      {
        class: `verdict ${this.footerHost ? '' : 'verdict--inline'}`.trim(),
        dataset: { state: 'idle', open: 'false' }
      },
      // inner clips while the bar animates its height; body carries the
      // padding, so a closed bar is truly zero tall.
      el('div', { class: 'verdict-inner' }, el('div', { class: 'verdict-body' }, this.feedbackEl, this.actions))
    );

    // Open the bar whenever there is a visible button in it or a verdict to
    // show — however the game got there.
    this.observer = new MutationObserver(() => this.syncVerdict());
    this.observer.observe(this.actions, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'disabled']
    });
    this.onCleanup(() => this.observer.disconnect());
  }

  syncVerdict() {
    const hasAction = [...this.actions.querySelectorAll('button, a')].some((node) => !node.hidden);
    const hasVerdict = this.verdict.dataset.state !== 'idle';
    this.verdict.dataset.open = String(hasAction || hasVerdict);
  }

  /**
   * How many questions (or cards, or pairs) this round should ask for.
   * Games call this instead of reading CONFIG directly, so a shorter round can
   * be requested — by a scene, or by Daily Practice — without any game knowing.
   */
  roundSize(preferred, available) {
    return Math.max(1, Math.min(this.roundLength || preferred, available));
  }

  /** Play a named cue (see js/sfx.js). Games use this for taps and placements. */
  cue(name) {
    playCue(name);
  }

  /* ---- progress --------------------------------------------------------- */

  setPosition(index, total) {
    this.position = { index, total };
    this.setProgress(total ? (index - 1) / total : 0);
    this.board.setAttribute('aria-label', t('stage.questionOf', { index, total }));
  }

  setProgress(fraction) {
    if (this.stage) this.stage.setProgress(fraction);
  }

  /**
   * Record a right or wrong answer.
   *
   * @param {boolean} correct
   * @param {HTMLElement} [origin] the element the learner actually tapped — the
   *        token flies from there to the streak, so the reward starts where
   *        their attention already is.
   */
  addScore(correct, origin = null) {
    if (correct) this.score += 1;
    else this.again += 1;

    if (this.mode === 'quiz') {
      this.streak = this.stage ? this.stage.bumpStreak(correct) : correct ? this.streak + 1 : 0;
      this.best = Math.max(this.best, this.streak);
    }

    if (correct) {
      if (origin && this.stage && this.mode === 'quiz') flyToken(origin, this.stage.streakEl, '+1');
      playCue(this.streak > 0 && this.streak % MILESTONE === 0 ? 'step' : 'correct');
    } else {
      playCue('wrong');
    }
  }

  /* ---- board / actions -------------------------------------------------- */

  /**
   * Replace the board immediately. Used for every render *within* a question —
   * placing a tile, flipping a card, revealing the answer.
   */
  renderBoard(...nodes) {
    clear(this.board).append(...nodes.flat().filter(Boolean));
    indexChildren(this.board);
    indexChildren(this.board, '.option, .match-item, .reply-choice');
  }

  /**
   * Move to the next question with a visible hand-off.
   *
   * ## Why the lock
   *
   * The hand-off takes about a third of a second, and for the first half of it
   * the *outgoing* board is still in the document with its handlers live. A
   * second tap on "Next" in that window ran the game's `advance()` twice. So
   * the controls are frozen for the duration, and every game's `advance()`
   * reads `transitioning` before it moves its index — `pointer-events` stops a
   * second tap, but not a programmatic `.click()` from the Enter key.
   */
  transitionTo(render) {
    if (this.transitioning) return Promise.resolve();
    this.transitioning = true;
    this.clearFeedback();
    this.setInteractive(false);
    if (this.stage) this.stage.body.scrollTo({ top: 0 });

    return swapBoard(this.board, render).finally(() => {
      this.setInteractive(true);
      this.transitioning = false;
    });
  }

  setInteractive(on) {
    const value = on ? '' : 'none';
    this.board.style.pointerEvents = value;
    this.actions.style.pointerEvents = value;
  }

  renderActions(...nodes) {
    clear(this.actions).append(...nodes.flat().filter(Boolean));
    this.syncVerdict();
  }

  /**
   * @param {'ok'|'bad'} tone
   * @param {string} title   "Correct!" / "Not quite."
   * @param {string} [detail] the answer, in all three scripts
   */
  showFeedback(tone, title, detail) {
    clear(this.verdictIcon).append(icon(tone === 'ok' ? 'check' : 'close', { size: 20 }));
    fill(this.verdictTitle, title);
    fill(this.verdictDetail, detail);
    this.verdictDetail.hidden = !(Array.isArray(detail) ? detail.length : detail);
    this.verdict.dataset.state = tone;
    this.syncVerdict();
    // Replay the arrival when one verdict replaces another.
    this.feedbackEl.classList.remove('is-in');
    void this.feedbackEl.offsetWidth;
    this.feedbackEl.classList.add('is-in');
  }

  clearFeedback() {
    this.verdict.dataset.state = 'idle';
    this.verdictTitle.textContent = '';
    this.verdictDetail.textContent = '';
    clear(this.verdictIcon);
    this.syncVerdict();
  }

  /* ---- persistence (never localStorage directly) ------------------------ */

  record(phraseId, correct, origin = null) {
    progress.recordAnswer(this.game.id, phraseId, correct);
    this.addScore(correct, origin);
  }

  /* ---- end of round ----------------------------------------------------- */

  finish(score = this.score, total = 0) {
    // A round can end from inside a transition; never leave the summary's own
    // buttons frozen by it.
    this.transitioning = false;
    this.setInteractive(true);
    progress.recordSession(this.game.id, score, total);
    this.clearFeedback();
    if (this.stage) {
      this.stage.complete();
      this.stage.showStreak(false);
      this.stage.body.scrollTo({ top: 0 });
    }
    track('game_round_completed', { game: this.game.id, score, total });
    playCue('complete');

    this.renderBoard(this.summary(score, total));
    this.renderActions(
      this.onBack
        ? el('button', { type: 'button', class: 'btn-secondary', onClick: () => this.onBack() }, t('stage.done'))
        : null,
      el(
        'button',
        { type: 'button', class: 'btn-primary', onClick: () => this.restart() },
        icon('repeat', { size: 18 }),
        el('span', {}, t('game.restart'))
      )
    );
  }

  /**
   * The end-of-round screen. The ring sweeps to the ratio and the number counts
   * to it: a static "6/8" is the correct information and no reward at all.
   */
  summary(score, total) {
    const isReview = this.mode === 'review';
    const ratio = total ? score / total : 0;
    const remark =
      ratio === 1 ? 'game.summaryPerfect' : ratio >= 0.6 ? 'game.summaryGood' : 'game.summaryKeep';

    const value = el('span', { class: 'score-ring-value' }, total ? `0/${total}` : '—');
    const ring = scoreRing(value);

    requestAnimationFrame(() => {
      sweepRing(ring.arc, ratio);
      if (total) countUpPair(value, score, total);
    });

    return el(
      'div',
      { class: 'summary' },
      ring.node,
      el('h2', { class: 'summary-title' }, t(isReview ? 'game.summaryReviewTitle' : 'game.summaryTitle')),
      el(
        'p',
        { class: 'summary-body' },
        isReview
          ? t('game.summaryReviewBody', { known: score, again: this.again })
          : t('game.summaryBody', { score, total })
      ),
      el('p', { class: 'summary-remark' }, t(remark)),
      this.best >= 3 && !isReview
        ? el(
            'p',
            { class: 'summary-streak' },
            icon('flame', { size: 18 }),
            el('span', {}, t('game.summaryStreak', { streak: this.best }))
          )
        : null,
      el('p', { class: 'summary-saved' }, t('game.progressSaved')),
      this.showBridge ? bookingBridge({ from: 'game', score, total }) : null
    );
  }

  restart() {
    this.destroy();
    this.score = 0;
    this.streak = 0;
    this.best = 0;
    this.again = 0;
    if (this.stage) {
      this.stage.streak = 0;
      this.stage.setSegments(1);
    }
    this.build();
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

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

/**
 * Set a verdict line. A string is plain text that follows the page's
 * direction (translated copy); an array of nodes is a phrase whose scripts
 * are each isolated — see phraseLine() in games/chat.js.
 */
function fill(node, value) {
  clear(node);
  if (value == null || value === '') return;
  if (typeof value === 'string') node.textContent = value;
  else node.append(...[value].flat().filter((part) => part != null && part !== ''));
}

/**
 * An SVG ring with a value inside it.
 *
 * SVG rather than a bordered div so the arc can sweep: a CSS border is
 * all-or-nothing, and `conic-gradient` can't be transitioned everywhere.
 * Colour and width stay in games.css.
 */
export function scoreRing(valueNode, { small = false } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'score-ring-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const circle = (cls) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '60');
    c.setAttribute('cy', '60');
    c.setAttribute('r', '52');
    c.setAttribute('class', cls);
    return c;
  };

  const arc = circle('score-ring-arc');
  svg.append(circle('score-ring-track'), arc);

  return {
    // Hidden from assistive tech: the number counts up over most of a second,
    // so a screen reader could announce "0/5", and every summary already
    // states the score in words beside it.
    node: el('div', { class: `score-ring ${small ? 'score-ring--small' : ''}`.trim(), 'aria-hidden': 'true' }, svg, valueNode),
    arc
  };
}

/**
 * Counts "0/8" up to "6/8" — the denominator never moves.
 *
 * `countUp` writes a bare number, so it drives an off-document proxy and this
 * mirrors it into the real node with the "/total" attached. That keeps the
 * easing in one place.
 */
export function countUpPair(node, score, total) {
  const proxy = el('span');
  countUp(proxy, 0, score, 900);

  const tick = () => {
    const at = Number(proxy.textContent) || 0;
    node.textContent = `${at}/${total}`;
    if (at < score) requestAnimationFrame(tick);
    else node.textContent = `${score}/${total}`;
  };
  requestAnimationFrame(tick);
}
