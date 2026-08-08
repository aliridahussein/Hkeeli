/**
 * Hkeeli — transient messages.
 *
 * Lives in its own module so `audio.js` and `ui.js` can both use it without
 * importing each other.
 */

let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
  return region;
}

/** Show a short message. Repeats of the same text are collapsed. */
export function toast(message, duration = 3600) {
  if (!message) return;
  const host = ensureRegion();
  if ([...host.children].some((child) => child.textContent === message)) return;

  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  host.appendChild(node);

  setTimeout(() => node.remove(), duration);
}
