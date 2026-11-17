/**
 * Hkeeli courtyard — the camera rig.
 *
 * The camera's whole state is eight numbers: where it stands (x, y, z), what
 * it looks at (x, y, z), its vertical field of view, and `shift`, which slides
 * the picture up the frame. Every move animates all eight on one clock, so
 * position, orientation and framing arrive together instead of one channel
 * leading the others.
 *
 * ## The curve
 *
 * Each move is a quintic Hermite segment per channel. It starts from the
 * camera's current value, velocity AND acceleration, and ends at the
 * destination with zero velocity and zero acceleration:
 *
 *   - from rest it is exactly smootherstep (6s⁵ − 15s⁴ + 10s³): gentle
 *     acceleration, gentle deceleration, no linear section;
 *   - mid-move, a new destination starts a new segment from wherever the
 *     camera is, moving as fast as it is moving. Velocity and acceleration are
 *     continuous across the switch, so a rapid second click bends the path
 *     instead of jerking it, and there is never a queue of moves to play out;
 *   - the end conditions mean there is nothing to settle: no overshoot, no
 *     oscillation, no snap when it lands.
 *
 * ## The path
 *
 * A straight line between two close-ups can cut through the pergola or the
 * lemon tree. `via` adds a smooth bump to the path — 64·s³(1−s)³, which is
 * zero with zero slope and zero curvature at both ends, so it bends the middle
 * of the route without touching either end condition.
 *
 * Time comes from the caller's frame delta, so motion is identical at 30, 60
 * or 144 fps.
 */

const CHANNELS = 8; // px py pz  tx ty tz  fov  shift

export class CameraRig {
  constructor() {
    this.value = new Float64Array(CHANNELS);
    this.velocity = new Float64Array(CHANNELS);
    this.acceleration = new Float64Array(CHANNELS);

    this.p0 = new Float64Array(CHANNELS);
    this.v0 = new Float64Array(CHANNELS);
    this.a0 = new Float64Array(CHANNELS);
    this.p1 = new Float64Array(CHANNELS);
    this.bump = new Float64Array(CHANNELS);

    this.elapsed = 0;
    this.duration = 0;
    this.moving = false;
  }

  /** Jump straight to a view: no motion, nothing carried over. */
  set(view) {
    writeView(this.value, view);
    this.velocity.fill(0);
    this.acceleration.fill(0);
    this.moving = false;
  }

  /**
   * Begin moving to `view` from wherever the camera is now.
   *
   * @param {object} view   { pos:[x,y,z], target:[x,y,z], fov, shift }
   * @param {object} [options]
   * @param {number} [options.duration]  seconds; derived from the distance if omitted
   * @param {number[]} [options.via]     offset for the middle of the camera's
   *                                     path, in metres — see "The path" above
   */
  goTo(view, { duration, via = null } = {}) {
    writeView(this.p1, view);
    this.p0.set(this.value);
    this.v0.set(this.velocity);
    this.a0.set(this.acceleration);
    this.bump.fill(0);
    if (via) {
      this.bump[0] = via[0];
      this.bump[1] = via[1];
      this.bump[2] = via[2];
    }

    this.duration = duration ?? suggestedDuration(this.p0, this.p1);
    this.elapsed = 0;
    this.moving = true;
  }

  /** How far the destination is from where the camera is, in metres. */
  distanceTo(view) {
    const to = new Float64Array(CHANNELS);
    writeView(to, view);
    return travel(this.value, to);
  }

  /**
   * Advance the clock. Returns true while the camera is still moving, so the
   * caller knows a frame has to be drawn.
   */
  update(dt) {
    if (!this.moving) return false;

    this.elapsed = Math.min(this.elapsed + dt, this.duration);
    const D = this.duration;
    const s = this.elapsed / D;

    const s2 = s * s;
    const s3 = s2 * s;
    const s4 = s3 * s;
    const s5 = s4 * s;

    // Quintic Hermite basis: start value, start velocity, start acceleration,
    // end value. (End velocity and acceleration are zero, so their terms drop.)
    const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
    const h1 = s - 6 * s3 + 8 * s4 - 3 * s5;
    const h2 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
    const h5 = 10 * s3 - 15 * s4 + 6 * s5;

    const d0 = -30 * s2 + 60 * s3 - 30 * s4;
    const d1 = 1 - 18 * s2 + 32 * s3 - 15 * s4;
    const d2 = s - 4.5 * s2 + 6 * s3 - 2.5 * s4;
    const d5 = 30 * s2 - 60 * s3 + 30 * s4;

    const e0 = -60 * s + 180 * s2 - 120 * s3;
    const e1 = -36 * s + 96 * s2 - 60 * s3;
    const e2 = 1 - 9 * s + 18 * s2 - 10 * s3;
    const e5 = 60 * s - 180 * s2 + 120 * s3;

    // The path bump and its first two derivatives.
    const u = 1 - s;
    const b = 64 * s3 * u * u * u;
    const db = 192 * s2 * u * u * (1 - 2 * s);
    const ddb = 192 * (2 * s * u * (1 - 2 * s) * (1 - 2 * s) - 2 * s2 * u * u);

    for (let c = 0; c < CHANNELS; c++) {
      const v0 = this.v0[c] * D;
      const a0 = this.a0[c] * D * D;
      const p0 = this.p0[c];
      const p1 = this.p1[c];
      const k = this.bump[c];

      this.value[c] = h0 * p0 + h1 * v0 + h2 * a0 + h5 * p1 + k * b;
      this.velocity[c] = (d0 * p0 + d1 * v0 + d2 * a0 + d5 * p1 + k * db) / D;
      this.acceleration[c] = (e0 * p0 + e1 * v0 + e2 * a0 + e5 * p1 + k * ddb) / (D * D);
    }

    if (this.elapsed >= D) {
      // The curve already ends exactly here with zero velocity; this only
      // clears floating-point residue.
      this.value.set(this.p1);
      this.velocity.fill(0);
      this.acceleration.fill(0);
      this.moving = false;
    }
    return true;
  }

  get pos() {
    return [this.value[0], this.value[1], this.value[2]];
  }

  get target() {
    return [this.value[3], this.value[4], this.value[5]];
  }

  get fov() {
    return this.value[6];
  }

  get shift() {
    return this.value[7];
  }
}

function writeView(out, view) {
  out[0] = view.pos[0];
  out[1] = view.pos[1];
  out[2] = view.pos[2];
  out[3] = view.target[0];
  out[4] = view.target[1];
  out[5] = view.target[2];
  out[6] = view.fov;
  out[7] = view.shift || 0;
}

/** How much the camera actually travels: its own path, or its gaze, whichever is larger. */
function travel(a, b) {
  const dp = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const dt = Math.hypot(b[3] - a[3], b[4] - a[4], b[5] - a[5]);
  return Math.max(dp, dt * 0.7);
}

/**
 * Around a second for a move across the table, a little longer for the crane
 * up to the balcony. Short enough to feel responsive, long enough that the
 * eye can follow where it went.
 */
function suggestedDuration(from, to) {
  const d = travel(from, to);
  return Math.min(1.6, Math.max(0.95, 0.86 + d * 0.085));
}
