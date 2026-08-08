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
