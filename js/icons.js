/**
 * Hkeeli — icons.
 *
 * One small stroke set for everything the practice experience draws. The
 * games used to carry emoji (🎧 🔗 ✏️ …), which render differently on every
 * platform — a different artist on iOS, Android and Windows — and could never
 * take the brand colours. These are 24×24, 2px round strokes, `currentColor`,
 * so an icon is always the colour of the text around it.
 *
 * Drawn for this site rather than borrowed from an icon library: the set is
 * small enough that a dependency would cost more than the paths do.
 *
 * Icons are decorative by default (`aria-hidden`). Pass `label` only when the
 * icon is the sole content of a control — and prefer labelling the control.
 */

const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  forward: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  flame:
    'M12 2.8c.6 3.4 5.6 6 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.9 1.9-4.7 2.9-5.9.2 1.9 1 2.9 2 3.4-.4-2.9 0-5.7.7-8.5z',
  speaker: 'M4 9.5v5h3.5L12 18V6L7.5 9.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  speakerOff: 'M4 9.5v5h3.5L12 18V6L7.5 9.5H4zM16 9.5l5 5M21 9.5l-5 5',
  headphones:
    'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  tiles: 'M3 7h7v4H3zM12.5 7H21v4h-8.5zM3 14h10v4H3zM15.5 14H21v4h-5.5z',
  thread: 'M3 4.5h11v7H8l-5 3.5V4.5zM17 9h4v9.5l-4-2.5h-6v-2.5',
  chat: 'M4 5h16v10H9.5L4 19.5V5z',
  cards: 'M8 3.5h11.5v14H8zM5 7v13.5h11',
  cup: 'M4 9.5h12v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9.5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-1 1 1 2 0 3.5M12 3.5c-1 1 1 2 0 3.5',
  phone:
    'M6.8 3.5l2.9.7 1.3 3.5-2 1.7a12 12 0 0 0 5.6 5.6l1.7-2 3.5 1.3.7 2.9c0 1.1-1 2.2-2.2 2.2C10.2 19.9 4.1 13.8 3.6 5.8c0-1.2 1.1-2.3 3.2-2.3z',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  target: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 12h.01',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  sparkle: 'M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 2'
};

/** Filled shapes, drawn without a stroke. */
const FILLED = {
  play: 'M8 5.2v13.6L18.8 12z',
  stop: 'M7 7h10v10H7z',
  pause: 'M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z'
};

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} name   a key of PATHS or FILLED
 * @param {object} [options]
 * @param {number} [options.size=20]
 * @param {string} [options.label]  makes the icon an image with this name
 * @param {string} [options.className]
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 20, label = '', className = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name} ${className}`.trim());

  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  const path = document.createElementNS(NS, 'path');
  if (FILLED[name]) {
    path.setAttribute('d', FILLED[name]);
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('d', PATHS[name] || PATHS.sparkle);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  }
  svg.append(path);
  return svg;
}

export default icon;
