/**
 * Hkeeli courtyard — the café encounter.
 *
 * A short Lebanese café conversation the visitor takes part in, and that the
 * courtyard answers. Sit down; the waiter comes over; pick up the menu and
 * order your coffee the way you like it; hand him the menu and watch him write
 * it on his pad; he brings it; thank him; answer "anything else?"; ask for the
 * bill; leave the money and say goodbye. About a minute, one turn at a time.
 *
 * ## The state machine
 *
 *   arrive → order → thanks → more → bill → bye → done
 *
 * Each turn has what the waiter says (and the gesture he says it with), two or
 * three replies, and the scene's answer. `phase` is `ready` (choices showing),
 * `busy` (the scene is answering; choices hidden) or `done`.
 *
 * Every async step runs under a token. Leaving, starting again or a change of
 * presentation bumps it, so a callback from an abandoned run can never advance
 * the new one. The waiter never queues (scene/story.js lands an event before
 * the next starts), and `sync()` rebuilds the table from the log of what has
 * happened — when the 3D scene takes over from the still, or the still from
 * the scene.
 *
 * A language switch re-renders the same moment (`refresh()`): the Lebanese,
 * the scene and the progress don't change; only the interface around them.
 *
 * Without the 3D scene (no WebGL, or a renderer too slow to draw it), the
 * same story plays over frames rendered from the scene itself (storyboard.js):
 * the waiter, the slip, the coffee, the bill appear as they do in 3D.
 *
 * ## Content
 *
 * Every Lebanese line is from data/lessons.json — Unit 2's dialogue and
 * phrases, plus four phrases from Units 1 and 3 — except one reply, "baddi
 * 2ahwe sada, min fadlak", composed from Unit 2's own words for the no-sugar
 * order (AUTHORED below; it needs a native speaker's check, and it isn't
 * counted towards any phrase's progress).
 *
 * Audio: a line plays its recording when the file exists (paths from
 * lessons.json and audio-manifest.js); until then it carries a small "Text
 * only" mark. No synthetic voice, ever.
 */

import { t, pick } from '../i18n.js';
import { el, clear, progressBar } from '../ui.js';
import { progress } from '../storage.js';
import { track } from '../analytics.js';
import { icon } from '../icons.js';
import { playPhrase } from '../audio.js';
import { listenControl, stopListening, hasRecording } from './listen.js';
import { withAudio } from './audio-manifest.js';
import { ambience } from './ambience.js';
import { CAFE_VIEWS } from './places.js';
import { createStoryboard } from './storyboard.js';

const SOURCE_ID = 'courtyard-cafe';
const UNIT_ID = 'unit-2';

/** Lebanese written for this encounter (not from lessons.json). Needs review. */
const AUTHORED = {
  sada: {
    id: 'cafe-sada',
    ar: 'بدي قهوة سادة، من فضلك.',
    translit: 'baddi 2ahwe sada, min fadlak.',
    en: "I'd like a coffee with no sugar, please.",
    authored: true
  }
};

/** What goes on the waiter's slip for each order. */
const SLIP = {
  wasat: { ar: 'قهوة وسط', tr: '2ahwe wasat' },
  ri7a: { ar: 'قهوة عالريحة', tr: '2ahwe 3al ri7a' },
  sada: { ar: 'قهوة سادة', tr: '2ahwe sada' },
  manoushe: { ar: 'منقوشة زعتر', tr: 'man2ushe za3tar' }
};

/** Things you do (not the waiter): they never interrupt what he's doing. */
const YOURS = new Set(['menuUp', 'drink', 'pay']);

/**
 * @param {HTMLElement} host   the experience layer (#place-panel)
 * @param {object} ctx
 * @param {object[]} ctx.units
 * @param {object[]} ctx.phrases
 * @param {() => object} ctx.scene       the current presentation (3D or still)
 * @param {HTMLElement} ctx.stage        the stage, for the still storyboard
 * @param {() => boolean} ctx.smooth     false = reduced motion
 * @param {() => string} ctx.framing     'wide' | 'tall'
 * @param {() => void} ctx.exit          back to the courtyard
 */
