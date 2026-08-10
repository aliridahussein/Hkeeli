/**
 * Hkeeli — Daily Practice.
 *
 * The guided session that is now the front door to practice: a short sequence
 * of the games that already exist, in the order a lesson runs — review what you
 * met before, learn one new phrase, hear it, answer someone, build a sentence.
 *
 * It duplicates no game logic. Each step mounts a real game in a subclassed
 * GameShell whose only difference is what happens at the end of the round:
 * instead of offering "play again", it hands control back here and moves on.
 * Adding, removing or reordering steps is a CONFIG.daily.steps edit.
 */

import { CONFIG } from './config.js';
import { t, pick } from './i18n.js';
import { el, clear, playButton } from './ui.js';
import { GameShell, getGame } from './games/index.js';
import { progress } from './storage.js';
import { stopAudio, hasSlowAudio, playPhrase } from './audio.js';
import { usageLabel } from './journey.js';

/** Sessions are recorded under their own id, alongside the individual games. */
export const DAILY_ID = 'daily';

export class DailySession {
  /**
   * @param {HTMLElement} host
   * @param {object} context  { units, phrases, unitId, onExit }
   */
  constructor(host, context = {}) {
    this.host = host;
    this.units = context.units || [];
    this.phrases = context.phrases || [];
    this.unitId = context.unitId || null;
    this.onExit = context.onExit || (() => {});
    this.steps = plan(CONFIG.daily.steps, this);
    this.index = 0;
    this.correct = 0;
    this.answered = 0;
    this.shell = null;
  }

  start() {
    this.index = 0;
    this.correct = 0;
    this.answered = 0;
    this.#build();
    this.#runStep();
  }

  #build() {
    this.stepHost = el('div', { class: 'daily-host' });
    this.trail = el('ol', { class: 'daily-trail' });

    clear(this.host).append(
      el(
        'section',
        { class: 'daily-session', 'aria-labelledby': 'daily-session-title' },
        el(
          'header',
          { class: 'daily-session-head' },
          el('h2', { id: 'daily-session-title' }, t('daily.sessionTitle')),
          el(
            'button',
            { type: 'button', class: 'daily-exit', onClick: () => this.exit() },
            t('daily.exit')
          )
        ),
        this.trail,
        this.stepHost
      )
    );
  }

  /** The step rail doubles as the progress indicator and the plan of the session. */
  #renderTrail() {
    clear(this.trail).append(
      ...this.steps.map((step, i) =>
        el(
          'li',
          {
            class: 'daily-trail-step',
            dataset: { state: i < this.index ? 'done' : i === this.index ? 'current' : 'todo' },
            'aria-current': i === this.index ? 'step' : null
          },
          el('span', { class: 'daily-trail-index', 'aria-hidden': 'true' }, String(i + 1)),
          el('span', {}, t(step.labelKey))
        )
      )
    );
  }

  #runStep() {
    stopAudio();
    if (this.shell) {
      this.shell.destroy();
      this.shell = null;
    }

    if (this.index >= this.steps.length) return this.#summary();

    this.#renderTrail();
    const step = this.steps[this.index];
    if (step.kind === 'teach') this.#teachStep(step);
    else this.#gameStep(step);
  }

  #gameStep(step) {
    const game = getGame(step.game);
    this.shell = new StepShell(
      this.stepHost,
      game,
      this.phrases,
      {
        units: this.units,
        unitId: this.unitId,
        roundLength: step.length
      },
      (score, total) => {
        this.correct += score;
        this.answered += total;
        this.index += 1;
        this.#runStep();
      },
      t('daily.continue')
    );
    game.start(this.shell);
  }

  /**
   * The one step that isn't a game: a single phrase, taught rather than tested.
   * It is the card the spaced-repetition queue says is most overdue, so the
   * "learn or revisit" step really is the phrase this learner needs next.
   */
  #teachStep(step) {
    const [phrase] = progress.getDueCards(this.phrases, 1);
    if (!phrase) {
      this.index += 1;
      return this.#runStep();
    }

    const state = progress.getPhraseState(phrase.id);
    const usage = usageLabel(phrase);
    const play = playButton(phrase, 'teach-play');

    const done = el(
      'button',
      {
        type: 'button',
        class: 'btn-primary',
        onClick: () => {
          // Being shown a phrase is not the same as answering one: it moves the
          // card through the schedule but never counts toward the session score.
          progress.setPhraseState(phrase.id, { lastSeen: Date.now() });
          this.index += 1;
          this.#runStep();
        }
      },
      t('daily.continue')
    );

    clear(this.stepHost).append(
      el(
        'div',
        { class: 'daily-teach' },
        el('p', { class: 'daily-step-label' }, t(step.labelKey)),
        el('p', { class: 'prompt-hint' }, t(state.seen ? 'daily.teachAgain' : 'daily.teachNew')),
        el(
          'div',
          { class: 'teach-card' },
          el('div', { class: 'teach-main' }, el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar), play),
          el('p', { class: 'translit', dir: 'ltr' }, phrase.translit),
          el('p', { class: 'teach-en' }, phrase.en),
          phrase.literal
            ? el('p', { class: 'teach-note' }, `${t('phrase.literally')} “${pick(phrase.literal)}”`)
            : null,
          phrase.note ? el('p', { class: 'teach-note' }, pick(phrase.note)) : null,
          usage ? el('p', {}, el('span', { class: 'usage-tag' }, usage)) : null,
          hasSlowAudio(phrase)
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'mini-slow',
                  onClick: () => playPhrase(phrase, null, { slow: true })
                },
                t('mini.slow')
              )
            : null
        ),
        el('div', { class: 'game-actions' }, done)
      )
    );

    playPhrase(phrase, play);
  }

  #summary() {
    clear(this.trail);
    progress.recordSession(DAILY_ID, this.correct, this.answered);

    clear(this.stepHost).append(
      el(
        'div',
        { class: 'summary daily-summary' },
        el('div', { class: 'score-ring' }, `${this.correct}/${this.answered}`),
        el('h3', {}, t('daily.doneTitle')),
        el('p', {}, t('daily.doneBody', { score: this.correct, total: this.answered })),
        el('p', { class: 'prompt-hint' }, t('game.progressSaved')),
        el(
          'div',
          { class: 'daily-summary-actions' },
          el('button', { type: 'button', class: 'btn-primary', onClick: () => this.start() }, t('daily.again')),
          el('button', { type: 'button', class: 'btn-secondary', onClick: () => this.exit() }, t('daily.chooseGame'))
        )
      )
    );
  }

  exit() {
    stopAudio();
    if (this.shell) this.shell.destroy();
    this.shell = null;
    this.onExit();
  }

  destroy() {
    stopAudio();
    if (this.shell) this.shell.destroy();
    this.shell = null;
  }
}

