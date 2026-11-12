/**
 * Hkeeli — motion primitives.
 *
 * The games used to replace their board with `clear()` + `append()`, which
 * destroys one question and builds the next inside a single frame: nothing
 * enters, nothing leaves, and the whole thing reads as a page blink rather
 * than as a game responding to you. Everything here exists to fix that.
 *
 * Three rules:
 *
 *   1. **Reduced motion wins.** Every function below degrades to its own
 *      instant equivalent, not to a shorter animation. `tokens.css` already
 *      collapses CSS durations; this is the JS half of the same promise.
 *   2. **Never block correctness.** Animations are awaited for sequencing, but
 *      a browser without the Web Animations API runs the same code path with
 *      the visuals skipped. Nothing here may swallow a render.
 *   3. **Clean up after yourself.** Anything appended to `<body>` removes
 *      itself, including when its animation never fires.
 */

const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when we can and should animate at all. */
function canAnimate(node) {
  return Boolean(node && typeof node.animate === 'function') && !reducedMotion();
}

/**
 * Promise-wrapped WAAPI that is guaranteed to settle.
 *
 * `finish` and `cancel` are the normal exits. The timer is not belt-and-braces
 * — it is load-bearing: a backgrounded tab pauses the document timeline, so an
 * animation started just before the learner switched away never fires either
 * event. Callers sequence real work behind these promises (the next question
 * is rendered after the exit resolves, and the controls are frozen until it
 * does), so a promise that never settles is a session frozen for good.
 *
 * The timer runs on setTimeout, which keeps counting while the tab is hidden.
 * Coming back to a question that has already swapped is correct; coming back
 * to a dead board is not.
 */
function run(node, keyframes, options) {
  return new Promise((resolve) => {
    let animation;
    try {
      animation = node.animate(keyframes, { easing: EASE, fill: 'none', ...options });
    } catch {
      return resolve();
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const { duration = 0, delay = 0 } = options || {};
    // Enough slack that the timer never pre-empts an animation that is simply
    // running, but short enough that a stalled one doesn't strand the learner.
    // `finish()` matters as much as resolving: a stalled animation otherwise
    // keeps painting its first frame — opacity 0 for every entrance here — so
    // the content would be "there" and invisible.
    const timer = setTimeout(() => {
      try {
        animation.finish();
      } catch {
        /* already finished or cancelled */
      }
      done();
    }, duration + delay + 250);

    animation.addEventListener('finish', done, { once: true });
    animation.addEventListener('cancel', done, { once: true });
  });
}

/**
 * Index every direct child so CSS can stagger them.
 *
 * The delay lives in `games.css` (`--i` × a step), not here: how much lag
 * looks right is a design decision and belongs with the rest of the design.
 */
export function indexChildren(parent, selector = null) {
  if (!parent) return;
  const nodes = selector ? parent.querySelectorAll(selector) : parent.children;
  Array.from(nodes).forEach((node, i) => node.style.setProperty('--i', String(i)));
}

/**
 * Replace a container's contents with a visible hand-off: the old board leaves
 * upward, the new one arrives from below with its children staggered.
 *
 * `render` is called between the two halves and must be synchronous — it is
 * the game's own `renderBoard()` call.
 *
 * @param {HTMLElement} board
 * @param {() => void} render
 * @param {{ stagger?: string }} [options] selector for the children to index
 */
export async function swapBoard(board, render, { stagger = '.option, .match-item' } = {}) {
  if (!canAnimate(board)) {
    render();
    return;
  }

  await run(board, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }], {
    duration: 130
  });

  /* Hold the board invisible across the render. Relying on the exit
     animation's fill would mean cancelling it a frame later, and that gap is
     long enough to flash the new content at full opacity.

     `data-entering` is what the CSS stagger keys off. It is set only for the
     length of this hand-off: the board re-renders on every tile placed and
     every card flipped, and an entrance animation on `.game-board > *` that
     ran on *every* render made the whole board blink out and back in on each
     tap. */
  board.style.opacity = '0';
  board.dataset.entering = 'true';
  render();
  indexChildren(board);
  if (stagger) indexChildren(board, stagger);
  board.style.opacity = '';

  await run(board, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
    duration: 200
  });
  // Long enough for the last staggered child to land.
  setTimeout(() => delete board.dataset.entering, 420);
}

