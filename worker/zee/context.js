/**
 * Zee — what goes into the prompt.
 *
 * The whole point of this module is to send Azure as little as possible. The
 * lexicon holds 45 entries and the site map holds 14 pages; sending both in
 * full on every turn would triple the prompt for no benefit, so each turn gets
 * the compact page index plus only the glossary entries the learner's message
 * actually touches.
 */

import lexicon from '../../data/zee/lebanese-lexicon.json';
import siteContext from '../../data/zee/site-context.json';
import instructions from '../../data/zee/zee-instructions.txt';
import { LIMITS } from './config.js';

export { instructions };

/* --------------------------------------------------------------------------
   Lookup index
   --------------------------------------------------------------------------
   Built once per isolate. Keys are normalised the same way the practice games
   normalise typed answers: the Arabic chat alphabet uses digits for sounds
   English has no letter for and nobody spells them consistently, so 7/h, 3/gh,
   2/glottal stop, 5/kh all collapse together before matching. That is what lets
   "mar7aba", "marhaba" and "marhabaa" all find the same entry.
   -------------------------------------------------------------------------- */

export function normalise(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`´]/g, '2')
    .replace(/5/g, 'kh')
    .replace(/9/g, 's')
    .replace(/gh/g, '3')
    .replace(/aa/g, '3')
    .replace(/7/g, 'h')
    .replace(/2/g, '')
    .replace(/[^a-z0-9؀-ۿ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const index = new Map();

for (const entry of lexicon.entries) {
  const keys = [entry.canonical, entry.arabic, ...(entry.variants || []), ...(entry.synonyms || [])];
  for (const key of keys) {
    // A multi-word phrase is also indexed by each of its words, so "baddi" in
    // "baddi 2ahwe wasat" is findable on its own.
    for (const token of [key, ...String(key).split(/\s+/)]) {
      const norm = normalise(token);
      if (norm.length < 2) continue;
      if (!index.has(norm)) index.set(norm, entry);
    }
  }
}

/**
 * Glossary entries relevant to one message.
 *
 * Deliberately simple: exact token matches, then the English meanings, in the
 * order the words appeared. No stemming, no fuzzy distance — a miss costs
 * nothing (the model still answers) while a false positive wastes tokens and
 * pushes an unrelated definition at the learner.
 */
export function findGlossary(message, limit = LIMITS.maxGlossaryEntries) {
  const found = new Map();
  const words = String(message).split(/[\s.,!?؟،"'()]+/).filter(Boolean);

  for (const word of words) {
    const hit = index.get(normalise(word));
    if (hit && !found.has(hit.canonical)) found.set(hit.canonical, hit);
    if (found.size >= limit) break;
  }

  // "what does 'I want' mean in Lebanese" — the learner gave us the English.
  if (found.size < limit) {
    const haystack = String(message).toLowerCase();
    for (const entry of lexicon.entries) {
      if (found.size >= limit) break;
      const meaning = String(entry.meaning || '').toLowerCase();
      if (meaning.length > 3 && haystack.includes(meaning)) found.set(entry.canonical, entry);
    }
  }

  return [...found.values()];
}

/** One compact line per entry — this is prompt text, not a data dump. */
function renderGlossary(entries) {
  return entries
    .map((entry) => {
      const parts = [`${entry.canonical} (${entry.arabic}) = ${entry.meaning}`];
      if (entry.variants && entry.variants.length) parts.push(`also written: ${entry.variants.join(', ')}`);
      if (entry.notes) parts.push(entry.notes);
      if (entry.unit) parts.push(`taught in ${entry.unit}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

/* --------------------------------------------------------------------------
   Site map
   -------------------------------------------------------------------------- */

/** id -> page, the allowlist every navigation action is checked against. */
export const PAGES = new Map(siteContext.pages.map((page) => [page.id, page]));

/** The compact index the model sees every turn (~200 tokens). */
const PAGE_INDEX = siteContext.pages
  .map((page) => `- ${page.id}: ${page.title} — ${page.purpose}`)
  .join('\n');

const FACTS = siteContext.facts.map((fact) => `- ${fact}`).join('\n');

/**
 * Assemble the per-turn context block.
 *
 * Returned as a single developer-role message rather than being glued onto the
 * system instructions, so the model can tell the difference between "who you
 * are" (fixed) and "what is relevant right now" (changes every turn).
 */
export function buildContextBlock({ message, page }) {
  const glossary = findGlossary(message);
  const blocks = [];

  blocks.push(`HKEELI FACTS\n${FACTS}`);
  blocks.push(`HKEELI PAGES (the only ids you may use in a <<nav:id>> marker)\n${PAGE_INDEX}`);

  if (glossary.length) {
    blocks.push(
      `HKEELI GLOSSARY (curated — these spellings and meanings win over your own)\n${renderGlossary(glossary)}`
    );
  }

  const here = pageFromPath(page);
  if (here) {
    blocks.push(`WHERE THE LEARNER IS RIGHT NOW\n${here.title} (${here.url}) — ${here.purpose}`);
  }

  return blocks.join('\n\n');
}

/**
 * The last thing the model reads, after the learner's message.
 *
 * A small model drifts away from a long system message within a couple of
 * turns — it starts writing half a sentence in Latin letters and half in Arabic
 * script, which is unreadable for exactly the learner this site exists for.
 * Restating the two rules that matter most in the final position is what
 * actually holds them; it costs about 60 tokens a turn and is worth it.
 */
export function styleReminder() {
  return (
    'REMINDER, applies to the reply you are about to write:\n' +
    '1. Write Lebanese in Latin letters only — mar7aba, kifak, baddi, 3am, mni7. ' +
    'Do NOT put Arabic script in the middle of a sentence. Show the Arabic script ' +
    'only if the learner asked for it, and then on its own line.\n' +
    '2. Keep it to 2-5 short lines.\n' +
    '3. If a page from HKEELI PAGES answers this, end with its <<nav:id>> marker ' +
    'on the last line.'
  );
}

/** Match the browser's pathname to a known page, ignoring any hash. */
export function pageFromPath(path) {
  if (!path) return null;
  const clean = String(path).split('#')[0].split('?')[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return siteContext.pages.find((entry) => entry.url.split('#')[0].replace(/\/$/, '') === clean.replace(/\/$/, '')) || null;
}
