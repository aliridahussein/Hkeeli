/**
 * Hkeeli — home page.
 *
 * The page is a route through one promise: hear a phrase, understand it, see
 * where it fits, meet the person teaching it, book if you want a human. Each
 * section below renders one step of that route; every one of them reads the
 * same lesson data the rest of the site uses.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, playButton, errorState, onLangChange } from './ui.js';
import { getAllPhrases, getIntro } from './data.js';
import { getJourney, GOALS, getGoal } from './journey.js';
import { initMiniLesson } from './mini-lesson.js';
import { prefs } from './storage.js';
import { initBookingForm } from './booking.js';

/* The three phrases on the hero postcards, by id. Change these to feature
   different words — no markup edits needed. */
const HERO_PHRASE_IDS = ['u1-p10', 'u1-p12', 'u1-p9'];

async function main() {
  await initI18n();
  initChrome();
  initBookingForm();

  try {
    await Promise.all([
      renderHero(),
      initMiniLesson(document.querySelector('#mini-host')),
      renderGoals(),
      renderJourney(),
      renderAbout(),
      renderClassFacts(),
      renderFaq()
    ]);
  } catch (error) {
    console.error(error);
    const journey = document.querySelector('#journey-list');
    if (journey) errorState(journey, () => location.reload());
  }

  onLangChange(() => {
    renderHero();
    initMiniLesson(document.querySelector('#mini-host'));
    renderGoals();
    renderJourney();
    renderAbout();
    renderClassFacts();
    renderFaq();
  });
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
   Why are you learning?
   --------------------------------------------------------------------------
   Picking a goal recommends a unit and remembers the choice on this device, so
   the Start Here flow and any later visit already know the answer. Nothing is
   sent anywhere and no account is involved.
   -------------------------------------------------------------------------- */

async function renderGoals() {
  const grid = document.querySelector('#goal-grid');
  const result = document.querySelector('#goal-result');
  if (!grid) return;

  const journey = await getJourney();
  const unitsById = new Map(journey.flatMap((stage) => stage.units).map((unit) => [unit.id, unit]));
  let selected = prefs.get().goal;

  const show = (goalId) => {
    if (!result) return;
    const goal = getGoal(goalId);
    const unit = goal && unitsById.get(goal.unitId);
    clear(result);
    if (!goal || !unit) return;

    result.append(
      el(
        'div',
        { class: 'goal-recommendation' },
        el('p', { class: 'goal-reco-label' }, t('goals.recommended')),
        el('h3', {}, pick(unit.title)),
        el('p', {}, pick(unit.outcome || unit.description)),
        el(
          'div',
          { class: 'goal-reco-actions' },
          el('a', { class: 'btn-primary btn-small', href: `learn.html#${unit.id}` }, t('goals.startUnit')),
          el(
            'a',
            {
              class: 'btn-secondary btn-small',
              href: `practice.html?unit=${encodeURIComponent(unit.id)}#${goal.gameId}`
            },
            t('goals.practiceThis')
          )
        )
      )
    );
  };

  const buttons = GOALS.map((goal) =>
    el(
      'button',
      {
        type: 'button',
        class: 'goal-card',
        'aria-pressed': String(goal.id === selected),
        onClick: () => {
          selected = goal.id;
          prefs.set({ goal: goal.id });
          buttons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.goal === goal.id)));
          show(goal.id);
        },
        dataset: { goal: goal.id }
      },
      el('span', { class: 'goal-label' }, t(goal.labelKey)),
      el('span', { class: 'goal-blurb' }, t(goal.blurbKey))
    )
  );

  clear(grid).append(...buttons);
  if (selected) show(selected);
  else if (result) clear(result);
}

/* --------------------------------------------------------------------------
   The learning journey
   -------------------------------------------------------------------------- */

async function renderJourney() {
  const host = document.querySelector('#journey-list');
  if (!host) return;

  const stages = await getJourney();
  clear(host).append(
    ...stages.map((stage, index) =>
      el(
        'li',
        { class: 'journey-stage', dataset: { state: stage.planned ? 'planned' : 'live' } },
        el('span', { class: 'journey-index', 'aria-hidden': 'true' }, String(index + 1)),
        el(
          'div',
          { class: 'journey-body' },
          el('h3', {}, t(stage.titleKey)),
          el('p', { class: 'journey-outcome' }, t(stage.outcomeKey)),
          stage.planned
            ? el('p', { class: 'journey-planned' }, t('journey.planned'))
            : el(
                'ul',
                { class: 'journey-units' },
                ...stage.units.map((unit) =>
                  el(
                    'li',
                    {},
                    el('a', { href: `learn.html#${unit.id}` }, pick(unit.title)),
                    el('span', { class: 'journey-unit-outcome' }, pick(unit.outcome || unit.description))
                  )
                )
              )
        )
      )
    )
  );
}

/* --------------------------------------------------------------------------
   Meet the teacher
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
   Classes
   --------------------------------------------------------------------------
   Each row is a fact about the class offer. A row whose value is the literal
   string "tbc" renders as "ask when you book" — the honest answer until the
   owner fills it in, and a single place to change once they do.
   -------------------------------------------------------------------------- */

function renderClassFacts() {
  const host = document.querySelector('#class-facts');
  if (!host) return;

  const rows = t('classes.facts');
  clear(host);
  if (!Array.isArray(rows)) return;

  host.append(
    ...rows.flatMap((row) => [
      el('dt', {}, row.label),
      el(
        'dd',
        { class: row.value === 'tbc' ? 'class-fact--pending' : '' },
        row.value === 'tbc' ? t('classes.pending') : row.value
      )
    ])
  );
}

/* --------------------------------------------------------------------------
   FAQ
   --------------------------------------------------------------------------
   Native <details> rather than a hand-rolled accordion: it is keyboard
   operable, announced correctly, and works before the JS that fills it runs.
   -------------------------------------------------------------------------- */

function renderFaq() {
  const host = document.querySelector('#faq-list');
  if (!host) return;

  const items = t('faq.items');
  clear(host);
  if (!Array.isArray(items)) return;

  host.append(
    ...items.map((item) =>
      el(
        'details',
        { class: 'faq-item' },
        el('summary', {}, item.q),
        el('div', { class: 'faq-answer' }, el('p', {}, item.a))
      )
    )
  );
}

main();
