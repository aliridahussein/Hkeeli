/**
 * Zee — the chat panel.
 *
 * Loaded on first open, never on page load. Talks only to /api/zee/chat: the
 * Azure key, the system instructions, the glossary and the list of pages Zee is
 * allowed to link to all live on the Worker, and nothing here can reach them.
 *
 * Two rules run through the whole file:
 *   - model output is text, never markup. Every character the model produces is
 *     placed with textContent or createTextNode, so a reply containing HTML is
 *     shown as HTML, not executed as it;
 *   - navigation buttons are built from the `action` event the Worker sends,
 *     which it has already checked against site-context.json. A URL written in
 *     the prose is just words.
 */

import { trackZeeEvent } from './zee-analytics.js';

const ENDPOINT = '/api/zee/chat';
const SESSION_KEY = 'hkeeli.zee.session.v1';

/* Mirrors of the Worker's limits, for the counter and the disabled state only.
   The Worker enforces its own copies; these are courtesy, not security. */
const MAX_CHARS = 1000;
const MAX_HISTORY = 8;

const GREETING =
  'Marhaba 👋 Ana Zee — Hkeeli\'s AI Lebanese instructor.\n\n' +
  'Fik tehke ma3e bel libnene, tes2alne shu ya3ne kelme, aw fike sa3dak tla2e ' +
  'l-dars l-monaseb 3a Hkeeli.\n\n' +
  'Shu badak net3allam lyom? 😄';

const STARTERS = [
  'Teach me a Lebanese phrase',
  'Shu ya3ne "kifak"?',
  'Practice with me',
  'Where should I start?'
];

const THINKING = ['Zee is thinking', 'Finding the right words', 'Thinking in Lebanese'];

const ERRORS = {
  rate_limited: 'Zee needs a tiny break 😄 Try again in a minute.',
  daily_limit: "That's Zee's limit for today 😄 She'll be back tomorrow — the lessons and practice are always open.",
  too_long: 'That message is a bit long for Zee. Try asking it in fewer words.',
  empty: 'Zee lost her train of thought there. Ask her again?',
  forbidden: "Zee couldn't verify where that came from. Reload the page and try again.",
  unavailable: 'Zee is offline for a moment. Try again shortly.',
  network: "Zee couldn't connect right now. Try again in a moment.",
  upstream: 'Zee had trouble answering that one. Try again in a moment.'
};

/* --------------------------------------------------------------------------
   Tiny DOM helpers — Zee is standalone, so it doesn't import the site's ui.js
   (which would drag in i18n, audio and the lesson loader for nothing).
   -------------------------------------------------------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(path) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', path);
  svg.append(node);
  return svg;
}

const ICONS = {
  expand: 'M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7',
  collapse: 'M10 20v-6H4M14 4v6h6M3 21l7-7M21 3l-7 7',
  clear: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M4 12l16-8-6 8 6 8z',
  stop: 'M7 7h10v10H7z'
};

const ARABIC = /[؀-ۿ]/;

/**
 * Render one message as text.
 *
 * Blank lines become paragraphs, single newlines become line breaks, and
 * **bold** becomes <strong> — nothing else is interpreted. Each line carries
 * dir="auto" so a line of Arabic script sits right-to-left inside an otherwise
 * left-to-right bubble, which is exactly what Zee's answers mix.
 */
function renderText(target, text) {
  target.replaceChildren();
  for (const block of String(text).split(/\n{2,}/)) {
    const p = el('p', { dir: 'auto' });
    block.split('\n').forEach((line, index) => {
      if (index) p.append(el('br'));
      // Split on **bold** and keep every fragment a text node.
      for (const piece of line.split(/(\*\*[^*]+\*\*)/g)) {
        if (!piece) continue;
        if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
          p.append(el('strong', {}, piece.slice(2, -2)));
        } else if (ARABIC.test(piece)) {
          p.append(el('span', { class: 'zee-ar', dir: 'auto', lang: 'ar' }, piece));
        } else {
          p.append(document.createTextNode(piece));
        }
      }
    });
    target.append(p);
  }
}

/* --------------------------------------------------------------------------
   Panel
   -------------------------------------------------------------------------- */

