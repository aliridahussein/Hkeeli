/**
 * Hkeeli — home page.
 */

import { initI18n, t } from './i18n.js';
import { initChrome, el, clear, playButton, lessonCard, gameTile, errorState, onLangChange } from './ui.js';
import { getFeaturedUnits, getAllPhrases, getIntro } from './data.js';
import { GAMES } from './games/index.js';
import { progress } from './storage.js';
import { initBookingForm } from './booking.js';

/* The three phrases on the hero postcards, by id. Change these to feature
   different words — no markup edits needed. */
const HERO_PHRASE_IDS = ['u1-p10', 'u1-p12', 'u1-p9'];

async function main() {
  await initI18n();
  initChrome();
  initBookingForm();

  try {
    await Promise.all([renderHero(), renderAbout(), renderLessons(), renderGames()]);
  } catch (error) {
    console.error(error);
    const learn = document.querySelector('#learn-grid');
    if (learn) errorState(learn, () => location.reload());
  }

  onLangChange(() => {
    renderHero();
    renderAbout();
    renderLessons();
    renderGames();
  });
}

/* --------------------------------------------------------------------------
   About — the spoken introduction and the testimonials
   -------------------------------------------------------------------------- */

async function renderAbout() {
  const host = document.querySelector('#intro-card');
  if (host) {
    const intro = await getIntro();
    clear(host);
    if (intro) {
      // playButton() gives the same file-first, TTS-fallback behaviour as every
      // other play control; only the accessible name differs, because "play
      // pronunciation" is the wrong description for a spoken introduction.
      const play = playButton(intro, 'intro-play');
      play.setAttribute('aria-label', t('about.introPlay'));

      host.append(
        el(
          'div',
          { class: 'intro-card-head' },
          play,
          el(
            'div',
            {},
            el('h3', {}, t('about.introTitle')),
            el('p', { class: 'intro-card-body' }, t('about.introBody'))
          )
        ),
        el(
          'div',
          { class: 'intro-line' },
          el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, intro.ar),
          el('p', { class: 'translit', dir: 'ltr' }, intro.translit),
          el('p', { class: 'intro-en' }, intro.en)
        )
      );
    }
  }

  renderTestimonials();
}

/**
 * Quotes come from the language bundles. An empty array renders nothing but a
 * short note: three invented testimonials cost more trust than none at all.
 */
function renderTestimonials() {
  const host = document.querySelector('#testimonials');
  if (!host) return;

  const quotes = t('about.testimonials');
  clear(host);

  if (!Array.isArray(quotes) || !quotes.length) {
    host.append(el('p', { class: 'testimonials-pending' }, t('about.testimonialsPending')));
    return;
  }

  host.append(
    el('h3', { class: 'testimonials-title' }, t('about.testimonialsTitle')),
    el(
      'div',
      { class: 'testimonials' },
      ...quotes.map((item) =>
        el(
          'figure',
          { class: 'testimonial' },
          el('blockquote', {}, item.quote),
          el('cite', {}, item.name)
        )
      )
    )
  );
}

/* --------------------------------------------------------------------------
   Hero postcards
   -------------------------------------------------------------------------- */

async function renderHero() {
  const stack = document.querySelector('#postcard-stack');
  const dots = document.querySelector('#postcard-dots');
  if (!stack) return;

  const phrases = await getAllPhrases();
  const featured = HERO_PHRASE_IDS.map((id) => phrases.find((p) => p.id === id)).filter(Boolean);
  const cards = featured.length ? featured : phrases.slice(0, 3);

  clear(stack).append(
    ...cards.map((phrase, index) =>
      el(
        'article',
        { class: `postcard ${index === 2 ? 'postcard--dark' : ''}`.trim() },
        el('span', { class: 'stamp', 'aria-hidden': 'true' }, 'ل.ل'),
        el('div', { class: 'word-ar arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
        // Transliteration and play share a row: it keeps the card short enough
        // that the stack can overlap without a card covering the one beneath.
        el(
          'div',
          { class: 'postcard-row' },
          el('div', { class: 'word-translit translit', dir: 'ltr' }, phrase.translit),
          playButton(phrase, 'postcard-play')
        ),
        el('div', { class: 'word-en' }, phrase.en)
      )
    )
  );

  if (dots) setupCarousel(stack, dots, cards.length);
}

/**
 * The mobile hero is a scroll-snap rail; the dots reflect and control it.
 * On desktop the rail becomes the scattered stack and the dots are hidden by
 * CSS, so this listener simply idles.
 */
function setupCarousel(stack, dots, count) {
  // Re-rendered on every language switch; drop the previous observer first.
  if (stack._carouselObserver) stack._carouselObserver.disconnect();

  /* Distance from the rail's scroll origin to a card's centre.
     Measured with rects rather than offsetLeft: the rail is statically
     positioned, so the cards' offsetParent is some ancestor and offsetLeft
     would be relative to the wrong box. */
  const centreOf = (card) => {
    const cardBox = card.getBoundingClientRect();
    const railBox = stack.getBoundingClientRect();
    return cardBox.left - railBox.left + stack.scrollLeft + cardBox.width / 2;
  };

  const setActive = (index) => {
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  };

  let restoreSnap;
  const scrollToCard = (i) => {
    const card = stack.children[i];
    if (!card) return;
    // Update the dot immediately rather than waiting for the scroll to land —
    // the control should acknowledge the tap even mid-animation.
    setActive(i);
    /* Mandatory scroll-snap cancels programmatic smooth scrolling outright in
       some engines — the rail simply never moves. Lift snapping for the length
       of the animation, then hand control back to it. */
    stack.style.scrollSnapType = 'none';
    stack.scrollTo({ left: centreOf(card) - stack.clientWidth / 2, behavior: 'smooth' });
    clearTimeout(restoreSnap);
    restoreSnap = setTimeout(() => {
      stack.style.scrollSnapType = '';
    }, 600);
  };

  clear(dots).append(
    ...Array.from({ length: count }, (_, i) =>
      el('button', {
        type: 'button',
        'aria-label': `${t('hero.goToCard')} ${i + 1}`,
        'aria-current': String(i === 0),
        onClick: () => scrollToCard(i)
      })
    )
  );

  /* Which card is showing is tracked with an IntersectionObserver rather than
     a scroll listener: observers are driven by layout, so they also report
     programmatic scrolls, which `scroll` events don't reliably do here. */
  const ratios = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
      let bestIndex = 0;
      let best = -1;
      [...stack.children].forEach((card, i) => {
        const ratio = ratios.get(card) ?? 0;
        if (ratio > best) {
          best = ratio;
          bestIndex = i;
        }
      });
      setActive(bestIndex);
    },
    { root: stack, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  [...stack.children].forEach((card) => observer.observe(card));
  stack._carouselObserver = observer;
}

/* --------------------------------------------------------------------------
   Learn preview
   -------------------------------------------------------------------------- */

async function renderLessons() {
  const grid = document.querySelector('#learn-grid');
  if (!grid) return;
  const units = await getFeaturedUnits(3);
  clear(grid).append(...units.map((unit) => lessonCard(unit)));
}

/* --------------------------------------------------------------------------
   Practice preview
   -------------------------------------------------------------------------- */

async function renderGames() {
  const grid = document.querySelector('#games-grid');
  if (!grid) return;
  clear(grid).append(...GAMES.map((game) => gameTile(game, progress.getGameStats(game.id))));
}

main();
