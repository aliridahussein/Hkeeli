/**
 * Hkeeli courtyard — café ambience, off unless asked for.
 *
 * A soft bed of room tone with the odd cup set down on a saucer, made in the
 * browser with Web Audio: no file to download, nothing that passes for a
 * voice. It starts only when the visitor turns it on, stays quiet under the
 * lines, and stops when they leave the café. The control says it is
 * synthesised; it is atmosphere, not part of the lesson.
 */

let ctx = null;
let nodes = null;
let clinkTimer = 0;
let on = false;

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = ctx || new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Brown noise, low-passed: the hum of a room with people in it.
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.2;
  }
  const bed = ctx.createBufferSource();
  bed.buffer = buffer;
  bed.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 520;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.22;
  // A slow swell, so it breathes rather than hisses.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain).connect(bedGain.gain);
  bed.connect(low).connect(bedGain).connect(master);
  bed.start();
  lfo.start();
  return { master, bed, lfo };
}

/** A cup on a saucer: two short, damped partials. */
function clink() {
  if (!ctx || !nodes) return;
  const now = ctx.currentTime;
  const base = 2100 + Math.random() * 900;
  [1, 2.76].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = base * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(i ? 0.012 : 0.03, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(g).connect(nodes.master);
    osc.start(now);
    osc.stop(now + 0.4);
  });
}

function scheduleClinks() {
  clearTimeout(clinkTimer);
  if (!on) return;
  clinkTimer = setTimeout(() => {
    clink();
    scheduleClinks();
  }, 3500 + Math.random() * 7000);
}

export const ambience = {
  playing: () => on,
  start() {
    if (on) return;
    nodes = nodes || build();
    if (!nodes) return;
    on = true;
    ctx.resume?.();
    nodes.master.gain.cancelScheduledValues(ctx.currentTime);
    nodes.master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    scheduleClinks();
  },
  stop() {
    if (!on) return;
    on = false;
    clearTimeout(clinkTimer);
    if (ctx && nodes) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  },
  /** Dip under a recorded line, and come back up after it. */
  duck(down) {
    if (!ctx || !nodes || !on) return;
    nodes.master.gain.setTargetAtTime(down ? 0.14 : 0.5, ctx.currentTime, down ? 0.12 : 0.4);
  },
  toggle() {
    if (on) this.stop();
    else this.start();
  }
};
