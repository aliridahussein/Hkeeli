/**
 * Hkeeli — shared UI: page chrome plus the renderers for every repeated
 * content block. If a component appears on more than one page, it is built
 * here exactly once.
 */

import { t, pick, setLang, getLang } from './i18n.js';
import { playPhrase, hasSlowAudio } from './audio.js';
import { usageLabel } from './journey.js';
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
  // Two nav items are sections of the home page rather than pages of their own,
  // so "where am I" changes as the hash changes, not only on navigation.
  window.addEventListener('hashchange', markCurrentPage);
}

/**
 * The page a path names, independent of how it is spelled.
 *
 * The links say "learn.html" but the site is served at "/learn": Cloudflare's
 * asset handling resolves the extension, and every link Zee produces uses the
 * clean form too. Comparing the raw strings meant no nav item was ever marked
 * current on the deployed site — only on a local file:// open. Both sides are
 * reduced to a bare page name instead.
 */
function pageName(path) {
  const last = String(path).split('/').pop() || '';
  return last.replace(/\.html$/, '') || 'index';
}

function markCurrentPage() {
  const here = pageName(location.pathname);
  document.querySelectorAll('.nav-links a, .nav-drawer a').forEach((link) => {
    const target = link.getAttribute('href') || '';
    const [path, fragment] = target.split('#');
    // A bare "#section" link has no path of its own — it points at this page.
    const samePage = (path ? pageName(path) : here) === here;
    // A link to a section is only "current" while that section is the target;
    // otherwise every hash link on the home page would claim to be current.
    const isCurrent = fragment ? samePage && `#${fragment}` === location.hash : samePage;
    if (isCurrent) link.setAttribute('aria-current', 'page');
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
 *
 * With `showNotes`, it also carries what the data says about how the phrase is
 * used: the literal meaning where the two differ, the usage note, and a label
 * derived from the phrase's own tags. Nothing is shown that lessons.json
 * doesn't contain — a phrase with no note simply has no note line.
 */
export function phraseStrip(phrase, { showEnglish = true, showNotes = false } = {}) {
  const usage = showNotes ? usageLabel(phrase) : null;
  const hasNotes = showNotes && (phrase.literal || phrase.note || usage);

  return el(
    'div',
    { class: `lesson-phrase ${hasNotes ? 'lesson-phrase--noted' : ''}`.trim() },
    el(
      'div',
      { class: 'lesson-phrase-main' },
      el('div', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
      el('div', { class: 'translit', dir: 'ltr' }, phrase.translit),
      showEnglish && el('div', { class: 'phrase-en' }, phrase.en),
      hasNotes
        ? el(
            'div',
            { class: 'phrase-notes' },
            phrase.literal
              ? el('span', { class: 'phrase-note' }, `${t('phrase.literally')} “${pick(phrase.literal)}”`)
              : null,
            phrase.note ? el('span', { class: 'phrase-note' }, pick(phrase.note)) : null,
            usage ? el('span', { class: 'usage-tag' }, usage) : null
          )
        : null
    ),
    el(
      'div',
      { class: 'lesson-phrase-audio' },
      playButton(phrase),
      hasSlowAudio(phrase)
        ? el(
            'button',
            {
              type: 'button',
              class: 'slow-link',
              onClick: () => playPhrase(phrase, null, { slow: true })
            },
            t('phrase.slow')
          )
        : null
    )
  );
}

/**
 * A labelled progress bar. Used for units and for the course as a whole; the
 * number it shows is always "phrases you have answered", never a guess at how
 * much of the language someone knows.
 */
export function progressBar(ratio, label) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return el(
    'div',
    { class: 'progress-meter' },
    el(
      'div',
      {
        class: 'progress-track',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(pct),
        'aria-label': label || t('progress.label')
      },
      el('div', { class: 'progress-fill', style: `width:${pct}%` })
    ),
    label ? el('span', { class: 'progress-label' }, label) : null
  );
}

/**
 * Practice tile with the saved best score.
 *
 * Two shapes, one component: a link when the tile navigates to the practice
 * page, a button when the game will mount in place (which is what the practice
 * page itself needs — a link that reloads the page it is already on is a
 * worse version of the same action).
 */
export function gameTile(game, stats, { onSelect = null, href = `practice.html#${game.id}` } = {}) {
  const played = stats && stats.plays > 0;
  const children = [
    el('span', { class: 'icon', 'aria-hidden': 'true' }, game.icon),
    el('h3', {}, t(game.titleKey)),
    el('p', {}, t(game.blurbKey)),
    el(
      'span',
      { class: 'tile-stat' },
      played ? `${t('games.bestScore')}: ${stats.best}` : t('games.notPlayed')
    )
  ];

  return onSelect
    ? el('button', { type: 'button', class: 'game-tile', onClick: onSelect }, children)
    : el('a', { class: 'game-tile', href }, children);
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
