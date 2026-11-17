/**
 * Hkeeli — the courtyard's places.
 *
 * One list, read by both presentations: the 3D scene (js/courtyard/scene/)
 * and the lightweight still-image view (js/courtyard/poster.js). Each place
 * names the lesson content it opens, the link it falls back to without
 * JavaScript, where its label sits, and where the camera goes.
 *
 * Nothing here holds copy. Labels are i18n keys under `courtyard.places.<id>`,
 * so the two presentations and both languages always say the same thing.
 *
 * Coordinates are metres in the scene: x to the right, y up, z towards the
 * viewer. The house front stands on z = -4; the café table is in the
 * foreground at z ≈ 2.2.
 *
 * Two framings exist because a phone held upright and a desktop column are
 * different pictures, not one picture cropped: `wide` for the desktop column
 * and landscape screens, `tall` for portrait phones and tablets. `framingQuery`
 * is the one media query both presentations use to choose between them — the
 * <picture> in index.html carries the same query, so the still image and the
 * 3D scene always agree on which composition is showing.
 *
 * Each framing is composed at the narrowest shape it will be shown at (0.93
 * for the desktop column, 0.5 for a phone). Both presentations draw it with
 * object-fit: cover, so a wider stage only ever loses sky and paving at the
 * top and bottom — never a place at the side.
 */

export const framingQuery = '(max-width: 959px) and (max-aspect-ratio: 3/4)';

/** Which framing the current viewport uses. */
export function currentFraming() {
  return window.matchMedia(framingQuery).matches ? 'tall' : 'wide';
}

/**
 * Camera views. `pos` is where the camera stands, `target` what it looks at,
 * `fov` the vertical field of view, and `shift` moves the picture up the frame
 * (in clip-space units) — on a phone the panel covers the lower half of the
 * scene, so the subject has to sit in the upper half instead of the middle.
 */
export const OVERVIEW = {
  wide: { pos: [-0.05, 1.62, 8.3], target: [0.32, 2.42, -2.6], fov: 50, shift: 0 },
  tall: { pos: [-1.15, 3.5, 7.3], target: [0.55, 1.95, -2.6], fov: 72, shift: 0 }
};

export const PLACES = [
  {
    id: 'entrance',
    icon: 'pin',
    unitId: 'unit-1',
    // Without JavaScript the label is a plain link to the lesson it opens.
    href: 'learn.html#unit-1',
    anchor: [-2.65, 2.95, -3.85],
    views: {
      wide: { pos: [-2.25, 1.58, 0.55], target: [-2.6, 1.42, -4.0], fov: 44, shift: 0 },
      tall: { pos: [-2.3, 1.72, 1.35], target: [-2.62, 1.5, -4.0], fov: 60, shift: 0.42 }
    }
  },
  {
    id: 'cafe',
    icon: 'cup',
    unitId: 'unit-2',
    href: 'learn.html#unit-2',
    anchor: [-1.3, 0.98, 2.2],
    views: {
      wide: { pos: [-1.66, 1.22, 3.36], target: [-1.17, 0.83, 1.95], fov: 40, shift: 0 },
      tall: { pos: [-1.74, 1.34, 3.55], target: [-1.17, 0.8, 1.95], fov: 58, shift: 0.42 }
    }
  },
  {
    id: 'balcony',
    icon: 'phone',
    unitId: 'unit-3',
    href: 'learn.html#unit-3',
    anchor: [1.95, 4.5, -3.35],
    views: {
      wide: { pos: [1.78, 4.62, -1.0], target: [2.12, 3.95, -3.5], fov: 44, shift: 0 },
      tall: { pos: [1.86, 4.72, -0.7], target: [2.14, 3.95, -3.5], fov: 58, shift: 0.42 }
    }
  },
  {
    id: 'teacher',
    icon: 'person',
    unitId: null,
    href: 'index.html#about',
    anchor: [3.3, 2.15, -2.3],
    views: {
      wide: { pos: [2.78, 1.52, 0.72], target: [3.3, 0.98, -2.8], fov: 44, shift: 0 },
      tall: { pos: [2.85, 1.62, 1.05], target: [3.3, 0.98, -2.8], fov: 60, shift: 0.42 }
    }
  }
];

export function getPlace(id) {
  return PLACES.find((place) => place.id === id) || null;
}

/**
 * Where each label and each place's close-up sit on the still images, as
 * fractions of the image (0..1 from the top-left). Measured from the 3D scene
 * itself at the moment the stills were rendered — see README, "The courtyard",
 * for how to regenerate both together. `zoom` is how far the still view
 * enlarges the image towards a place when it is selected.
 */
export const POSTER = {
  wide: {
    src: 'assets/images/courtyard/courtyard-wide.webp',
    width: 1400,
    height: 1500,
    places: {
      entrance: { label: [0.215, 0.461], focus: [0.22, 0.596], zoom: 2.0 },
      cafe: { label: [0.221, 0.694], focus: [0.254, 0.715], zoom: 2.3 },
      balcony: { label: [0.655, 0.318], focus: [0.669, 0.37], zoom: 2.3 },
      teacher: { label: [0.82, 0.525], focus: [0.807, 0.64], zoom: 2.1 }
    }
  },
  tall: {
    src: 'assets/images/courtyard/courtyard-tall.webp',
    width: 800,
    height: 1600,
    places: {
      entrance: { label: [0.067, 0.43], focus: [0.082, 0.52], zoom: 2.0 },
      cafe: { label: [0.239, 0.723], focus: [0.273, 0.728], zoom: 2.3 },
      balcony: { label: [0.661, 0.329], focus: [0.677, 0.365], zoom: 2.3 },
      teacher: { label: [0.869, 0.485], focus: [0.836, 0.554], zoom: 2.1 }
    }
  }
};

/** The hash a place is reached by: index.html#visit-cafe. */
export const HASH_PREFIX = '#visit-';

export function placeFromHash(hash = location.hash) {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return getPlace(decodeURIComponent(hash.slice(HASH_PREFIX.length)));
}
