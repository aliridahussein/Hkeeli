/**
 * Hkeeli — Learn page.
 *
 * Renders every unit in lessons.json as an expandable card: dialogue,
 * vocabulary with audio, the teacher's tip, the speaking challenge and the
 * homework. Adding a unit to the data file is enough to make it appear here.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, phraseStrip, errorState, onLangChange } from './ui.js';
import { getUnits } from './data.js';

async function main() {
  await initI18n();
  initChrome();
  await render();
  onLangChange(render);
}

async function render() {
  const host = document.querySelector('#units');
  if (!host) return;

  let units;
  try {
    units = await getUnits();
  } catch (error) {
    console.error(error);
    errorState(host, () => location.reload());
    return;
  }

  // Preserve which units were open across a language switch.
  const open = new Set(
    [...host.querySelectorAll('.unit[data-open="true"]')].map((node) => node.dataset.unit)
  );
  const fromHash = location.hash.slice(1);
  if (fromHash) open.add(fromHash);
  if (!open.size && units[0]) open.add(units[0].id);

  clear(host).append(...units.map((unit) => unitCard(unit, open.has(unit.id))));

  if (fromHash) {
    const target = host.querySelector(`[data-unit="${CSS.escape(fromHash)}"]`);
    if (target) target.scrollIntoView({ block: 'start' });
  }
}

function unitCard(unit, isOpen) {
  const bodyId = `${unit.id}-body`;

  const toggle = el(
    'button',
    {
      type: 'button',
      class: 'unit-summary',
      'aria-expanded': String(isOpen),
      'aria-controls': bodyId
    },
    el('span', { class: 'unit-index', 'aria-hidden': 'true' }, String(unit.order)),
    el(
      'span',
      {},
      el('h2', {}, pick(unit.title)),
      el(
        'span',
        { class: 'unit-sub' },
        `${pick(unit.level)} · ${unit.phrases.length} ${t('learn.phraseCount')}`
      )
    ),
    el('span', { class: 'chevron', 'aria-hidden': 'true' }, '⌄')
  );

  const body = el(
    'div',
    { class: 'unit-body', id: bodyId },
    block('learn.dialogue', (unit.dialogue || []).map(dialogueLine)),
    block(
      'learn.vocab',
      el('div', { class: 'vocab-list' }, unit.phrases.map((phrase) => phraseStrip(phrase)))
    ),
    unit.tip
      ? block('learn.tip', el('div', { class: 'tip-box' }, el('p', {}, pick(unit.tip))))
      : null,
    el(
      'div',
      { class: 'task-box' },
      unit.challenge ? task('learn.challenge', pick(unit.challenge)) : null,
      unit.homework ? task('learn.homework', pick(unit.homework)) : null
    ),
    el(
      'a',
      { class: 'btn-primary btn-small', href: 'practice.html' },
      t('learn.practiceThis')
    )
  );

  const card = el('article', { class: 'unit', id: unit.id, dataset: { unit: unit.id, open: String(isOpen) } }, toggle, body);
  body.hidden = !isOpen;

  toggle.addEventListener('click', () => {
    const next = card.dataset.open !== 'true';
    card.dataset.open = String(next);
    body.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
  });

  return card;
}

function block(titleKey, content) {
  return el('section', { class: 'unit-block' }, el('h3', {}, t(titleKey)), content);
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
