/**
 * Hkeeli — Scenes.
 *
 * A scene is not an eighth game. It is the seven that already exist, scoped to
 * one unit and framed as one situation — a café, a phone call — with a start,
 * a cast, and an ending that is the conversation you just had.
 *
 * What makes it a scene rather than a quiz with a theme:
 *
 *   1. **One unit, start to finish.** Every question is about the same place
 *      and the same people, so step four follows from step three.
 *   2. **A cast.** The other person has a name ("Waiter", "Teta") and a face
 *      in every bubble, and the learner is always "You" — the Answer step only
 *      ever asks for the learner's own lines.
 *   3. **An arc.** An intro that sets the scene and shows the six steps; a
 *      beat of narration at the top of each step; and at the end, the
 *      dialogue written out as the conversation you held, every line
 *      playable, your side marked.
 *   4. **Somewhere to go next.** The end of a scene offers the next scene by
 *      name. When there is none left to play, it offers the one thing a
 *      website can't do: a real conversation, with a person.
 *
 * Adding a scene is a data edit: one entry in `SCENES` naming a unit, plus the
 * `scene.<id>.*` strings in both language bundles. No new game code, ever.
 */

import { t, pick } from './i18n.js';
import { el } from './ui.js';
import { StepSession } from './session.js';
import { progress } from './storage.js';
import { bookingBridge } from './cta.js';
import { revealSequence, sweepRing } from './motion.js';
import { track } from './analytics.js';
import { icon } from './icons.js';
import { scoreRing } from './games/index.js';
import { chatBubble, initial, speakerOf } from './games/chat.js';

/* --------------------------------------------------------------------------
   The scenes
   --------------------------------------------------------------------------
   `unitId` is the whole scoping mechanism: the session runs on that unit's
   phrases and that unit's dialogue, which is what makes every step cohere.

   `you` says which speaker in the dialogue is the learner. It differs per
   scene — in the café someone serves you; on the phone you are the one who
   called — and the Answer step and the transcript both depend on it.

   The step shape is identical across scenes on purpose. It is the arc of a
   lesson — meet the words, learn the one that matters, hear it, answer it,
   say it, then do the whole thing — and a learner on their second scene
   should recognise the shape rather than learn a new one.
   -------------------------------------------------------------------------- */

const ARC = (id) => [
  { kind: 'game', game: 'cards', length: 3, labelKey: 'scene.stepWarm', beatKey: `scene.${id}.beat1` },
  { kind: 'teach', labelKey: 'scene.stepKey', beatKey: `scene.${id}.beat2` },
  { kind: 'game', game: 'listen', length: 3, labelKey: 'scene.stepHear', beatKey: `scene.${id}.beat3` },
  { kind: 'game', game: 'reply', length: 2, labelKey: 'scene.stepSay', beatKey: `scene.${id}.beat4` },
  { kind: 'game', game: 'build', length: 2, labelKey: 'scene.stepBuild', beatKey: `scene.${id}.beat5` },
  { kind: 'game', game: 'order', length: 1, labelKey: 'scene.stepWhole', beatKey: `scene.${id}.beat6` }
];

export const SCENES = [
  { id: 'cafe', unitId: 'unit-2', you: 'B', icon: 'cup', steps: ARC('cafe') },
  { id: 'teta', unitId: 'unit-3', you: 'A', icon: 'phone', steps: ARC('teta') }
];

export function getScene(id) {
  return SCENES.find((scene) => scene.id === id) || null;
}

/** Progress is recorded per scene, so "played the café" and "played teta" differ. */
export function sceneSessionId(scene) {
  return `scene-${scene.id}`;
}

/** A scene can only run if the unit it names is actually in the course. */
export function playableScenes(units) {
  return SCENES.filter((scene) => units.some((unit) => unit.id === scene.unitId));
}

export function hasPlayed(scene) {
  return progress.getGameStats(sceneSessionId(scene)).plays > 0;
}

/** The cast, in the current language. */
function castOf(scene) {
  return { you: scene.you, them: t(`scene.${scene.id}.them`), youLabel: t('scene.you') };
}

/* --------------------------------------------------------------------------
   The session
   -------------------------------------------------------------------------- */

