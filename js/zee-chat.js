/**
 * Zee — launcher.
 *
 * This is the only Zee code every page load pays for: one button, no network,
 * no model, no chat machinery. The panel (js/zee-panel.js) is fetched the first
 * time somebody actually opens her, and Azure is not called until they send a
 * message.
 */

import { trackZeeEvent } from './zee-analytics.js';

const MARK = 'ح';

let panel = null;
let loading = false;

function build() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zee-launcher';
  button.dataset.open = 'false';
  button.setAttribute('aria-label', 'Open Zee, the AI Lebanese instructor');
  button.setAttribute('aria-expanded', 'false');

  const mark = document.createElement('span');
  mark.className = 'zee-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = MARK;

  const label = document.createElement('span');
  label.className = 'zee-label';
  label.textContent = 'Ask Zee';

  button.append(mark, label);
  return button;
}

async function open(button) {
  if (loading) return;

  if (!panel) {
    loading = true;
    try {
      // Lazy: ~20 KB of chat UI that most visitors never need.
      const module = await import('./zee-panel.js');
      panel = module.createPanel({
        onClose: () => setState(button, false)
      });
    } catch (error) {
      console.error('Zee failed to load', error);
      loading = false;
      return;
    }
    loading = false;
  }

  panel.open();
  setState(button, true);
  trackZeeEvent('zee_opened');
}

function setState(button, isOpen) {
  button.dataset.open = String(isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
  button.setAttribute(
    'aria-label',
    isOpen ? 'Close Zee, the AI Lebanese instructor' : 'Open Zee, the AI Lebanese instructor'
  );
}

function init() {
  const button = build();
  button.addEventListener('click', () => {
    if (panel && panel.isOpen()) {
      panel.close();
      setState(button, false);
      return;
    }
    open(button);
  });
  document.body.append(button);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
