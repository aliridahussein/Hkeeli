/**
 * Hkeeli — the play stage.
 *
 * Everything a learner *plays* — a scene, Daily Practice, a single game —
 * opens here: a full-viewport layer over the practice page, with a slim top
 * bar (leave, progress, streak, sound), a scrolling stage in the middle and
 * the verdict bar pinned to the bottom.
 *
 * It replaced games that mounted as a card in the middle of a scrolling page.
 * That arrangement kept every other thing on the page in view while you
 * played — the scene picker above, Daily Practice and seven game tiles
 * below — which is the opposite of what playing should feel like. Committing
 * to a situation should *take you somewhere*.
 *
 * What the stage owns, and nothing else does:
 *
 *   - **The page behind it.** Everything outside the stage is made `inert`
 *     while it is open: no focus, no clicks, nothing announced. Page scroll is
 *     locked and restored exactly on close, so leaving drops you back where
 *     you were.
 *   - **The way out.** The close button, Escape, and the browser's Back
 *     button all leave — the last because on a phone, Back is how people leave
 *     things. (The history entry itself is managed by practice.js, which knows
 *     whether it pushed one; the stage only asks to be closed.)
 *   - **Session-level HUD.** One progress bar, segmented when a session has
 *     steps, and one streak that carries across those steps — a run of right
 *     answers doesn't reset because the next question belongs to a different
 *     game.
 *
 * Two themes. `dark` is the scene theme: the deep sea of the brand, so being
 * inside a scene is unmistakable. `light` is the sand canvas, for drills.
 * Colours inside the stage are set through the stage's own custom properties
 * (see games.css), never inherited from wherever the stage happens to sit —
 * the bug that once rendered option text sand-on-sand came from exactly that
 * kind of inheritance.
 */

import { t } from './i18n.js';
import { el, clear } from './ui.js';
import { icon } from './icons.js';
import { isMuted, toggleMuted, play as playCue } from './sfx.js';
import { pulse, reducedMotion } from './motion.js';

export class Stage {
  /**
   * @param {object} options
   * @param {'dark'|'light'} [options.theme]
   * @param {string} [options.label]          accessible name of the dialog
   * @param {() => void} [options.onRequestClose]  close button, Escape
   */
  constructor({ theme = 'light', label = '', onRequestClose = () => {} } = {}) {
    this.theme = theme;
    this.label = label;
    this.onRequestClose = onRequestClose;
    this.streak = 0;
    this.segments = 1;
    this.step = 0;
    this.isOpen = false;
  }

  /* ---- lifecycle -------------------------------------------------------- */

