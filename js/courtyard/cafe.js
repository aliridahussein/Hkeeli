/**
 * Hkeeli courtyard — your first Lebanese conversation.
 *
 * One exchange at the café table, built entirely from Unit 2's own dialogue
 * (data/lessons.json): nothing in Lebanese is written here.
 *
 *   1. The waiter greets you        ahla w sahla, shu bt7eb?        (dialogue 1)
 *   2. You choose your answer       baddi 2ahwe wasat, min fadlak.  (dialogue 2)
 *      — the other two choices are real phrases from Unit 1, and the feedback
 *        for each says what it actually means, from its own data
 *   3. He asks if there's more      shi tene?                       (dialogue 3)
 *   4. You finish the order aloud   man2ushe za3tar kamen. ...      (dialogue 4)
 *   5. The phrase to keep           baddi 2ahwe wasat               (u2-p2)
 *      and where to go next: the unit, the full café scene, a class.
 *
 * Every line shows Arabic, transliteration and meaning, and can be heard the
 * moment a real recording exists (listen.js). The answer is recorded in the
 * same progress store as the course, under its own id, the way the home
 * page's mini-lesson does — so it moves Unit 2's progress honestly (one
 * phrase seen) without distorting any game's statistics.
 */

import { t, pick } from '../i18n.js';
import { el, clear, progressBar } from '../ui.js';
import { shuffle } from '../data.js';
import { progress } from '../storage.js';
import { track } from '../analytics.js';
import { listenControl, stopListening } from './listen.js';

const SOURCE_ID = 'courtyard-cafe';
const UNIT_ID = 'unit-2';
const KEEP_ID = 'u2-p2';
const DISTRACTOR_IDS = ['u1-p11', 'u1-p9'];

/** Latin text inside translated copy keeps its own direction. */
const bdi = (text, dir = 'ltr') => el('bdi', { dir }, text);

/** Fill a translated template, putting nodes where its {placeholders} are. */
function fill(template, values) {
  const out = [];
  let last = 0;
  template.replace(/\{(\w+)\}/g, (match, key, offset) => {
    out.push(template.slice(last, offset));
    const value = values[key];
    out.push(value instanceof Node ? value : String(value ?? match));
    last = offset + match.length;
    return match;
  });
  out.push(template.slice(last));
  return out.filter((part) => part !== '');
}

/**
 * @param {HTMLElement} host
 * @param {object} context  { units, phrases, smooth: () => boolean, restore?: state }
 *   `restore` continues a conversation already under way (a language switch
 *   re-renders the panel, and shouldn't send you back to the greeting).
 * @returns {{ state: object, render: () => void, destroy: () => void }}
 */
