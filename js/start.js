/**
 * Hkeeli — Start Here.
 *
 * Three questions, one screen each, then one concrete next step. It exists
 * because "where do I begin" is the question that loses people, and a course
 * with twelve planned units answers it badly by default.
 *
 * Everything is optional: the page carries a skip link straight to Unit 1, any
 * question can be revisited, and the answers live on the device — there is no
 * account and nothing is sent anywhere.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, errorState, onLangChange, progressBar } from './ui.js';
import { getUnit } from './data.js';
import { getGame } from './games/index.js';
import { GOALS, LEVELS, FIRST_ACTIONS, recommend } from './journey.js';
import { prefs } from './storage.js';

/* Question order matters: the goal is the one everybody can answer instantly,
   and answering it makes the next two feel worth the effort. */
const QUESTIONS = [
  { key: 'goal', titleKey: 'start.q1', options: () => GOALS.map(toOption) },
  { key: 'level', titleKey: 'start.q2', options: () => LEVELS.map(toOption) },
  { key: 'first', titleKey: 'start.q3', options: () => FIRST_ACTIONS.map(toOption) }
];

function toOption(item) {
  return { id: item.id, labelKey: item.labelKey, blurbKey: item.blurbKey || null };
}

let answers = {};
let step = 0;

async function main() {
  await initI18n();
  initChrome();

  // A returning learner keeps their answers, so this is a review rather than an
  // interrogation — but they still land on question one and can change them.
  const saved = prefs.get();
  answers = { goal: saved.goal, level: saved.level, first: saved.first };

  render();
  onLangChange(render);
}

function render() {
  const host = document.querySelector('#onboarding');
  if (!host) return;
  if (step >= QUESTIONS.length) return renderResult(host);

  const question = QUESTIONS[step];
  const options = question.options();

  const choose = (id) => {
    answers = { ...answers, [question.key]: id };
    prefs.set({ [question.key]: id });
    step += 1;
    render();
    focusHeading();
  };

  clear(host).append(
    el(
      'div',
      { class: 'onboarding-card' },
      progressBar((step + 1) / (QUESTIONS.length + 1), t('start.step', { current: step + 1, total: QUESTIONS.length })),
      el('h2', { id: 'onboarding-title', tabindex: '-1' }, t(question.titleKey)),
      el(
        'div',
        { class: 'onboarding-options', role: 'group', 'aria-labelledby': 'onboarding-title' },
        ...options.map((option) =>
          el(
            'button',
            {
              type: 'button',
              class: 'onboarding-option',
              'aria-pressed': String(answers[question.key] === option.id),
              onClick: () => choose(option.id)
            },
            el('span', { class: 'onboarding-option-label' }, t(option.labelKey)),
            option.blurbKey ? el('span', { class: 'onboarding-option-blurb' }, t(option.blurbKey)) : null
          )
        )
      ),
      el(
        'div',
        { class: 'onboarding-nav' },
        step > 0
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn-secondary btn-small',
                onClick: () => {
                  step -= 1;
                  render();
                  focusHeading();
                }
              },
              t('start.back')
            )
          : null,
        // Skipping a question is allowed: the recommendation degrades to a
        // sensible default rather than blocking on a missing answer.
        el(
          'button',
          {
            type: 'button',
            class: 'onboarding-skip-link',
            onClick: () => {
              step += 1;
              render();
              focusHeading();
            }
          },
          t('start.skipQuestion')
        )
      )
    )
  );
}

/** Move focus to the new question so keyboard and screen-reader users follow. */
function focusHeading() {
  const heading = document.querySelector('#onboarding-title, #onboarding-result-title');
  if (heading) heading.focus();
}

async function renderResult(host) {
  const result = recommend(answers);
  let unit;
  try {
    unit = await getUnit(result.unitId);
  } catch (error) {
    console.error(error);
    errorState(host, () => location.reload());
    return;
  }

  const game = result.gameId ? getGame(result.gameId) : null;
  const title = game ? t(game.titleKey) : pick(unit && unit.title);
  const detail = game
    ? `${t('start.inUnit')} ${pick(unit && unit.title)}`
    : pick((unit && (unit.outcome || unit.description)) || '');

  prefs.set({ onboardedAt: Date.now() });

  clear(host).append(
    el(
      'div',
      { class: 'onboarding-card onboarding-result' },
      progressBar(1, t('start.done')),
      el('p', { class: 'onboarding-reason' }, t(result.reasonKey)),
      el('h2', { id: 'onboarding-result-title', tabindex: '-1' }, t('start.resultTitle')),
      el(
        'div',
        { class: 'onboarding-reco' },
        el('p', { class: 'onboarding-reco-kind' }, t(result.kind === 'lesson' ? 'start.kindLesson' : 'start.kindPractice')),
        el('h3', {}, title),
        detail ? el('p', {}, detail) : null
      ),
      el(
        'div',
        { class: 'onboarding-actions' },
        el('a', { class: 'btn-primary', href: result.href }, t('start.begin')),
        el(
          'button',
          {
            type: 'button',
            class: 'btn-secondary btn-small',
            onClick: () => {
              step = 0;
              render();
              focusHeading();
            }
          },
          t('start.changeAnswers')
        )
      ),
      el('p', { class: 'onboarding-saved' }, t('start.saved'))
    )
  );

  focusHeading();
}

main();
