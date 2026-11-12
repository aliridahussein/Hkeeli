/**
 * Hkeeli — bilingual UI layer.
 *
 * Markup never contains UI copy. Elements declare a key:
 *
 *   <h1 data-i18n="hero.titleBefore"></h1>
 *   <button data-i18n-attr="aria-label:game.playAudio"></button>
 *   <p data-i18n="game.summaryBody" data-i18n-vars='{"score":3,"total":8}'></p>
 *
 * Switching language rewrites those nodes, flips <html lang/dir>, and notifies
 * listeners via the `hkeeli:langchange` event. No page reload.
 */

import { CONFIG } from './config.js';

const bundles = new Map();
let current = CONFIG.defaultLang;

/** Resolve "a.b.c" against a nested object. */
function lookup(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Replace {name} placeholders. */
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/**
 * Fetch a bundle from the server.
 *
 * `no-cache` means "always ask the server; a 304 is fine". A bundle has to be
 * the copy that matches the code asking for its keys, and a cache that hands
 * this page yesterday's en.json under today's scripts renders raw keys
 * ("practice.heroTitle") in place of headlines. The conditional request costs
 * a few hundred bytes when nothing has changed.
 */
async function fetchBundle(lang, cache = 'no-cache') {
  const res = await fetch(`${CONFIG.dataBase}${lang}.json`, { cache });
  if (!res.ok) throw new Error(`Missing translation bundle: ${lang}`);
  return res.json();
}

async function loadBundle(lang) {
  if (bundles.has(lang)) return bundles.get(lang);
  const bundle = await fetchBundle(lang);
  bundles.set(lang, bundle);
  return bundle;
}

/** The value for a key in the current language, else the default; undefined if neither has it. */
function resolve(key) {
  return lookup(bundles.get(current), key) ?? lookup(bundles.get(CONFIG.defaultLang), key);
}

/**
 * Translate a key. Falls back to the default language, then to the key itself
 * so a missing string is visible in development rather than silently empty —
 * and every miss is reported once to the console, and triggers the one-off
 * re-fetch below.
 */
export function t(key, vars) {
  const value = resolve(key);
  if (value === undefined) {
    noteMissing(key);
    return key;
  }
  return typeof value === 'string' ? interpolate(value, vars) : value;
}

/* --------------------------------------------------------------------------
   Missing strings
   --------------------------------------------------------------------------
   A key the code asks for that no bundle contains is, nearly always, version
   skew: something between the server and this page — the browser's cache, a
   proxy, a CDN edge — delivered an older copy of the bundle than the scripts
   now running. `no-cache` above closes most of that window. For whatever gets
   through, the first miss triggers one re-fetch that bypasses every cache; if
   that copy has the missing keys, the page re-renders through the same event
   a language switch uses.

   Once per page load. A key missing from the server's copy too is a genuine
   typo: it must stay visible (as the key itself, plus the console warning),
   not set off a loop of re-fetches.
   -------------------------------------------------------------------------- */

const missing = new Set();
let healAttempted = false;

function noteMissing(key) {
  if (missing.has(key)) return;
  missing.add(key);
  console.warn(`[i18n] missing string "${key}"`);
  if (!healAttempted && bundles.size) {
    healAttempted = true;
    // After the render that hit the miss has finished, not in the middle of it.
    setTimeout(healBundles, 0);
  }
}

async function healBundles() {
  const langs = [...bundles.keys()];
  let fresh;
  try {
    fresh = await Promise.all(langs.map((lang) => fetchBundle(lang, 'reload')));
  } catch {
    return; // offline, or the server is mid-restart: keep what we have
  }
  langs.forEach((lang, i) => bundles.set(lang, fresh[i]));

  const healed = [...missing].filter((key) => resolve(key) !== undefined);
  if (!healed.length) return; // genuinely missing — nothing would change
  healed.forEach((key) => missing.delete(key));

  reflectDocument();
  applyTranslations();
  document.dispatchEvent(new CustomEvent('hkeeli:langchange', { detail: { lang: current } }));
}

export function getLang() {
  return current;
}

export function isRTL() {
  return current === 'ar';
}

/** Pick the right side of a {en, ar} content object from lessons.json. */
export function pick(field, fallbackLang = CONFIG.defaultLang) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  return field[current] || field[fallbackLang] || '';
}

/** The text each element carried in the markup, before any translation ran. */
const markupDefaults = new WeakMap();

/** Apply the active bundle to every translatable node inside `root`. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (!markupDefaults.has(el)) markupDefaults.set(el, el.textContent.trim());
    const key = el.dataset.i18n;
    const vars = el.dataset.i18nVars ? safeParse(el.dataset.i18nVars) : undefined;

    // A missing key never replaces the markup's own default: the English the
    // HTML ships with beats a headline reading "practice.heroTitle". Elements
    // with no default still show the key, so a missing string stays visible.
    const fallback = markupDefaults.get(el);
    if (resolve(key) === undefined && fallback) {
      noteMissing(key);
      el.textContent = fallback;
      return;
    }
    el.textContent = t(key, vars);
  });

  // "aria-label:nav.openMenu, placeholder:book.goalsPlaceholder"
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function reflectDocument() {
  const html = document.documentElement;
  html.setAttribute('lang', current);
  html.setAttribute('dir', current === 'ar' ? 'rtl' : 'ltr');
  // Pages name themselves with data-title-key on <body>; the home page just
  // gets the tagline.
  const titleKey = document.body?.dataset.titleKey;
  document.title = titleKey
    ? `${t('site.nameEn')} — ${t(titleKey)}`
    : `${t('site.nameEn')} — ${t('site.tagline')}`;

  // The description follows the title, so the document never describes itself in
  // one language while naming itself in another. Note the limit: link-preview
  // scrapers read the served HTML and never run this, and og:* tags are left
  // alone for that reason — this is for the rendered document, not for sharing.
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', t('site.metaDescription'));

  document.querySelectorAll('.lang-switch button[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
  });
}

/** Switch language, persist the choice, and re-render the page. */
export async function setLang(lang) {
  if (!CONFIG.languages.includes(lang)) return;
  await loadBundle(lang);
  current = lang;
  try {
    localStorage.setItem(CONFIG.langStorageKey, lang);
  } catch {
    /* private mode — the site still works, the choice just won't persist */
  }
  reflectDocument();
  applyTranslations();
  document.dispatchEvent(new CustomEvent('hkeeli:langchange', { detail: { lang } }));
}

function detectLang() {
  try {
    const saved = localStorage.getItem(CONFIG.langStorageKey);
    if (saved && CONFIG.languages.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return CONFIG.defaultLang;
}

/**
 * Boot the i18n layer. Always loads the default bundle too, so any key missing
 * from a translation falls back instead of rendering blank.
 */
export async function initI18n() {
  const lang = detectLang();
  await loadBundle(CONFIG.defaultLang);
  if (lang !== CONFIG.defaultLang) await loadBundle(lang);
  current = lang;
  reflectDocument();
  applyTranslations();
  return lang;
}
