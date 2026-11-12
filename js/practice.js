/**
 * Hkeeli — Practice page.
 *
 * The page is a hub, and playing anything leaves it. Three ways in, in the
 * order the page recommends them:
 *
 *   1. **Scenes** — one situation, played start to finish, ending on the
 *      conversation you just had.
 *   2. **Daily Practice** — a short mix across the whole course.
 *   3. **Drills** — the seven games, one skill at a time.
 *
 * Choosing any of them opens the play stage (js/stage.js) over the hub. The
 * hub stays where it was underneath, inert; leaving drops you back on it with
 * the card you came from refreshed.
 *
 * ## URLs and the Back button
 *
 *   practice.html?unit=unit-2#listen
 *
 *   - the hash names what is playing: `scene-<id>`, `daily-session`, or a
 *     game id. No hash (or a section anchor like `#scenes`) is the hub.
 *   - `unit` scopes Daily Practice and the drills to one lesson, so "Practice
 *     these words" on the Lessons page practises those words. Scenes ignore
 *     it — a scene defines its own unit.
 *
 * Opening the stage from the hub pushes a history entry, so the browser's
 * Back button — the way people leave things on a phone — closes the stage
 * instead of leaving the site. Arriving on a deep link (the goal picker on the
 * home page links straight to `#listen`) opens the stage without pushing, so
 * Back from there behaves as the visitor expects too.
 *
 * `#daily` used to mean "the hub, scrolled to Daily Practice" and was written
 * into the URL on every visit, so it stays the hub — the session itself is
 * `#daily-session`, and an old bookmark never starts one unasked.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, gameTile, errorState, onLangChange } from './ui.js';
import { getUnits } from './data.js';
import { stopAudio } from './audio.js';
import { GAMES, GAME_GROUPS, ungroupedGames, getGame, GameShell } from './games/index.js';
import { DailySession, DAILY_ID } from './daily.js';
import { SceneSession, getScene, playableScenes, sceneCard, hasPlayed } from './scenes.js';
import { Stage } from './stage.js';
import { dueCount } from './journey.js';
import { progress } from './storage.js';
import { icon } from './icons.js';

const ALL = 'all';
const DAILY_SESSION = 'daily-session';
const SCENE_PREFIX = 'scene-';

let units = [];
let phrases = [];
let unitId = ALL;

let stage = null;
let session = null;
let shell = null;
let active = null;
/** Whether the open stage has a history entry of its own to go Back from. */
let pushed = false;
/** Which hub control opened the stage, so closing it can return focus there. */
let openedFrom = null;

async function main() {
  await initI18n();
  initChrome();

  try {
    units = await getUnits();
  } catch (error) {
    console.error(error);
    errorState(document.querySelector('#scene-grid'), () => location.reload());
    return;
  }

  unitId = readUnitFromUrl();
  phrases = phrasesFor(unitId);
  renderHub();

  window.addEventListener('popstate', syncToUrl);
  window.addEventListener('hashchange', syncToUrl);

  // The hub re-renders in place on a language switch. The stage can't be
  // switched mid-play — the nav is inert behind it — so there is nothing to
  // remount.
  onLangChange(() => {
    if (!stage) renderHub();
  });

  const target = readTarget();
  if (target) play(target, { push: false });
}

/* --------------------------------------------------------------------------
   Targets and URLs
   -------------------------------------------------------------------------- */

function readTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  return isTarget(id) ? id : null;
}

function isTarget(id) {
  if (!id) return false;
  if (id === DAILY_SESSION) return true;
  if (id.startsWith(SCENE_PREFIX)) {
    const scene = getScene(id.slice(SCENE_PREFIX.length));
    return Boolean(scene && units.some((unit) => unit.id === scene.unitId));
  }
  return GAMES.some((game) => game.id === id);
}

function sceneOf(target) {
  return target && target.startsWith(SCENE_PREFIX) ? getScene(target.slice(SCENE_PREFIX.length)) : null;
}

function readUnitFromUrl() {
  const requested = new URLSearchParams(location.search).get('unit');
  return requested && units.some((u) => u.id === requested) ? requested : ALL;
}

