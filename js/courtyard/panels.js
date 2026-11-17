/**
 * Hkeeli courtyard — the panel each place opens.
 *
 * The same panel serves the 3D scene and the still-image view: it is HTML,
 * built from the same data the rest of the site uses (lessons.json for units,
 * dialogues and phrases; the language bundles for every word of interface).
 * So the immersive and lightweight presentations can never drift apart.
 *
 *   entrance  → Unit 1, "First conversations": greetings, introductions
 *   cafe      → Unit 2, as the conversation in cafe-story.js
 *   balcony   → Unit 3, the phone call with teta and jiddo
 *   teacher   → the existing introduction, how lessons work, booking
 *
 * Every panel links on to the full page it summarises, so the courtyard is a
 * way in, never a dead end.
 */

import { t, pick } from '../i18n.js';
import { el, clear, progressBar } from '../ui.js';
import { getUnits, getAllPhrases, getIntro } from '../data.js';
import { progress } from '../storage.js';
import { usageLabel } from '../journey.js';
import { bookingHandover, teacherName } from '../booking.js';
import { icon } from '../icons.js';
import { PLACES, getPlace } from './places.js';
import { listenControl, stopListening } from './listen.js';
import { createCafeEncounter } from './cafe-story.js';

/** The phrases each place leads with. Ids, so they follow the data. */
const KEY_PHRASES = {
  entrance: ['u1-p1', 'u1-p2', 'u1-p7', 'u1-p11'],
  balcony: ['u3-p1', 'u3-p2', 'u3-p4', 'u3-p3']
};

const SCENES = {
  balcony: { href: 'practice.html#scene-teta', titleKey: 'scene.teta.title' }
};

/**
 * Render a place into the panel element.
 *
 * @param {HTMLElement} panel     the panel element (#place-panel)
 * @param {string} id             place id
 * @param {object} ctx            { open(id), close(), smooth(), scene(), framing() }
 * @returns {Promise<{ heading: HTMLElement, destroy: () => void, refresh?: () => void, onEscape?: () => boolean, cafe?: object }>}
 */
export async function renderPanel(panel, id, ctx) {
  const place = getPlace(id);
  const [units, phrases] = await Promise.all([getUnits(), getAllPhrases()]);
  panel.dataset.place = id;

  // The café is a conversation you take part in, not a page to read.
  if (id === 'cafe') {
    const cafe = createCafeEncounter(panel, {
      units,
      phrases,
      scene: ctx.scene,
      stage: ctx.stage,
      smooth: ctx.smooth,
      framing: ctx.framing,
      exit: ctx.close
    });
    return {
      get heading() {
        return cafe.heading;
      },
      destroy: () => cafe.destroy(),
      refresh: () => cafe.refresh(),
      onEscape: () => cafe.onEscape(),
      cafe
    };
  }

  const heading = el('h2', { id: 'place-panel-title', class: 'place-title', tabindex: '-1' }, t(`courtyard.places.${id}.topic`));
  const bar = el(
    'div',
    { class: 'exp-bar' },
    el(
      'button',
      { type: 'button', class: 'exp-btn exp-exit', onClick: () => ctx.close() },
      el('span', { class: 'exp-exit-icon', 'aria-hidden': 'true' }, icon('back', { size: 18 })),
      el('span', { class: 'exp-exit-label' }, t('courtyard.back'))
    ),
    el(
      'div',
      { class: 'exp-where' },
      el(
        'p',
        { class: 'exp-title' },
        el('span', { class: 'place-eyebrow-icon', 'aria-hidden': 'true' }, icon(place.icon, { size: 16 })),
        el('span', {}, t(`courtyard.places.${id}.name`))
      )
    )
  );
  const body = el('div', { class: 'place-body' });
  clear(panel).append(
    bar,
    el(
      'section',
      { class: 'exp-dock exp-dock--place', 'aria-labelledby': 'place-panel-title' },
      el('div', { class: 'place-scroll' }, el('header', { class: 'place-head' }, heading), body, others(id, ctx))
    )
  );

  if (id === 'teacher') await teacherCorner(body);
  else unitPlace(body, id, units, phrases);

  return { heading, destroy: () => stopListening(), refresh: null };
}

/* --------------------------------------------------------------------------
   Entrance and balcony: a unit, met in its own situation
   -------------------------------------------------------------------------- */
