/**
 * Hkeeli — Practice page.
 *
 * Owns the game picker, the unit filter, and the lifecycle of the currently
 * mounted game. All games share one phrase bank and one shell
 * (js/games/index.js).
 *
 * URL shape: practice.html?unit=unit-2#listen
 *   - `unit` scopes every game to a single lesson, so "Practice these words"
 *     on the Learn page actually practises those words.
 *   - the hash selects the game.
 * Both are kept in the URL so a learner can bookmark or share a drill.
 */

import { initI18n, t, pick } from './i18n.js';
import { initChrome, el, clear, errorState, onLangChange } from './ui.js';
import { getUnits } from './data.js';
import { stopAudio } from './audio.js';
import { GAMES, getGame, GameShell } from './games/index.js';
import { progress } from './storage.js';

const ALL = 'all';

let units = [];
let phrases = [];
let shell = null;
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

  renderPicker();
  renderUnitFilter();
  mount(getGame(location.hash.slice(1)).id);

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== activeId) mount(getGame(id).id);
  });

  // A language switch re-renders the board, which restarts the current round.
  onLangChange(() => {
    renderPicker();
    renderUnitFilter();
    mount(activeId);
  });
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
  // Only once a game is mounted: writing the URL earlier would clobber the
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
   Game picker + mounting
   -------------------------------------------------------------------------- */

function renderPicker() {
  const picker = document.querySelector('#game-picker');
  if (!picker) return;

  clear(picker).append(
    ...GAMES.map((game) => {
      const stats = progress.getGameStats(game.id);
      return el(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(game.id === activeId),
          dataset: { game: game.id },
          onClick: () => mount(game.id)
        },
        el('span', { 'aria-hidden': 'true' }, game.icon),
        el('span', {}, t(game.titleKey)),
        stats.plays ? el('span', { class: 'tile-stat' }, String(stats.best)) : null
      );
    })
  );
}

/**
 * Bring the selected tab into view inside the picker rail.
 *
 * The rail scrolls horizontally on a phone and is far wider than the screen, so
 * arriving from a home-page tile (or any #hash link) selected a tab that was
 * hundreds of pixels off-screen — the page looked like nothing was chosen.
 *
 * Measured with rects rather than offsetLeft: offsetLeft is relative to the
 * offset parent, which is not the rail, and it doesn't mirror in RTL.
 */
function revealActiveTab(id) {
  const rail = document.querySelector('#game-picker');
  const btn = rail && rail.querySelector(`button[data-game="${id}"]`);
  if (!rail || !btn || rail.scrollWidth <= rail.clientWidth) return;

  const railRect = rail.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const delta = btnRect.left - railRect.left - (railRect.width - btnRect.width) / 2;
  // Instant, not smooth: on first paint there's nothing to animate from, and a
  // smooth scroll here competes with the page's own scroll position.
  rail.scrollBy({ left: delta, behavior: 'auto' });
}

function mount(id) {
  const game = getGame(id);
  const host = document.querySelector('#game-host');
  if (!host) return;

  stopAudio();
  if (shell) shell.destroy();
  activeId = game.id;
  syncUrl();

  document
    .querySelectorAll('#game-picker button')
    .forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.game === game.id)));

  revealActiveTab(game.id);

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
    return;
  }

  shell = new GameShell(host, game, phrases, { units, unitId: unitId === ALL ? null : unitId });
  game.start(shell);
}

main();
