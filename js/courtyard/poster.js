/**
 * Hkeeli courtyard — the still-image presentation.
 *
 * The page's first picture of the courtyard is a still rendered from the 3D
 * scene itself (assets/images/courtyard/). This module makes that still a
 * complete presentation of its own:
 *
 *   - the place labels sit where the places are, positioned with the same
 *     `object-fit: cover` geometry the image is drawn with;
 *   - choosing a place eases the image towards it — the still image's version
 *     of the camera move — and the same panel opens.
 *
 * It is what shows while the 3D scene loads, and all that shows when it
 * can't (no WebGL, a software renderer, Save-Data). The learning and the
 * booking are identical either way: they live in the panel, not the picture.
 */

import { POSTER } from './places.js';

/** Where an image point (fractions) lands in a box drawn with object-fit: cover. */
export function coverPoint(u, v, boxW, boxH, imgW, imgH) {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return [(boxW - w) / 2 + u * w, (boxH - h) / 2 + v * h, scale];
}

/**
 * @param {object} options
 * @param {HTMLElement} options.stage
 * @param {HTMLElement} options.picture   the element wrapping the still (<picture>)
 * @param {(id, x, y, visible) => void} options.placeLabel
 * @param {'wide'|'tall'} options.framing
 * @param {() => boolean} options.sheet   is the panel covering the lower stage?
 */
export function createPosterPresentation({ stage, picture, placeLabel, framing, sheet }) {
  const state = { framing, place: null };

  function layout() {
    const spec = POSTER[state.framing];
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    Object.entries(spec.places).forEach(([id, p]) => {
      const [x, y] = coverPoint(p.label[0], p.label[1], w, h, spec.width, spec.height);
      placeLabel(id, x, y, x > 0 && x < w && y > 0 && y < h);
    });
    zoom(state.place);
  }

  /* The picture's box is the image's own cover rectangle — the whole image,
     overhanging the stage where cover crops it — so a zoom can reach any part
     of it. Unzoomed, that draws exactly what object-fit: cover would. */
  function frame() {
    const spec = POSTER[state.framing];
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const [x0, y0, scale] = coverPoint(0, 0, w, h, spec.width, spec.height);
    Object.assign(picture.style, {
      left: `${x0.toFixed(1)}px`,
      top: `${y0.toFixed(1)}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${(spec.width * scale).toFixed(1)}px`,
      height: `${(spec.height * scale).toFixed(1)}px`
    });
    return { x0, y0, bw: spec.width * scale, bh: spec.height * scale };
  }

  /* The zoom: scale the picture about its top-left, then translate so the
     place's focus lands where the eye expects it — the middle of the stage,
     or higher up when the dock covers the lower part. */
  function zoom(id) {
    const spec = POSTER[state.framing];
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const { x0, y0, bw, bh } = frame();
    if (!id || !spec.places[id]) {
      picture.style.transform = '';
      return;
    }
    const p = spec.places[id];
    const s = p.zoom;
    // The focus, in the picture's own coordinates.
    const fx = p.focus[0] * bw;
    const fy = p.focus[1] * bh;
    const target = [w / 2, sheet() ? h * (w < h ? 0.22 : 0.3) : h / 2];
    let tx = target[0] - x0 - s * fx;
    let ty = target[1] - y0 - s * fy;
    // Keep the enlarged picture covering the stage.
    tx = Math.min(-x0, Math.max(w - x0 - s * bw, tx));
    ty = Math.min(-y0, Math.max(h - y0 - s * bh, ty));
    picture.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s})`;
  }

  const observer = new ResizeObserver(layout);
  observer.observe(stage);
  layout();

  return {
    show(id) {
      state.place = id;
      zoom(id);
    },
    hover() {},
    setMotion() {},
    setFraming(next) {
      state.framing = next;
      layout();
    },
    layout,
    destroy() {
      observer.disconnect();
      picture.removeAttribute('style');
    }
  };
}
