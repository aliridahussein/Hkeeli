/**
 * Hkeeli — helpers shared by the practice games.
 */

import { CONFIG } from '../config.js';
import { shuffle, sample } from '../data.js';

export { shuffle, sample };

/**
 * Fold the many ways learners spell Lebanese in Latin script down to one
 * comparable form. The "Arabic chat alphabet" uses digits for sounds English
 * has no letters for, and nobody is consistent about them — so 7/h, 3/gh/aa,
 * 2/glottal stop, 5/kh and 9/s all collapse together, as do doubled letters.
 */
export function normalizeAnswer(input) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip Latin accents: é -> e
    .replace(/[’'`´]/g, '2') // glottal stop written as an apostrophe
    .replace(/5/g, 'kh')
    .replace(/9/g, 's')
    .replace(/gh/g, '3')
    .replace(/aa/g, '3')
    .replace(/7/g, 'h')
    .replace(/2/g, '')
    .replace(/[^a-z0-9]/g, '') // drop spaces, hyphens, slashes, punctuation
    .replace(/(.)\1+/g, '$1'); // kifak == kiffak
}

/** Classic iterative Levenshtein — small strings, so the simple version wins. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Is a typed answer close enough? Accepts the expected answer, any spelling
 * listed on the phrase, and anything within the configured edit distance —
 * a learner who writes "kifik" for "kifak" has understood the exercise.
 */
export function isAnswerAcceptable(input, expected, alternatives = []) {
  const given = normalizeAnswer(input);
  if (!given) return false;

  const candidates = [expected, ...alternatives]
    .filter(Boolean)
    .flatMap((value) => String(value).split('/')) // "kifak / kifik" -> both
    .map(normalizeAnswer)
    .filter(Boolean);

  return candidates.some(
    (candidate) =>
      given === candidate ||
      (candidate.length > 3 && levenshtein(given, candidate) <= CONFIG.games.fuzzyDistance)
  );
}

/**
 * Build a multiple-choice set: the correct phrase plus distractors whose
 * English differs from it, shuffled.
 */
export function buildOptions(correct, pool, count = CONFIG.games.optionCount) {
  const distractors = sample(
    pool.filter((p) => p.id !== correct.id && p.en !== correct.en),
    count - 1
  );
  return shuffle([correct, ...distractors]);
}

/** A, B, C, D — used as the keycap on each option button. */
export function optionKey(index) {
  return String.fromCharCode(65 + index);
}