  open() {
    if (this.isOpen) return this;
    this.isOpen = true;
    this.opener = document.activeElement;
    this.build();

    document.body.append(this.root);
    this.lockPage(true);

    this.onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.onRequestClose();
      }
    };
    document.addEventListener('keydown', this.onKey);

    // Focus the dialog itself, so a screen reader announces where you are
    // before anything inside it, and Tab starts from the top of the stage.
    this.root.focus({ preventScroll: true });
    return this;
  }

  /** Animate out, then put the page back exactly as it was. */
  close() {
    if (!this.isOpen) return Promise.resolve();
    this.isOpen = false;
    document.removeEventListener('keydown', this.onKey);

    const done = () => {
      this.root.remove();
      this.lockPage(false);
      if (this.opener && document.contains(this.opener)) {
        this.opener.focus({ preventScroll: true });
      }
    };

    if (reducedMotion()) {
      done();
      return Promise.resolve();
    }

    this.root.dataset.closing = 'true';
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        done();
        resolve();
      };
      // animationend bubbles: a ripple or a tile finishing inside the stage
      // must not count as the stage itself having faded out.
      const onEnd = (event) => {
        if (event.target !== this.root) return;
        this.root.removeEventListener('animationend', onEnd);
        finish();
      };
      this.root.addEventListener('animationend', onEnd);
      // A backgrounded tab never fires animationend; never strand the page.
      setTimeout(finish, 420);
    });
  }

  /**
   * Everything outside the stage goes inert and the page stops scrolling.
   *
   * The toast region is left alone: a toast raised during play (the
   * synthetic-voice notice, "no audio yet") must still be seen and announced.
   */
  lockPage(locked) {
    const html = document.documentElement;
    if (locked) {
      this.inerted = [...document.body.children].filter(
        (node) => node !== this.root && !node.classList.contains('toast-region') && !node.inert
      );
      this.inerted.forEach((node) => {
        node.inert = true;
      });
      html.dataset.stage = 'open';
    } else {
      (this.inerted || []).forEach((node) => {
        node.inert = false;
      });
      this.inerted = [];
      delete html.dataset.stage;
    }
  }

  /* ---- structure -------------------------------------------------------- */

  build() {
    this.closeBtn = el(
      'button',
      {
        type: 'button',
        class: 'stage-close',
        'aria-label': t('stage.close'),
        onClick: () => this.onRequestClose()
      },
      icon('close', { size: 22 })
    );

    this.track = el('div', { class: 'stage-progress-track' });
    this.progressEl = el(
      'div',
      {
        class: 'stage-progress',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '0',
        'aria-label': t('stage.progress')
      },
      this.track
    );

    this.streakCount = el('span', { class: 'stage-streak-count' }, '0');
    this.streakEl = el(
      'div',
      { class: 'stage-streak', dataset: { level: '0' }, hidden: true },
      icon('flame', { size: 20 }),
      this.streakCount,
      // Read out as a sentence; the flame and the bare number are decorative.
      (this.streakLabel = el('span', { class: 'visually-hidden' }, ''))
    );

    this.soundBtn = el('button', { type: 'button', class: 'stage-sound' });
    this.soundBtn.addEventListener('click', () => {
      toggleMuted();
      this.paintSound();
      if (!isMuted()) playCue('place'); // confirm the choice in the medium itself
    });
    this.paintSound();

    this.content = el('div', { class: 'stage-content' });
    this.body = el('div', { class: 'stage-body' }, this.content);
    this.footer = el('div', { class: 'stage-footer' });

    this.root = el(
      'div',
      {
        class: 'stage',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': this.label,
        tabindex: '-1',
        dataset: { theme: this.theme }
      },
      el(
        'header',
        { class: 'stage-bar' },
        this.closeBtn,
        this.progressEl,
        el('div', { class: 'stage-bar-end' }, this.streakEl, this.soundBtn)
      ),
      this.body,
      this.footer
    );

    this.setSegments(1);
  }

  setTheme(theme) {
    this.theme = theme;
    if (this.root) this.root.dataset.theme = theme;
  }

  setLabel(label) {
    this.label = label;
    if (this.root) this.root.setAttribute('aria-label', label);
  }

  /** Empty the stage for the next screen and put it back at the top. */
  clearContent() {
    clear(this.content);
    this.body.scrollTop = 0;
    return this.content;
  }

  paintSound() {
    const off = isMuted();
    clear(this.soundBtn).append(icon(off ? 'speakerOff' : 'speaker', { size: 20 }));
    this.soundBtn.dataset.state = off ? 'off' : 'on';
    this.soundBtn.setAttribute('aria-pressed', String(!off));
    this.soundBtn.setAttribute('aria-label', t(off ? 'game.soundOn' : 'game.soundOff'));
  }

  /* ---- progress --------------------------------------------------------- */

  /**
   * Split the bar into one segment per step. A single game is one segment; a
   * scene is six, and the current one fills as its questions are answered —
   * so the bar always says both "where am I in this step" and "how much of the
   * scene is left", without a second indicator.
   */
  setSegments(count) {
    this.segments = Math.max(1, count);
    this.step = 0;
    clear(this.track).append(
      ...Array.from({ length: this.segments }, () =>
        el('span', { class: 'stage-seg' }, el('span', { class: 'stage-seg-fill' }))
      )
    );
    this.track.dataset.segmented = String(this.segments > 1);
    this.setProgress(0);
  }

  /** Mark every segment before `index` complete and make `index` current. */
  setStep(index) {
    this.step = Math.max(0, Math.min(index, this.segments));
    [...this.track.children].forEach((seg, i) => {
      seg.dataset.state = i < this.step ? 'done' : i === this.step ? 'current' : 'todo';
      if (i < this.step) seg.firstChild.style.width = '100%';
      if (i > this.step) seg.firstChild.style.width = '0%';
    });
    this.setProgress(0);
  }

  /** Fill the current segment to `fraction`. */
  setProgress(fraction) {
    const f = Math.max(0, Math.min(1, fraction || 0));
    const seg = this.track.children[this.step];
    if (seg) seg.firstChild.style.width = `${f * 100}%`;
    const overall = Math.round(((this.step + f) / this.segments) * 100);
    this.progressEl.setAttribute('aria-valuenow', String(Math.min(100, overall)));
  }

  /** Everything done — used by the end screens. */
  complete() {
    [...this.track.children].forEach((seg) => {
      seg.dataset.state = 'done';
      seg.firstChild.style.width = '100%';
    });
    this.progressEl.setAttribute('aria-valuenow', '100');
  }

  /* ---- streak ----------------------------------------------------------- */

  /**
   * The streak belongs to the stage, not to a game, so a run of right answers
   * carries from the Listen step of a scene into its Answer step. Returns the
   * new value.
   */
  bumpStreak(correct) {
    this.streak = correct ? this.streak + 1 : 0;
    this.paintStreak(correct);
    return this.streak;
  }

  /** Shown for games with right answers; hidden for self-graded review. */
  showStreak(on) {
    this.streakEl.hidden = !on;
    if (on) this.paintStreak(false);
  }

  paintStreak(justScored) {
    const n = this.streak;
    this.streakCount.textContent = String(n);
    this.streakLabel.textContent = t('stage.streak', { count: n });
    // Heat levels drive colour only: cold at 0, warm from 3, hot from 5.
    this.streakEl.dataset.level = n >= 5 ? '3' : n >= 3 ? '2' : n >= 1 ? '1' : '0';
    if (justScored) pulse(this.streakEl, 1.25);
  }
}

export default Stage;
