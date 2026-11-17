/**
 * Hkeeli courtyard — the controller.
 *
 * "A little Lebanon, one conversation at a time." The home page's hero is a
 * Lebanese courtyard; each place in it opens the lessons that belong there.
 * This module owns what is open, and hands the drawing to one of two
 * presentations that share one interface (show / hover / setMotion /
 * setFraming):
 *
 *   - poster.js — the still image, immediately, everywhere;
 *   - scene/presentation.js — the 3D courtyard, loaded after the page is
 *     usable, on devices that can draw it well. It fades in over the still
 *     (same composition, same camera), and if the GPU goes away it fades out
 *     again and the still takes over where it left off.
 *
 * ## What a visitor can rely on
 *
 *   - Every place is a real link (learn.html#unit-1 …) in a labelled list, so
 *     without JavaScript the courtyard is still four ways into the course.
 *   - Choosing a place: the camera moves, the panel opens beside the scene
 *     (or over its lower half on a phone), focus moves to the panel heading.
 *   - Back to the courtyard: the button in the panel, Escape, or the browser's
 *     Back button (each place is index.html#visit-<place>, so it is also a
 *     shareable address). Focus returns to the place's label.
 *   - Choosing again mid-move retargets the camera; nothing queues.
 *   - Reduced motion: no idle movement, and viewpoint changes are a soft cut
 *     instead of a flight. "Pause motion" stops idle movement for anyone.
 *   - Opening a place never calls Zee or anything else over the network
 *     beyond the lesson data the page already loaded.
 */

import { t } from '../i18n.js';
import { clear } from '../ui.js';
import { icon } from '../icons.js';
import { track } from '../analytics.js';
import { getPlace, placeFromHash, HASH_PREFIX, framingQuery, currentFraming } from './places.js';
import { createPosterPresentation } from './poster.js';
import { renderPanel } from './panels.js';
import { stopListening } from './listen.js';
import { chooseTier, probeWebGL } from './scene/quality.js';

