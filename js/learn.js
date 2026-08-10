/**
 * Hkeeli — Lessons.
 *
 * The curriculum, visible: what each unit lets you *do*, what it covers, how
 * much of it you've met on this device, and one obvious way in. Opening a unit
 * still reveals everything lessons.json holds — dialogue, vocabulary with
 * audio, the teacher's tip, the speaking challenge and the homework.
 *
 * Units are grouped by the stage they belong to, so the page reads as a path
 * rather than a list. Adding a unit to the data file is enough to place it.
 */

import { initI18n, t, pick } from './i18n.js';
import {
  initChrome,
  el,
  clear,
  phraseStrip,
  progressBar,
  errorState,
  onLangChange
} from './ui.js';
import { getJourney, nextUnit } from './journey.js';
import { progress } from './storage.js';

async function main() {
  await initI18n();
  initChrome();
  await render();
  onLangChange(render);
}

async function render() {
  const host = document.querySelector('#units');
  if (!host) return;

  let stages;
  let resume;
  try {
    stages = await getJourney();
    resume = await nextUnit();
  } catch (error) {
    console.error(error);
    errorState(host, () => location.reload());
    return;
  }

  const live = stages.filter((stage) => !stage.planned);
  const planned = stages.filter((stage) => stage.planned);
  const units = live.flatMap((stage) => stage.units);

  // Preserve which units were open across a language switch.
  const open = new Set(
    [...host.querySelectorAll('.unit[data-open="true"]')].map((node) => node.dataset.unit)
  );
  const fromHash = location.hash.slice(1);
  if (fromHash) open.add(fromHash);
  if (!open.size && units[0]) open.add(units[0].id);

  renderOverview(units, resume);

  clear(host).append(
    ...live.map((stage) =>
      el(
        'section',
        { class: 'stage', 'aria-labelledby': `stage-${stage.id}` },
        el(
          'header',
          { class: 'stage-head' },
          el('h2', { id: `stage-${stage.id}`, class: 'stage-title' }, t(stage.titleKey)),
          el('p', { class: 'stage-outcome' }, t(stage.outcomeKey))
        ),
        ...stage.units.map((unit) => unitCard(unit, open.has(unit.id)))
      )
    ),
    planned.length
      ? el(
          'section',
          { class: 'stage stage--planned', 'aria-labelledby': 'stage-planned' },
          el(
            'header',
            { class: 'stage-head' },
            el('h2', { id: 'stage-planned', class: 'stage-title' }, t('learn.comingSoon')),
            el('p', { class: 'stage-outcome' }, t('learn.comingSoonBody'))
          ),
          el(
            'ul',
            { class: 'planned-stages' },
            ...planned.map((stage) =>
              el(
                'li',
                {},
                el('strong', {}, t(stage.titleKey)),
                el('span', {}, t(stage.outcomeKey))
              )
            )
          )
        )
      : null
  );

  if (fromHash) {
    const target = host.querySelector(`[data-unit="${CSS.escape(fromHash)}"]`);
    if (target) target.scrollIntoView({ block: 'start' });
  }
}

/* --------------------------------------------------------------------------
   Course overview — where you are, and the one button that continues
   -------------------------------------------------------------------------- */

function renderOverview(units, resume) {
  const host = document.querySelector('#course-overview');
  if (!host) return;

  const totals = units.reduce(
    (acc, unit) => {
      const p = progress.getUnitProgress(unit);
      acc.seen += p.seen;
      acc.total += p.total;
      return acc;
    },
    { seen: 0, total: 0 }
  );

  const ratio = totals.total ? totals.seen / totals.total : 0;
  const started = totals.seen > 0;

  clear(host).append(
    el(
      'div',
      { class: 'course-overview' },
      el(
        'div',
        {},
        el('h2', {}, t(started ? 'learn.overviewResume' : 'learn.overviewStart')),
        el(
          'p',
          {},
          t('learn.overviewCount', {
            units: units.length,
            phrases: totals.total,
            seen: totals.seen
          })
        ),
        progressBar(ratio, t('learn.overviewProgress', { percent: Math.round(ratio * 100) }))
      ),
      resume
        ? el(
            'a',
            { class: 'btn-primary', href: `#${resume.id}` },
            `${t(started ? 'learn.continueWith' : 'learn.startWith')} ${pick(resume.title)}`
          )
        : null
    )
  );
}

/* --------------------------------------------------------------------------
   Unit card
   -------------------------------------------------------------------------- */

