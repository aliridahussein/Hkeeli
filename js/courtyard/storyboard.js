/**
 * Hkeeli courtyard — the café, without the 3D scene.
 *
 * Where the 3D scene can't run (no WebGL 2, or a renderer far too slow to
 * draw it), the café encounter still has to answer the visitor. This is how:
 * frames rendered from the 3D scene itself (tools/courtyard-preview.html,
 * "Render café storyboard"), stacked at the table and shown as the story
 * reaches them — the approach, then your seat with the waiter, the menu, the
 * slip, the coffee, the manoushe, the bill and your money each on a layer of
 * its own, so any combination the story reaches is drawn correctly.
 *
 * It is a lightweight presentation, not 3D: nothing here moves but a fade.
 * If an image is missing, that layer simply doesn't appear; the still courtyard
 * underneath and the dialogue carry on regardless.
 */

const BASE = 'assets/images/courtyard/';
const LAYERS = ['menu', 'waiter', 'slip', 'plate', 'tray', 'tray-empty', 'bill', 'money'];

/** Which layers a story has reached: from the log of what has happened. */
export function boardState(view, events) {
  const s = { view: view === 'approach' ? 'approach' : 'seat', menu: true, waiter: false, slip: false, plate: false, tray: false, empty: false, bill: false, money: false };
  for (const e of events) {
    if (e === 'arrive' || e === 'coffee' || e === 'manoushe' || e === 'bill') s.waiter = true;
    if (e === 'leave') s.waiter = false;
    if (e === 'note') {
      s.menu = false;
      s.slip = true;
    }
    if (e === 'coffee') s.tray = true;
    if (e === 'manoushe') s.plate = true;
    if (e === 'drink') s.empty = true;
    if (e === 'bill') {
      s.bill = true;
      s.slip = false;
    }
    if (e === 'pay') s.money = true;
  }
  return s;
}

/**
 * @param {HTMLElement} stage
 * @param {'wide'|'tall'} framing
 * @param {{ smooth: () => boolean }} options
 */
export function createStoryboard(stage, framing, { smooth }) {
  const root = document.createElement('div');
  root.className = 'cafe-board';
  root.setAttribute('aria-hidden', 'true');
  stage.querySelector('.courtyard-still')?.after(root);
  let current = framing;
  let images = {};
  let last = null;

  function build() {
    root.replaceChildren();
    images = {};
    ['approach', 'seat', ...LAYERS].forEach((name) => {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.className = `cafe-board-layer cafe-board-${name}`;
      img.dataset.on = 'false';
      img.src = `${BASE}cafe-${current}-${name}.webp`;
      img.addEventListener('error', () => img.remove(), { once: true });
      root.append(img);
      images[name] = img;
    });
    root.dataset.motion = String(smooth());
  }
  build();

  function show(view, events) {
    last = [view, events.slice()];
    const s = boardState(view, events);
    const on = {
      approach: s.view === 'approach',
      seat: s.view === 'seat',
      menu: s.view === 'seat' && s.menu,
      waiter: s.view === 'seat' && s.waiter,
      slip: s.view === 'seat' && s.slip,
      plate: s.view === 'seat' && s.plate,
      tray: s.view === 'seat' && s.tray && !s.empty,
      'tray-empty': s.view === 'seat' && s.tray && s.empty,
      bill: s.view === 'seat' && s.bill,
      money: s.view === 'seat' && s.money
    };
    root.dataset.motion = String(smooth());
    Object.entries(images).forEach(([name, img]) => {
      img.dataset.on = String(Boolean(on[name]));
    });
  }

  return {
    show,
    setFraming(next) {
      if (next === current) return;
      current = next;
      build();
      if (last) show(...last);
    },
    destroy() {
      root.remove();
    }
  };
}