export function createCafeEncounter(host, ctx) {
  const unit = ctx.units.find((u) => u.id === UNIT_ID);
  const byId = (id) => ctx.phrases.find((p) => p.id === id) || null;
  const d = (unit && unit.dialogue) || [];
  const line = (x) => (x ? withAudio(x) : null);

  const L = {
    greet: line(d[0]),
    shiTene: line(d[2]),
    tfaddal: line(byId('u2-p12')),
    sa77tein: line(byId('u2-p8'))
  };
  const R = {
    wasat: line(d[1]),
    ri7a: line(byId('u2-p1')),
    sada: line(AUTHORED.sada),
    allah: line(byId('u3-p3')),
    shukran: line(byId('u1-p8')),
    bkhatrak: line(byId('u1-p11')),
    manoushe: line(byId('u2-p6')),
    kifeye: line(byId('u2-p11')),
    bill: line(byId('u2-p4')),
    addesh: line(byId('u2-p9')),
    tikram: line(byId('u1-p9')),
    marhaba: line(byId('u1-p1'))
  };

  /* The turns. A choice: { line, ok, phrase (progress id), set, why } */
  const TURNS = [
    {
      id: 'arrive',
      prompt: 'courtyard.encounter.p.arrive',
      choices: [{ action: 'sit', label: 'courtyard.encounter.sit', ok: true }]
    },
    {
      id: 'order',
      them: [L.greet],
      gesture: 'greet',
      prompt: 'courtyard.encounter.p.order',
      hint: () => t('courtyard.encounter.h.order'),
      choices: [
        { line: R.wasat, ok: true, phrase: 'u2-p2', set: { order: 'wasat' } },
        { line: R.ri7a, ok: true, phrase: 'u2-p1', set: { order: 'ri7a' } },
        { line: R.sada, ok: true, set: { order: 'sada' } }
      ]
    },
    {
      id: 'thanks',
      them: [L.tfaddal, L.sa77tein],
      gesture: 'offer',
      prompt: 'courtyard.encounter.p.thanks',
      hint: () => t('courtyard.encounter.h.thanks'),
      choices: [
        { line: R.shukran, ok: true, phrase: 'u1-p8' },
        { line: R.allah, ok: true, phrase: 'u3-p3' },
        { line: R.bkhatrak, ok: false, why: 'courtyard.encounter.w.notLeaving' }
      ]
    },
    {
      id: 'more',
      them: [L.shiTene],
      gesture: 'ask',
      prompt: 'courtyard.encounter.p.more',
      hint: () => t('courtyard.encounter.h.more'),
      choices: [
        { line: R.manoushe, ok: true, phrase: 'u2-p6', set: { manoushe: true } },
        { line: R.kifeye, ok: true, phrase: 'u2-p11', set: { manoushe: false } }
      ]
    },
    {
      id: 'bill',
      prompt: 'courtyard.encounter.p.bill',
      hint: () => t('courtyard.encounter.h.bill'),
      choices: [
        { line: R.bill, ok: true, phrase: 'u2-p4' },
        { line: R.addesh, ok: true, phrase: 'u2-p9' },
        { line: R.tikram, ok: false, why: 'courtyard.encounter.w.welcome' }
      ]
    },
    {
      id: 'bye',
      prompt: 'courtyard.encounter.p.bye',
      hint: () => t('courtyard.encounter.h.bye'),
      choices: [
        { line: R.bkhatrak, ok: true, phrase: 'u1-p11' },
        { line: R.marhaba, ok: false, why: 'courtyard.encounter.w.hello' }
      ]
    }
  ];

  const ready = TURNS.every((turn) => (turn.them || []).every(Boolean) && turn.choices.every((c) => c.action || c.line));
  if (!unit || !ready) {
    clear(host).append(
      el(
        'div',
        { class: 'exp-dock' },
        el('h2', { class: 'exp-prompt', id: 'exp-turn-title', tabindex: '-1' }, t('courtyard.places.cafe.topic')),
        el('a', { class: 'btn-primary btn-small', href: `learn.html#${UNIT_ID}` }, t('courtyard.panel.openUnit'))
      )
    );
    return { heading: host.querySelector('#exp-turn-title'), refresh() {}, sync() {}, reframe() {}, onEscape: () => false, destroy() {} };
  }

  const fresh = () => ({
    turn: 0,
    phase: 'ready', // ready | busy | done
    order: null,
    manoushe: false,
    wrong: {}, // turn id → indexes tried and wrong
    firstTry: {}, // turn id → right on the first attempt?
    history: [], // the transcript: { who, line } | { narration }
    events: [], // what has happened at the table, in order (for sync)
    slip: [],
    ticket: false, // the slip is shown once he has written it
    view: 'approach',
    narration: 'courtyard.encounter.n.arrive',
    said: null,
    feedback: null,
    drawer: null // 'transcript' | 'hint' | 'sound' | null
  });
  const state = fresh();
  // Settings that outlive a replay.
  const sound = { voices: true, available: null };
  let token = 0;
  let destroyed = false;
  let board = null;

  /* ---- DOM --------------------------------------------------------------- */
  const bar = el('div', { class: 'exp-bar' });
  const drawer = el('div', { class: 'exp-drawer', id: 'exp-drawer', role: 'region', 'aria-labelledby': 'exp-drawer-title' });
  const dock = el('section', { class: 'exp-dock', 'aria-labelledby': 'exp-turn-title', tabindex: '-1' });
  const live = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  // What the waiter wrote down, readable whatever the scene shows.
  const ticket = el('aside', { class: 'exp-ticket', 'aria-labelledby': 'exp-ticket-title' });
  clear(host).append(bar, ticket, drawer, dock, live);

  function render() {
    renderBar();
    renderTicket();
    renderDrawer();
    if (state.phase === 'done') renderDone();
    else renderTurn();
  }

  function tool(name, label, iconName, { pressed = null, onClick } = {}) {
    return el(
      'button',
      {
        type: 'button',
        class: 'exp-btn exp-tool',
        'aria-pressed': pressed === null ? null : String(pressed),
        'aria-controls': name ? 'exp-drawer' : null,
        title: label,
        onClick
      },
      el('span', { class: 'exp-tool-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 18 })),
      el('span', { class: 'exp-tool-label' }, label)
    );
  }

  function toggleDrawer(name) {
    state.drawer = state.drawer === name ? null : name;
    renderBar();
    renderDrawer();
    if (state.drawer) drawer.querySelector('.exp-drawer-title')?.focus({ preventScroll: true });
  }

  function renderBar() {
    const total = TURNS.length;
    const done = state.phase === 'done';
    const n = done ? total : state.turn + 1;
    const turn = TURNS[state.turn];
    const audible = ambience.playing() || (sound.voices && sound.available);
    clear(bar).append(
      el(
        'button',
        { type: 'button', class: 'exp-btn exp-exit', onClick: () => ctx.exit() },
        el('span', { class: 'exp-exit-icon', 'aria-hidden': 'true' }, icon('back', { size: 18 })),
        el('span', { class: 'exp-exit-label' }, t('courtyard.back'))
      ),
      el(
        'div',
        { class: 'exp-where' },
        el('p', { class: 'exp-title' }, t('courtyard.encounter.title')),
        el(
          'ol',
          { class: 'exp-progress', role: 'img', 'aria-label': t('courtyard.encounter.progress', { n, total }) },
          TURNS.map((_, i) => el('li', { dataset: { state: done || i < state.turn ? 'done' : i === state.turn ? 'now' : 'next' } }))
        )
      ),
      el(
        'div',
        { class: 'exp-tools' },
        !done && turn.hint
          ? tool('hint', t('courtyard.encounter.hint'), 'sparkle', { pressed: state.drawer === 'hint', onClick: () => toggleDrawer('hint') })
          : null,
        tool('transcript', t('courtyard.encounter.transcript'), 'thread', {
          pressed: state.drawer === 'transcript',
          onClick: () => toggleDrawer('transcript')
        }),
        tool(null, t('courtyard.encounter.restart'), 'repeat', { onClick: restart }),
        tool('sound', t('courtyard.encounter.sound'), audible ? 'speaker' : 'speakerOff', {
          pressed: state.drawer === 'sound',
          onClick: () => toggleDrawer('sound')
        })
      )
    );
  }

  function renderTicket() {
    clear(ticket);
    ticket.hidden = !state.ticket || !state.slip.length || state.phase === 'done';
    if (ticket.hidden) return;
    ticket.append(
      el('p', { class: 'exp-ticket-title', id: 'exp-ticket-title' }, t('courtyard.encounter.ticket')),
      el(
        'ul',
        {},
        state.slip.map((l) => el('li', {}, el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, l.ar), el('span', { class: 'translit', dir: 'ltr' }, l.tr)))
      )
    );
  }

  /** An on/off setting in the Sound drawer. */
  function setting(name, note, on, onChange) {
    return el(
      'div',
      { class: 'exp-setting' },
      el(
        'button',
        { type: 'button', class: 'exp-switch', role: 'switch', 'aria-checked': String(on), onClick: onChange },
        el('span', { class: 'exp-switch-track', 'aria-hidden': 'true' }, el('span', { class: 'exp-switch-thumb' })),
        el('span', { class: 'exp-setting-name' }, name)
      ),
      note ? el('p', { class: 'exp-setting-note' }, note) : null
    );
  }

  function renderDrawer() {
    clear(drawer);
    drawer.hidden = !state.drawer;
    if (!state.drawer) return;
    const close = el(
      'button',
      { type: 'button', class: 'exp-drawer-close', 'aria-label': t('common.close'), onClick: () => toggleDrawer(state.drawer) },
      icon('close', { size: 18 })
    );
    const title = (key) => el('h2', { class: 'exp-drawer-title', id: 'exp-drawer-title', tabindex: '-1' }, t(key));
    if (state.drawer === 'hint') {
      const turn = TURNS[state.turn];
      drawer.append(close, title('courtyard.encounter.hint'), el('p', {}, turn.hint ? turn.hint() : ''));
      return;
    }
    if (state.drawer === 'sound') {
      const refocus = () => drawer.querySelector('.exp-switch[aria-checked]')?.focus({ preventScroll: true });
      drawer.append(
        close,
        title('courtyard.encounter.sound'),
        sound.available
          ? setting(t('courtyard.encounter.voices'), t('courtyard.encounter.voicesOn'), sound.voices, () => {
              sound.voices = !sound.voices;
              if (!sound.voices) {
                stopListening();
                ambience.duck(false);
              }
              renderBar();
              renderDrawer();
              refocus();
            })
          : el(
              'div',
              { class: 'exp-setting' },
              el('p', { class: 'exp-setting-name' }, t('courtyard.encounter.voices')),
              el('p', { class: 'exp-setting-note' }, t(sound.available === null ? 'courtyard.encounter.voicesChecking' : 'courtyard.encounter.voicesNone'))
            ),
        setting(t('courtyard.encounter.ambience'), t('courtyard.encounter.ambienceNote'), ambience.playing(), () => {
          ambience.toggle();
          renderBar();
          renderDrawer();
          drawer.querySelectorAll('.exp-switch')[sound.available ? 1 : 0]?.focus({ preventScroll: true });
        })
      );
      return;
    }
    drawer.append(
      close,
      title('courtyard.encounter.transcript'),
      state.history.length
        ? el(
            'ol',
            { class: 'exp-transcript' },
            state.history.map((h) =>
              h.narration
                ? el('li', { class: 'exp-transcript-note' }, t(h.narration))
                : el(
                    'li',
                    { dataset: { who: h.who } },
                    el('span', { class: 'exp-who' }, h.who === 'you' ? t('scene.you') : t('scene.cafe.them')),
                    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, h.line.ar),
                    el('span', { class: 'translit', dir: 'ltr' }, h.line.translit),
                    el('span', { class: 'phrase-en', lang: 'en', dir: 'ltr' }, h.line.en)
                  )
            )
          )
        : el('p', {}, t('courtyard.encounter.nothingYet'))
    );
  }

  /** What one speaker says this turn: one or two lines, in one bubble. */
  function speech(lines, who) {
    return el(
      'div',
      { class: 'exp-line', dataset: { who } },
      el('p', { class: 'exp-who' }, who === 'you' ? t('scene.you') : t('scene.cafe.them')),
      ...lines.map((l) =>
        el(
          'div',
          { class: 'exp-said' },
          el('p', { class: 'arabic exp-ar', dir: 'rtl', lang: 'ar' }, l.ar),
          el('p', { class: 'translit exp-tr', dir: 'ltr' }, l.translit),
          el('p', { class: 'phrase-en exp-en', lang: 'en', dir: 'ltr' }, l.en),
          listenControl(l, { compact: true })
        )
      )
    );
  }

  function renderTurn() {
    const turn = TURNS[state.turn];
    const busy = state.phase === 'busy';
    const parts = [];
    if (state.narration) parts.push(el('p', { class: 'exp-narration' }, t(state.narration)));
    if (!busy && turn.them) parts.push(speech(turn.them, 'them'));
    if (busy && state.said) parts.push(speech([state.said], 'you'));
    if (state.feedback) parts.push(el('p', { class: 'exp-feedback', dataset: { tone: 'try' } }, ...state.feedback()));

    const prompt = el('h2', { class: 'exp-prompt', id: 'exp-turn-title', tabindex: '-1' }, busy ? '' : t(turn.prompt));
    prompt.hidden = busy;
    const choices = busy
      ? null
      : el(
          'div',
          { class: 'exp-choices', role: 'group', 'aria-labelledby': 'exp-turn-title', dataset: { count: String(turn.choices.length) } },
          turn.choices.map((c, i) => {
            if (c.action) {
              return el('button', { type: 'button', class: 'exp-choice exp-choice--action', onClick: () => choose(i) }, t(c.label));
            }
            const wrong = (state.wrong[turn.id] || []).includes(i);
            return el(
              'button',
              {
                type: 'button',
                class: 'exp-choice',
                disabled: wrong,
                'aria-label': `${c.line.translit} — ${c.line.en}`,
                dataset: { state: wrong ? 'wrong' : '' },
                onClick: () => choose(i)
              },
              el('span', { class: 'arabic exp-choice-ar', dir: 'rtl', lang: 'ar', 'aria-hidden': 'true' }, c.line.ar),
              el('span', { class: 'translit exp-choice-tr', dir: 'ltr', 'aria-hidden': 'true' }, c.line.translit),
              el('span', { class: 'phrase-en exp-choice-en', lang: 'en', dir: 'ltr', 'aria-hidden': 'true' }, c.line.en)
            );
          })
        );
    clear(dock).append(...[el('div', { class: 'exp-turn' }, ...parts), prompt, choices].filter(Boolean));
    dock.dataset.phase = state.phase;
    dock.dataset.turn = turn.id;
  }

  function renderDone() {
    const used = state.history.filter((h) => h.who === 'you');
    const p = progress.getUnitProgress(unit);
    clear(dock).append(
      el('h2', { class: 'exp-prompt exp-done-title', id: 'exp-turn-title', tabindex: '-1' }, t('courtyard.encounter.done.title')),
      el('p', { class: 'exp-done-body' }, t('courtyard.encounter.done.body')),
      // What you said, briefly: each phrase as a chip, its meaning on hover
      // and for screen readers; the whole exchange is in the transcript.
      el(
        'ul',
        { class: 'exp-used' },
        used.map((h) =>
          el(
            'li',
            { title: h.line.en },
            el('span', { class: 'translit', dir: 'ltr' }, h.line.translit),
            el('span', { class: 'visually-hidden', lang: 'en' }, ` — ${h.line.en}`)
          )
        )
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'exp-link exp-done-more',
          'aria-controls': 'exp-drawer',
          onClick: () => toggleDrawer('transcript')
        },
        t('courtyard.encounter.done.transcript')
      ),
      el(
        'div',
        { class: 'exp-keep' },
        el('p', { class: 'exp-keep-title' }, t('courtyard.cafe.keep')),
        el(
          'p',
          {},
          el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, R.bill.ar),
          ' ',
          el('bdi', { class: 'translit', dir: 'ltr' }, R.bill.translit),
          ' — ',
          el('bdi', { dir: 'ltr', lang: 'en' }, R.bill.en)
        )
      ),
      progressBar(p.ratio, t('learn.unitProgress', { seen: p.seen, total: p.total })),
      el(
        'div',
        { class: 'exp-done-actions' },
        el('a', { class: 'btn-primary btn-small', href: `learn.html#${UNIT_ID}` }, t('courtyard.cafe.continueUnit', { title: pick(unit.title) })),
        el('button', { type: 'button', class: 'btn-secondary btn-small', onClick: restart }, t('courtyard.encounter.done.replay'))
      ),
      el(
        'p',
        { class: 'exp-teacher' },
        el('a', { class: 'exp-link', href: '#book', dataset: { courtyardLeave: 'true' } }, t('courtyard.encounter.done.teacher')),
        ' ',
        el('span', { class: 'exp-small' }, t('book.paidNote'))
      )
    );
    dock.dataset.phase = 'done';
    delete dock.dataset.turn;
  }

  /* ---- The scene's side ------------------------------------------------------ */
  const wait = (ms) => new Promise((r) => setTimeout(r, ctx.smooth() ? ms : 0));
  const presentation = () => ctx.scene();
  const story = () => presentation()?.story || null;
  const alive = (my) => my === token && !destroyed;

  /** Without the 3D scene, the storyboard: frames rendered from it. */
  function storyboard() {
    if (story()) {
      board?.destroy();
      board = null;
      return null;
    }
    if (!board && ctx.stage) board = createStoryboard(ctx.stage, ctx.framing(), { smooth: ctx.smooth });
    return board;
  }

  /** Something happens at the table: in 3D, or on the storyboard. */
  function sceneEvent(name) {
    state.events.push(name);
    const s = story();
    if (!s) {
      storyboard()?.show(state.view, state.events);
      return wait(YOURS.has(name) ? 300 : 900);
    }
    const options = { immediate: !ctx.smooth() };
    return YOURS.has(name) ? s.act(name, options) : s.play(name, options);
  }

  function gesture(name) {
    const s = story();
    if (s && name) s.gesture(name, { immediate: !ctx.smooth() });
  }

  function slip(lines, write = false) {
    state.slip = lines;
    renderTicket();
    const s = story();
    if (!s) return;
    if (write) s.writeOrder(lines);
    else s.setOrder(lines);
  }

  function cameraTo(name, { immediate = false } = {}) {
    state.view = name;
    const p = presentation();
    if (p && p.showView && p.story) p.showView(CAFE_VIEWS[name][ctx.framing()], { immediate: immediate || !ctx.smooth() });
    else storyboard()?.show(state.view, state.events);
  }

  /** Play the waiter's lines, if they've been recorded. One at a time; the
      café sounds dip underneath. */
  async function speak(lines, my) {
    for (const l of lines) {
      if (!alive(my) || !sound.voices) return;
      if (!(await hasRecording(l))) continue;
      if (!alive(my) || !sound.voices) return;
      ambience.duck(true);
      await playPhrase(l, null, { tts: false });
      ambience.duck(false);
    }
  }

  function quiet() {
    stopListening();
    ambience.duck(false);
  }

  /* ---- The flow -------------------------------------------------------------- */
  function narrate(key) {
    state.narration = key;
    if (key) state.history.push({ narration: key });
  }

  function show(index, { narration } = {}) {
    const my = ++token;
    const turn = TURNS[index];
    state.turn = index;
    state.phase = 'ready';
    state.said = null;
    state.feedback = null;
    if (narration !== undefined) narrate(narration);
    (turn.them || []).forEach((l) => state.history.push({ who: 'them', line: l }));
    if (state.drawer === 'hint' && !turn.hint) state.drawer = null;
    render();
    announce(turn);
    focusFirst();
    gesture(turn.gesture);
    if (turn.them) speak(turn.them, my);
    // As he asks what you'd like, you pick up the menu.
    if (turn.id === 'order') {
      wait(1100).then(() => {
        if (alive(my) && state.phase === 'ready') sceneEvent('menuUp');
      });
    }
  }

  function busy(said, narration = null) {
    state.phase = 'busy';
    state.said = said;
    state.feedback = null;
    narrate(narration);
    render();
    live.textContent = [said ? `${t('scene.you')}: ${said.translit} — ${said.en}` : '', narration ? t(narration) : ''].filter(Boolean).join(' ');
    // Focus stays in the dialogue while the choices are away.
    dock.focus({ preventScroll: true });
  }

  function say(key) {
    narrate(key);
    render();
    live.textContent = t(key);
  }

  /** The scene's answer to each turn, then the next turn. */
  const AFTER = {
    async arrive(my) {
      busy(null, 'courtyard.encounter.n.sit');
      cameraTo('seat');
      await wait(1100);
      if (!alive(my)) return;
      say('courtyard.encounter.n.waiter');
      await sceneEvent('arrive');
      if (!alive(my)) return;
      show(1, { narration: null });
    },
    async order(my) {
      slip([SLIP[state.order]], true);
      await sceneEvent('note');
      if (!alive(my)) return;
      state.ticket = true;
      renderTicket();
      await sceneEvent('leave');
      if (!alive(my)) return;
      say('courtyard.encounter.n.coffee');
      await sceneEvent('coffee');
      if (!alive(my)) return;
      show(2, { narration: null });
    },
    async thanks(my) {
      await wait(900);
      if (!alive(my)) return;
      show(3, { narration: null });
    },
    async more(my) {
      if (state.manoushe) {
        slip([SLIP[state.order], SLIP.manoushe]);
        await sceneEvent('leave');
        if (!alive(my)) return;
        say('courtyard.encounter.n.manoushe');
        await sceneEvent('manoushe');
        if (!alive(my)) return;
        await wait(700);
        if (!alive(my)) return;
      } else {
        gesture('nod');
        await wait(800);
        if (!alive(my)) return;
      }
      sceneEvent('leave');
      await wait(900);
      if (!alive(my)) return;
      show(4, { narration: 'courtyard.encounter.n.ready' });
      sceneEvent('drink');
    },
    async bill(my) {
      await sceneEvent('bill');
      if (!alive(my)) return;
      state.ticket = false;
      renderTicket();
      show(5, { narration: 'courtyard.encounter.n.pay' });
      sceneEvent('pay');
    },
    async bye(my) {
      await sceneEvent('wave');
      if (!alive(my)) return;
      sceneEvent('leave');
      await wait(500);
      if (!alive(my)) return;
      finish();
    }
  };

  const NARRATION_AFTER = {
    order: 'courtyard.encounter.n.note',
    thanks: null,
    more: null,
    bill: 'courtyard.encounter.n.bill',
    bye: 'courtyard.encounter.n.bye'
  };

  function choose(i) {
    if (state.phase !== 'ready') return; // a second tap mid-answer does nothing
    const turn = TURNS[state.turn];
    const c = turn.choices[i];
    if (!c) return;

    if (c.action === 'sit') {
      const my = ++token;
      AFTER.arrive(my);
      return;
    }

    if (!c.ok) {
      if (!(turn.id in state.firstTry)) state.firstTry[turn.id] = false;
      state.wrong[turn.id] = [...(state.wrong[turn.id] || []), i];
      state.feedback = () => [
        el('strong', {}, t('courtyard.cafe.notQuite')),
        ' ',
        el('bdi', { dir: 'ltr', class: 'translit' }, c.line.translit),
        ' = ',
        el('bdi', { dir: 'ltr', lang: 'en' }, c.line.en),
        '. ',
        t(c.why)
      ];
      render();
      live.textContent = `${t('courtyard.cafe.notQuite')} ${c.line.translit} = ${c.line.en}. ${t(c.why)}`;
      focusFirst();
      return;
    }

    // A right answer: count it, say it, let the scene answer.
    if (!(turn.id in state.firstTry)) state.firstTry[turn.id] = true;
    if (c.phrase) progress.recordAnswer(SOURCE_ID, c.phrase, state.firstTry[turn.id]);
    Object.assign(state, c.set || {});
    state.history.push({ who: 'you', line: c.line });
    quiet();
    const my = ++token;
    busy(c.line, turn.id === 'more' && !state.manoushe ? 'courtyard.encounter.n.enough' : NARRATION_AFTER[turn.id] ?? null);
    AFTER[turn.id](my);
  }

  function finish() {
    token += 1;
    cameraTo('stand');
    const total = Object.keys(state.firstTry).length;
    const right = Object.values(state.firstTry).filter(Boolean).length;
    progress.recordSession(SOURCE_ID, right, total);
    track('cafe_conversation_completed', { first_try: right, of: total, order: state.order, manoushe: state.manoushe });
    state.phase = 'done';
    state.drawer = state.drawer === 'hint' ? null : state.drawer;
    render();
    live.textContent = t('courtyard.encounter.done.title');
    dock.querySelector('.exp-done-title')?.focus({ preventScroll: true });
  }

  function restart() {
    token += 1;
    quiet();
    story()?.reset();
    const keep = state.drawer === 'sound' ? 'sound' : null;
    Object.assign(state, fresh(), { drawer: keep });
    track('cafe_conversation_started', { again: true });
    cameraTo('approach');
    storyboard()?.show(state.view, state.events);
    show(0, { narration: 'courtyard.encounter.n.arrive' });
  }

  function announce(turn) {
    const them = (turn.them || []).map((l) => `${t('scene.cafe.them')}: ${l.translit} — ${l.en}`);
    live.textContent = [state.narration ? t(state.narration) : '', ...them, t(turn.prompt)].filter(Boolean).join(' ');
  }

  function focusFirst() {
    const target = dock.querySelector('.exp-choice:not([disabled])');
    if (target) target.focus({ preventScroll: true });
  }

  /* ---- Start -------------------------------------------------------------------- */
  {
    story()?.reset();
    track('cafe_conversation_started');
    cameraTo('approach');
    show(0, { narration: 'courtyard.encounter.n.arrive' });
    // Are any of the lines recorded yet? Asked once, quietly.
    const lines = [...Object.values(L), ...Object.values(R)].filter(Boolean);
    Promise.all(lines.map((l) => hasRecording(l))).then((found) => {
      if (destroyed) return;
      sound.available = found.some(Boolean);
      renderBar();
      if (state.drawer === 'sound') renderDrawer();
    });
  }

  return {
    get heading() {
      return dock.querySelector('#exp-turn-title') || dock;
    },
    /** Same moment, new language; focus stays on the same control. */
    refresh() {
      const all = () => [...host.querySelectorAll('button, a, [tabindex]')];
      const was = all().indexOf(document.activeElement);
      render();
      if (was >= 0) all()[was]?.focus({ preventScroll: true });
    },
    /**
     * The presentation changed (the 3D scene replaced the still, or the
     * other way round), or the framing did: put the camera, the table and
     * the storyboard where the story is, without animating.
     */
    sync() {
      const s = story();
      cameraTo(state.view, { immediate: true });
      if (!s) {
        storyboard()?.show(state.view, state.events);
        return;
      }
      storyboard();
      s.reset();
      s.setOrder(state.slip);
      state.events.forEach((name) => (YOURS.has(name) ? s.act(name, { immediate: true }) : s.play(name, { immediate: true })));
    },
    reframe() {
      board?.setFraming(ctx.framing());
      cameraTo(state.view, { immediate: true });
    },
    /** Escape closes an open drawer first; returns true if it did. */
    onEscape() {
      if (!state.drawer) return false;
      toggleDrawer(state.drawer);
      dock.querySelector('.exp-choice:not([disabled])')?.focus({ preventScroll: true });
      return true;
    },
    destroy() {
      destroyed = true;
      token += 1;
      quiet();
      ambience.stop();
      story()?.reset();
      board?.destroy();
      board = null;
    }
  };
}
