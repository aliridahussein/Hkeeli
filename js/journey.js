/**
 * Hkeeli — the learning journey.
 *
 * One place that knows how the course is shaped and what to send a learner to
 * next. The home page, the Start Here flow, the Lessons page and Daily Practice
 * all ask this module rather than each inventing their own answer.
 *
 * Nothing here holds copy: every label is an i18n key, so the journey reads the
 * same in English and Arabic.
 */

import { t } from './i18n.js';
import { getUnits } from './data.js';
import { progress, prefs } from './storage.js';

/* --------------------------------------------------------------------------
   Stages — the progression a learner moves through
   --------------------------------------------------------------------------
   A unit joins a stage by declaring `stage` in lessons.json. Stages with no
   units yet are still shown, marked as planned, so the path is visible without
   pretending the material exists.
   -------------------------------------------------------------------------- */

export const STAGES = [
  { id: 'first-conversations', titleKey: 'journey.s1Title', outcomeKey: 'journey.s1Outcome' },
  { id: 'everyday-situations', titleKey: 'journey.s2Title', outcomeKey: 'journey.s2Outcome' },
  { id: 'family-and-social', titleKey: 'journey.s3Title', outcomeKey: 'journey.s3Outcome' },
  { id: 'needs-and-opinions', titleKey: 'journey.s4Title', outcomeKey: 'journey.s4Outcome' },
  { id: 'natural-conversation', titleKey: 'journey.s5Title', outcomeKey: 'journey.s5Outcome' }
];

/** Stages with their units attached, in course order. */
export async function getJourney() {
  const units = await getUnits();
  return STAGES.map((stage) => {
    const stageUnits = units.filter((unit) => unit.stage === stage.id);
    return {
      ...stage,
      units: stageUnits,
      planned: stageUnits.length === 0,
      progress: aggregate(stageUnits)
    };
  });
}

function aggregate(units) {
  return units.reduce(
    (acc, unit) => {
      const p = progress.getUnitProgress(unit);
      acc.seen += p.seen;
      acc.total += p.total;
      acc.ratio = acc.total ? acc.seen / acc.total : 0;
      return acc;
    },
    { seen: 0, total: 0, ratio: 0 }
  );
}

/* --------------------------------------------------------------------------
   Goals — "why are you learning?"
   --------------------------------------------------------------------------
   Each goal points at a unit that exists today and, where it makes sense, at
   the practice game that drills that goal most directly.
   -------------------------------------------------------------------------- */

export const GOALS = [
  {
    id: 'family',
    labelKey: 'goals.familyLabel',
    blurbKey: 'goals.familyBlurb',
    unitId: 'unit-3',
    gameId: 'cards'
  },
  {
    id: 'visit',
    labelKey: 'goals.visitLabel',
    blurbKey: 'goals.visitBlurb',
    unitId: 'unit-2',
    gameId: 'listen'
  },
  {
    id: 'understand',
    labelKey: 'goals.understandLabel',
    blurbKey: 'goals.understandBlurb',
    unitId: 'unit-3',
    gameId: 'reply'
  },
  {
    id: 'zero',
    labelKey: 'goals.zeroLabel',
    blurbKey: 'goals.zeroBlurb',
    unitId: 'unit-1',
    gameId: 'listen'
  },
  {
    id: 'pronunciation',
    labelKey: 'goals.pronunciationLabel',
    blurbKey: 'goals.pronunciationBlurb',
    unitId: 'unit-1',
    gameId: 'listen'
  }
];

export function getGoal(id) {
  return GOALS.find((goal) => goal.id === id) || null;
}

/** The Start Here answers that aren't goals. */
export const LEVELS = [
  { id: 'zero', labelKey: 'start.levelZero' },
  { id: 'some', labelKey: 'start.levelSome' },
  { id: 'heritage', labelKey: 'start.levelHeritage' },
  { id: 'conversational', labelKey: 'start.levelConversational' }
];

