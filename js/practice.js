/**
 * Hkeeli — Practice page.
 *
 * Owns the game picker and the lifecycle of the currently mounted game. All
 * four games share one phrase bank and one shell (js/games/index.js).
 */

import { initI18n, t } from './i18n.js';
import { initChrome, el, clear, errorState, onLangChange } from './ui.js';
import { getAllPhrases } from './data.js';
import { stopAudio } from './audio.js';
import { GAMES, getGame, GameShell } from './games/index.js';
import { progress } from './storage.js';

let phrases = [];
let shell = null;
let activeId = null;

async function main() {
  await initI18n();
  initChrome();

  const host = document.querySelector('#game-host');
  try {
    phrases = await getAllPhrases();
  } catch (error) {
    console.error(error);
    errorState(host, () => location.reload());
    return;
  }

  renderPicker();
  mount(getGame(location.hash.slice(1)).id);

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== activeId) mount(getGame(id).id);
  });

  // A language switch re-renders the board, which means restarting the round.
  onLangChange(() => {
    renderPicker();
    mount(activeId);
  });
}

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

function mount(id) {
  const game = getGame(id);
  const host = document.querySelector('#game-host');
  if (!host) return;

  stopAudio();
  if (shell) shell.destroy();
  activeId = game.id;

  if (phrases.length < (game.minPhrases || 1)) {
    clear(host).append(el('div', { class: 'game-empty' }, el('p', {}, t('game.empty'))));
    return;
  }

  history.replaceState(null, '', `#${game.id}`);
  document
    .querySelectorAll('#game-picker button')
    .forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.game === game.id)));

  shell = new GameShell(host, game, phrases);
  game.start(shell);
}

main();
