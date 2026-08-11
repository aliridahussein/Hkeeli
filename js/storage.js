/**
 * Hkeeli — progress persistence.
 *
 * Games never touch localStorage. They talk to the `progress` adapter below,
 * which exposes a deliberately small surface:
 *
 *   getPhraseState(id)             -> { box, dueAt, seen, correct, wrong }
 *   setPhraseState(id, patch)
 *   recordAnswer(gameId, id, ok)   -> updated phrase state
 *   getDueCards(phrases, limit)    -> phrases scheduled for review
 *   getGameStats(gameId)           -> { plays, best, lastScore, streak }
 *   recordSession(gameId, score, total)
 *
 * To move progress to a real backend later, write an `ApiProgress` object with
 * these same six methods and export it in place of `LocalStorageProgress`.
 * No game logic changes.
 */

import { CONFIG } from './config.js';

const EMPTY = { version: 1, phrases: {}, games: {}, updatedAt: null };

function blankPhrase() {
  return { box: 0, dueAt: 0, seen: 0, correct: 0, wrong: 0, lastSeen: null };
}

function blankGame() {
  return { plays: 0, best: 0, lastScore: 0, totalCorrect: 0, totalAnswered: 0 };
}

const DAY = 24 * 60 * 60 * 1000;

class LocalStorageProgress {
  constructor(key = CONFIG.storageKey) {
    this.key = key;
    this.state = this.#read();
  }

  /* Corrupt, absent, or foreign data must never break the page. */
  #read() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return structuredClone(EMPTY);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== EMPTY.version) {
        return structuredClone(EMPTY);
      }
      return { ...structuredClone(EMPTY), ...parsed };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  #write() {
    this.state.updatedAt = Date.now();
    try {
      localStorage.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* quota or private mode — progress is best-effort, never fatal */
    }
  }

  getPhraseState(id) {
    return { ...blankPhrase(), ...(this.state.phrases[id] || {}) };
  }

  setPhraseState(id, patch) {
    const next = { ...this.getPhraseState(id), ...patch };
    this.state.phrases[id] = next;
    this.#write();
    return next;
  }

  /**
   * Leitner scheduling: a correct answer promotes the card one box, a wrong
   * answer drops it back to box 0 so it comes round again this session.
   */
  recordAnswer(gameId, phraseId, correct) {
    const prev = this.getPhraseState(phraseId);
    const intervals = CONFIG.games.srsIntervals;
    const box = correct ? Math.min(prev.box + 1, intervals.length - 1) : 0;

    const next = this.setPhraseState(phraseId, {
      box,
      dueAt: Date.now() + intervals[box] * DAY,
      seen: prev.seen + 1,
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      lastSeen: Date.now()
    });

    const game = { ...blankGame(), ...(this.state.games[gameId] || {}) };
    game.totalAnswered += 1;
    game.totalCorrect += correct ? 1 : 0;
    this.state.games[gameId] = game;
    this.#write();

    return next;
  }

  /**
   * Review queue: overdue cards first (most overdue leading), then unseen
   * cards, so a new learner still gets a full session on day one.
   */
  getDueCards(phrases, limit = CONFIG.games.flashcardSession) {
    const now = Date.now();
    const scored = phrases.map((phrase) => {
      const state = this.getPhraseState(phrase.id);
      return { phrase, state, isNew: state.seen === 0, overdue: now - state.dueAt };
    });

    const due = scored
      .filter((entry) => !entry.isNew && entry.overdue >= 0)
      .sort((a, b) => b.overdue - a.overdue);
    const fresh = scored.filter((entry) => entry.isNew);

    return [...due, ...fresh].slice(0, limit).map((entry) => entry.phrase);
  }

  getGameStats(gameId) {
    return { ...blankGame(), ...(this.state.games[gameId] || {}) };
  }

  /**
   * How far through a unit a learner is, measured in phrases they have actually
   * answered at least once. Nothing here is a claim about mastery — it is the
   * honest count of what this device has seen.
   */
  getUnitProgress(unit) {
    const phrases = (unit && unit.phrases) || [];
    const total = phrases.length;
    const seen = phrases.filter((phrase) => this.getPhraseState(phrase.id).seen > 0).length;
    // "Learned" means the card has survived enough correct answers to sit in a
    // long Leitner box, not merely that it was shown once.
    const learned = phrases.filter((phrase) => this.getPhraseState(phrase.id).box >= 3).length;
    return {
      total,
      seen,
      learned,
      ratio: total ? seen / total : 0,
      status: seen === 0 ? 'new' : seen < total ? 'started' : 'complete'
    };
  }

  recordSession(gameId, score, total) {
    const game = { ...blankGame(), ...(this.state.games[gameId] || {}) };
    game.plays += 1;
    game.lastScore = score;
    game.best = Math.max(game.best, score);
    game.lastTotal = total;
    game.lastPlayed = Date.now();
    this.state.games[gameId] = game;
    this.#write();
    return game;
  }

  /** Exposed for a future "reset my progress" control. */
  reset() {
    this.state = structuredClone(EMPTY);
    this.#write();
  }
}

export const progress = new LocalStorageProgress();
export { LocalStorageProgress };

/* --------------------------------------------------------------------------
   Learner preferences
   --------------------------------------------------------------------------
   What the onboarding flow and the goal picker remember: why someone is
   learning, roughly where they are, and what they wanted to do first. It is
   kept apart from `progress` because it is answers, not performance — and
   because clearing progress should never clear who the learner is.

   Everything is optional. Every page must work for someone who has never
   answered a question, so `get()` always returns a complete object.
   -------------------------------------------------------------------------- */

const EMPTY_PREFS = { version: 1, goal: null, level: null, first: null, onboardedAt: null };

class LocalPrefs {
  constructor(key = CONFIG.prefsKey) {
    this.key = key;
  }

  get() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (!parsed || typeof parsed !== 'object' || parsed.version !== EMPTY_PREFS.version) {
        return { ...EMPTY_PREFS };
      }
      return { ...EMPTY_PREFS, ...parsed };
    } catch {
      return { ...EMPTY_PREFS };
    }
  }

  set(patch) {
    const next = { ...this.get(), ...patch, version: EMPTY_PREFS.version };
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      /* private mode — the choice just won't outlive the session */
    }
    return next;
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

export const prefs = new LocalPrefs();
