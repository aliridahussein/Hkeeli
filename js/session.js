/**
 * Hkeeli — the step session engine.
 *
 * A step session runs a sequence of real games as one experience inside the
 * play stage: it mounts each game in a `StepShell`, collects the scores, and
 * moves on when a round ends. It duplicates no game logic — the only
 * differences between a game inside a session and the same game on its own
 * are that it has no heading of its own (the session's step header replaces
 * it) and that finishing hands control back here.
 *
 * Two things are built on it:
 *
 *   - **Daily Practice** (js/daily.js) — a skills circuit across the course.
 *   - **Scenes** (js/scenes.js) — the same machinery scoped to one unit and
 *     framed as a situation, with an intro and a transcript at the end.
 *
 * ## How it uses the stage
 *
 *   - The progress bar is split into one segment per step, and the current
 *     segment fills as that step's questions are answered.
 *   - The streak lives on the stage, so it carries from step to step.
 *   - Each step opens with a header — "Step 3 of 6 · Listen" — and, in a
 *     scene, the beat: one line of narration that says where you are.
 *   - There is no "step complete" screen between steps. The last answer's
 *     verdict bar says how it went; "Next" goes straight into the next step.
 *     An interstitial would cost a tap per step and say nothing the progress
 *     bar doesn't.
 *
 * Subclasses override `intro()`, `stepHeader()`, `summary()` and
 * `summaryActions()`. None of the methods here are `#private` for that reason.
 */

import { t, pick } from './i18n.js';
import { el, clear } from './ui.js';
import { GameShell, getGame, scoreRing, countUpPair } from './games/index.js';
import { progress } from './storage.js';
import { stopAudio, hasSlowAudio, playPhrase } from './audio.js';
import { usageLabel } from './journey.js';
import { play as playCue } from './sfx.js';
import { swapBoard, sweepRing } from './motion.js';
import { bookingBridge } from './cta.js';
import { icon } from './icons.js';
import { track } from './analytics.js';

export class StepSession {
  /**
   * @param {Stage} stage
   * @param {object} context
   *   units, phrases, unitId  — the material, already scoped by the caller
   *   steps                   — [{ kind, game, length, labelKey, beatKey }]
   *   sessionId               — what progress is recorded under
   *   cast                    — who is who in the dialogue (scenes only)
   *   onExit                  — leave the session (closes the stage)
   */
  constructor(stage, context = {}) {
    this.stage = stage;
    this.units = context.units || [];
    this.phrases = context.phrases || [];
    this.unitId = context.unitId || null;
    this.cast = context.cast || null;
    this.onExit = context.onExit || (() => {});
    this.sessionId = context.sessionId || 'daily';
    this.steps = planSteps(context.steps || [], this);
    this.index = 0;
    this.correct = 0;
    this.answered = 0;
    this.shell = null;
    this.advancing = false;
  }

  start() {
    track('session_started', { session: this.sessionId });
    this.index = 0;
    this.correct = 0;
    this.answered = 0;
    this.advancing = false;
    this.stage.streak = 0;
    this.stage.setSegments(this.steps.length);
    this.intro();
  }

  /** Daily Practice has no intro: it starts the moment you ask for it. */
  intro() {
    this.begin();
  }

  begin() {
    this.index = 0;
    this.runStep();
  }

  /* ---- running ---------------------------------------------------------- */

  runStep() {
    stopAudio();
    if (this.shell) {
      this.shell.destroy();
      this.shell = null;
    }

    if (this.index >= this.steps.length) return this.finishSession();

    this.stage.setStep(this.index);
    const step = this.steps[this.index];
    const content = this.stage.clearContent();
    const header = this.stepHeader(step);

    if (step.kind === 'teach') this.teachStep(step, content, header);
    else this.gameStep(step, content, header);
  }

  /**
   * "Step 3 of 6 · Listen", plus the scene's beat when there is one. Daily
   * Practice has no beats: its steps are skills, and narrating a flashcard
   * drill would be invention.
   */
  stepHeader(step) {
    return el(
      'header',
      { class: 'step-head' },
      el(
        'p',
        { class: 'step-eyebrow' },
        el('span', {}, t('stage.stepOf', { n: this.index + 1, total: this.steps.length })),
        el('span', { class: 'step-eyebrow-dot', 'aria-hidden': 'true' }),
        el('span', {}, t(step.labelKey))
      ),
      step.beatKey ? el('p', { class: 'step-beat' }, t(step.beatKey)) : null
    );
  }