export const FIRST_ACTIONS = [
  { id: 'phrases', labelKey: 'start.firstPhrases' },
  { id: 'listening', labelKey: 'start.firstListening' },
  { id: 'conversation', labelKey: 'start.firstConversation' }
];

/* --------------------------------------------------------------------------
   Recommendation
   -------------------------------------------------------------------------- */

/**
 * Turn the three onboarding answers into one concrete next step.
 *
 * Rules, in order:
 *   - a complete beginner always starts at unit 1, whatever their goal — the
 *     goal decides where they go *after* the greetings;
 *   - "practice listening" and "prepare for conversation" go to a game, since
 *     the lesson pages are reading, not drilling;
 *   - everything else opens the unit that matches the goal.
 *
 * Returns a plain descriptor; the caller decides how to render it.
 *
 * @param {{goal?: string, level?: string, first?: string}} answers
 * @returns {{kind: 'lesson'|'practice', href: string, unitId?: string,
 *            gameId?: string, reasonKey: string}}
 */
export function recommend(answers = {}) {
  const goal = getGoal(answers.goal) || getGoal('zero');
  const beginner = answers.level === 'zero' || !answers.level;
  const unitId = beginner ? 'unit-1' : goal.unitId;

  if (answers.first === 'listening') {
    return {
      kind: 'practice',
      gameId: 'listen',
      unitId,
      href: `practice.html?unit=${encodeURIComponent(unitId)}#listen`,
      reasonKey: 'start.reasonListening'
    };
  }

  if (answers.first === 'conversation') {
    return {
      kind: 'practice',
      gameId: 'reply',
      unitId,
      href: `practice.html?unit=${encodeURIComponent(unitId)}#reply`,
      reasonKey: 'start.reasonConversation'
    };
  }

  return {
    kind: 'lesson',
    unitId,
    href: `learn.html#${unitId}`,
    reasonKey: beginner ? 'start.reasonBeginner' : 'start.reasonGoal'
  };
}

/** The saved recommendation, or the default one for a first-time visitor. */
export function savedRecommendation() {
  return recommend(prefs.get());
}

/* --------------------------------------------------------------------------
   Continue where you left off
   -------------------------------------------------------------------------- */

/**
 * The unit a learner should open next: the first one they've started but not
 * finished, else the first untouched one, else the last unit in the course.
 */
export async function nextUnit() {
  const units = await getUnits();
  const started = units.find((unit) => progress.getUnitProgress(unit).status === 'started');
  if (started) return started;
  const fresh = units.find((unit) => progress.getUnitProgress(unit).status === 'new');
  return fresh || units[units.length - 1] || null;
}

/** How many phrases across the whole course are due for review right now. */
export async function dueCount() {
  const units = await getUnits();
  const now = Date.now();
  return units
    .flatMap((unit) => unit.phrases)
    .filter((phrase) => {
      const state = progress.getPhraseState(phrase.id);
      return state.seen > 0 && state.dueAt <= now;
    }).length;
}

/* --------------------------------------------------------------------------
   Usage labels
   --------------------------------------------------------------------------
   Derived from the `tags` already on each phrase — no new claims about the
   language, just a readable name for what the data already says. A phrase with
   no matching tag gets no label rather than a guessed one.
   -------------------------------------------------------------------------- */

const TAG_LABELS = [
  ['slang', 'phrase.registerCasual'],
  ['blessing', 'phrase.registerBlessing'],
  ['politeness', 'phrase.registerPolite'],
  ['feelings', 'phrase.registerAffectionate'],
  ['family', 'phrase.registerFamily'],
  ['greeting', 'phrase.registerEveryday']
];

export function usageLabel(phrase) {
  const tags = (phrase && phrase.tags) || [];
  const match = TAG_LABELS.find(([tag]) => tags.includes(tag));
  return match ? t(match[1]) : null;
}
