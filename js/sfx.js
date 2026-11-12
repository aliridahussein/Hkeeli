/**
 * Hkeeli — game sound.
 *
 * Short synthesised tones for the moments a game has no other way to mark:
 * a right answer, a wrong one, a card placed, a scene finished. They are
 * generated with WebAudio rather than shipped as files — four assets to host
 * and 404-handle is a poor trade for four sine waves.
 *
 * Two rules the implementation follows:
 *
 *   1. **Never throw.** A blocked AudioContext, an unsupported browser or a
 *      locked-down profile must degrade to silence, never to an error in the
 *      middle of a round.
 *   2. **Never click.** Every tone ramps its gain up and back down; a square
 *      edge on a 100ms tone is audible as a tick and sounds cheap.
 *
 * The site already plays pronunciation audio unprompted, so sound is on by
 * default. The preference is per-device and remembered — see `setMuted()`,
 * which the game HUD's speaker button drives.
 */

const STORAGE_KEY = 'hkeeli.sound.v1';

/* Kept well below 1: these play on top of pronunciation audio, and a feedback
   tone that competes with the teacher's voice is a bug, not a feature. */
const MASTER_GAIN = 0.16;

let ctx = null;
let master = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false; // private mode — default to audible, forget the choice
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = Boolean(next);
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    /* preference just won't outlive the session */
  }
  if (muted && ctx) stopAll();
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

/**
 * The context is created on first play, not on import.
 *
 * Browsers start an AudioContext suspended until a user gesture, and every
 * caller here is already inside a click handler — so building it lazily is
 * both the correct time and the one that avoids a console warning on every
 * page load for a visitor who never plays a game.
 */
function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function stopAll() {
  if (!master || !ctx) return;
  try {
    // Ramp rather than disconnect: cutting a sounding oscillator is a click.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    setTimeout(() => {
      if (master) master.gain.value = MASTER_GAIN;
    }, 120);
  } catch {
    /* ignore */
  }
}

/**
 * One note.
 *
 * @param {number} freq      hertz
 * @param {number} at        seconds from now
 * @param {number} length    seconds the note sounds for
 * @param {object} [options] type: oscillator shape; gain: peak, 0–1;
 *                           bend: hertz to glide to over the note's length
 */
function note(freq, at, length, { type = 'sine', gain = 1, bend = null } = {}) {
  const c = audio();
  if (!c) return;

  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (bend != null) osc.frequency.exponentialRampToValueAtTime(bend, start + length);

  /* A 12ms attack and a decay to near-silence. exponentialRamp can't reach 0,
     hence the small floor followed by an explicit stop. */
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Play a named cue. Unknown names, muted state and no WebAudio are all no-ops. */
export function play(name) {
  if (muted) return;
  const c = audio();
  if (!c) return;

  // Suspended contexts resume silently when the gesture allows it.
  if (c.state === 'suspended') c.resume().catch(() => {});

  try {
    CUES[name] && CUES[name]();
  } catch {
    /* a failed tone is never worth an exception */
  }
}

/* --------------------------------------------------------------------------
   The cues
   --------------------------------------------------------------------------
   Tuned to A major, which is what the "complete" arpeggio spells out — the
   four cues sit in one key so hearing several in a row isn't discordant.
   -------------------------------------------------------------------------- */

const CUES = {
  /** Right answer: a rising major third, bright and over in a fifth of a second. */
  correct() {
    note(659.25, 0, 0.09, { gain: 0.5 }); // E5
    note(880.0, 0.07, 0.16, { gain: 0.45 }); // A5
  },

  /** Wrong answer: low, soft, bending down. A correction, not a buzzer. */
  wrong() {
    note(196.0, 0, 0.22, { type: 'triangle', gain: 0.4, bend: 155 });
  },

  /** A chip or line placed. Barely there — it marks the tap, nothing more. */
  place() {
    note(880.0, 0, 0.035, { type: 'triangle', gain: 0.18 });
  },

  /** A pair matched, or a step of a scene cleared. */
  step() {
    note(587.33, 0, 0.07, { gain: 0.34 }); // D5
    note(880.0, 0.06, 0.12, { gain: 0.3 }); // A5
  },

  /** End of a round: an A major arpeggio. The one cue allowed to feel like a reward. */
  complete() {
    [440.0, 554.37, 659.25, 880.0].forEach((freq, i) =>
      note(freq, i * 0.085, i === 3 ? 0.5 : 0.18, { gain: i === 3 ? 0.5 : 0.36 })
    );
  }
};

export default { play, isMuted, setMuted, toggleMuted };