  /**
   * Advance, with a hand-off so one beat gives way to the next.
   *
   * Locked: the outgoing step is still live during its exit, and a second tap
   * would skip a step and double-count its score.
   */
  nextStep(score = 0, total = 0) {
    if (this.advancing) return;
    this.advancing = true;

    this.correct += score;
    this.answered += total;
    this.index += 1;
    track('session_step_completed', { session: this.sessionId, step: this.index });
    if (this.index < this.steps.length) playCue('step');

    const content = this.stage.content;
    content.style.pointerEvents = 'none';
    swapBoard(content, () => this.runStep(), { stagger: null }).finally(() => {
      content.style.pointerEvents = '';
      this.advancing = false;
    });
  }

  gameStep(step, content, header) {
    const game = getGame(step.game);
    const mount = el('div', { class: 'step-mount' });
    content.append(header, mount);

    this.shell = new StepShell(
      mount,
      game,
      this.phrases,
      {
        units: this.units,
        unitId: this.unitId,
        roundLength: step.length,
        stage: this.stage,
        headless: true,
        cast: this.cast,
        session: this.sessionId
      },
      (score, total) => this.nextStep(score, total)
    );
    game.start(this.shell);
  }

  /**
   * The one step that isn't a game: a single phrase, taught rather than tested.
   * It is the card the spaced-repetition queue says is most overdue, so the
   * "learn or revisit" step really is the phrase this learner needs next.
   */
  teachStep(step, content, header) {
    const [phrase] = progress.getDueCards(this.phrases, 1);
    if (!phrase) {
      this.index += 1;
      return this.runStep();
    }

    this.stage.showStreak(false);
    const state = progress.getPhraseState(phrase.id);
    const usage = usageLabel(phrase);

    const play = el('button', {
      type: 'button',
      class: 'play play-hero',
      'aria-label': `${t('game.playAudio')}: ${phrase.translit}`
    });
    play.addEventListener('click', () => playPhrase(phrase, play));

    content.append(
      header,
      el(
        'div',
        { class: 'teach' },
        el('p', { class: 'game-instruction' }, t(state.seen ? 'daily.teachAgain' : 'daily.teachNew')),
        el(
          'div',
          { class: 'teach-card' },
          el('div', { class: 'listen-hero-ring' }, play),
          el('p', { class: 'arabic teach-ar', dir: 'rtl', lang: 'ar' }, phrase.ar),
          el('p', { class: 'translit teach-translit', dir: 'ltr' }, phrase.translit),
          el('p', { class: 'teach-en' }, phrase.en),
          phrase.literal || phrase.note || usage
            ? el(
                'div',
                { class: 'teach-notes' },
                phrase.literal
                  ? el('p', { class: 'teach-note' }, `${t('phrase.literally')} “${pick(phrase.literal)}”`)
                  : null,
                phrase.note ? el('p', { class: 'teach-note' }, pick(phrase.note)) : null,
                usage ? el('span', { class: 'usage-tag' }, usage) : null
              )
            : null,
          hasSlowAudio(phrase)
            ? el(
                'button',
                { type: 'button', class: 'teach-slow', onClick: () => playPhrase(phrase, null, { slow: true }) },
                t('mini.slow')
              )
            : null
        )
      )
    );

    this.footer(
      el(
        'button',
        {
          type: 'button',
          class: 'btn-primary',
          onClick: () => {
            // Being shown a phrase is not the same as answering one: it moves
            // the card through the schedule but never counts toward the score.
            progress.setPhraseState(phrase.id, { lastSeen: Date.now() });
            this.nextStep(0, 0);
          }
        },
        el('span', {}, t('daily.continue')),
        icon('forward', { size: 18, className: 'icon-dir' })
      )
    );

    this.stage.setProgress(1);
    playPhrase(phrase, play);
  }