export class SceneSession extends StepSession {
  /**
   * @param {Stage} stage
   * @param {object} context
   *   scene, units, onExit
   *   number         the scene's position in the list, for "Scene 2"
   *   nextScene      offered at the end, or null when every scene is played
   *   onStartScene   starts another scene in this same stage
   *
   * `phrases` is derived here rather than passed in: a scene is defined by
   * its unit, and letting a caller hand it a different phrase bank would
   * quietly break the one guarantee it makes.
   */
  constructor(stage, context = {}) {
    const scene = context.scene;
    const units = context.units || [];
    const unit = units.find((u) => u.id === scene.unitId) || null;

    super(stage, {
      units,
      // All units stay available: "What Do You Reply?" draws its wrong answers
      // from *other* units, and scoping those away would leave it with
      // distractors from the same conversation, several of which could fit.
      phrases: unit ? unit.phrases : [],
      unitId: scene.unitId,
      onExit: context.onExit,
      sessionId: sceneSessionId(scene),
      steps: scene.steps,
      cast: castOf(scene)
    });

    this.scene = scene;
    this.unit = unit;
    this.number = context.number || 1;
    this.nextScene = context.nextScene || null;
    this.onStartScene = context.onStartScene || null;
  }

  /* ---- the opening ------------------------------------------------------ */

  /**
   * Before anything is asked of you: where you are, who you're talking to,
   * and the shape of what's about to happen. Without it a scene opened
   * straight onto a flashcard, and nothing said it was a scene at all.
   */
  intro() {
    this.stage.showStreak(false);
    const id = this.scene.id;
    const plan = this.steps.map((step, i) =>
      el(
        'li',
        { class: 'scene-plan-step' },
        el('span', { class: 'scene-plan-index', 'aria-hidden': 'true' }, String(i + 1)),
        el('span', {}, t(step.labelKey))
      )
    );

    const content = this.stage.clearContent();
    content.append(
      el(
        'div',
        { class: 'scene-intro' },
        el('div', { class: 'scene-emblem', 'aria-hidden': 'true' }, icon(this.scene.icon, { size: 40 })),
        el('p', { class: 'scene-intro-eyebrow' }, t('scene.number', { n: this.number })),
        el('h2', { class: 'scene-intro-title' }, t(`scene.${id}.title`)),
        el('p', { class: 'scene-intro-setting' }, t(`scene.${id}.setting`)),
        el(
          'div',
          { class: 'scene-cast', role: 'list', 'aria-label': t('scene.castLabel') },
          castChip(this.cast.them, 'them', t('scene.castThem')),
          castChip(this.cast.youLabel, 'you', t('scene.castYou'))
        ),
        el(
          'div',
          { class: 'scene-plan-wrap' },
          el('h3', { class: 'scene-plan-title' }, t('scene.planTitle')),
          el('ol', { class: 'scene-plan' }, ...plan)
        ),
        this.unit && this.unit.outcome
          ? el(
              'p',
              { class: 'scene-intro-outcome' },
              el('span', { class: 'scene-intro-outcome-label' }, t('scene.outcomeLabel')),
              el('span', {}, pick(this.unit.outcome))
            )
          : null
      )
    );
    revealSequence(content.querySelectorAll('.scene-intro > *'), { step: 70, duration: 380 });

    this.footer(
      el(
        'button',
        { type: 'button', class: 'btn-primary btn-wide', onClick: () => this.begin() },
        el('span', {}, t('scene.start')),
        icon('forward', { size: 18, className: 'icon-dir' })
      )
    );
  }

  /* ---- the payoff ------------------------------------------------------- */

  /**
   * The end of a scene is the conversation, not the score.
   *
   * The dialogue is the one in `lessons.json` for this unit — the same lines
   * the learner just heard, answered and reassembled — rendered as a chat
   * they can play back, with their own side marked. The score is still there,
   * smaller, because it is the less interesting fact.
   */
  summary() {
    const lines = (this.unit && this.unit.dialogue) || [];
    const ratio = this.answered ? this.correct / this.answered : 0;

    const transcript = el(
      'div',
      { class: 'chat scene-transcript' },
      ...lines.map((line) => {
        const who = speakerOf(line, this.cast);
        return chatBubble(line, { who: who.who, name: who.name });
      })
    );

    const value = el('span', { class: 'score-ring-value' }, `${this.correct}/${this.answered}`);
    const ring = scoreRing(value, { small: true });

    requestAnimationFrame(() => {
      sweepRing(ring.arc, ratio);
      revealSequence(transcript.children, { step: 160, duration: 420 });
    });

    return el(
      'div',
      { class: 'scene-end' },
      el('div', { class: 'scene-emblem scene-emblem--done', 'aria-hidden': 'true' }, icon('check', { size: 36 })),
      el('p', { class: 'scene-end-eyebrow' }, t('scene.doneEyebrow')),
      el('h2', { class: 'scene-end-title' }, t(`scene.${this.scene.id}.done`)),
      el('p', { class: 'scene-end-body' }, t('scene.doneBody')),
      transcript,
      el(
        'div',
        { class: 'scene-score' },
        ring.node,
        el(
          'p',
          {},
          el('span', { class: 'scene-score-line' }, t('scene.scoreLine', { score: this.correct, total: this.answered })),
          el('span', { class: 'summary-saved' }, t('game.progressSaved'))
        )
      ),
      // When the footer's main button is already the booking link, the card
      // carries the argument without a second copy of the same button.
      bookingBridge({
        from: 'scene',
        score: this.correct,
        total: this.answered,
        sceneId: this.scene.id,
        withCta: Boolean(this.nextScene)
      })
    );
  }