/**
 * A game shell that belongs to a sequence: same board, same scoring, different
 * ending. The round summary the games already produce is kept — only the
 * "play again" action is swapped for "continue".
 */
class StepShell extends GameShell {
  constructor(host, game, phrases, context, onDone, continueLabel) {
    super(host, game, phrases, context);
    this.onDone = onDone;
    this.continueLabel = continueLabel;
  }

  finish(score = this.score, total = 0) {
    super.finish(score, total);
    this.renderActions(
      el('button', { type: 'button', class: 'btn-primary', onClick: () => this.onDone(score, total) }, this.continueLabel)
    );
  }
}

/**
 * Drop the steps that can't run with the material in scope — a unit filter can
 * leave a game with nothing to ask. Better a four-step session than a step that
 * shows "no phrases available" and strands the learner with no way forward.
 *
 * The checks mirror what each game needs to build a question; they are cheap
 * and local, and a game that slips through still renders its own empty state.
 */
function plan(steps, session) {
  const scoped = session.unitId
    ? session.units.filter((unit) => unit.id === session.unitId)
    : session.units;

  const dialoguePairs = scoped.reduce(
    (sum, unit) => sum + Math.max(0, (unit.dialogue || []).length - 1),
    0
  );
  const buildable =
    session.phrases.some((phrase) => tokenCount(phrase.translit) >= 3) ||
    scoped.some((unit) => (unit.dialogue || []).some((line) => tokenCount(line.translit) >= 3));

  const runnable = (step) => {
    if (step.kind === 'teach') return session.phrases.length > 0;
    const game = getGame(step.game);
    if (session.phrases.length < (game.minPhrases || 1)) return false;
    if (step.game === 'reply') return dialoguePairs > 0;
    if (step.game === 'order') return scoped.some((unit) => (unit.dialogue || []).length >= 3);
    if (step.game === 'build') return buildable;
    if (step.game === 'blank') return session.phrases.some((p) => p.blank || tokenCount(p.translit) >= 2);
    return true;
  };

  return steps.filter(runnable);
}

function tokenCount(translit) {
  const text = String(translit || '').trim();
  if (!text || text.includes('/')) return 0;
  return text.split(/\s+/).length;
}
