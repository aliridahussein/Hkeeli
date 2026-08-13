/**
 * Zee — analytics seam.
 *
 * The site has no analytics provider today. Rather than wire the UI to one
 * later (and touch every call site), every notable interaction goes through
 * this one function, which currently just fires a DOM event.
 *
 * To connect a provider, listen for it once:
 *
 *   document.addEventListener('zee:event', (e) =>
 *     yourAnalytics.track(e.detail.name, e.detail.props));
 *
 * Deliberately no message text, no user identifier, no page-by-page trail —
 * just the name of the thing that happened.
 */

export function trackZeeEvent(name, props = {}) {
  try {
    document.dispatchEvent(new CustomEvent('zee:event', { detail: { name, props } }));
    // Picked up automatically by Cloudflare Web Analytics / GA-style globals if
    // one is ever added, without this module having to know which.
    if (typeof window.zeeAnalyticsSink === 'function') window.zeeAnalyticsSink(name, props);
  } catch {
    /* analytics must never break the chat */
  }
}

// Also exposed globally so a non-module snippet in the page can call it.
if (typeof window !== 'undefined') window.trackZeeEvent = trackZeeEvent;
