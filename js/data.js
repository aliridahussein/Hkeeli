/**
 * Hkeeli — lesson data access.
 *
 * The single place that knows lessons.json exists. Pages and games ask this
 * module for units and phrases; they never fetch. When a real content API
 * arrives, only `loadLessons` changes.
 */

import { CONFIG } from './config.js';

let cache = null;
let inflight = null;

/** Fetch and memoise the course data. Safe to call from every module. */
export async function loadLessons() {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = fetch(`${CONFIG.dataBase}${CONFIG.lessonsFile}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load lessons (${res.status})`);
      return res.json();
    })
    .then((json) => {
      cache = normalise(json);
      inflight = null;
      return cache;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/**
 * Give every phrase a back-reference to its unit and a guaranteed id, so games
 * can show provenance ("from Unit 2") without carrying the unit around.
 */
function normalise(json) {
  const units = (json.units || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  units.forEach((unit, ui) => {
    // Dialogue lines get ids too — Order the Conversation compares by id, and
    // the audio layer keys its file/TTS lookups on one.
    unit.dialogue = (unit.dialogue || []).map((line, li) => ({
      ...line,
      id: line.id || `${unit.id}-d${li + 1}`,
      unitId: unit.id
    }));

    unit.phrases = (unit.phrases || []).map((phrase, pi) => ({
      ...phrase,
      id: phrase.id || `${unit.id}-p${pi + 1}`,
      unitId: unit.id,
      unitTitle: unit.title,
      unitOrder: unit.order || ui + 1
    }));
  });
  return { ...json, units };
}

export async function getUnits() {
  const { units } = await loadLessons();
  return units;
}

export async function getFeaturedUnits(limit = 3) {
  const units = await getUnits();
  const featured = units.filter((u) => u.featured);
  return (featured.length ? featured : units).slice(0, limit);
}

export async function getUnit(id) {
  const units = await getUnits();
  return units.find((u) => u.id === id || u.slug === id) || null;
}

/** Every phrase in the course, flattened — the shared bank all games draw on. */
export async function getAllPhrases() {
  const units = await getUnits();
  return units.flatMap((u) => u.phrases);
}

/** Phrases that carry (or can derive) a fill-in-the-blank exercise. */
export async function getBlankPhrases() {
  const phrases = await getAllPhrases();
  return phrases.filter((p) => p.blank || deriveBlank(p));
}

/**
 * Build a blank from a phrase that doesn't declare one: hide the longest word
 * of the transliteration. Good enough for multi-word phrases; single-word
 * phrases are skipped so the exercise never becomes "fill in the whole thing".
 */
export function deriveBlank(phrase) {
  if (phrase.blank) return phrase.blank;
  const words = String(phrase.translit || '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;

  const target = words.reduce((a, b) => (b.length > a.length ? b : a));
  return {
    translit: words.map((w) => (w === target ? '___' : w)).join(' '),
    ar: phrase.ar,
    answer: target,
    derived: true
  };
}

/** Fisher–Yates, non-mutating. */
export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random sample without replacement. */
export function sample(list, count) {
  return shuffle(list).slice(0, count);
}