function unitCard(unit, isOpen) {
  const bodyId = `${unit.id}-body`;
  const stats = progress.getUnitProgress(unit);
  const activities = (unit.dialogue || []).length;

  const toggle = el(
    'button',
    {
      type: 'button',
      class: 'unit-open btn-primary btn-small',
      'aria-expanded': String(isOpen),
      'aria-controls': bodyId
    },
    t(isOpen ? 'learn.close' : stats.status === 'new' ? 'learn.start' : 'learn.continue')
  );

  const head = el(
    'header',
    { class: 'unit-head' },
    el(
      'div',
      { class: 'unit-headline' },
      el('span', { class: 'unit-index', 'aria-hidden': 'true' }, String(unit.order)),
      el(
        'div',
        {},
        el('h3', {}, pick(unit.title)),
        el(
          'p',
          { class: 'unit-outcome' },
          `${t('learn.youWillBeAbleTo')} ${pick(unit.outcome || unit.description)}`
        )
      )
    ),
    el(
      'div',
      { class: 'unit-meta' },
      el('span', { class: 'lesson-level' }, pick(unit.level)),
      el('span', { class: 'unit-status', dataset: { status: stats.status } }, t(`learn.status.${stats.status}`)),
      // Counted, never estimated: how long a unit takes depends entirely on the
      // learner, and an invented "10 min" would be the only fiction on the page.
      el('span', { class: 'unit-count' }, t('learn.countPhrases', { count: stats.total })),
      activities ? el('span', { class: 'unit-count' }, t('learn.countDialogue', { count: activities })) : null
    ),
    unit.skills && unit.skills.length
      ? el(
          'ul',
          { class: 'unit-skills', 'aria-label': t('learn.skills') },
          ...unit.skills.map((skill) => el('li', {}, pick(skill)))
        )
      : null,
    progressBar(stats.ratio, t('learn.unitProgress', { seen: stats.seen, total: stats.total })),
    el('div', { class: 'unit-actions' }, toggle)
  );

  const body = el(
    'div',
    { class: 'unit-body', id: bodyId },
    block('learn.dialogue', (unit.dialogue || []).map(dialogueLine)),
    block(
      'learn.vocab',
      el(
        'div',
        { class: 'vocab-list' },
        unit.phrases.map((phrase) => phraseStrip(phrase, { showNotes: true }))
      )
    ),
    unit.tip
      ? block(
          'learn.tip',
          el('div', { class: 'tip-box' }, el('p', {}, pick(unit.tip)))
        )
      : null,
    el(
      'div',
      { class: 'task-box' },
      unit.challenge ? task('learn.challenge', pick(unit.challenge)) : null,
      unit.homework ? task('learn.homework', pick(unit.homework)) : null
    ),
    // Scoped to this unit, so "practice these words" practises these words.
    el(
      'div',
      { class: 'unit-footer-actions' },
      el(
        'a',
        { class: 'btn-primary btn-small', href: `practice.html?unit=${encodeURIComponent(unit.id)}` },
        t('learn.practiceThis')
      ),
      el(
        'a',
        {
          class: 'btn-secondary btn-small',
          href: `practice.html?unit=${encodeURIComponent(unit.id)}#listen`
        },
        t('learn.listenThis')
      )
    )
  );

  const card = el(
    'article',
    { class: 'unit', id: unit.id, dataset: { unit: unit.id, open: String(isOpen) } },
    head,
    body
  );
  body.hidden = !isOpen;

  toggle.addEventListener('click', () => {
    const next = card.dataset.open !== 'true';
    card.dataset.open = String(next);
    body.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    toggle.textContent = t(next ? 'learn.close' : stats.status === 'new' ? 'learn.start' : 'learn.continue');
  });

  return card;
}

function block(titleKey, content) {
  return el('section', { class: 'unit-block' }, el('h4', {}, t(titleKey)), content);
}

function task(titleKey, text) {
  return el('div', { class: 'task' }, el('h4', {}, t(titleKey)), el('p', {}, text));
}

function dialogueLine(line) {
  return el(
    'div',
    { class: 'dialogue-line', dataset: { speaker: line.speaker || 'A' } },
    el('span', { class: 'speaker' }, line.speaker || 'A'),
    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, line.ar),
    el('span', { class: 'translit', dir: 'ltr' }, line.translit),
    el('span', { class: 'line-en' }, line.en)
  );
}

main();
