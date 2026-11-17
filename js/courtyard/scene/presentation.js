/**
 * Hkeeli courtyard — the 3D presentation.
 *
 * Owns the renderer, the camera and the frame loop. The controller
 * (js/courtyard/index.js) tells it what to show — the overview or a place —
 * and it moves the camera there; it tells the controller where each place's
 * label sits on screen, every frame, so the labels stay HTML: readable,
 * translatable, focusable.
 *
 * ## Framing
 *
 * The still images were rendered from this scene with these cameras, and both
 * are shown `object-fit: cover`. The camera here does the same: its field of
 * view is set so the reference picture covers the canvas — full height when
 * the canvas is narrower than the picture, full width when it is wider. That
 * is what lets the 3D canvas fade in over the still with nothing jumping.
 *
 * ## Smoothness
 *
 *   - motion is integrated from the frame delta, clamped so a tab coming back
 *     from the background resumes instead of leaping;
 *   - camera moves come from CameraRig (rig.js): retargetable, continuous in
 *     velocity and acceleration, no queue;
 *   - every view is drawn once, hidden, before the canvas is revealed, so the
 *     first move to a place never waits on a shader or a buffer upload;
 *   - drawing resolution adapts to measured frame time, never during a move.
 */

import {
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from '../../../vendor/three/three-hkeeli.min.js';
import { buildWorld } from './world.js';
import { CameraRig } from './rig.js';
import { OVERVIEW, PLACES, POSTER, getPlace } from '../places.js';

const DEG = Math.PI / 180;
const REFERENCE = {
  wide: POSTER.wide.width / POSTER.wide.height,
  tall: POSTER.tall.width / POSTER.tall.height
};

/** Vertical FOV at which a picture of `ref` aspect covers a canvas of `aspect`. */
function coverFov(fov, aspect, ref) {
  if (aspect <= ref) return fov;
  return (2 * Math.atan((Math.tan((fov * DEG) / 2) * ref) / aspect)) / DEG;
}

const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @param {object} options
 * @param {HTMLElement} options.stage       the element the canvas fills
 * @param {HTMLCanvasElement} options.canvas
 * @param {(id, x, y, visible) => void} options.placeLabel
 * @param {object} options.quality         a tier from quality.js
 * @param {'wide'|'tall'} options.framing
 * @param {boolean} options.motion         idle motion allowed (false = reduced motion)
 * @param {() => void} [options.onLost]    WebGL context lost
 * @param {() => void} [options.onSlow]    frames measured far too slow to
 *   be worth drawing (a software renderer, an overloaded GPU): the still
 *   image will serve the visitor better
 * @param {boolean} [options.force]   keep drawing however slow (?courtyard=3d)
 * @param {boolean} [options.alpha]   a transparent canvas (the stills harness)
 * @param {boolean} [options.debug]
 */
export async function createScenePresentation({
  stage,
  canvas,
  placeLabel,
  quality,
  framing,
  motion = true,
  onLost,
  onSlow,
  force = false,
  alpha = false,
  debug = false
}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: debug
  });
  const maxRatio = Math.min(window.devicePixelRatio || 1, quality.dprMax);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = !quality.staticShadows;

  const world = await buildWorld(renderer, quality);
  const { scene, wind } = world;

  const camera = new PerspectiveCamera(44, 1, 0.06, 1200);
  const rig = new CameraRig();

  const state = {
    framing,
    place: null,
    width: 1,
    height: 1,
    running: false,
    visible: true,
    pageVisible: !document.hidden,
    motion,
    dirty: true,
    destroyed: false
  };

  const viewFor = (id, f = state.framing) => (id ? getPlace(id).views[f] : OVERVIEW[f]);
  rig.set(viewFor(null));

  /* ---- Pointer parallax and the lean towards a hovered place ------------ */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const lean = { pos: new Vector3(), target: new Vector3(), toPos: new Vector3(), toTarget: new Vector3() };
  // The stage's box is measured once per scroll or resize, not on every
  // pointer move: a layout read between the frame's writes is a full layout.
  let box = null;
  const forgetBox = () => {
    box = null;
  };
  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    box ??= stage.getBoundingClientRect();
    pointer.tx = ((event.clientX - box.left) / box.width) * 2 - 1;
    pointer.ty = ((event.clientY - box.top) / box.height) * 2 - 1;
  };
  const onPointerLeave = () => {
    pointer.tx = 0;
    pointer.ty = 0;
  };
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('scroll', forgetBox, { passive: true });
  window.addEventListener('resize', forgetBox);

  /* ---- Camera ----------------------------------------------------------- */
  const target = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  function applyCamera() {
    const [px, py, pz] = rig.pos;
    const [tx, ty, tz] = rig.target;
    target.set(tx, ty, tz).add(lean.target);
    camera.position.set(px, py, pz).add(lean.pos);
    camera.lookAt(target);
    if (state.motion) {
      const amount = state.place ? 0.03 : 0.11;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, pointer.x * amount).addScaledVector(up, -pointer.y * amount * 0.45);
      camera.lookAt(target);
    }
    const aspect = state.width / state.height;
    camera.aspect = aspect;
    camera.fov = coverFov(rig.fov, aspect, REFERENCE[state.framing]);
    camera.setViewOffset(state.width, state.height, 0, (rig.shift * state.height) / 2, state.width, state.height);
  }

  /* ---- Labels ------------------------------------------------------------ */
  const v = new Vector3();
  const anchors = PLACES.map((p) => ({ id: p.id, at: new Vector3(...p.anchor) }));
  function updateLabels() {
    anchors.forEach(({ id, at }) => {
      v.copy(at).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      placeLabel(id, (v.x * 0.5 + 0.5) * state.width, (-v.y * 0.5 + 0.5) * state.height, visible);
    });
  }

  /* ---- Size --------------------------------------------------------------- */
  function resize() {
    const w = Math.max(1, Math.round(stage.clientWidth));
    const h = Math.max(1, Math.round(stage.clientHeight));
    if (w === state.width && h === state.height) return;
    state.width = w;
    state.height = h;
    renderer.setSize(w, h, false);
    state.dirty = true;
  }
  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!state.running) renderFrame(0);
  });
  resizeObserver.observe(stage);
  resize();

  /* ---- Performance: measured, then acted on -------------------------------- */
  const perf = { frames: [], drawn: [], ema: 1000 / 60, settledAt: performance.now() + 2500, lastChange: 0, slow: false };
  function measure(ms) {
    perf.frames.push(ms);
    if (perf.frames.length > 900) perf.frames.shift();
    perf.ema += (ms - perf.ema) * 0.04;
  }
  /* Far too slow to be worth it: under ~12 frames a second on frames that
     actually drew, once the warm-up is over. Resolution can't rescue that,
     and a still with the same story beats a slideshow. Decided once. */
  function checkSlow(ms, drew, now) {
    if (force || perf.slow || !drew || now < perf.settledAt) return;
    perf.drawn.push(ms);
    if (perf.drawn.length > 10) perf.drawn.shift();
    if (perf.drawn.length < 10) return;
    const median = [...perf.drawn].sort((a, b) => a - b)[5];
    if (median > 85) {
      perf.slow = true;
      onSlow?.(median);
    }
  }
  function adapt(now) {
    if (rig.moving || now < perf.settledAt || now - perf.lastChange < 3000) return;
    // ~24 ms average means frames are being dropped at 60 Hz. Resolution
    // gives way first, down to a little under native: a slightly softer
    // picture is a far smaller loss than a camera move that stutters.
    if (perf.ema > 24 && ratio > 0.8) {
      ratio = Math.max(0.8, ratio * 0.8);
    } else if (perf.ema < 12.5 && ratio < maxRatio) {
      ratio = Math.min(maxRatio, ratio * 1.15);
    } else return;
    perf.lastChange = now;
    renderer.setPixelRatio(ratio);
    renderer.setSize(state.width, state.height, false);
    state.dirty = true;
  }

  /* ---- The frame ----------------------------------------------------------- */
  const cup = world.cups[0] ? new Vector3(...world.cups[0]) : null;
  let last = performance.now();
  let raf = 0;

  function renderFrame(dt) {
    const moving = rig.update(dt);
    const k = smooth(3.2, dt);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    const kl = smooth(4, dt);
    lean.pos.lerp(lean.toPos, kl);
    lean.target.lerp(lean.toTarget, kl);
    const settling =
      Math.abs(pointer.tx - pointer.x) > 1e-4 ||
      Math.abs(pointer.ty - pointer.y) > 1e-4 ||
      lean.pos.distanceToSquared(lean.toPos) > 1e-8 ||
      lean.target.distanceToSquared(lean.toTarget) > 1e-8;

    if (state.motion) wind.uTime.value += dt;
    // The waiter breathes and looks about only while idle motion is on.
    const acting = world.story.update(dt, camera, state.motion);
    if (!(state.motion || moving || settling || acting || state.dirty)) return false;
    state.dirty = false;

    // While the camera travels, the shadow map holds still: only the leaves'
    // own shadows would change in that second, and nobody can see dappled
    // light shift while the whole view is moving. Those frames are the ones
    // that must not drop.
    if (!quality.staticShadows) renderer.shadowMap.autoUpdate = !moving;

    applyCamera();
    if (cup) world.steamNear.value = Math.min(1, Math.max(0, (2.4 - camera.position.distanceTo(cup)) / 1.0));
    updateLabels();
    renderer.render(scene, camera);
    return true;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const ms = now - last;
    last = now;
    // Clamped only against long gaps (a tab coming back): a slow device still
    // moves in real time.
    const dt = Math.min(0.1, ms / 1000);
    measure(ms);
    const drew = renderFrame(dt);
    adapt(now);
    checkSlow(ms, drew, now);
  }

  function setRunning() {
    const should = state.visible && state.pageVisible && !state.destroyed;
    if (should === state.running) return;
    state.running = should;
    if (should) {
      last = performance.now();
      perf.settledAt = last + 1500;
      raf = requestAnimationFrame(loop);
    } else cancelAnimationFrame(raf);
  }

  const io = new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    setRunning();
  });
  io.observe(stage);
  const onVisibility = () => {
    state.pageVisible = !document.hidden;
    setRunning();
  };
  document.addEventListener('visibilitychange', onVisibility);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    state.destroyed = true;
    setRunning();
    onLost?.();
  });

  /* ---- Warm-up: every view, drawn once, before anyone sees the canvas ------- */
  applyCamera();
  await renderer.compileAsync(scene, camera);
  world.lib.textures.forEach((t) => renderer.initTexture(t));
  for (const id of [...PLACES.map((p) => p.id), null]) {
    rig.set(viewFor(id));
    applyCamera();
    renderer.render(scene, camera);
  }
  if (quality.staticShadows) renderer.shadowMap.needsUpdate = true;
  rig.set(viewFor(null));
  applyCamera();
  updateLabels();
  renderer.render(scene, camera);

  /* How long a frame really takes here, measured before anyone sees one: a
     one-pixel read waits for the frame to finish. A software renderer can be
     a hundred times slower than any GPU; the controller keeps the still view
     rather than show a slideshow (unless 3D was asked for). */
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    samples.push(performance.now() - a);
  }
  const measuredMs = samples.sort((x, y) => x - y)[1];

  /* ---- The interface the controller uses ------------------------------------ */
  const api = {
    /**
     * Move to a place (id) or back to the overview (null). `sheet`: the panel
     * covers the lower half of the stage (phones), so a place is framed in
     * the upper half — the rig animates that shift with everything else.
     */
    show(id, { immediate = false, sheet = false } = {}) {
      const from = state.place;
      state.place = id;
      lean.toPos.set(0, 0, 0);
      lean.toTarget.set(0, 0, 0);
      const base = viewFor(id);
      const view = { ...base, shift: id && sheet ? base.shift || 0.4 : 0 };
      if (immediate) {
        rig.set(view);
      } else {
        // Between two close-ups the camera's straight path is clear of the
        // pergola, the tree and the table (checked for every pair); it bows
        // gently back towards the open middle of the courtyard so a long
        // sideways move reads as a dolly, not a slide.
        let via = null;
        if (from && id && from !== id) {
          const hub = OVERVIEW[state.framing].pos;
          const a = rig.pos;
          const b = view.pos;
          via = [0, 1, 2].map((i) => (hub[i] - (a[i] + b[i]) / 2) * 0.1);
        }
        rig.goTo(view, { via });
      }
      state.dirty = true;
      if (!state.running) renderFrame(0);
    },

    /**
     * Move to an explicit view (the café's arrive and seat cameras). Same rig,
     * same continuity: a call mid-move bends the path instead of queueing.
     */
    showView(view, { immediate = false, duration } = {}) {
      lean.toPos.set(0, 0, 0);
      lean.toTarget.set(0, 0, 0);
      if (immediate) rig.set(view);
      else rig.goTo(view, { duration });
      state.dirty = true;
      if (!state.running) renderFrame(0);
    },

    /** The café story's scene events (see story.js). */
    story: {
      gesture: (name, options) => {
        state.dirty = true;
        const p = world.story.gesture(name, options);
        if (!state.running) renderFrame(0);
        return p;
      },
      play: (name, options) => {
        state.dirty = true;
        const p = world.story.play(name, options);
        if (!state.running) renderFrame(0);
        return p;
      },
      act: (name, options) => {
        state.dirty = true;
        const p = world.story.act(name, options);
        if (!state.running) renderFrame(0);
        return p;
      },
      layers: () => world.story.layers(),
      writeOrder: (lines) => world.story.writeOrder(lines),
      setOrder: (lines) => world.story.setOrder(lines),
      reset: () => {
        world.story.reset();
        state.dirty = true;
      }
    },

    /** A gentle lean towards the place under the pointer or focus. */
    hover(id) {
      if (state.place || !state.motion) {
        lean.toPos.set(0, 0, 0);
        lean.toTarget.set(0, 0, 0);
        return;
      }
      if (!id) {
        lean.toPos.set(0, 0, 0);
        lean.toTarget.set(0, 0, 0);
      } else {
        const place = getPlace(id);
        const view = OVERVIEW[state.framing];
        lean.toTarget.set(...place.anchor).sub(new Vector3(...view.target)).multiplyScalar(0.05);
        lean.toPos.set(...place.anchor).sub(new Vector3(...view.pos)).multiplyScalar(0.018);
      }
      state.dirty = true;
    },

    setMotion(on) {
      state.motion = on;
      if (!on) {
        pointer.tx = pointer.ty = pointer.x = pointer.y = 0;
      }
      state.dirty = true;
    },

    setFraming(next) {
      if (next === state.framing) return;
      state.framing = next;
      rig.set(viewFor(state.place));
      state.dirty = true;
    },

    start() {
      setRunning();
    },

    /** Draw the current view now, outside the frame loop (stills, tests). */
    renderNow() {
      resize();
      applyCamera();
      updateLabels();
      renderer.render(scene, camera);
    },

    /** For the debug overlay and for honest reporting. */
    stats() {
      const sorted = [...perf.frames].sort((a, b) => a - b);
      const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
      return {
        tier: quality.name,
        pixelRatio: ratio,
        size: [state.width, state.height],
        frameMsAvg: sorted.length ? sorted.reduce((s, x) => s + x, 0) / sorted.length : 0,
        frameMsP50: pct(0.5),
        frameMsP95: pct(0.95),
        frameMsP99: pct(0.99),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries
      };
    },

    resetStats() {
      perf.frames = [];
    },

    destroy() {
      state.destroyed = true;
      setRunning();
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', forgetBox);
      window.removeEventListener('resize', forgetBox);
      renderer.dispose();
    },

    /** Milliseconds per frame, measured at warm-up (see above). */
    measuredMs,
    renderer,
    camera,
    scene,
    rig,
    anchors
  };
  return api;
}
