/**
 * Hkeeli — keyboard control for multiple-choice games.
 *
 * The option buttons are labelled A, B, C, D. Those keycaps were decorative
 * until this module existed — the UI promised keyboard play and didn't deliver.
 *
 * Bindings: A–D or 1–4 pick an option, Enter advances when a Next button is
 * showing. Typing inside a field is never intercepted, so Fill the Blank's
 * text input still behaves normally.
 */

const LETTERS = 'abcdefghij';

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Attach key handling for a game and register its own teardown.
 *
 * @param {GameShell} shell
 * @param {() => ({ options?: HTMLElement[], next?: HTMLElement })} getState
 *        Called on each keypress so the handler always sees the current
 *        question rather than a stale closure.
 */
export function bindChoiceKeys(shell, getState) {
  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;

    const state = getState() || {};
    const key = event.key.toLowerCase();

    if (key === 'enter') {
      const next = state.next;
      if (next && !next.hidden && !next.disabled) {
        event.preventDefault();
        next.click();
      }
      return;
    }

    const options = state.options || [];
    if (!options.length) return;

    const byLetter = LETTERS.indexOf(key);
    const byDigit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const index = byLetter >= 0 ? byLetter : byDigit;

    const target = options[index];
    if (target && !target.disabled) {
      event.preventDefault();
      target.click();
    }
  };

  document.addEventListener('keydown', onKey);
  shell.onCleanup(() => document.removeEventListener('keydown', onKey));
}
