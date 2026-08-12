/**
 * Hkeeli — the booking section.
 *
 * There is no booking system here, by design. Preply owns accounts, current
 * pricing, availability, scheduling, payment and the trial lesson itself; this
 * section's only job is to explain what a private lesson is and hand the
 * visitor over deliberately rather than dumping them on a marketplace.
 *
 * Everything that could go stale lives in CONFIG.preply — the profile URL, the
 * teacher's first name, and whether a contact address exists at all. Nothing
 * here states a price, a duration, a rating or an availability, because the
 * site has no honest source for any of them.
 */

import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { el, clear } from './ui.js';

/** Analytics contract for the one action that matters on this section. */
const CTA_EVENT = 'preply_booking_click';
const CTA_LOCATION = 'homepage_booking';

/**
 * How the copy names the teacher. With no name configured it falls back to a
 * neutral phrase — which is how the rest of the site already refers to her, so
 * an unset value reads as a deliberate choice rather than a missing variable.
 */
function teacherName() {
  const configured = (CONFIG.preply.teacherFirstName || '').trim();
  return configured || t('book.teacherFallback');
}

/** A profile URL still holding a placeholder is treated as not configured. */
function profileUrl() {
  const url = (CONFIG.preply.profileUrl || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

export function initBookingSection() {
  const section = document.querySelector('#book');
  if (!section) return;

  const teacher = teacherName();

  renderList('#booking-benefits', 'book.benefits');
  renderSteps(teacher);
  renderAction(teacher);
  renderReassurance();
  renderGoals();

  // Copy that carries the teacher's name can't be a plain data-i18n node, so
  // those few strings are written here instead of by the i18n sweep.
  setText('[data-i18n="book.p1"]', t('book.p1', { teacher }));
  setText('[data-i18n="book.cardBody"]', t('book.cardBody', { teacher }));
}

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) node.textContent = text;
}

function renderList(selector, key) {
  const host = document.querySelector(selector);
  const items = t(key);
  if (!host || !Array.isArray(items)) return;
  clear(host).append(...items.map((item) => el('li', {}, item)));
}

function renderSteps(teacher) {
  const host = document.querySelector('#booking-steps');
  const steps = t('book.steps');
  if (!host || !Array.isArray(steps)) return;
  clear(host).append(...steps.map((step) => el('li', {}, step.replace('{teacher}', teacher))));
}

function renderReassurance() {
  const host = document.querySelector('#booking-reassurance');
  const items = t('book.reassurance');
  if (!host || !Array.isArray(items)) return;
  clear(host).append(
    ...items.map((item) =>
      el('li', {}, el('span', { class: 'tick', 'aria-hidden': 'true' }), el('span', {}, item))
    )
  );
}

/* --------------------------------------------------------------------------
   The handover: call to action, disclosure, optional contact line
   -------------------------------------------------------------------------- */

function renderAction(teacher) {
  const host = document.querySelector('#booking-action');
  if (!host) return;

  const url = profileUrl();
  const email = (CONFIG.preply.contactEmail || '').trim();

  /* The arrow is decorative and mirrored in RTL by CSS; the accessible name of
     the control stays the full label, not "View times and book on Preply ↗". */
  const arrow = el('span', { class: 'cta-arrow', 'aria-hidden': 'true' });
  arrow.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><path d="M4 12L12 4M6 4h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* No configured profile means no link. A button that looks live but goes
     nowhere is worse than one that says it isn't ready — and this state should
     never reach production; see the TODO in js/config.js. */
  const cta = url
    ? el(
        'a',
        {
          class: 'btn-primary booking-cta',
          href: url,
          // Same tab, deliberately: the visitor is continuing a journey, not
          // opening a reference. No redirect, no interstitial.
          'aria-describedby': 'booking-disclosure',
          dataset: { event: CTA_EVENT, location: CTA_LOCATION }
        },
        el('span', {}, t('book.cta')),
        arrow
      )
    : el(
        'span',
        { class: 'btn-primary booking-cta booking-cta--disabled', role: 'link', 'aria-disabled': 'true' },
        el('span', {}, t('book.cta')),
        arrow
      );

  /* Filtered before append(): unlike el(), Element.append() stringifies a null
     child into the literal text "null". */
  const parts = [
    cta,
    url ? null : el('p', { class: 'booking-unconfigured' }, t('book.ctaUnconfigured')),
    el('p', { class: 'booking-disclosure', id: 'booking-disclosure' }, t('book.disclosure', { teacher })),
    el('p', { class: 'booking-note' }, t('book.paidNote')),
    // Omitted entirely when no address is configured — an empty "contact me"
    // affordance is worse than none.
    email
      ? el(
          'p',
          { class: 'booking-contact' },
          el(
            'a',
            { href: `mailto:${email}?subject=${encodeURIComponent(t('book.contactSubject'))}` },
            t('book.contactLink', { teacher })
          )
        )
      : null
  ];

  clear(host).append(...parts.filter(Boolean));
}

/* --------------------------------------------------------------------------
   "What would you like help with?"
   --------------------------------------------------------------------------
   Three buttons and one answer. The point is recognition — the visitor should
   see their own reason written down before they are asked to leave the site.

   The selection is deliberately inert: it is not stored, not counted, not sent
   to Preply, and never appended to the outgoing URL.
   -------------------------------------------------------------------------- */

function renderGoals() {
  const host = document.querySelector('#booking-goals');
  const message = document.querySelector('#booking-goal-message');
  const goals = t('book.goals');
  if (!host || !message || !Array.isArray(goals)) return;

  let selected = null;

  const buttons = goals.map((goal, index) =>
    el(
      'button',
      {
        type: 'button',
        class: 'goal-help-option',
        'aria-pressed': 'false',
        onClick: () => {
          // Tapping the selected goal again clears it, so the reveal is
          // reversible without a second control to explain.
          selected = selected === index ? null : index;
          buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)));
          show(selected);
        }
      },
      el('span', { class: 'goal-help-tick', 'aria-hidden': 'true' }),
      el('span', {}, goal.label)
    )
  );

  const show = (index) => {
    if (index == null) {
      message.textContent = '';
      message.dataset.shown = 'false';
      return;
    }
    message.textContent = goals[index].message;
    /* Restart the fade-and-rise when the message swaps: without dropping the
       flag first, the same animation on the same element doesn't replay. */
    message.dataset.shown = 'false';
    // eslint-disable-next-line no-unused-expressions
    message.offsetWidth; // forced reflow — the cheapest reliable restart
    message.dataset.shown = 'true';
  };

  clear(host).append(...buttons);
  show(null);
}