function phrasesFor(id) {
  const unit = units.find((u) => u.id === id);
  return unit ? unit.phrases : units.flatMap((u) => u.phrases);
}

function hubUrl() {
  const query = unitId === ALL ? '' : `?unit=${encodeURIComponent(unitId)}`;
  return `${location.pathname}${query}`;
}

/** Back, Forward, a typed hash, an anchor click: make the screen match. */
function syncToUrl() {
  const target = readTarget();
  if (target && target !== active) {
    // Arriving on a stage entry by Forward: there is a hub entry behind it.
    play(target, { push: false, hasEntry: true });
  } else if (!target && stage) {
    closeStage();
  }
}

/* --------------------------------------------------------------------------
   The stage
   -------------------------------------------------------------------------- */

/**
 * Open (or switch) the stage to a target.
 *
 * @param {string} target
 * @param {{ push?: boolean, hasEntry?: boolean }} [options]
 */
function play(target, { push = true, hasEntry = false } = {}) {
  if (!isTarget(target)) return;
  if (stage && target === active) return;

  teardown();
  const scene = sceneOf(target);
  const theme = scene ? 'dark' : 'light';
  const label = labelFor(target);
  const url = `${hubUrl()}#${target}`;

  if (!stage) {
    const origin = document.activeElement && document.activeElement.closest('[data-return]');
    openedFrom = origin ? origin.dataset.return : null;
    stage = new Stage({ theme, label, onRequestClose: leave });
    stage.open();
    if (push) {
      history.pushState({ stage: target }, '', url);
      pushed = true;
    } else {
      history.replaceState({ stage: target }, '', url);
      pushed = hasEntry;
    }
  } else {
    // Moving from one scene straight into the next: same stage, same history
    // entry, so Back still means "back to practice".
    history.replaceState({ stage: target }, '', url);
    stage.setTheme(theme);
    stage.setLabel(label);
  }

  active = target;
  mount(target);
}

function labelFor(target) {
  const scene = sceneOf(target);
  if (scene) return t(`scene.${scene.id}.title`);
  if (target === DAILY_SESSION) return t('practice.dailyTitle');
  return t(getGame(target).titleKey);
}

/** The learner asked to leave: ×, Escape, or "Done". */
function leave() {
  if (pushed) {
    history.back(); // popstate closes the stage
  } else {
    history.replaceState(null, '', hubUrl());
    closeStage();
  }
}

async function closeStage() {
  if (!stage) return;
  teardown();
  const closing = stage;
  const was = active;
  stage = null;
  active = null;
  pushed = false;
  // Refresh first, so what fades in underneath already shows the new score.
  renderHub();
  await closing.close();
  returnFocus(was);
}

/**
 * Put focus back on the thing the learner started from.
 *
 * The stage restores focus to its opener — but refreshing the hub replaced
 * that card with a new one showing the new score, so the original button is
 * gone and focus would drop to the top of the page. A keyboard or screen
 * reader user would lose their place after every round. This finds the
 * equivalent control on the refreshed hub instead.
 */
function returnFocus(target) {
  if (!target) return;
  if (openedFrom === 'hero') {
    openedFrom = null;
    const hero = document.querySelector('#practice-start .btn-primary');
    if (hero) return hero.focus({ preventScroll: false });
  }
  openedFrom = null;
  const scene = sceneOf(target);
  const selector = scene
    ? `.scene-card[data-scene="${scene.id}"] button`
    : target === DAILY_SESSION
      ? '#daily-card button'
      : `.drill-tile[data-game="${target}"]`;
  const node = document.querySelector(selector);
  if (node) node.focus({ preventScroll: false });
}

function teardown() {
  stopAudio();
  if (shell) shell.destroy();
  if (session) session.destroy();
  shell = null;
  session = null;
}

