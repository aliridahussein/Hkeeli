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

async function loadBundle(lang) {
  if (bundles.has(lang)) return bundles.get(lang);
  const res = await fetch(`${CONFIG.dataBase}${lang}.json`);
  if (!res.ok) throw new Error(`Missing translation bundle: ${lang}`);
  const bundle = await res.json();
  bundles.set(lang, bundle);
  return bundle;
}

/**
 * Translate a key. Falls back to the default language, then to the key itself
 * so a missing string is visible in development rather than silently empty.
 */
export function t(key, vars) {
  const value =
    lookup(bundles.get(current), key) ?? lookup(bundles.get(CONFIG.defaultLang), key) ?? key;
  return typeof value === 'string' ? interpolate(value, vars) : value;
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

/** Apply the active bundle to every translatable node inside `root`. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const vars = el.dataset.i18nVars ? safeParse(el.dataset.i18nVars) : undefined;
    el.textContent = t(el.dataset.i18n, vars);
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