  /**
   * Put actions in the stage's footer for a screen that isn't a game — the
   * intro, the taught phrase, the end. Same verdict-bar markup as a game, so
   * the bottom of the screen behaves the same way everywhere.
   */
  footer(...buttons) {
    clear(this.stage.footer).append(
      el(
        'div',
        { class: 'verdict', dataset: { state: 'idle', open: 'true' } },
        el(
          'div',
          { class: 'verdict-inner' },
          el('div', { class: 'verdict-body' }, el('div', { class: 'verdict-actions' }, ...buttons.flat().filter(Boolean)))
        )
      )
    );
  }

  /* ---- ending ----------------------------------------------------------- */

  finishSession() {
    this.stage.complete();
    this.stage.showStreak(false);
    progress.recordSession(this.sessionId, this.correct, this.answered);
    track('session_completed', { session: this.sessionId, score: this.correct, total: this.answered });
    playCue('complete');

    this.stage.clearContent().append(this.summary());
    this.footer(...this.summaryActions());
  }

  /** The end screen. Scenes replace this with the transcript. */
  summary() {
    const ratio = this.answered ? this.correct / this.answered : 0;
    const value = el('span', { class: 'score-ring-value' }, `0/${this.answered}`);
    const ring = scoreRing(value);

    requestAnimationFrame(() => {
      sweepRing(ring.arc, ratio);
      countUpPair(value, this.correct, this.answered);
    });

    return el(
      'div',
      { class: 'summary' },
      ring.node,
      el('h2', { class: 'summary-title' }, t('daily.doneTitle')),
      el('p', { class: 'summary-body' }, t('daily.doneBody', { score: this.correct, total: this.answered })),
      el('p', { class: 'summary-saved' }, t('game.progressSaved')),
      bookingBridge({ from: 'daily', score: this.correct, total: this.answered })
    );
  }

  summaryActions() {
    return [
      el('button', { type: 'button', class: 'btn-secondary', onClick: () => this.exit() }, t('stage.done')),
      el(
        'button',
        { type: 'button', class: 'btn-primary', onClick: () => this.start() },
        icon('repeat', { size: 18 }),
        el('span', {}, t('daily.again'))
      )
    ];
  }

  exit() {
    this.destroy();
    this.onExit();
  }

  destroy() {
    stopAudio();
    if (this.shell) this.shell.destroy();
    this.shell = null;
  }
}

/**
 * A game shell that belongs to a sequence: same board and scoring, no heading
 * of its own, and a round that ends by handing back to the session instead of
 * showing a summary — the session's next step *is* what comes next.
 */
export class StepShell extends GameShell {
  constructor(host, game, phrases, context, onDone) {
    super(host, game, phrases, context);
    this.showBridge = false;
    this.onDone = onDone;
  }

  finish(score = this.score, total = 0) {
    this.transitioning = false;
    this.setInteractive(true);
    this.setProgress(1);
    this.onDone(score, total);
  }
}

/**
 * Drop the steps that can't run with the material in scope — a unit filter, or
 * a scene pinned to one unit, can leave a game with nothing to ask. Better a
 * five-step session than a step that shows "no phrases available" and strands
 * the learner with no way forward.
 */
export function planSteps(steps, session) {
  const scoped = session.unitId
    ? session.units.filter((unit) => unit.id === session.unitId)
    : session.units;

  // In a scene, "What Do You Reply?" only asks for the learner's own lines.
  const you = session.cast && session.cast.you;
  const replyPairs = scoped.reduce((sum, unit) => {
    const lines = unit.dialogue || [];
    return (
      sum +
      lines.slice(1).filter((line) => !you || (line.speaker || 'A') === you).length
    );
  }, 0);

  const buildable =
    session.phrases.some((phrase) => tokenCount(phrase.translit) >= 3) ||
    scoped.some((unit) => (unit.dialogue || []).some((line) => tokenCount(line.translit) >= 3));

  const runnable = (step) => {
    if (step.kind === 'teach') return session.phrases.length > 0;
    const game = getGame(step.game);
    if (session.phrases.length < (game.minPhrases || 1)) return false;
    if (step.game === 'reply') return replyPairs > 0;
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