function mount(target) {
  const content = stage.clearContent();
  clear(stage.footer);

  const scene = sceneOf(target);
  if (scene) return startScene(scene);
  if (target === DAILY_SESSION) return startDaily();

  const game = getGame(target);
  stage.setSegments(1);

  // A narrow unit filter can leave a game without enough material to run.
  if (phrases.length < (game.minPhrases || 1)) {
    content.append(
      el(
        'div',
        { class: 'game-empty' },
        el('p', {}, t('game.emptyScoped')),
        el(
          'button',
          {
            type: 'button',
            class: 'btn-secondary',
            onClick: () => {
              setUnit(ALL);
              mount(target);
            }
          },
          t('games.allUnits')
        )
      )
    );
    return;
  }

  shell = new GameShell(content, game, phrases, {
    units,
    unitId: unitId === ALL ? null : unitId,
    stage,
    onBack: leave
  });
  game.start(shell);
}

function startScene(scene) {
  const available = playableScenes(units);
  session = new SceneSession(stage, {
    scene,
    units,
    number: available.indexOf(scene) + 1,
    nextScene: nextSceneAfter(scene, available),
    onStartScene: (next) => play(`${SCENE_PREFIX}${next.id}`),
    onExit: leave
  });
  session.start();
}

/**
 * The scene to offer at the end of this one: the next one in order that
 * hasn't been played yet. When every other scene has been played, there is
 * none — and the end screen offers the lesson instead.
 */
function nextSceneAfter(scene, available) {
  const at = available.indexOf(scene);
  for (let i = 1; i < available.length; i++) {
    const candidate = available[(at + i) % available.length];
    if (!hasPlayed(candidate)) return candidate;
  }
  return null;
}

function startDaily() {
  session = new DailySession(stage, {
    units,
    phrases,
    unitId: unitId === ALL ? null : unitId,
    onExit: leave
  });
  session.start();
}

/* --------------------------------------------------------------------------
   The hub
   -------------------------------------------------------------------------- */

function renderHub() {
  renderStart();
  renderModes();
  renderScenes();
  renderDaily();
  renderUnitFilter();
  renderDrills();
}

/**
 * The hero's one-tap start: the next scene not yet played, by name.
 *
 * It uses the same rule as the "Start here" badge on the scene cards, so the
 * two never disagree. Once every scene has been played it stops naming one
 * and points at the list instead — choosing which to replay is the learner's
 * call, not ours.
 */
function renderStart() {
  const host = document.querySelector('#practice-start');
  if (!host) return;

  const available = playableScenes(units);
  const next = available.find((scene) => !hasPlayed(scene)) || null;
  const anyPlayed = available.some(hasPlayed);

  const action = next
    ? el(
        'button',
        {
          type: 'button',
          class: 'btn-primary practice-start-btn',
          dataset: { return: 'hero' },
          onClick: () => play(`${SCENE_PREFIX}${next.id}`)
        },
        icon(next.icon, { size: 20 }),
        el('span', {}, t(anyPlayed ? 'practice.heroNext' : 'practice.heroStart', { title: t(`scene.${next.id}.title`) })),
        icon('forward', { size: 18, className: 'icon-dir' })
      )
    : available.length
      ? el(
          'a',
          { class: 'btn-primary practice-start-btn', href: '#scenes' },
          el('span', {}, t('practice.heroAll')),
          icon('forward', { size: 18, className: 'icon-dir' })
        )
      : null;

  clear(host).append(...[action, action ? el('p', { class: 'practice-start-note' }, t('practice.heroNote')) : null].filter(Boolean));
}

/**
 * What the three things on this page are, in one line each. Without it a
 * visitor has to infer what a "scene" is from the cards below, and the page
 * reads as three unrelated blocks rather than one offer at three depths.
 */
const MODES = [
  { id: 'Scene', icon: 'pin', href: '#scenes' },
  { id: 'Daily', icon: 'repeat', href: '#daily' },
  { id: 'Games', icon: 'target', href: '#drills' }
];

function renderModes() {
  const host = document.querySelector('#practice-modes');
  if (!host) return;
  clear(host).append(
    el(
      'ol',
      { class: 'practice-modes', 'aria-label': t('practice.howTitle') },
      ...MODES.map((mode, i) =>
        el(
          'li',
          {},
          el(
            'a',
            { class: 'practice-mode', href: mode.href },
            el('span', { class: 'practice-mode-icon' }, icon(mode.icon, { size: 22 })),
            el(
              'span',
              { class: 'practice-mode-text' },
              el('span', { class: 'practice-mode-title' }, t(`practice.mode${mode.id}Title`)),
              el('span', { class: 'practice-mode-body' }, t(`practice.mode${mode.id}Body`))
            ),
            i === 0 ? el('span', { class: 'practice-mode-flag' }, t('practice.startHere')) : null
          )
        )
      )
    )
  );
}

