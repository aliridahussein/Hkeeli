/**
 * Hkeeli — Practice page.
 *
 * Daily Practice is the page's answer to "what should I do now": one guided
 * sequence built from the games that already exist. The seven individual games
 * are still all here, one level down, grouped by the skill they train — a
 * learner who knows they want listening practice can go straight to it.
 *
 * URL shape: practice.html?unit=unit-2#listen
 *   - `unit` scopes the session and every game to a single lesson, so
 *     "Practice these words" on the Lessons page actually practises those words;
 *   - the hash selects what is mounted: `daily` (the default) or a game id.
 * Both stay in the URL so a learner can bookmark or share a drill.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, gameTile, errorState, onLangChange } from './ui.js';
import { getUnits } from './data.js';
import { stopAudio } from './audio.js';
import { GAMES, GAME_GROUPS, ungroupedGames, getGame, GameShell } from './games/index.js';
import { DailySession, DAILY_ID } from './daily.js';
import { dueCount } from './journey.js';
import { progress } from './storage.js';

const ALL = 'all';
const DAILY = 'daily';

let units = [];
let phrases = [];
let shell = null;
let session = null;
let activeId = null;
let unitId = ALL;

async function main() {
  await initI18n();
  initChrome();

  const host = document.querySelector('#game-host');
  try {
    units = await getUnits();
  } catch (error) {
    console.error(error);
    errorState(host, () => location.reload());
    return;
  }

  unitId = readUnitFromUrl();
  applyUnit(unitId, { remount: false });

  renderUnitFilter();
  renderCatalogue();
  await mount(readTargetFromUrl());

  window.addEventListener('hashchange', () => {
    const id = readTargetFromUrl();
    if (id !== activeId) mount(id);
  });

  // A language switch re-renders the board, which restarts whatever is running.
  onLangChange(async () => {
    renderUnitFilter();
    renderCatalogue();
    await mount(activeId);
  });
}

/** `daily` unless the hash names a real game. */
function readTargetFromUrl() {
  const id = location.hash.slice(1);
  if (!id || id === DAILY) return DAILY;
  return GAMES.some((game) => game.id === id) ? id : DAILY;
}

/* --------------------------------------------------------------------------
   Unit scoping
   -------------------------------------------------------------------------- */

function readUnitFromUrl() {
  const requested = new URLSearchParams(location.search).get('unit');
  return requested && units.some((u) => u.id === requested) ? requested : ALL;
}

/** Narrow the phrase bank to one unit, or open it back up to the whole course. */
function applyUnit(next, { remount = true } = {}) {
  unitId = next;
  const unit = units.find((u) => u.id === unitId);
  phrases = unit ? unit.phrases : units.flatMap((u) => u.phrases);
  syncUrl();
  if (remount) mount(activeId);
}

function syncUrl() {
  // Only once something is mounted: writing the URL earlier would clobber the
  // incoming hash before it has been read.
  if (!activeId) return;
  const query = unitId === ALL ? '' : `?unit=${encodeURIComponent(unitId)}`;
  history.replaceState(null, '', `${location.pathname}${query}#${activeId}`);
}

function renderUnitFilter() {
  const host = document.querySelector('#unit-filter');
  if (!host) return;

  const select = el('select', { id: 'unit-select', 'aria-label': t('games.unitFilter') });
  select.append(
    el('option', { value: ALL }, t('games.allUnits')),
    ...units.map((unit) =>
      el('option', { value: unit.id }, `${t('learn.unitLabel')} ${unit.order} — ${pick(unit.title)}`)
    )
  );
  select.value = unitId;
  select.addEventListener('change', () => applyUnit(select.value));

  clear(host).append(
    el('label', { class: 'unit-filter-label', for: 'unit-select' }, t('games.unitFilter')),
    select
  );
}

/* --------------------------------------------------------------------------
   The Daily Practice card — the page's recommended action
   -------------------------------------------------------------------------- */

async function renderDailyCard() {
  const host = document.querySelector('#daily-card');
  if (!host) return;

  const stats = progress.getGameStats(DAILY_ID);
  const due = await dueCount();
  const scoped = units.find((unit) => unit.id === unitId);
  const running = activeId === DAILY && session;
  const steps = t('practice.dailySteps');

  clear(host).append(
    el(
      'div',
      { class: 'daily-card', dataset: { state: running ? 'running' : 'idle' } },
      el(
        'div',
        { class: 'daily-card-body' },
        el('p', { class: 'eyebrow' }, el('span', { class: 'dot' }), el('span', {}, t('practice.recommended'))),
        el('h2', {}, t('practice.dailyTitle')),
        el('p', {}, t('practice.dailyBody')),
        Array.isArray(steps)
          ? el('ul', { class: 'daily-card-steps' }, ...steps.map((step) => el('li', {}, step)))
          : null,
        el(
          'p',
          { class: 'daily-card-stats' },
          due
            ? t('practice.dueCount', { count: due })
            : t('practice.noneDue'),
          scoped ? ` · ${t('practice.scopedTo')} ${pick(scoped.title)}` : '',
          stats.plays ? ` · ${t('practice.lastScore')} ${stats.lastScore}/${stats.lastTotal || '—'}` : ''
        )
      ),
      running
        ? el('p', { class: 'daily-card-running' }, t('practice.running'))
        : el(
            'button',
            { type: 'button', class: 'btn-primary', onClick: () => mount(DAILY, { restart: true }) },
            t(stats.plays ? 'practice.startDailyAgain' : 'practice.startDaily')
          )
    )
  );
}