const MOTION_KEY = 'hkeeli.courtyard.motion';
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function initCourtyard() {
  const hero = document.querySelector('#courtyard');
  if (!hero || hero.dataset.ready) return null;
  hero.dataset.ready = 'true';

  const stage = hero.querySelector('.courtyard-stage');
  const picture = hero.querySelector('.courtyard-still');
  const panel = hero.querySelector('#place-panel');
  const stageBack = hero.querySelector('.courtyard-back');
  const motionButton = hero.querySelector('.courtyard-motion');
  const labels = new Map([...hero.querySelectorAll('.place-label[data-place]')].map((a) => [a.dataset.place, a]));
  const widths = new Map();

  const state = {
    place: null,
    pushed: false,
    framing: currentFraming(),
    motion: !reducedQuery.matches && readMotion(),
    panel: null,
    renderToken: 0
  };

  const smooth = () => !reducedQuery.matches;
  // In a place, the dock covers the lower part of the stage.
  const sheet = () => Boolean(state.place);

  /* ---- Labels -------------------------------------------------------------
     The presentation reports where each place is on the stage; the label's
     pin goes exactly there, and its pill is nudged inwards so it never hangs
     off the edge. Widths are measured on layout changes, never per frame. */
  labels.forEach((label, id) => {
    const place = getPlace(id);
    const slot = label.querySelector('.place-label-icon');
    if (slot && place) clear(slot).append(icon(place.icon, { size: 18 }));
  });

  /* Sizes are read here, on layout changes only. placeLabel() runs every
     frame and only writes: a read after a write would force a layout of the
     whole page on each frame. */
  let stageWidth = stage.clientWidth;
  function measure() {
    stageWidth = stage.clientWidth;
    labels.forEach((label, id) => widths.set(id, label.querySelector('.place-label-body')?.offsetWidth || 150));
  }

  function placeLabel(id, x, y, visible) {
    const label = labels.get(id);
    if (!label) return;
    const w = stageWidth;
    const half = (widths.get(id) || 150) / 2;
    const margin = 10;
    const cx = Math.min(w - half - margin, Math.max(half + margin, x));
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    label.style.setProperty('--nudge', `${(cx - x).toFixed(1)}px`);
    // A label that has focus stays shown, even while the camera is on its
    // way back and its place is briefly out of frame: hiding it would drop
    // keyboard focus to the page.
    label.dataset.visible = String(visible || label === document.activeElement);
  }

  /* ---- Presentations ------------------------------------------------------- */
  let presentation = createPosterPresentation({ stage, picture, placeLabel, framing: state.framing, sheet });
  hero.dataset.mode = 'still';
  measure();
  presentation.layout?.();

  /* ---- Opening and closing places ----------------------------------------- */
  const ctx = {
    open: (id) => open(id, { source: 'panel' }),
    close: () => close(),
    smooth,
    scene: () => presentation,
    framing: () => state.framing,
    stage
  };

  /* ---- The experience: a place fills the screen below the nav ---------------
     The stage is fixed beneath the site's navigation, the page behind it is
     inert and doesn't scroll, and the place's controls sit over the scene
     (a bar at the top, the dialogue dock at the foot). Leaving puts the page
     back exactly as it was. */
  const root = document.documentElement;
  let inerted = [];
  function setTop() {
    const nav = document.querySelector('.site-nav');
    const box = nav ? nav.getBoundingClientRect() : null;
    const top = box && getComputedStyle(nav).position !== 'static' ? Math.max(0, box.bottom) : 0;
    root.style.setProperty('--exp-top', `${Math.round(top)}px`);
  }
  function enterExperience() {
    if (root.dataset.experience === 'open') return;
    // The stage leaves the page's flow; hold its place so nothing behind it
    // moves, and leaving finds the page exactly as it was.
    const holder = stage.parentElement;
    holder.style.minHeight = `${holder.offsetHeight}px`;
    root.dataset.experience = 'open';
    // The navigation slims down in the experience; measure it after.
    setTop();
    // Everything outside the courtyard, and the hero's own copy, is out of
    // reach of focus and of assistive technology while a place is open. The
    // site navigation stays usable.
    const keep = (node) => node.matches('.site-nav, .skip-link, .zee-launcher, .zee-panel, .toast-region, script, style, link');
    inerted = [];
    const mark = (node) => {
      if (keep(node) || node.inert) return;
      node.inert = true;
      inerted.push(node);
    };
    const sweep = (parent) => {
      [...parent.children].forEach((node) => {
        if (node === hero) return;
        if (node.contains(hero)) sweep(node);
        else mark(node);
      });
    };
    sweep(document.body);
    [...hero.children].forEach((node) => {
      if (!node.classList.contains('courtyard') && node !== panel) mark(node);
    });
    mark(stage.querySelector('.courtyard-places'));
  }
  function leaveExperience() {
    if (root.dataset.experience !== 'open') return;
    delete root.dataset.experience;
    stage.parentElement.style.minHeight = '';
    inerted.forEach((node) => {
      node.inert = false;
    });
    inerted = [];
  }
  window.addEventListener('resize', () => {
    if (root.dataset.experience === 'open') setTop();
  });

  async function open(id, { push = true, immediate = false, focus = true, source = 'label' } = {}) {
    const place = getPlace(id);
    if (!place) return;
    if (state.place === id) {
      state.panel?.heading.focus({ preventScroll: true });
      return;
    }
    const first = !state.place;
    stopListening();
    state.panel?.destroy();
    state.place = id;
    enterExperience();

    hero.dataset.view = 'place';
    hero.dataset.place = id;
    labels.forEach((label, key) => label.setAttribute('aria-expanded', String(key === id)));
    move(id, { immediate });

    if (push) {
      const url = `${location.pathname}${location.search}${HASH_PREFIX}${id}`;
      if (first) {
        history.pushState({ courtyard: id }, '', url);
        state.pushed = true;
      } else history.replaceState({ courtyard: id }, '', url);
    }

    const token = ++state.renderToken;
    panel.hidden = false;
    panel.dataset.state = 'opening';
    const rendered = await renderPanel(panel, id, ctx);
    if (token !== state.renderToken) return;
    state.panel = rendered;
    // On the next frame, so the entrance transition runs from 'opening' —
    // with a timer behind it, since a backgrounded tab may not paint frames.
    const settle = () => {
      if (token === state.renderToken) panel.dataset.state = 'open';
    };
    requestAnimationFrame(settle);
    setTimeout(settle, 60);
    if (focus) rendered.heading.focus({ preventScroll: true });
    track('courtyard_place_opened', { place: id, from: source });
  }

  function close({ push = true, focus = true } = {}) {
    if (!state.place) return;
    const id = state.place;
    state.place = null;
    state.renderToken += 1;
    stopListening();
    state.panel?.destroy();
    state.panel = null;

    hero.dataset.view = 'overview';
    delete hero.dataset.place;
    leaveExperience();
    labels.forEach((label) => label.setAttribute('aria-expanded', 'false'));
    move(null);

    panel.dataset.state = 'closing';
    const token = state.renderToken;
    setTimeout(() => {
      if (token !== state.renderToken) return;
      panel.hidden = true;
      clear(panel);
      delete panel.dataset.state;
    }, smooth() ? 320 : 0);

    if (push) {
      if (state.pushed && history.state && history.state.courtyard) history.back();
      else history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
    state.pushed = false;
    const label = labels.get(id);
    if (focus && label) {
      // The camera is still on its way back, so this place's label may be
      // out of frame for a moment (hidden); it is shown now so it can take
      // focus, and the next frame puts it where it belongs.
      label.dataset.visible = 'true';
      // No transition for this one change: with reduced motion every
      // transition lasts 1 ms (tokens.css), and a label still mid-way from
      // hidden can't take focus.
      label.style.transition = 'none';
      void getComputedStyle(label).visibility;
      label.focus({ preventScroll: true });
      requestAnimationFrame(() => label.style.removeProperty('transition'));
    }
  }

  /* Camera (or still) to a place. With reduced motion the view changes in
     one cut, with no travel; the panel still opens beside it. */
  /* The dock covers the lower part of the screen in a place, so the place is
     framed above it (`sheet`). */
  function move(id, { immediate = false } = {}) {
    presentation.show(id, { immediate: immediate || !smooth(), sheet: Boolean(id) });
  }

  /* ---- Wiring ---------------------------------------------------------------- */
  labels.forEach((label, id) => {
    label.setAttribute('aria-expanded', 'false');
    label.setAttribute('aria-controls', 'place-panel');
    label.addEventListener('click', (event) => {
      // Let modified clicks open the lesson itself in a new tab.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(id, { source: 'label' });
    });
    label.addEventListener('pointerenter', () => presentation.hover(id));
    label.addEventListener('pointerleave', () => presentation.hover(null));
    label.addEventListener('focus', () => presentation.hover(id));
    label.addEventListener('blur', () => presentation.hover(null));
  });

  hero.querySelectorAll('[data-courtyard-open]').forEach((link) =>
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(link.dataset.courtyardOpen, { source: 'hero' });
    })
  );

  stageBack?.addEventListener('click', () => close());

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.place || event.defaultPrevented) return;
    if (event.target.closest?.('.zee-panel, .nav-drawer')) return;
    // An open drawer (transcript, hint) closes first.
    if (state.panel?.onEscape?.()) {
      event.preventDefault();
      return;
    }
    close();
  });

  window.addEventListener('popstate', () => {
    const place = placeFromHash();
    const inside = panel.contains(document.activeElement);
    // Back to the courtyard (no hash): focus returns to the place's label.
    // A link out of the panel to another section (#book, #about): the
    // browser has already put the reader there, so focus stays where it went.
    const toCourtyard = !location.hash;
    // Opening a place makes the page behind it inert, so focus goes into it.
    if (place && place.id !== state.place) open(place.id, { push: false, focus: true });
    else if (!place && state.place) close({ push: false, focus: inside && toCourtyard });
  });

  /* ---- Motion ----------------------------------------------------------------- */
  function renderMotionButton() {
    if (!motionButton) return;
    const on = state.motion;
    clear(motionButton).append(icon(on ? 'pause' : 'play', { size: 16 }));
    const label = t(on ? 'courtyard.pauseMotion' : 'courtyard.playMotion');
    motionButton.setAttribute('aria-label', label);
    motionButton.title = label;
    motionButton.hidden = hero.dataset.mode !== 'scene' || reducedQuery.matches;
  }
  motionButton?.addEventListener('click', () => {
    state.motion = !state.motion;
    try {
      localStorage.setItem(MOTION_KEY, state.motion ? 'on' : 'off');
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    presentation.setMotion(state.motion);
    renderMotionButton();
  });
  reducedQuery.addEventListener('change', () => {
    state.motion = !reducedQuery.matches && readMotion();
    presentation.setMotion(state.motion);
    renderMotionButton();
  });
  renderMotionButton();

  /* ---- Layout changes ----------------------------------------------------------- */
  window.matchMedia(framingQuery).addEventListener('change', () => {
    state.framing = currentFraming();
    presentation.setFraming(state.framing);
    presentation.show(state.place, { immediate: true, sheet: Boolean(state.place) });
    state.panel?.cafe?.reframe();
  });
  new ResizeObserver(() => measure()).observe(stage);

  document.addEventListener('hkeeli:langchange', async () => {
    measure();
    presentation.layout?.();
    renderMotionButton();
    if (state.place) {
      // The café carries on where it was, in the new language.
      if (state.panel?.refresh) {
        state.panel.refresh();
        return;
      }
      const token = ++state.renderToken;
      const previous = state.panel;
      const rendered = await renderPanel(panel, state.place, ctx);
      if (token !== state.renderToken) return;
      previous?.destroy();
      state.panel = rendered;
      panel.dataset.state = 'open';
    }
  });

  /* ---- Arriving on index.html#visit-<place> --------------------------------------- */
  const arrived = placeFromHash();
  if (arrived) {
    history.replaceState({ courtyard: arrived.id }, '', location.href);
    state.pushed = false;
    open(arrived.id, { push: false, immediate: true, focus: false, source: 'link' });
  }

  /* ---- The 3D scene, when the page has settled and the device is able ------------- */
  const forced = new URLSearchParams(location.search).get('courtyard');
  const gl = forced === '3d' ? { ok: true } : probeWebGL();
  const tier = forced === 'still' ? null : chooseTier(gl.renderer, gl.software);
  hero.dataset.renderer = tier && gl.ok ? 'pending' : `still${gl.reason ? `:${gl.reason}` : ''}`;
  if (tier && gl.ok) {
    const start = () => loadScene(tier).catch((error) => {
      console.warn('[courtyard] 3D scene unavailable, keeping the still image', error);
      hero.dataset.renderer = 'still:error';
    });
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1200 });
    else setTimeout(start, 300);
  }

  async function loadScene(quality) {
    const canvas = document.createElement('canvas');
    canvas.className = 'courtyard-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    picture.after(canvas);
    const { createScenePresentation } = await import('./scene/presentation.js');
    const scene = await createScenePresentation({
      stage,
      canvas,
      placeLabel,
      quality,
      framing: state.framing,
      motion: state.motion,
      debug: new URLSearchParams(location.search).has('courtyard-debug'),
      force: forced === '3d',
      // The GPU went away, or proved far too slow to draw the scene: the
      // still takes over exactly where we were, mid-conversation included.
      onLost: () => toStill('lost'),
      onSlow: (ms) => toStill(`slow:${Math.round(ms)}ms`)
    });
    function toStill(reason) {
      if (hero.dataset.mode === 'still') return;
      hero.dataset.mode = 'still';
      hero.dataset.renderer = `still:${reason}`;
      const scene3d = presentation;
      presentation = createPosterPresentation({ stage, picture, placeLabel, framing: state.framing, sheet });
      presentation.show(state.place, { immediate: true, sheet: Boolean(state.place) });
      state.panel?.cafe?.sync();
      renderMotionButton();
      setTimeout(() => {
        scene3d.destroy?.();
        canvas.remove();
      }, 600);
    }
    // Measured at warm-up, before the canvas shows: a renderer this slow (a
    // software rasteriser, typically) would turn every move into a slideshow,
    // so the still view stays — unless 3D was asked for (?courtyard=3d).
    hero.dataset.frameMs = String(Math.round(scene.measuredMs));
    if (scene.measuredMs > 85 && forced !== '3d') {
      scene.destroy();
      canvas.remove();
      hero.dataset.renderer = `still:slow:${Math.round(scene.measuredMs)}ms`;
      return;
    }
    const poster = presentation;
    scene.show(state.place, { immediate: true, sheet: Boolean(state.place) });
    presentation = scene;
    // Mid-conversation, the 3D table picks up exactly where the story is.
    state.panel?.cafe?.sync();
    poster.destroy();
    scene.start();
    hero.dataset.mode = 'scene';
    hero.dataset.renderer = `scene:${quality.name}`;
    renderMotionButton();
    if (new URLSearchParams(location.search).has('courtyard-debug')) window.__hkeeliCourtyard = scene;
  }

  return { open, close };
}

function readMotion() {
  try {
    return localStorage.getItem(MOTION_KEY) !== 'off';
  } catch {
    return true;
  }
}