function renderScenes() {
  const host = document.querySelector('#scene-grid');
  if (!host) return;

  const available = playableScenes(units);
  const recommended = available.find((scene) => !hasPlayed(scene)) || null;

  clear(host).append(
    ...available.map((scene, i) =>
      sceneCard(scene, units.find((u) => u.id === scene.unitId), {
        number: i + 1,
        recommended: scene === recommended,
        onStart: (picked) => play(`${SCENE_PREFIX}${picked.id}`)
      })
    )
  );
}

async function renderDaily() {
  const host = document.querySelector('#daily-card');
  if (!host) return;

  const stats = progress.getGameStats(DAILY_ID);
  const due = await dueCount();
  const scoped = units.find((unit) => unit.id === unitId);

  clear(host).append(
    el(
      'div',
      { class: 'daily-strip' },
      el('span', { class: 'daily-strip-icon', 'aria-hidden': 'true' }, icon('repeat', { size: 28 })),
      el(
        'div',
        { class: 'daily-strip-text' },
        el('p', { class: 'daily-strip-eyebrow' }, t('practice.alsoLabel')),
        el('h2', { id: 'daily-title' }, t('practice.dailyTitle')),
        el('p', {}, t('practice.dailyBody')),
        el(
          'p',
          { class: 'daily-strip-stats' },
          due ? t('practice.dueCount', { count: due }) : t('practice.noneDue'),
          scoped ? ` · ${t('practice.scopedTo')} ${pick(scoped.title)}` : '',
          stats.plays ? ` · ${t('practice.lastScore')} ${stats.lastScore}/${stats.lastTotal || '—'}` : ''
        )
      ),
      el(
        'button',
        { type: 'button', class: 'btn-primary', onClick: () => play(DAILY_SESSION) },
        el('span', {}, t(stats.plays ? 'practice.startDailyAgain' : 'practice.startDaily')),
        icon('forward', { size: 18, className: 'icon-dir' })
      )
    )
  );
}

function renderUnitFilter() {
  const host = document.querySelector('#unit-filter');
  if (!host) return;

  const select = el('select', { id: 'unit-select' });
  select.append(
    el('option', { value: ALL }, t('games.allUnits')),
    ...units.map((unit) =>
      el('option', { value: unit.id }, `${t('learn.unitLabel')} ${unit.order} — ${pick(unit.title)}`)
    )
  );
  select.value = unitId;
  select.addEventListener('change', () => setUnit(select.value));

  clear(host).append(el('label', { class: 'unit-filter-label', for: 'unit-select' }, t('games.unitFilter')), select);
}

/** Scope Daily Practice and the drills to one unit, or the whole course. */
function setUnit(next) {
  unitId = next;
  phrases = phrasesFor(unitId);
  if (!stage) {
    history.replaceState(null, '', `${hubUrl()}${location.hash}`);
    renderDaily();
    renderDrills();
  }
}

function renderDrills() {
  const host = document.querySelector('#game-groups');
  if (!host) return;

  const extra = ungroupedGames();
  const groups = extra.length
    ? [...GAME_GROUPS, { id: 'other', titleKey: 'practice.skillOther', games: extra.map((g) => g.id) }]
    : GAME_GROUPS;

  clear(host).append(
    ...groups.map((group) =>
      // A group, not a <section>: the site styles every <section> as a padded
      // page band, and five nested landmarks would crowd a screen reader's
      // region list for what are only headings in a list.
      el(
        'div',
        { class: 'drill-group', role: 'group', 'aria-label': t(group.titleKey) },
        el('h3', { class: 'drill-group-title' }, t(group.titleKey)),
        el(
          'div',
          { class: 'drill-grid' },
          ...group.games.map((id) => {
            const game = getGame(id);
            return gameTile(game, progress.getGameStats(game.id), { onSelect: () => play(game.id) });
          })
        )
      )
    )
  );
}

main();
