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

/* --------------------------------------------------------------------------
   English index
   --------------------------------------------------------------------------
   Half the questions arrive in English — "how do I order coffee?" — and until
   this existed they matched nothing, so the model answered from its own memory
   and invented words the course does not teach. Indexing the meanings by their
   content words is what puts Hkeeli's own vocabulary in front of it instead.
   -------------------------------------------------------------------------- */

const STOPWORDS = new Set(
  ('a an the to of for and or is are be it its you your my me i in on at with' +
    ' that this said say says how what when where who why do does did can could' +
    ' would like want good more most very said someone something person people')
    .split(' ')
);

const englishIndex = new Map();

for (const entry of lexicon.entries) {
  const words = String(entry.meaning || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

  for (const word of words) {
    if (!englishIndex.has(word)) englishIndex.set(word, []);
    const bucket = englishIndex.get(word);
    // A common word like "coffee" should bring its whole family of phrases, but
    // not flood the prompt.
    if (bucket.length < 4) bucket.push(entry);
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

  // "how do I say I want / order coffee" — the learner gave us the English.
  if (found.size < limit) {
    const english = String(message)
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word));

    for (const word of english) {
      for (const entry of englishIndex.get(word) || []) {
        if (found.size >= limit) break;
        if (!found.has(entry.canonical)) found.set(entry.canonical, entry);
      }
      if (found.size >= limit) break;
    }
  }

  return [...found.values()];
}

/**
 * One compact line per entry — this is prompt text, not a data dump.
 *
 * The Arabic sits in a labelled field at the end rather than in brackets beside
 * the transliteration. Side by side reads as "these two belong together in a
 * sentence", and a small model copies that pattern straight into its prose —
 * which is the script-mixing this whole prompt is trying to prevent.
 */
function renderGlossary(entries) {
  return entries
    .map((entry) => {
      const parts = [`${entry.canonical} = ${entry.meaning}`];
      if (entry.variants && entry.variants.length) parts.push(`also written: ${entry.variants.join(', ')}`);
      if (entry.notes) parts.push(entry.notes);
      if (entry.unit) parts.push(`taught in ${entry.unit}`);
      if (entry.arabic) parts.push(`script (phrase block only): ${entry.arabic}`);
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
      'HKEELI GLOSSARY (curated — these spellings and meanings win over your own. ' +
        'The Arabic script here is ONLY ever the middle line of a phrase block, ' +
        'never part of a sentence you write)\n' +
        renderGlossary(glossary)
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
    '1. Talk WITH them, do not just translate. React to what they said, answer ' +
    'briefly, then ask them something back in easy Lebanese so the conversation ' +
    'continues.\n' +
    '2. Your conversational sentences are Latin letters ONLY. Arabic script ' +
    'appears nowhere except on its own line inside a phrase block.\n' +
    '   WRONG: "Yalla, قوليلي: baddi shu?"\n' +
    '   WRONG: "Eh mazbout, baddi هيك بتنعاد كتير"\n' +
    '   RIGHT: "Yalla, 2ouleele: baddi shu?"\n' +
    '   RIGHT: "Eh mazbout — baddi bteji ktir bel 7ake."\n' +
    '3. When you teach a phrase, give it as three separate lines and nothing else ' +
    'on them:\n' +
    'kifak?\n' +
    'كيفك؟\n' +
    '"how are you?"\n' +
    '4. Keep it short — 2-5 conversational lines around at most one phrase block.\n' +
    '5. If a page from HKEELI PAGES answers this, end with its <<nav:id>> marker ' +
    'on the last line.'
  );
}

/** Match the browser's pathname to a known page, ignoring any hash. */
export function pageFromPath(path) {
  if (!path) return null;
  const clean = String(path).split('#')[0].split('?')[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return siteContext.pages.find((entry) => entry.url.split('#')[0].replace(/\/$/, '') === clean.replace(/\/$/, '')) || null;
}