export function createPanel({ onClose } = {}) {
  /** Visible transcript; also what gets trimmed and sent as history. */
  let history = restore();
  let streaming = null; // AbortController while a reply is in flight
  let expanded = false;

  const log = el('div', {
    class: 'zee-log',
    id: 'zee-log',
    role: 'log',
    'aria-live': 'polite',
    'aria-label': 'Conversation with Zee'
  });

  const input = el('textarea', {
    class: 'zee-input',
    id: 'zee-input',
    rows: '1',
    maxlength: String(MAX_CHARS),
    placeholder: 'Ask Zee something…',
    'aria-label': 'Message to Zee'
  });

  const count = el('div', { class: 'zee-count', id: 'zee-count', 'aria-live': 'off' });

  const send = el('button', {
    type: 'submit',
    class: 'zee-send',
    dataset: { mode: 'send' },
    'aria-label': 'Send message'
  });
  send.append(icon(ICONS.send));
  send.disabled = true;

  const expandBtn = el('button', {
    type: 'button',
    class: 'zee-icon-btn',
    'aria-label': 'Expand chat',
    onClick: () => toggleExpand()
  });
  expandBtn.append(icon(ICONS.expand));

  const clearBtn = el('button', {
    type: 'button',
    class: 'zee-icon-btn',
    'aria-label': 'Clear conversation',
    onClick: () => confirmClear()
  });
  clearBtn.append(icon(ICONS.clear));

  const closeBtn = el('button', {
    type: 'button',
    class: 'zee-icon-btn',
    'aria-label': 'Close chat',
    onClick: () => close()
  });
  closeBtn.append(icon(ICONS.close));

  const form = el(
    'form',
    { class: 'zee-form', onSubmit: (event) => { event.preventDefault(); submit(); } },
    el('div', { class: 'zee-input-wrap' }, input, send)
  );

  const panel = el(
    'section',
    {
      class: 'zee-panel',
      dataset: { expanded: 'false' },
      role: 'dialog',
      'aria-modal': 'false',
      'aria-label': 'Zee — AI Lebanese instructor'
    },
    el(
      'header',
      { class: 'zee-head' },
      el('span', { class: 'zee-mark', 'aria-hidden': 'true' }, 'ح'),
      el(
        'div',
        { class: 'zee-title' },
        el('strong', {}, 'Zee'),
        el('span', {}, 'AI Lebanese Instructor')
      ),
      el('div', { class: 'zee-head-actions' }, expandBtn, clearBtn, closeBtn)
    ),
    log,
    count,
    form
  );

  /* ---- transcript ---- */

  function restore() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter((m) => m && m.role && typeof m.content === 'string') : [];
    } catch {
      return [];
    }
  }

  function persist() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(history.slice(-40)));
    } catch {
      /* private mode — the conversation just won't survive a reload */
    }
  }

  function addMessage(role, text) {
    const wrap = el(
      'div',
      { class: 'zee-msg', dataset: { from: role === 'user' ? 'you' : 'zee' } },
      el('span', { class: 'zee-msg-who' }, role === 'user' ? 'You' : 'Zee')
    );
    const bubble = el('div', { class: 'zee-bubble' });
    renderText(bubble, text);
    wrap.append(bubble);
    log.append(wrap);
    scrollToEnd();
    return { wrap, bubble };
  }

  function addNote(text, tone) {
    log.append(el('p', { class: 'zee-note', dataset: tone ? { tone } : {} }, text));
    scrollToEnd();
  }

  function addAction(after, action) {
    const link = el('a', {
      class: 'zee-action',
      href: action.url,
      onClick: () => {
        trackZeeEvent(action.id === 'book' ? 'zee_booking_clicked' : 'zee_navigation_clicked', {
          target: action.id
        });
      }
    }, action.label);
    after.append(link);
    scrollToEnd();
  }

  /* Auto-scroll only when the learner is already at the bottom — nothing worse
     than being yanked back down while reading what Zee said two answers ago. */
  function nearBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }

  let stick = true;
  log.addEventListener('scroll', () => {
    stick = nearBottom();
  });

  function scrollToEnd(force = false) {
    if (!force && !stick) return;
    log.scrollTop = log.scrollHeight;
  }

  function paint() {
    log.replaceChildren();
    if (!history.length) {
      addMessage('assistant', GREETING);
      log.append(
        el(
          'div',
          { class: 'zee-starters' },
          ...STARTERS.map((text) =>
            el('button', {
              type: 'button',
              class: 'zee-starter',
              onClick: () => {
                input.value = text;
                submit();
              }
            }, text)
          )
        )
      );
      return;
    }
    for (const turn of history) {
      const node = addMessage(turn.role, turn.content);
      if (turn.action) addAction(node.wrap, turn.action);
    }
    scrollToEnd(true);
  }

  /* ---- composer ---- */

  function sync() {
    const value = input.value.trim();
    const over = input.value.length > MAX_CHARS;
    send.disabled = streaming ? false : !value || over;
    count.textContent = input.value.length > MAX_CHARS - 200 ? `${input.value.length} / ${MAX_CHARS}` : '';
    count.dataset.state = over ? 'over' : 'ok';

    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  input.addEventListener('input', sync);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  function setSending(on) {
    send.dataset.mode = on ? 'stop' : 'send';
    send.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
    send.replaceChildren(icon(on ? ICONS.stop : ICONS.send));
    send.disabled = false;
    if (!on) sync();
  }

  /* ---- the request ---- */

  async function submit() {
    if (streaming) {
      streaming.abort();
      return;
    }

    const message = input.value.trim();
    if (!message || message.length > MAX_CHARS) return;

    document.querySelector('.zee-starters')?.remove();

    history.push({ role: 'user', content: message });
    addMessage('user', message);
    persist();
    trackZeeEvent('zee_message_sent');

    input.value = '';
    sync();
    stick = true;

    const thinking = el(
      'div',
      { class: 'zee-thinking' },
      el('span', {}, THINKING[Math.floor(Math.random() * THINKING.length)]),
      el('span', { class: 'zee-dots', 'aria-hidden': 'true' }, el('span'), el('span'), el('span'))
    );
    log.append(thinking);
    scrollToEnd();

    streaming = new AbortController();
    setSending(true);

    let node = null;
    let answer = '';
    let action = null;

    const settle = () => {
      thinking.remove();
      if (!node) node = addMessage('assistant', '');
      return node;
    };

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          // Only the recent turns, and only the fields the Worker accepts.
          history: history.slice(-MAX_HISTORY - 1, -1).map((t) => ({ role: t.role, content: t.content })),
          page: location.pathname
        }),
        signal: streaming.signal
      });

      if (!response.ok && !response.body) throw new Error(`http_${response.status}`);

      for await (const event of readEvents(response.body)) {
        if (event.name === 'delta') {
          answer += event.data.t || '';
          const target = settle();
          renderText(target.bubble, answer);
          target.bubble.append(el('span', { class: 'zee-cursor', 'aria-hidden': 'true' }));
          scrollToEnd();
        } else if (event.name === 'action') {
          action = event.data;
        } else if (event.name === 'error') {
          thinking.remove();
          if (node) node.bubble.querySelector('.zee-cursor')?.remove();
          addNote(ERRORS[event.data.code] || ERRORS.upstream, 'bad');
          if (!answer) node = null;
        }
      }

      if (answer) {
        const target = settle();
        renderText(target.bubble, answer);
        history.push({ role: 'assistant', content: answer, action });
        if (action) addAction(target.wrap, action);
        persist();
      } else {
        thinking.remove();
      }
    } catch (error) {
      thinking.remove();
      if (error.name === 'AbortError') {
        // The learner pressed Stop; keep whatever already arrived.
        if (answer) {
          node?.bubble.querySelector('.zee-cursor')?.remove();
          history.push({ role: 'assistant', content: answer, action: null });
          persist();
        }
      } else {
        console.error('Zee request failed', error);
        addNote(ERRORS.network, 'bad');
      }
    } finally {
      streaming = null;
      setSending(false);
      node?.bubble.querySelector('.zee-cursor')?.remove();
      input.focus();
    }
  }

  /** Parse the Worker's SSE feed into {name, data} objects. */
  async function* readEvents(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        let name = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          yield { name, data: JSON.parse(data) };
        } catch {
          /* ignore a malformed frame rather than dropping the answer */
        }
      }
    }
  }

  /* ---- controls ---- */

  function toggleExpand() {
    expanded = !expanded;
    panel.dataset.expanded = String(expanded);
    expandBtn.replaceChildren(icon(expanded ? ICONS.collapse : ICONS.expand));
    expandBtn.setAttribute('aria-label', expanded ? 'Shrink chat' : 'Expand chat');
    scrollToEnd(true);
    trackZeeEvent('zee_expanded', { expanded });
  }

  /* Two taps rather than a browser confirm(): the dialog steals focus out of the
     panel and looks nothing like the rest of the site. */
  let clearArmed = null;
  function confirmClear() {
    if (clearArmed) {
      clearTimeout(clearArmed);
      clearArmed = null;
      doClear();
      return;
    }
    clearBtn.setAttribute('aria-label', 'Tap again to clear the conversation');
    addNote('Tap the bin again to clear this conversation.');
    clearArmed = setTimeout(() => {
      clearArmed = null;
      clearBtn.setAttribute('aria-label', 'Clear conversation');
    }, 5000);
  }

  function doClear() {
    if (streaming) streaming.abort();
    history = [];
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    paint();
    clearBtn.setAttribute('aria-label', 'Clear conversation');
    trackZeeEvent('zee_cleared');
    input.focus();
  }

  function open() {
    if (!panel.isConnected) document.body.append(panel);
    panel.hidden = false;
    if (!log.childElementCount) paint();
    scrollToEnd(true);
    // Not on a phone: focusing the field opens the keyboard over the greeting.
    if (window.matchMedia('(min-width: 560px)').matches) input.focus();
  }

  function close() {
    if (streaming) streaming.abort();
    panel.hidden = true;
    if (onClose) onClose();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });

  sync();

  return {
    open,
    close,
    isOpen: () => panel.isConnected && !panel.hidden
  };
}