export function createCafeConversation(host, { units, phrases, smooth, restore = null }) {
  const unit = units.find((u) => u.id === UNIT_ID);
  const byId = (id) => phrases.find((p) => p.id === id) || null;
  const lines = unit ? unit.dialogue : [];
  const keep = byId(KEEP_ID);

  // Without the dialogue there is no conversation to have: say where it lives.
  if (!unit || lines.length < 4 || !keep) {
    clear(host).append(
      el('p', {}, pick(unit?.outcome || unit?.description || '')),
      el('a', { class: 'btn-primary btn-small', href: `learn.html#${UNIT_ID}` }, t('courtyard.panel.openUnit'))
    );
    return { state: null, render() {}, destroy() {} };
  }

  const [greeting, order, more, finish] = lines;
  const state = restore || {
    step: 'reply', // reply → finish → done
    options: shuffle([{ line: order, right: true }, ...DISTRACTOR_IDS.map((id) => ({ line: byId(id), right: false }))].filter((o) => o.line)),
    wrong: new Set(),
    attempts: 0,
    firstTry: null,
    focus: null
  };
  if (!restore) track('cafe_conversation_started');

  // Dialogue lines carry no recordings yet; say so once, at the top, rather
  // than under every line.
  const textOnly = [greeting, order, more, finish].some((line) => !line.audio);

  const root = el('div', { class: 'cafe' });
  const status = el('div', { class: 'cafe-status', role: 'status', 'aria-live': 'polite' });
  clear(host).append(root, status);

  /* The status region announces every verdict. It is also the visible
     feedback for a wrong answer; after a right one the step below shows the
     detail, so the region stays visually hidden and only speaks. */
  function say(parts, { visible = true } = {}) {
    clear(status).append(...[].concat(parts));
    status.dataset.visible = String(visible && status.textContent.trim() !== '');
  }

  function lineCard(line, who) {
    return el(
      'li',
      { class: 'cafe-line', dataset: { who } },
      el('p', { class: 'cafe-speaker' }, who === 'you' ? t('scene.you') : t('scene.cafe.them')),
      el('p', { class: 'arabic cafe-ar', dir: 'rtl', lang: 'ar' }, line.ar),
      el('p', { class: 'translit cafe-translit', dir: 'ltr' }, line.translit),
      el('p', { class: 'phrase-en cafe-en' }, line.en),
      listenControl(line, { quietWhenMissing: textOnly || who === 'you' })
    );
  }

  function render() {
    stopListening();
    const thread = el('ol', { class: 'cafe-thread' });
    thread.append(lineCard(greeting, 'them'));
    if (state.step !== 'reply') {
      // Your answer, what it taught you, then his next line — in the order
      // it happened, so the thread reads as the conversation did.
      thread.append(
        lineCard(order, 'you'),
        rightNote(),
        el('li', { class: 'cafe-beat' }, t('courtyard.cafe.anythingElse')),
        lineCard(more, 'them')
      );
    }
    if (state.step === 'done') thread.append(lineCard(finish, 'you'));

    clear(root).append(
      el('p', { class: 'cafe-eyebrow' }, t('courtyard.cafe.eyebrow')),
      el('p', { class: 'cafe-setting' }, t('courtyard.cafe.setting')),
      textOnly ? el('p', { class: 'cafe-honest' }, t('courtyard.audio.textOnly')) : null,
      thread,
      state.step === 'reply' ? replyStep() : state.step === 'finish' ? finishStep() : doneStep()
    );
  }

  /* ---- 2. Your answer --------------------------------------------------- */
  function replyStep() {
    const buttons = state.options.map((option, i) => {
      const done = state.wrong.has(i);
      return el(
        'button',
        {
          type: 'button',
          class: 'cafe-option',
          disabled: done,
          dataset: { state: done ? 'wrong' : '' },
          onClick: () => choose(i)
        },
        el('span', { class: 'arabic cafe-ar', dir: 'rtl', lang: 'ar' }, option.line.ar),
        el('span', { class: 'translit cafe-translit', dir: 'ltr' }, option.line.translit),
        el('span', { class: 'phrase-en cafe-en' }, option.line.en)
      );
    });
    const step = el(
      'div',
      { class: 'cafe-turn' },
      el('h3', { class: 'cafe-prompt' }, t('courtyard.cafe.yourTurn')),
      el('div', { class: 'cafe-options', role: 'group', 'aria-label': t('courtyard.cafe.yourTurn') }, buttons)
    );
    state.focus = buttons.find((b) => !b.disabled) || null;
    return step;
  }

  function choose(i) {
    const option = state.options[i];
    state.attempts += 1;
    if (state.firstTry === null) {
      state.firstTry = option.right;
      progress.recordAnswer(SOURCE_ID, keep.id, option.right);
    }
    if (!option.right) {
      state.wrong.add(i);
      const line = option.line;
      say([
        el('strong', {}, t('courtyard.cafe.notQuite')),
        ' ',
        ...fill(t('courtyard.cafe.means'), { phrase: bdi(line.translit), meaning: bdi(line.en) }),
        line.note ? ` ${pick(line.note)}` : '',
        line.literal ? ` ${t('phrase.literally')} “${pick(line.literal)}”` : '',
        ' ',
        t('courtyard.cafe.tryAgain')
      ]);
      render();
      focusNow();
      return;
    }
    state.step = 'finish';
    say(t('courtyard.cafe.right'), { visible: false });
    render();
    focusNow();
  }

  /* What the right answer teaches: Unit 2's own tip, and the key word. */
  function rightNote() {
    const word = keep.blank && keep.blank.answer;
    return el(
      'li',
      { class: 'cafe-right' },
      el('p', { class: 'cafe-right-title' }, t('courtyard.cafe.right')),
      unit.tip ? el('p', {}, pick(unit.tip)) : null,
      word ? el('p', { class: 'cafe-word' }, ...fill(t('courtyard.cafe.word'), { word: bdi(word), meaning: pick(keep.blank.hint) })) : null
    );
  }

  /* ---- 4. Finish the order out loud -------------------------------------- */
  function finishStep() {
    const said = el('button', { type: 'button', class: 'btn-primary btn-small cafe-said', onClick: finishOrder }, t('courtyard.cafe.said'));
    state.focus = said;
    return el(
      'div',
      { class: 'cafe-turn' },
      el('h3', { class: 'cafe-prompt' }, t('courtyard.cafe.sayIt')),
      el(
        'div',
        { class: 'cafe-say' },
        el('p', { class: 'arabic cafe-ar', dir: 'rtl', lang: 'ar' }, finish.ar),
        el('p', { class: 'translit cafe-translit', dir: 'ltr' }, finish.translit),
        el('p', { class: 'phrase-en cafe-en' }, finish.en),
        listenControl(finish, { quietWhenMissing: true })
      ),
      said
    );
  }

  function finishOrder() {
    state.step = 'done';
    progress.recordSession(SOURCE_ID, state.firstTry ? 1 : 0, 1);
    track('cafe_conversation_completed', { first_try: Boolean(state.firstTry) });
    say(t('scene.cafe.done'), { visible: false });
    render();
    focusNow();
  }

  /* ---- 5. The phrase to keep, and where next ------------------------------ */
  function doneStep() {
    const p = progress.getUnitProgress(unit);
    const heading = el('h3', { class: 'cafe-done-title', tabindex: '-1' }, t('scene.cafe.done'));
    state.focus = heading;
    return el(
      'div',
      { class: 'cafe-done' },
      heading,
      el(
        'section',
        { class: 'cafe-keep' },
        el('h4', {}, t('courtyard.cafe.keep')),
        el('p', { class: 'arabic cafe-ar', dir: 'rtl', lang: 'ar' }, keep.ar),
        el('p', { class: 'translit cafe-translit', dir: 'ltr' }, keep.translit),
        el('p', { class: 'phrase-en cafe-en' }, keep.en),
        listenControl(keep)
      ),
      progressBar(p.ratio, t('learn.unitProgress', { seen: p.seen, total: p.total })),
      el(
        'div',
        { class: 'cafe-next' },
        el('h4', {}, t('courtyard.cafe.nextTitle')),
        el(
          'div',
          { class: 'cafe-next-actions' },
          el('a', { class: 'btn-primary btn-small', href: `learn.html#${UNIT_ID}` }, t('courtyard.cafe.continueUnit', { title: pick(unit.title) })),
          el('a', { class: 'btn-secondary btn-small', href: 'practice.html#scene-cafe' }, t('courtyard.cafe.playScene'))
        )
      ),
      el(
        'aside',
        { class: 'cafe-book' },
        el('h4', {}, t('courtyard.panel.bookTitle')),
        el('p', {}, t('courtyard.cafe.bookBody')),
        el('a', { class: 'cafe-book-link', href: '#book', dataset: { courtyardBook: 'cafe' } }, t('courtyard.panel.book')),
        el('p', { class: 'cafe-book-note' }, t('book.paidNote'))
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'cafe-again',
          onClick: () => {
            Object.assign(state, {
              step: 'reply',
              options: shuffle(state.options),
              wrong: new Set(),
              attempts: 0,
              firstTry: null
            });
            say('', { visible: false });
            track('cafe_conversation_started', { again: true });
            render();
            focusNow();
          }
        },
        t('courtyard.cafe.again')
      )
    );
  }

  function focusNow() {
    const target = state.focus;
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', behavior: smooth() ? 'smooth' : 'auto' });
    target.focus({ preventScroll: true });
  }

  render();

  return {
    state,
    render,
    destroy() {
      stopListening();
    }
  };
}