/**
 * Make re-rendered elements *travel* instead of teleporting.
 *
 * The word tiles in Sentence Builder and the lines in Order the Conversation
 * re-render their whole board on every tap, so a tile tapped in the bank used
 * to vanish from the bank and appear in the sentence in the same frame. FLIP
 * (First, Last, Invert, Play) fixes that without the games giving up their
 * simple "render everything from state" model:
 *
 *   1. **First** — measure every element carrying `data-flip`.
 *   2. Run `mutate()`, which may throw the whole board away and rebuild it.
 *   3. **Last** — measure the new elements with the same keys.
 *   4. **Invert & play** — translate each one back to where it was, then let
 *      it animate to where it now is.
 *
 * An element that is new may name where it came from with
 * `data-flip-from="<key>"` — the reply you picked flies out of the option
 * list into the conversation that way, though the option itself stays put.
 * Anything brand new with no origin just fades in.
 *
 * Keys must be unique within `root` and stable across the mutation.
 *
 * @param {HTMLElement} root
 * @param {() => void} mutate   synchronous re-render
 * @param {{ duration?: number }} [options]
 */
export function flip(root, mutate, { duration = 360 } = {}) {
  if (!root || reducedMotion() || typeof root.animate !== 'function') {
    mutate();
    return;
  }

  const first = new Map();
  root.querySelectorAll('[data-flip]').forEach((node) => {
    first.set(node.dataset.flip, node.getBoundingClientRect());
  });

  mutate();

  root.querySelectorAll('[data-flip], [data-flip-from]').forEach((node) => {
    const origin = first.get(node.dataset.flip) || first.get(node.dataset.flipFrom);
    const last = node.getBoundingClientRect();

    if (!origin) {
      run(node, [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }], {
        duration: 220
      });
      return;
    }

    const dx = origin.left - last.left;
    const dy = origin.top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    // A slight lift at the midpoint reads as the tile being picked up and set
    // down, rather than sliding along the glass.
    run(
      node,
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 10}px) scale(1.04)`, offset: 0.55 },
        { transform: 'none' }
      ],
      { duration }
    );
  });
}

/**
 * Count a number up, the way a scoreboard does.
 *
 * Eases out, so it decelerates into the final value instead of stopping dead,
 * and always lands exactly on `to` — a rounding error in a score is worse
 * than no animation.
 */
export function countUp(node, from, to, duration = 450) {
  if (!node) return;
  if (reducedMotion() || from === to) {
    node.textContent = String(to);
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(step);
    else node.textContent = String(to);
  };
  requestAnimationFrame(step);
}

/** A short scale-and-settle, for an element whose value just changed. */
export function pulse(node, scale = 1.35) {
  if (!canAnimate(node)) return;
  run(node, [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
    duration: 420
  });
}

/**
 * Throw a token from one element to another — the "+1" that leaves the answer
 * you clicked and lands on the score.
 *
 * It is `position: fixed` on `<body>` rather than absolute inside the board:
 * the board has `overflow` and a sticky footer over it, and a token that
 * clips halfway through its arc is worse than none.
 */
export function flyToken(fromEl, toEl, text = '+1') {
  if (!fromEl || !toEl || !canAnimate(fromEl)) return;

  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  // Elements scrolled out of view report a zero box; there is nothing to throw.
  if (!from.width || !to.width) return;

  const token = document.createElement('span');
  token.className = 'score-token';
  token.setAttribute('aria-hidden', 'true');
  token.textContent = text;
  token.style.left = `${from.left + from.width / 2}px`;
  token.style.top = `${from.top + from.height / 2}px`;
  document.body.append(token);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  run(
    token,
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -140%) scale(1.15)', opacity: 1, offset: 0.28 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.45)`, opacity: 0 }
    ],
    { duration: 720 }
  ).then(() => token.remove());

  // Belt and braces: if the animation never runs, the node still goes away.
  setTimeout(() => token.remove(), 1200);
}

/**
 * Sweep an SVG ring from empty to `ratio`, then hold.
 *
 * The caller owns the circle; this only drives `stroke-dashoffset`, so the
 * ring's size, colour and width stay in CSS where they belong.
 */
export function sweepRing(circle, ratio, duration = 900) {
  if (!circle) return;
  const length = circle.getTotalLength ? circle.getTotalLength() : 100;
  circle.style.strokeDasharray = String(length);

  const target = length * (1 - Math.max(0, Math.min(1, ratio)));
  if (reducedMotion()) {
    circle.style.strokeDashoffset = String(target);
    return;
  }

  circle.style.strokeDashoffset = String(length);
  run(circle, [{ strokeDashoffset: length }, { strokeDashoffset: target }], { duration }).then(() => {
    circle.style.strokeDashoffset = String(target);
  });
}

/**
 * Reveal a list of elements one after another — the transcript at the end of
 * a scene, where the lines should land like a conversation replaying rather
 * than appear all at once.
 */
export function revealSequence(nodes, { step = 110, duration = 340 } = {}) {
  const list = Array.from(nodes || []);
  if (!list.length || reducedMotion()) return;

  list.forEach((node, i) => {
    if (typeof node.animate !== 'function') return;
    run(node, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], {
      duration,
      delay: i * step,
      fill: 'backwards'
    });
  });
}