function unitPlace(body, id, units, phrases) {
  const place = getPlace(id);
  const unit = units.find((u) => u.id === place.unitId);
  if (!unit) return;

  const note = el('p', { class: 'place-honest' }, t('courtyard.audio.textOnlyShort'));
  note.hidden = true;
  const missing = () => {
    note.hidden = false;
  };

  const dialogue = (unit.dialogue || []).map((line) =>
    el(
      'li',
      { class: 'dialogue-line place-line', dataset: { speaker: line.speaker } },
      el('span', { class: 'speaker' }, line.speaker),
      el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
      el('p', { class: 'translit', dir: 'ltr' }, line.translit),
      el('p', { class: 'phrase-en line-en' }, line.en),
      listenControl(line, { quietWhenMissing: true, onMissing: missing })
    )
  );

  const keys = (KEY_PHRASES[id] || []).map((pid) => phrases.find((p) => p.id === pid)).filter(Boolean);
  const cards = keys.map((phrase) => {
    const usage = usageLabel(phrase);
    return el(
      'li',
      { class: 'place-phrase' },
      el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
      el('p', { class: 'translit', dir: 'ltr' }, phrase.translit),
      el('p', { class: 'phrase-en' }, phrase.en),
      phrase.literal ? el('p', { class: 'place-phrase-note' }, `${t('phrase.literally')} “${pick(phrase.literal)}”`) : null,
      phrase.note ? el('p', { class: 'place-phrase-note' }, pick(phrase.note)) : null,
      usage ? el('span', { class: 'usage-tag' }, usage) : null,
      listenControl(phrase, { quietWhenMissing: true, onMissing: missing })
    );
  });

  const p = progress.getUnitProgress(unit);
  const scene = SCENES[id];

  body.append(
    el('p', { class: 'place-lede' }, `${t('learn.youWillBeAbleTo')} ${pick(unit.outcome || unit.description)}`),
    note,
    el('h3', { class: 'place-subhead' }, t('courtyard.panel.conversation')),
    el('ol', { class: 'place-dialogue' }, dialogue),
    el('h3', { class: 'place-subhead' }, t('courtyard.panel.keyPhrases')),
    el('ul', { class: 'place-phrases' }, cards),
    unit.tip ? el('div', { class: 'tip-box place-tip' }, el('h4', {}, t('courtyard.panel.tip')), el('p', {}, pick(unit.tip))) : null,
    progressBar(p.ratio, t('learn.unitProgress', { seen: p.seen, total: p.total })),
    el(
      'div',
      { class: 'place-actions' },
      el('a', { class: 'btn-primary btn-small', href: `learn.html#${unit.id}` }, `${t('courtyard.panel.openUnit')}: ${pick(unit.title)}`),
      scene
        ? el('a', { class: 'btn-secondary btn-small', href: scene.href }, t('courtyard.panel.playScene', { title: t(scene.titleKey) }))
        : el('a', { class: 'btn-secondary btn-small', href: '#mini-lesson', dataset: { courtyardLeave: 'true' } }, t('courtyard.panel.miniLesson')),
      el('a', { class: 'place-link', href: `practice.html?unit=${encodeURIComponent(unit.id)}#listen` }, t('courtyard.panel.practise'))
    ),
    bookNudge()
  );
}

/** A quiet route to a person, at the end of every lesson place. */
function bookNudge() {
  return el(
    'p',
    { class: 'place-book' },
    el('span', {}, t('courtyard.panel.bookTitle')),
    ' ',
    el('a', { href: '#book', dataset: { courtyardLeave: 'true' } }, t('courtyard.panel.book'))
  );
}

/* --------------------------------------------------------------------------
   The teacher's corner: the real teacher, in her own words
   -------------------------------------------------------------------------- */
async function teacherCorner(body) {
  const intro = await getIntro();
  const teacher = teacherName();

  if (intro) {
    const pending = el('p', { class: 'place-honest' }, t('courtyard.teacher.introPending'));
    pending.hidden = true;
    body.append(
      el(
        'figure',
        { class: 'teacher-intro' },
        el('figcaption', { class: 'teacher-intro-title' }, t('about.introTitle')),
        pending,
        el('p', { class: 'arabic', dir: 'rtl', lang: 'ar' }, intro.ar),
        el('p', { class: 'translit', dir: 'ltr' }, intro.translit),
        el('p', { class: 'phrase-en' }, intro.en),
        listenControl(intro, {
          quietWhenMissing: true,
          onMissing: () => {
            pending.hidden = false;
          }
        })
      )
    );
  }

  const values = ['Approach', 'Class', 'Who'].map((k) =>
    el('div', { class: 'teacher-value' }, el('dt', {}, t(`about.value${k}Title`)), el('dd', {}, t(`about.value${k}Body`)))
  );
  const steps = t('book.steps');

  body.append(
    el('h3', { class: 'place-subhead teacher-title' }, t('about.title')),
    el('p', {}, t('about.p1')),
    el('p', {}, t('about.p2')),
    el('h3', { class: 'place-subhead' }, t('courtyard.teacher.approach')),
    el('dl', { class: 'teacher-values' }, values),
    el('p', { class: 'place-free' }, t('about.note')),
    el(
      'section',
      { class: 'teacher-book', 'aria-labelledby': 'teacher-book-title' },
      el('h3', { id: 'teacher-book-title' }, t('courtyard.teacher.bookTitle')),
      el('p', {}, t('book.cardBody', { teacher })),
      Array.isArray(steps) ? el('ol', { class: 'booking-steps' }, steps.map((s) => el('li', {}, s.replace('{teacher}', teacher)))) : null,
      el('div', { class: 'booking-action' }, ...bookingHandover({ teacher, location: 'courtyard_teacher', id: 'courtyard-booking-disclosure' }))
    ),
    el(
      'p',
      { class: 'place-actions place-actions--links' },
      el('a', { class: 'place-link', href: '#about', dataset: { courtyardLeave: 'true' } }, t('courtyard.teacher.readMore')),
      el('a', { class: 'place-link', href: '#book', dataset: { courtyardLeave: 'true' } }, t('courtyard.teacher.bookingDetails'))
    )
  );
}

/* --------------------------------------------------------------------------
   Somewhere else: the other three places, one tap away
   -------------------------------------------------------------------------- */
function others(current, ctx) {
  return el(
    'nav',
    { class: 'place-others', 'aria-label': t('courtyard.otherPlaces') },
    el('p', { class: 'place-others-title' }, t('courtyard.otherPlaces')),
    el(
      'ul',
      {},
      PLACES.filter((p) => p.id !== current).map((p) =>
        el(
          'li',
          {},
          el(
            'button',
            { type: 'button', class: 'place-other', onClick: () => ctx.open(p.id) },
            el('span', { class: 'place-other-icon', 'aria-hidden': 'true' }, icon(p.icon, { size: 16 })),
            el('span', {}, t(`courtyard.places.${p.id}.name`))
          )
        )
      )
    )
  );
}
