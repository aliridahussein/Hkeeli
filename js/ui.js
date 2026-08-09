/**
 * Hkeeli — shared UI: page chrome plus the renderers for every repeated
 * content block. If a component appears on more than one page, it is built
 * here exactly once.
 */

import { t, pick, setLang, getLang } from './i18n.js';
import { playPhrase } from './audio.js';
import { toast } from './toast.js';

export { toast };

/** Terse element factory: el('div', { class: 'x' }, child, 'text') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* --------------------------------------------------------------------------
   Page chrome: nav drawer, language switcher, current-page marker
   -------------------------------------------------------------------------- */

export function initChrome() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const toggle = nav.querySelector('.nav-toggle');
  const drawer = nav.querySelector('.nav-drawer');

  if (toggle && drawer) {
    const setOpen = (open) => {
      nav.dataset.open = String(open);
      drawer.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', t(open ? 'nav.closeMenu' : 'nav.openMenu'));
    };

    setOpen(false);
    toggle.addEventListener('click', () => setOpen(nav.dataset.open !== 'true'));
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.dataset.open === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    // Tapping the page behind an open drawer closes it — the gesture everyone
    // expects on a phone, and the only way out that doesn't need the toggle.
    document.addEventListener('click', (e) => {
      if (nav.dataset.open === 'true' && !nav.contains(e.target)) setOpen(false);
    });
    // The drawer is a small-screen affordance; close it if we grow past it.
    window.matchMedia('(min-width: 860px)').addEventListener('change', (e) => {
      if (e.matches) setOpen(false);
    });
  }

  nav.querySelectorAll('.lang-switch button[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  markCurrentPage();
  document.addEventListener('hkeeli:langchange', markCurrentPage);
}

function markCurrentPage() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .nav-drawer a').forEach((link) => {
    const target = link.getAttribute('href') || '';
    const isPage = target.split('#')[0] === here && !target.startsWith('#');
    if (isPage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/* --------------------------------------------------------------------------
   Content components
   -------------------------------------------------------------------------- */

/**
 * A play button bound to a phrase. Re-labelled on language change, but the
 * phrase content it plays is language-independent.
 */
export function playButton(phrase, extraClass = '') {
  const btn = el('button', {
    type: 'button',
    class: `play ${extraClass}`.trim(),
    'aria-label': `${t('game.playAudio')}: ${phrase.translit}`
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    playPhrase(phrase, btn);
  });
  return btn;
}

/**
 * The trilingual phrase strip. Arabic script, transliteration, English and
 * audio are shown together in *both* site languages — a learner in Arabic mode
 * still needs the transliteration, and a learner in English mode still needs
 * the script.
 */
export function phraseStrip(phrase, { showEnglish = true } = {}) {
  return el(
    'div',
    { class: 'lesson-phrase' },
    el(
      'div',
      {},
      el('div', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
      el('div', { class: 'translit', dir: 'ltr' }, phrase.translit),
      showEnglish && el('div', { class: 'phrase-en' }, phrase.en)
    ),
    playButton(phrase)
  );
}

/** Lesson card used on the home page and as the collapsed unit on Learn. */
export function lessonCard(unit, { href = 'learn.html' } = {}) {
  // A unit can nominate its showcase phrase via `feature` in lessons.json.
  const first = unit.phrases.find((p) => p.id === unit.feature) || unit.phrases[0];
  return el(
    'article',
    { class: 'lesson-card' },
    el('span', { class: 'lesson-level' }, pick(unit.level)),
    el('h3', {}, el('a', { href: `${href}#${unit.id}` }, pick(unit.title))),
    el('p', {}, pick(unit.description)),
    first ? phraseStrip(first, { showEnglish: false }) : null
  );
}

/** Practice tile — a link into practice.html with the saved best score. */
export function gameTile(game, stats) {
  const played = stats && stats.plays > 0;
  return el(
    'a',
    { class: 'game-tile', href: `practice.html#${game.id}` },
    el('span', { class: 'icon', 'aria-hidden': 'true' }, game.icon),
    el('h3', {}, t(game.titleKey)),
    el('p', {}, t(game.blurbKey)),
    el(
      'span',
      { class: 'tile-stat' },
      played ? `${t('games.bestScore')}: ${stats.best}` : t('games.notPlayed')
    )
  );
}

/** The coastline SVG divider, so the motif is defined in one place. */
export function coastline(variant = '') {
  const wrap = el('div', { class: `coastline ${variant}`.trim(), 'aria-hidden': 'true' });
  wrap.innerHTML = `
    <svg viewBox="0 0 1200 70" preserveAspectRatio="none" focusable="false">
      <path d="M0,35 C150,10 300,60 450,35 C600,10 750,60 900,35 C1050,10 1150,50 1200,35 L1200,70 L0,70 Z" fill="#1F4B4A" opacity="0.08"/>
      <path d="M0,45 C150,20 300,68 450,45 C600,20 750,68 900,45 C1050,22 1150,58 1200,45 L1200,70 L0,70 Z" fill="#E8A33D" opacity="0.15"/>
    </svg>`;
  return wrap;
}

/** Render an error state in place of a failed section. */
export function errorState(container, retry) {
  clear(container).append(
    el(
      'div',
      { class: 'game-empty' },
      el('p', {}, t('common.error')),
      retry && el('button', { class: 'btn-secondary btn-small', onClick: retry }, t('common.retry'))
    )
  );
}

/** Re-run a render function whenever the language changes. */
export function onLangChange(fn) {
  document.addEventListener('hkeeli:langchange', () => fn(getLang()));
}
