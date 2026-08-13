/**
 * Zee's mark — a small robot head.
 *
 * Its own module because both the launcher (loaded on every page) and the chat
 * panel (loaded on demand) draw it, and the launcher must not have to pull in
 * the whole panel to render a button.
 *
 * Drawn as inline SVG rather than an emoji or an image file: it inherits
 * currentColor, so it sits on the citrus disc in the same ink as everything
 * else, and it costs no extra request.
 */

const NS = 'http://www.w3.org/2000/svg';

export function zeeMark() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const parts = [
    // head
    ['path', { d: 'M5 9.5h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z' }],
    // antenna
    ['path', { d: 'M12 9.5V6' }],
    ['circle', { cx: '12', cy: '4.4', r: '1.6' }],
    // eyes
    ['circle', { cx: '9', cy: '14.5', r: '1.35', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '15', cy: '14.5', r: '1.35', fill: 'currentColor', stroke: 'none' }]
  ];

  for (const [tag, attrs] of parts) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  }

  return svg;
}