  /**
   * The way forward is the next scene, named — or, once every scene has been
   * played, the lesson. "Choose a game instead" was the old ending, and it
   * sent a learner who had just enjoyed something back to a menu.
   */
  summaryActions() {
    const again = el(
      'button',
      { type: 'button', class: 'btn-secondary', onClick: () => this.start() },
      icon('repeat', { size: 18 }),
      el('span', {}, t('scene.replay'))
    );

    if (this.nextScene && this.onStartScene) {
      return [
        again,
        el(
          'button',
          {
            type: 'button',
            class: 'btn-primary',
            onClick: () => this.onStartScene(this.nextScene)
          },
          el('span', {}, t('scene.next', { title: t(`scene.${this.nextScene.id}.title`) })),
          icon('forward', { size: 18, className: 'icon-dir' })
        )
      ];
    }

    const book = el(
      'a',
      { class: 'btn-primary', href: 'index.html#book', dataset: { event: 'booking_cta_clicked', from: 'scene-end' } },
      icon('person', { size: 18 }),
      el('span', {}, t('bridge.cta'))
    );
    book.addEventListener('click', () => track('booking_cta_clicked', { from: 'scene-end', scene: this.scene.id }));
    return [again, book];
  }
}

function castChip(name, who, role) {
  return el(
    'div',
    { class: 'cast-chip', role: 'listitem', dataset: { who } },
    el('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, initial(name)),
    el('span', { class: 'cast-chip-text' }, el('span', { class: 'cast-chip-name' }, name), el('span', { class: 'cast-chip-role' }, role))
  );
}

/* --------------------------------------------------------------------------
   The hub card
   -------------------------------------------------------------------------- */

/**
 * The card a scene is started from.
 *
 * It states what the learner will be able to do — the unit's own `outcome`
 * from lessons.json, the same promise the Lessons page makes, so the two can
 * never drift apart — and how big the scene is in plain counts rather than a
 * guessed number of minutes.
 *
 * @param {object} scene
 * @param {object} unit
 * @param {object} options  { number, recommended, onStart }
 */
export function sceneCard(scene, unit, { number = 1, recommended = false, onStart }) {
  const stats = progress.getGameStats(sceneSessionId(scene));
  const played = stats.plays > 0;
  const questions = scene.steps.reduce((sum, step) => sum + (step.kind === 'game' ? step.length : 0), 0);
  const status = played ? 'done' : recommended ? 'next' : 'new';

  const badge = played
    ? el('span', { class: 'scene-badge', dataset: { tone: 'done' } }, icon('check', { size: 14 }), el('span', {}, t('scene.badgeDone', { score: stats.best, total: stats.lastTotal || questions })))
    : recommended
      ? el('span', { class: 'scene-badge', dataset: { tone: 'next' } }, el('span', {}, t('practice.startHere')))
      : null;

  const start = el(
    'button',
    { type: 'button', class: played ? 'btn-secondary' : 'btn-primary', onClick: () => onStart(scene) },
    el('span', {}, t(played ? 'scene.replay' : 'scene.start')),
    icon(played ? 'repeat' : 'forward', { size: 18, className: played ? '' : 'icon-dir' })
  );

  return el(
    'article',
    { class: 'scene-card', dataset: { scene: scene.id, status } },
    el(
      'div',
      { class: 'scene-card-art' },
      el('span', { class: 'scene-card-icon', 'aria-hidden': 'true' }, icon(scene.icon, { size: 34 })),
      badge
    ),
    el(
      'div',
      { class: 'scene-card-body' },
      el('p', { class: 'scene-card-eyebrow' }, t('scene.number', { n: number })),
      el('h3', { class: 'scene-card-title' }, t(`scene.${scene.id}.title`)),
      el('p', { class: 'scene-card-setting' }, t(`scene.${scene.id}.setting`)),
      unit && unit.outcome
        ? el(
            'p',
            { class: 'scene-card-outcome' },
            el('span', { class: 'scene-card-outcome-label' }, t('scene.outcomeLabel')),
            el('span', {}, pick(unit.outcome))
          )
        : null,
      el(
        'ul',
        { class: 'scene-card-facts' },
        el('li', {}, t('scene.stepCount', { count: scene.steps.length })),
        el('li', {}, t('scene.questionCount', { count: questions })),
        unit ? el('li', {}, t('scene.phraseCount', { count: unit.phrases.length })) : null
      )
    ),
    el('div', { class: 'scene-card-foot' }, start)
  );
}