/* --------------------------------------------------------------------------
   The game catalogue — secondary, grouped by skill
   -------------------------------------------------------------------------- */

function renderCatalogue() {
  const host = document.querySelector('#game-groups');
  if (!host) return;

  const extra = ungroupedGames();
  const groups = extra.length
    ? [...GAME_GROUPS, { id: 'other', titleKey: 'practice.skillOther', games: extra.map((g) => g.id) }]
    : GAME_GROUPS;

  clear(host).append(
    ...groups.map((group) =>
      el(
        'section',
        { class: 'game-group' },
        el('h3', {}, t(group.titleKey)),
        el(
          'div',
          { class: 'games-grid' },
          ...group.games.map((id) => {
            const game = getGame(id);
            const tile = gameTile(game, progress.getGameStats(game.id), {
              onSelect: () => mount(game.id, { scroll: true })
            });
            tile.dataset.game = game.id;
            return tile;
          })
        )
      )
    )
  );

  markActiveTile();
}

/** The tile whose game is mounted says so — otherwise nothing in the catalogue
    reflects what is currently on screen above it. */
function markActiveTile() {
  document.querySelectorAll('#game-groups .game-tile').forEach((tile) => {
    if (tile.dataset.game === activeId) tile.setAttribute('aria-current', 'true');
    else tile.removeAttribute('aria-current');
  });
}

/* --------------------------------------------------------------------------
   Mounting
   -------------------------------------------------------------------------- */

async function teardown() {
  stopAudio();
  if (shell) shell.destroy();
  if (session) session.destroy();
  shell = null;
  session = null;
}

/**
 * Mount Daily Practice or a single game into the host.
 *
 * @param {string} id  'daily' or a game id
 * @param {{restart?: boolean, scroll?: boolean}} [options]
 */
async function mount(id, { restart = false, scroll = false } = {}) {
  const host = document.querySelector('#game-host');
  if (!host) return;

  const target = id === DAILY || GAMES.some((game) => game.id === id) ? id : DAILY;
  const wasRunning = activeId === DAILY && Boolean(session);

  await teardown();
  activeId = target;
  syncUrl();

  if (target === DAILY) {
    // Arriving at the page shows the card, not a session in progress: Daily
    // Practice starts when the learner says so.
    if (restart || wasRunning) startDaily(host);
    else clear(host);
    markActiveTile();
    await renderDailyCard();
    if (scroll) host.scrollIntoView({ block: 'start' });
    return;
  }

  const game = getGame(target);

  // A narrow unit filter can leave a game without enough material to run.
  if (phrases.length < (game.minPhrases || 1)) {
    clear(host).append(
      el(
        'div',
        { class: 'game-empty' },
        el('p', {}, t('game.empty')),
        unitId !== ALL
          ? el(
              'button',
              { class: 'btn-secondary btn-small', onClick: () => applyUnit(ALL) },
              t('games.allUnits')
            )
          : null
      )
    );
    await renderDailyCard();
    return;
  }

  const mountPoint = el('div', { class: 'game-mount' });
  clear(host).append(
    el(
      'div',
      { class: 'game-frame' },
      el(
        'div',
        { class: 'game-frame-head' },
        el(
          'button',
          { type: 'button', class: 'game-back', onClick: () => mount(DAILY, { scroll: true }) },
          t('practice.backToDaily')
        ),
        el('p', { class: 'game-frame-title' }, t(game.blurbKey))
      ),
      mountPoint
    )
  );

  shell = new GameShell(mountPoint, game, phrases, {
    units,
    unitId: unitId === ALL ? null : unitId
  });
  game.start(shell);

  markActiveTile();
  await renderDailyCard();
  if (scroll) host.scrollIntoView({ block: 'start' });
}

function startDaily(host) {
  session = new DailySession(clear(host), {
    units,
    phrases,
    unitId: unitId === ALL ? null : unitId,
    onExit: () => {
      session = null;
      clear(host);
      renderDailyCard();
      const catalogue = document.querySelector('#game-catalogue');
      if (catalogue) catalogue.scrollIntoView({ block: 'start' });
    }
  });
  session.start();
}

main();
