/**
 * Hkeeli — home page.
 *
 * The page is a route through one promise: hear a phrase, understand it, see
 * where it fits, meet the person teaching it, book if you want a human. Each
 * section below renders one step of that route; every one of them reads the
 * same lesson data the rest of the site uses.
 *
 * The hero is the courtyard (js/courtyard/): a Lebanese courtyard whose
 * places open the lessons that belong there, with the café conversation as
 * the first small success.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, errorState, onLangChange } from './ui.js';
import { getIntro } from './data.js';
import { getJourney, GOALS, getGoal } from './journey.js';
import { initMiniLesson } from './mini-lesson.js';
import { prefs } from './storage.js';
import { initBookingSection } from './booking.js';
import { initCourtyard } from './courtyard/index.js';
import { hasRecording } from './courtyard/listen.js';
import { playPhrase } from './audio.js';

async function main() {
  await initI18n();
  initChrome();
  // Reads only the language bundles and CONFIG, so it doesn't wait on
  // lessons.json with the sections below.
  initBookingSection();
  initCourtyard();

  try {
    await Promise.all([
      initMiniLesson(document.querySelector('#mini-host')),
      renderGoals(),
      renderJourney(),
      renderAbout(),
      renderFaq()
    ]);
  } catch (error) {
    console.error(error);
    const journey = document.querySelector('#journey-list');
    if (journey) errorState(journey, () => location.reload());
  }

  honourHash();

  onLangChange(() => {
    initMiniLesson(document.querySelector('#mini-host'));
    renderGoals();
    renderJourney();
    renderAbout();
    initBookingSection();
    renderFaq();
  });
}

/**
 * Land on the section a cross-page link asked for.
 *
 * Arriving at index.html#book, the browser jumps the moment the markup parses —
 * while the mini-lesson, the goals, the journey and the FAQ are still empty
 * containers. Every one of them then renders and pushes #book thousands of
 * pixels down, leaving the visitor stranded mid-page. Re-honouring the hash once
 * the content is in place is the fix; `instant` because the jump has already
 * visibly happened and animating the correction would only look like a glitch.
 */
function honourHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
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
  const live = stages.filter((stage) => !stage.planned);
  const planned = stages.filter((stage) => stage.planned);

  /* Unwritten stages are named, once, in a single closing row rather than given
     a row each. Two "being written" rows among five made three finished units
     read as an abandoned course; one line is the same admission, honestly, in
     the space it deserves. The full path is still on the Lessons page. */
  clear(host).append(
    ...live.map((stage, index) =>
      el(
        'li',
        { class: 'journey-stage', dataset: { state: 'live' } },
        el('span', { class: 'journey-index', 'aria-hidden': 'true' }, String(index + 1)),
        el(
          'div',
          { class: 'journey-body' },
          el('h3', {}, t(stage.titleKey)),
          el('p', { class: 'journey-outcome' }, t(stage.outcomeKey)),
          el(
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
    ),
    planned.length
      ? el(
          'li',
          { class: 'journey-stage journey-stage--more', dataset: { state: 'planned' } },
          el('span', { class: 'journey-index', 'aria-hidden': 'true' }, '+'),
          el(
            'div',
            { class: 'journey-body' },
            el('h3', {}, t('journey.moreTitle')),
            el(
              'p',
              { class: 'journey-outcome' },
              t('journey.moreBody', {
                stages: planned.map((stage) => t(stage.titleKey)).join(t('journey.moreJoin'))
              })
            )
          )
        )
      : null
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
      // The introduction is the teacher speaking about herself, so it plays
      // her recording or nothing — never the synthetic fallback the phrase
      // buttons use, which would put a computer voice in her mouth. Until the
      // file exists the card says so and shows the words.
      const play = el('button', {
        type: 'button',
        class: 'play intro-play',
        'aria-label': t('about.introPlay')
      });
      play.hidden = true;
      play.addEventListener('click', () => playPhrase(intro, play, { tts: false }));
      const body = el('p', { class: 'intro-card-body' }, t('about.introBody'));
      hasRecording(intro).then((recorded) => {
        if (recorded) play.hidden = false;
        else body.textContent = t('courtyard.teacher.introPending');
      });

      host.append(
        el(
          'div',
          { class: 'intro-card-head' },
          play,
          el('div', {}, el('h3', {}, t('about.introTitle')), body)
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
