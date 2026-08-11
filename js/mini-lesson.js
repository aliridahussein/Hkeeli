/**
 * Hkeeli — the free mini-lesson on the home page.
 *
 * A real lesson, not a mockup: it draws from the same phrase bank as every
 * unit, plays audio through the same `playPhrase()` path, records answers in
 * the same progress store, and hands the learner off to the place they should
 * go next. Three phrases, one question each — short enough that a visitor
 * finishes it before deciding whether to stay.
 *
 * Flow per phrase:   listen → (replay) → see the transliteration →
 *                    choose the meaning, or reveal it → feedback with the
 *                    literal meaning, the usage note, and the script.
 */

import { t, pick } from './i18n.js';
import { el, clear, playButton } from './ui.js';
import { getAllPhrases, sample, shuffle } from './data.js';
import { playPhrase, hasSlowAudio } from './audio.js';
import { progress } from './storage.js';
import { usageLabel } from './journey.js';

/* The lesson opens with these, in this order: a greeting everyone recognises,
   the gendered one that marks a learner as taught-by-a-person, and a reply that
   has no English equivalent. Change the ids to feature different phrases. */
const LESSON_PHRASE_IDS = ['u1-p1', 'u1-p2', 'u1-p9'];
const OPTION_COUNT = 3;

/** Progress is recorded under its own id so it never distorts a game's stats. */
const SOURCE_ID = 'mini-lesson';

export async function initMiniLesson(host) {
  if (!host) return;

  const all = await getAllPhrases();
  const lesson = LESSON_PHRASE_IDS.map((id) => all.find((p) => p.id === id)).filter(Boolean);
  const phrases = lesson.length ? lesson : all.slice(0, 3);
  if (!phrases.length) return;

  let index = 0;
  let correctCount = 0;

  const stepEl = el('p', { class: 'mini-step' });
  const board = el('div', { class: 'mini-board' });
  const status = el('div', {
    class: 'mini-feedback',
    role: 'status',
    'aria-live': 'polite'
  });
  status.hidden = true;

  clear(host).append(
    el(
      'div',
      { class: 'mini-lesson' },
      el(
        'div',
        { class: 'mini-head' },
        el('h3', {}, t('mini.title')),
        stepEl
      ),
      board,
      status
    )
  );

  const setStatus = (tone, title, detail) => {
    clear(status).append(el('strong', {}, title), detail || null);
    status.dataset.tone = tone;
    status.hidden = false;
  };

  const question = () => {
    const phrase = phrases[index];
    status.hidden = true;
    clear(status);
    stepEl.textContent = t('mini.step', { current: index + 1, total: phrases.length });

    let answered = false;

    const play = playButton(phrase, 'mini-play');
    play.setAttribute('aria-label', `${t('game.playAudio')}: ${phrase.translit}`);

    const options = shuffle([
      phrase,
      ...sample(
        phrases.concat(all).filter((p) => p.id !== phrase.id && p.en !== phrase.en),
        OPTION_COUNT - 1
      )
    ]);

    const nextBtn = el(
      'button',
      { type: 'button', class: 'btn-primary btn-small' },
      t(index + 1 === phrases.length ? 'mini.finish' : 'mini.next')
    );
    nextBtn.hidden = true;
    nextBtn.addEventListener('click', advance);

    const revealBtn = el(
      'button',
      { type: 'button', class: 'btn-secondary btn-small' },
      t('mini.reveal')
    );

    /* Styled by components.css rather than reusing the games' `.option`:
       css/games.css isn't loaded on the home page, and pulling it in for one
       button would cost more than these few rules. */
    const optionButtons = options.map((option) =>
      el('button', { type: 'button', class: 'mini-option' }, el('span', { class: 'option-en' }, option.en))
    );

    /* One settle path for both routes into the answer: choosing an option and
       revealing it should leave the board in the same state, minus the score. */
    const settle = ({ chosen }) => {
      if (answered) return;
      answered = true;

      const correct = Boolean(chosen) && chosen.id === phrase.id;
      optionButtons.forEach((button, i) => {
        button.disabled = true;
        if (options[i].id === phrase.id) button.dataset.state = 'correct';
        else if (chosen && options[i].id === chosen.id) button.dataset.state = 'wrong';
      });

      if (chosen) {
        progress.recordAnswer(SOURCE_ID, phrase.id, correct);
        if (correct) correctCount += 1;
      }

      setStatus(
        correct ? 'ok' : chosen ? 'bad' : 'neutral',
        correct ? t('game.correct') : chosen ? t('game.wrong') : t('mini.revealed'),
        phraseNotes(phrase)
      );

      revealBtn.hidden = true;
      nextBtn.hidden = false;
      nextBtn.focus();
    };

    optionButtons.forEach((button, i) => {
      button.addEventListener('click', () => settle({ chosen: options[i] }));
    });
    revealBtn.addEventListener('click', () => settle({ chosen: null }));

    clear(board).append(
      el(
        'div',
        { class: 'mini-prompt' },
        play,
        el(
          'div',
          {},
          el('p', { class: 'mini-hint' }, t('mini.listenHint')),
          el('p', { class: 'translit mini-translit', dir: 'ltr' }, phrase.translit),
          hasSlowAudio(phrase)
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'mini-slow',
                  onClick: () => playPhrase(phrase, null, { slow: true })
                },
                t('mini.slow')
              )
            : null
        )
      ),
      el('p', { class: 'mini-question' }, t('mini.question')),
      el('div', { class: 'mini-options' }, optionButtons),
      el('div', { class: 'mini-actions' }, revealBtn, nextBtn)
    );

    // Hearing it first is the whole point, but autoplay on a page the visitor
    // just landed on is rude — the first phrase waits for a tap.
    if (index > 0) playPhrase(phrase, play);
  };

  function advance() {
    index += 1;
    if (index >= phrases.length) summary();
    else question();
  }

  function summary() {
    status.hidden = true;
    stepEl.textContent = t('mini.step', { current: phrases.length, total: phrases.length });
    clear(board).append(
      el(
        'div',
        { class: 'mini-summary' },
        el('p', { class: 'mini-score' }, t('mini.score', { score: correctCount, total: phrases.length })),
        el('h4', {}, t('mini.doneTitle')),
        el('p', {}, t('mini.doneBody')),
        el(
          'div',
          { class: 'mini-actions' },
          el('a', { class: 'btn-primary btn-small', href: 'learn.html#unit-1' }, t('mini.toLessons')),
          el('a', { class: 'btn-secondary btn-small', href: 'practice.html' }, t('mini.toPractice')),
          el(
            'button',
            {
              type: 'button',
              class: 'mini-restart',
              onClick: () => {
                index = 0;
                correctCount = 0;
                question();
              }
            },
            t('mini.again')
          )
        )
      )
    );
  }

  question();
}

/**
 * The teaching half of the feedback: script, literal meaning where the data has
 * one, and the usage note. Only what lessons.json actually carries — a phrase
 * with no literal gloss simply doesn't get that line.
 */
function phraseNotes(phrase) {
  const usage = usageLabel(phrase);
  return el(
    'span',
    { class: 'mini-notes' },
    el('span', { class: 'arabic', dir: 'rtl', lang: 'ar' }, phrase.ar),
    el('span', { class: 'mini-note-en' }, phrase.en),
    phrase.literal
      ? el('span', { class: 'mini-note' }, `${t('phrase.literally')} “${pick(phrase.literal)}”`)
      : null,
    phrase.note ? el('span', { class: 'mini-note' }, pick(phrase.note)) : null,
    usage ? el('span', { class: 'usage-tag' }, usage) : null
  );
}
