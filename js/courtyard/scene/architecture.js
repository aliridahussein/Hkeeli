/**
 * Hkeeli courtyard — the house, the walls, the gate, the pergola.
 *
 * A Lebanese house of the kind found all over the old quarters: pale dressed
 * limestone, arched openings with stone surrounds, a triple arcade on marble
 * columns behind a balcony on stone corbels, louvred shutters painted teal,
 * and a hipped roof of canal tiles. The courtyard is closed by a garden wall
 * with an arched gate on the left and a single-storey wing on the right, where
 * a pergola shades the teacher's corner.
 *
 * Dimensions are real: a 1.1 m door, a 0.95 m balcony, a 2.78 m pergola. The
 * camera comes within a metre of some of this, and things built at the wrong
 * size read as wrong long before anyone can say why.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Shape,
  ExtrudeGeometry,
  TorusGeometry,
  CylinderGeometry,
  SphereGeometry,
  Matrix4,
  Quaternion,
  Vector3
} from '../../../vendor/three/three-hkeeli.min.js';
import { wallWithOpenings, archSurround, archPath, roundBox, box, lathe, moulding, cylinder, rng } from './geometry.js';

/** The plan, in one place. Props and plants are positioned against these. */
export const LAYOUT = {
  backZ: -4.0,
  houseLeft: -1.0,
  houseRight: 4.8,
  wingInner: 4.3,
  leftInner: -4.3,
  storey: 3.32,
  eaves: 6.45,
  gardenWallTop: 3.35,
  gate: { cx: -2.65, width: 1.32, spring: 1.92 },
  door: { cx: 1.45, width: 1.12, spring: 1.86 },
  winA: { cx: -0.15, width: 0.76, bottom: 0.95, spring: 2.02 },
  winC: { cx: 3.45, width: 0.76, bottom: 0.95, spring: 2.02 },
  upper: [
    { cx: -0.35, width: 0.66, bottom: 4.0, spring: 5.02 },
    { cx: 3.5, width: 0.66, bottom: 4.0, spring: 5.02 }
  ],
  arcade: { cx: 1.45, open: 0.68, column: 0.13, spring: 5.08 },
  balcony: { x0: 0.05, x1: 2.85, depth: 0.95 },
  pergola: { x0: 2.3, x1: 4.3, z0: -4.0, z1: -1.35, y: 2.78 },
  tiles: { x0: 2.25, x1: 4.3, z0: -4.0, z1: -1.3 }
};

const Z = LAYOUT.backZ;

/**
 * @param {object} B   bucket registry: B.get('stone').add(geometry, transform)
 * @param {object} extra  { blobs, fades, lights } collectors filled as we go
 */
export function buildArchitecture(B, extra) {
  floor(B, extra);
  facade(B, extra);
  gardenWalls(B, extra);
  gate(B);
  houseDoor(B);
  windows(B);
  arcade(B, extra);
  balcony(B);
  cornice(B);
  roof(B);
  pergola(B);
  lane(B);
  neighbours(B);
}

/* --------------------------------------------------------------------------
   Floor
   -------------------------------------------------------------------------- */
function floor(B, extra) {
  // Pavers: the whole courtyard and a little beyond the frame.
  B.get('paver').add(box(9.2, 0.1, 12.5), [[0, -0.05, 2.25]]);
  // The patterned cement tiles of the teacher's corner, with a stone kerb.
  const t = LAYOUT.tiles;
  B.get('cement').add(box(t.x1 - t.x0, 0.02, t.z1 - t.z0), [[(t.x0 + t.x1) / 2, 0.004, (t.z0 + t.z1) / 2]]);
  B.get('dressed').add(roundBox(0.07, 0.03, t.z1 - t.z0 + 0.07, 0.008), [[t.x0 - 0.02, 0.012, (t.z0 + t.z1) / 2 + 0.03]]);
  B.get('dressed').add(roundBox(t.x1 - t.x0 + 0.05, 0.03, 0.07, 0.008), [[(t.x0 + t.x1) / 2 + 0.02, 0.012, t.z1 + 0.03]]);
  // Darkening where the walls meet the floor: cheap, and it is what makes a
  // wall stand on the ground instead of hovering over it.
  // `rot` turns each strip so its dark edge faces its wall: π for walls behind
  // (towards -z), -π/2 for the left wall, π/2 for the wing on the right.
  extra.fades.push(
    { x: 1.65, z: Z + 0.14, w: 6.6, d: 0.28, rot: Math.PI },
    { x: -1.84, z: Z + 0.14, w: 0.85, d: 0.28, rot: Math.PI },
    { x: -3.85, z: Z + 0.14, w: 0.9, d: 0.28, rot: Math.PI },
    { x: LAYOUT.leftInner + 0.14, z: -1.6, w: 4.8, d: 0.28, rot: -Math.PI / 2 },
    { x: LAYOUT.wingInner - 0.14, z: -1.5, w: 5.0, d: 0.28, rot: Math.PI / 2 }
  );
}

/* --------------------------------------------------------------------------
   The house front
   -------------------------------------------------------------------------- */
function facade(B, extra) {
  const L = LAYOUT;
  const openings = [
    { type: 'arch', cx: L.door.cx, bottom: 0, width: L.door.width, spring: L.door.spring },
    { type: 'arch', cx: L.winA.cx, bottom: L.winA.bottom, width: L.winA.width, spring: L.winA.spring },
    { type: 'arch', cx: L.winC.cx, bottom: L.winC.bottom, width: L.winC.width, spring: L.winC.spring },
    ...L.upper.map((w) => ({ type: 'arch', cx: w.cx, bottom: w.bottom, width: w.width, spring: w.spring })),
    ...arcadeCentres().map((cx) => ({ type: 'arch', cx, bottom: L.storey, width: L.arcade.open, spring: L.arcade.spring }))
  ];
  const wall = wallWithOpenings(L.houseLeft, L.houseRight, 0, L.eaves, 0.5, openings);
  B.get('stone').add(wall, [[0, 0, Z]]);

  // Dark rooms behind the closed upper shutters, so no louvre shows sky.
  L.upper.forEach((w) => {
    const top = w.spring + w.width / 2;
    B.get('interior').add(box(w.width + 0.12, top - w.bottom + 0.1, 0.04), [[w.cx, (w.bottom + top) / 2, Z - 0.52]]);
  });

  // Quoins up the left corner: alternating long and short dressed blocks.
  for (let i = 0; i < 12; i++) {
    const long = i % 2 === 0;
    const h = 0.5;
    B.get('dressed').add(roundBox(long ? 0.5 : 0.3, h - 0.012, 0.03, 0.006), [[L.houseLeft + (long ? 0.25 : 0.15), h * i + h / 2, Z + 0.012]]);
  }

  // The string course at the first floor, broken by the balcony.
  B.get('dressed').add(roundBox(L.balcony.x0 - L.houseLeft + 0.02, 0.09, 0.07, 0.01), [[(L.houseLeft + L.balcony.x0) / 2, L.storey - 0.12, Z + 0.035]]);
  B.get('dressed').add(roundBox(L.wingInner - L.balcony.x1 + 0.02, 0.09, 0.07, 0.01), [[(L.balcony.x1 + L.wingInner) / 2, L.storey - 0.12, Z + 0.035]]);

  // Surrounds, keystones and sills.
  surround(B, L.door.cx, 0, L.door.width, L.door.spring, { band: 0.15, key: true });
  surround(B, L.winA.cx, L.winA.bottom, L.winA.width, L.winA.spring, { band: 0.1, sill: true });
  surround(B, L.winC.cx, L.winC.bottom, L.winC.width, L.winC.spring, { band: 0.1, sill: true });
  L.upper.forEach((w) => surround(B, w.cx, w.bottom, w.width, w.spring, { band: 0.09, sill: true }));

  // The wing on the right: one storey, coped, pergola against it.
  B.get('stone').add(box(0.5, 3.42, 5.4), [[L.wingInner + 0.25, 1.71, Z + 2.7]]);
  coping(B, 'z', L.wingInner + 0.25, Z + 0.05, Z + 5.4, 3.42, 0.6);
}

function arcadeCentres() {
  const a = LAYOUT.arcade;
  const step = a.open + a.column;
  return [a.cx - step, a.cx, a.cx + step];
}

function surround(B, cx, bottom, width, spring, { band = 0.12, key = false, sill = false } = {}) {
  const g = archSurround(cx, bottom, width, spring, { band, proud: 0.03, head: band * 0.25 });
  B.get('dressed').add(g, [[0, 0, Z - 0.004]]);
  if (key) {
    B.get('dressed').add(roundBox(0.2, 0.3, 0.07, 0.012), [[cx, spring + width / 2 + band * 0.7, Z + 0.035]]);
  }
  if (sill) {
    B.get('dressed').add(roundBox(width + band * 2 + 0.1, 0.07, 0.2, 0.012), [[cx, bottom - 0.03, Z + 0.06]]);
  }
}

/* A row of coping stones along a wall top, each a little different. */
function coping(B, axis, fixed, from, to, top, width) {
  const r = rng(Math.round(fixed * 100 + from * 10));
  let at = from;
  while (at < to - 0.05) {
    const len = Math.min(to - at, r.range(0.48, 0.74));
    const h = 0.075 + r.range(-0.006, 0.006);
    const geo = roundBox(axis === 'x' ? len - 0.012 : width, h, axis === 'x' ? width : len - 0.012, 0.012);
    const centre = at + len / 2;
    const pos = axis === 'x' ? [centre, top + h / 2, fixed] : [fixed, top + h / 2, centre];
    B.get('dressed').add(geo, [pos, [r.signed(0.006), r.signed(0.01), r.signed(0.006)]]);
    at += len;
  }
}

/* --------------------------------------------------------------------------
   Garden walls and the courtyard entrance
   -------------------------------------------------------------------------- */
function gardenWalls(B, extra) {
  const L = LAYOUT;
  const g = L.gate;
  const back = wallWithOpenings(-4.7, L.houseLeft, 0, L.gardenWallTop, 0.42, [{ type: 'arch', cx: g.cx, bottom: 0, width: g.width, spring: g.spring }]);
  B.get('stone').add(back, [[0, 0, Z]]);
  coping(B, 'x', Z - 0.2, -4.7, L.houseLeft, L.gardenWallTop, 0.52);

  // The left wall, a little lower than the back.
  B.get('stone').add(box(0.38, 3.02, 5.2), [[L.leftInner - 0.19, 1.51, Z + 2.2]]);
  coping(B, 'z', L.leftInner - 0.19, Z - 0.4, Z + 4.8, 3.02, 0.48);

  // The gate's surround, keystone and imposts: the dressed stone a visitor
  // walks under.
  const s = archSurround(g.cx, 0, g.width, g.spring, { band: 0.17, proud: 0.035, head: 0.05 });
  B.get('dressed').add(s, [[0, 0, Z - 0.004]]);
  B.get('dressed').add(roundBox(0.22, 0.32, 0.08, 0.014), [[g.cx, g.spring + g.width / 2 + 0.13, Z + 0.04]]);
  [-1, 1].forEach((side) => {
    B.get('dressed').add(roundBox(0.24, 0.1, 0.07, 0.01), [[g.cx + side * (g.width / 2 + 0.085), g.spring - 0.05, Z + 0.045]]);
  });
  // Threshold.
  B.get('dressed').add(roundBox(g.width + 0.3, 0.06, 0.5, 0.012), [[g.cx, 0.03, Z - 0.2]]);
  extra.fades.push({ x: g.cx, z: Z + 0.2, w: g.width + 0.2, d: 0.3, rot: Math.PI, opacity: 0.18 });
}

function gate(B) {
  const g = LAYOUT.gate;
  const half = g.width / 2;
  const crown = g.spring + half;
  // One leaf, hinged at x = 0 and reaching +x to the middle of the opening.
  const leafShape = (mirror) => {
    const s = new Shape();
    const m = mirror ? -1 : 1;
    s.moveTo(0, 0);
    s.lineTo(m * (half - 0.01), 0);
    s.lineTo(m * (half - 0.01), crown - 0.02);
    const n = 16;
    for (let i = 1; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * (Math.PI / 2);
      // Arc centred on the opening's middle at the springing line.
      s.lineTo(m * (half + Math.cos(a) * (half - 0.02)), g.spring + Math.sin(a) * (half - 0.02));
    }
    s.lineTo(0, 0);
    return new ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 4 });
  };

  const leaves = [
    { hinge: g.cx - half + 0.01, open: -1.18, mirror: false },
    { hinge: g.cx + half - 0.01, open: 0.42, mirror: true }
  ];
  leaves.forEach(({ hinge, open, mirror }) => {
    const pos = [hinge, 0.012, Z - 0.1];
    const rot = [0, open, 0];
    B.get('woodDark').add(leafShape(mirror), [pos, rot]);
    const m = mirror ? -1 : 1;
    // Plank joints, iron straps and studs.
    for (let k = 1; k < 4; k++) {
      B.get('iron').add(box(0.006, g.spring - 0.1, 0.003), matrixOn(pos, rot, [m * k * (half / 4), (g.spring - 0.1) / 2 + 0.04, 0.058]));
    }
    [0.42, 1.62].forEach((y) => {
      B.get('iron').add(roundBox(half - 0.06, 0.045, 0.008, 0.003), matrixOn(pos, rot, [m * (half / 2), y, 0.062]));
      for (let k = 0; k < 4; k++) {
        B.get('iron').add(new SphereGeometry(0.009, 8, 6), matrixOn(pos, rot, [m * (0.07 + k * ((half - 0.14) / 3)), y, 0.068]));
      }
    });
    B.get('iron').add(new TorusGeometry(0.035, 0.0055, 6, 16), matrixOn(pos, rot, [m * (half - 0.1), 1.05, 0.072]));
  });
}

/** Compose a local offset onto a placed leaf: position + rotation about Y. */
function matrixOn(pos, rot, local) {
  const c = Math.cos(rot[1]);
  const s = Math.sin(rot[1]);
  const x = pos[0] + local[0] * c + local[2] * s;
  const z = pos[2] - local[0] * s + local[2] * c;
  return [[x, pos[1] + local[1], z], rot];
}

/* --------------------------------------------------------------------------
   The front door: panelled, teal, with an iron fanlight
   -------------------------------------------------------------------------- */
function houseDoor(B) {
  const d = LAYOUT.door;
  const half = d.width / 2;
  const back = Z - 0.32;
  [-1, 1].forEach((side) => {
    const cx = d.cx + side * (half / 2);
    B.get('tealDoor').add(roundBox(half - 0.012, d.spring - 0.01, 0.05, 0.008), [[cx, d.spring / 2, back]]);
    // Raised panels.
    [0.55, 1.35].forEach((y, i) => {
      B.get('tealDoor').add(roundBox(half - 0.13, i === 0 ? 0.62 : 0.66, 0.02, 0.008), [[cx, y, back + 0.032]]);
    });
  });
  // Brass knob and knocker.
  B.get('brass').add(new SphereGeometry(0.026, 14, 10), [[d.cx + 0.07, 1.0, back + 0.06]]);
  B.get('brass').add(new TorusGeometry(0.045, 0.008, 8, 18), [[d.cx - 0.08, 1.32, back + 0.065]]);
  // Fanlight: dark glass behind radial iron bars.
  const fan = new Shape();
  fan.moveTo(d.cx - half, d.spring);
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    fan.lineTo(d.cx + Math.cos(a) * half, d.spring + Math.sin(a) * half);
  }
  fan.lineTo(d.cx - half, d.spring);
  const glass = new ExtrudeGeometry(fan, { depth: 0.01, bevelEnabled: false, curveSegments: 4 });
  B.get('glass').add(glass, [[0, 0, back - 0.01]]);
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI - (i / 6) * Math.PI;
    const g = box(0.014, half - 0.02, 0.014);
    g.translate(0, (half - 0.02) / 2, 0);
    B.get('iron').add(g, [[d.cx, d.spring, back + 0.01], [0, 0, a - Math.PI / 2]]);
  }
  B.get('iron').add(new TorusGeometry(half * 0.42, 0.008, 6, 24, Math.PI), [[d.cx, d.spring, back + 0.01]]);
  B.get('tealDoor').add(roundBox(d.width, 0.06, 0.06, 0.01), [[d.cx, d.spring + 0.01, back + 0.01]]);
  // Step.
  B.get('dressed').add(roundBox(d.width + 0.36, 0.13, 0.42, 0.015), [[d.cx, 0.065, Z + 0.12]]);
}

/* --------------------------------------------------------------------------
   Windows and shutters
   -------------------------------------------------------------------------- */

/**
 * One louvred shutter leaf, hinged at x = 0 and reaching +x (or -x when
 * mirrored). Louvres are real slats at 35°: in raking light an open shutter
 * throws a striped shadow on the wall behind it.
 */
function shutterLeaf(B, bucket, width, height, transform, mirror = false) {
  const m = mirror ? -1 : 1;
  const frame = 0.045;
  const [pos, rot] = transform;
  const put = (geo, local) => B.get(bucket).add(geo, matrixOn(pos, rot, local));
  put(roundBox(frame, height, 0.032, 0.006), [m * (frame / 2), height / 2, 0]);
  put(roundBox(frame, height, 0.032, 0.006), [m * (width - frame / 2), height / 2, 0]);
  [frame / 2 + 0.005, height / 2, height - frame / 2 - 0.005].forEach((y) => put(roundBox(width - frame * 2, 0.05, 0.028, 0.006), [m * (width / 2), y, 0]));
  const span = width - frame * 2;
  const pitch = 0.036;
  [
    [frame + 0.03, height / 2 - 0.03],
    [height / 2 + 0.03, height - frame - 0.03]
  ].forEach(([y0, y1]) => {
    for (let y = y0 + pitch / 2; y < y1; y += pitch) {
      const slat = box(span, 0.034, 0.005);
      slat.rotateX(-0.62);
      put(slat, [m * (width / 2), y, 0]);
    }
  });
}

function windows(B) {
  const L = LAYOUT;
  // Ground floor: shutters folded back against the wall, slightly proud of it.
  [L.winA, L.winC].forEach((w) => {
    const h = w.spring - w.bottom;
    const half = w.width / 2;
    shutterLeaf(B, 'teal', half, h - 0.02, [[w.cx - half - 0.012, w.bottom + 0.01, Z + 0.035], [0, Math.PI - 0.16, 0]]);
    shutterLeaf(B, 'teal', half, h - 0.02, [[w.cx + half + 0.012, w.bottom + 0.01, Z + 0.035], [0, -Math.PI + 0.16, 0]], true);
    windowFrame(B, w);
  });
  // Upper floor: closed against the afternoon sun.
  L.upper.forEach((w) => {
    const h = w.spring - w.bottom;
    const half = w.width / 2;
    shutterLeaf(B, 'teal', half - 0.005, h - 0.02, [[w.cx - half + 0.005, w.bottom + 0.01, Z - 0.09], [0, 0, 0]]);
    shutterLeaf(B, 'teal', half - 0.005, h - 0.02, [[w.cx + half - 0.005, w.bottom + 0.01, Z - 0.09], [0, 0, 0]], true);
    fanlight(B, w, Z - 0.09);
  });
}

/** Casement frame and dark glass, set back in the reveal. */
function windowFrame(B, w) {
  const back = Z - 0.3;
  const h = w.spring - w.bottom;
  B.get('glass').add(box(w.width - 0.02, h, 0.01), [[w.cx, w.bottom + h / 2, back - 0.01]]);
  [-1, 0, 1].forEach((k) => B.get('teal').add(box(0.04, h, 0.04), [[w.cx + (k * (w.width - 0.04)) / 2, w.bottom + h / 2, back]]));
  [w.bottom + 0.02, w.bottom + h * 0.55].forEach((y) => B.get('teal').add(box(w.width, 0.035, 0.04), [[w.cx, y, back]]));
  fanlight(B, w, back);
}

function fanlight(B, w, z) {
  const half = w.width / 2;
  const s = new Shape();
  archPath(s, w.cx, w.spring - 0.001, w.width - 0.01, w.spring, { rise: half - 0.005 });
  B.get('glass').add(new ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 4 }), [[0, 0, z - 0.012]]);
  for (let i = 1; i < 5; i++) {
    const a = Math.PI - (i / 5) * Math.PI;
    const g = box(0.016, half - 0.02, 0.02);
    g.translate(0, (half - 0.02) / 2, 0);
    B.get('teal').add(g, [[w.cx, w.spring, z], [0, 0, a - Math.PI / 2]]);
  }
  B.get('teal').add(box(w.width, 0.03, 0.03), [[w.cx, w.spring, z]]);
}

/* --------------------------------------------------------------------------
   The triple arcade: marble columns, teal doors, the middle one open
   -------------------------------------------------------------------------- */
function arcade(B, extra) {
  const L = LAYOUT;
  const a = L.arcade;
  const centres = arcadeCentres();
  const height = a.spring - L.storey;

  centres.forEach((cx, i) => {
    const g = archSurround(cx, L.storey, a.open, a.spring, { band: 0.065, proud: 0.025, head: 0.02 });
    B.get('dressed').add(g, [[0, 0, Z - 0.004]]);

    const back = Z - 0.34;
    fanlight(B, { cx, width: a.open, spring: a.spring }, back);
    const half = a.open / 2;
    if (i === 1) {
      // The open door: leaves swung into the room. Through it, a lit interior.
      shutterLeaf(B, 'teal', half - 0.01, height - 0.02, [[cx - half + 0.01, L.storey + 0.01, back], [0, -1.32, 0]]);
      shutterLeaf(B, 'teal', half - 0.01, height - 0.02, [[cx + half - 0.01, L.storey + 0.01, back], [0, 1.32, 0]], true);
    } else {
      shutterLeaf(B, 'teal', half - 0.006, height - 0.02, [[cx - half + 0.006, L.storey + 0.01, back], [0, 0, 0]]);
      shutterLeaf(B, 'teal', half - 0.006, height - 0.02, [[cx + half - 0.006, L.storey + 0.01, back], [0, 0, 0]], true);
    }
  });

  // The room behind the arcade: seen through the open door, and in slivers
  // between the louvres of the closed ones. Drawn from inside (BackSide).
  const cx = centres[1];
  B.get('room').add(box(2.5, 2.4, 2.45), [[cx, L.storey + 1.2, Z - 0.45 - 1.225]]);
  extra.lights.push({ kind: 'room', pos: [cx + 0.25, L.storey + 1.7, Z - 1.5] });

  // Marble columns between the arches: base, shaft with entasis, capital.
  const column = lathe(
    [
      [0, 0],
      [0.085, 0],
      [0.085, 0.03],
      [0.072, 0.05],
      [0.078, 0.07],
      [0.06, 0.09],
      [0.058, 0.6],
      [0.054, height - 0.22],
      [0.06, height - 0.2],
      [0.058, height - 0.17],
      [0.09, height - 0.06],
      [0.098, height - 0.04],
      [0.098, height],
      [0, height]
    ],
    24
  );
  scaleLatheUV(column, 0.36 / 0.8, height / 0.8);
  [0, 1].forEach((k) => {
    const x = (centres[k] + centres[k + 1]) / 2;
    B.get('marbleCol').add(column.clone(), [[x, L.storey, Z + 0.07]]);
  });
}

/** Lathe UVs run 0..1 round and along; scale them to metres of texture. */
export function scaleLatheUV(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geometry;
}

/* --------------------------------------------------------------------------
   The balcony
   -------------------------------------------------------------------------- */
function balcony(B) {
  const L = LAYOUT;
  const b = L.balcony;
  const w = b.x1 - b.x0;
  const cx = (b.x0 + b.x1) / 2;
  B.get('dressed').add(roundBox(w, 0.15, b.depth, 0.018), [[cx, L.storey - 0.075, Z + b.depth / 2]]);
  // Corbels: an ogee bracket under each end and the middle.
  const profile = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = t * 0.52;
    const z = 0.08 + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.1))) + 0.03 * Math.sin(Math.PI * 2 * t);
    profile.push([Math.min(0.62, z), y]);
  }
  const shape = [[0, 0], ...profile, [0, 0.52]];
  [b.x0 + 0.22, cx, b.x1 - 0.22].forEach((x) => {
    const g = moulding(shape, 0.2);
    B.get('dressed').add(g, [[x - 0.1, L.storey - 0.15 - 0.52, Z]]);
  });

  // Railing.
  const top = L.storey + 0.98;
  const front = Z + b.depth - 0.04;
  const iron = B.get('iron');
  iron.add(roundBox(w - 0.06, 0.035, 0.045, 0.01), [[cx, top, front]]);
  iron.add(box(w - 0.06, 0.02, 0.02), [[cx, L.storey + 0.1, front]]);
  iron.add(box(w - 0.06, 0.014, 0.014), [[cx, top - 0.16, front]]);
  [b.x0 + 0.04, b.x1 - 0.04].forEach((x) => {
    iron.add(roundBox(0.045, 0.035, b.depth - 0.04, 0.01), [[x, top, Z + b.depth / 2 - 0.02]]);
    iron.add(box(0.02, 0.02, b.depth - 0.04), [[x, L.storey + 0.1, Z + b.depth / 2 - 0.02]]);
    iron.add(box(0.03, top - L.storey, 0.03), [[x, (top + L.storey) / 2, front]]);
  });
  const pitch = 0.1;
  for (let x = b.x0 + 0.1; x < b.x1 - 0.06; x += pitch) {
    iron.add(cylinder(0.008, 0.008, top - L.storey - 0.1, 8), [[x, L.storey + 0.05 + (top - L.storey - 0.1) / 2, front]]);
    iron.add(new TorusGeometry(0.04, 0.006, 6, 18), [[x + pitch / 2, top - 0.08, front]]);
  }
  [b.x0 + 0.04, b.x1 - 0.04].forEach((x) => {
    for (let z = Z + 0.12; z < front - 0.04; z += pitch) {
      iron.add(cylinder(0.008, 0.008, top - L.storey - 0.1, 8), [[x, L.storey + 0.05 + (top - L.storey - 0.1) / 2, z]]);
    }
  });
}

/* --------------------------------------------------------------------------
   Cornice and roof
   -------------------------------------------------------------------------- */
function cornice(B) {
  const L = LAYOUT;
  const profile = [
    [0, 0],
    [0.05, 0],
    [0.05, 0.04],
    [0.1, 0.07],
    [0.15, 0.13],
    [0.21, 0.16],
    [0.29, 0.17],
    [0.29, 0.24],
    [0, 0.24]
  ];
  const length = L.houseRight - L.houseLeft + 0.3;
  B.get('dressed').add(moulding(profile, length), [[L.houseLeft - 0.15, L.eaves, Z]]);
  // Dentils.
  for (let x = L.houseLeft - 0.08; x < L.houseRight + 0.1; x += 0.095) {
    B.get('dressed').add(box(0.045, 0.055, 0.05), [[x, L.eaves - 0.03, Z + 0.025]]);
  }
}

function roof(B) {
  const L = LAYOUT;
  const y0 = L.eaves + 0.24;
  const y1 = y0 + 1.28;
  const x0 = L.houseLeft - 0.22;
  const x1 = L.houseRight + 0.2;
  const zf = Z + 0.3;
  const zb = Z - 6.0;
  const zr = (zf + zb) / 2;
  const rx0 = x0 + (zf - zr);
  const rx1 = x1 - (zf - zr);

  const faces = [
    // front slope
    [[x0, y0, zf], [x1, y0, zf], [rx1, y1, zr], [rx0, y1, zr]],
    // left and right hips
    [[x0, y0, zb], [x0, y0, zf], [rx0, y1, zr], [rx0, y1, zr]],
    [[x1, y0, zf], [x1, y0, zb], [rx1, y1, zr], [rx1, y1, zr]]
  ];
  const pos = [];
  const uv = [];
  faces.forEach((q) => {
    // Planar UVs per face: u along the eave, v up the slope, in metres.
    const [a, b2, c, d] = q;
    const ex = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]];
    const el = Math.hypot(...ex) || 1;
    const eu = ex.map((v) => v / el);
    const project = (p) => {
      const rel = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const u = rel[0] * eu[0] + rel[1] * eu[1] + rel[2] * eu[2];
      const along = [rel[0] - eu[0] * u, rel[1] - eu[1] * u, rel[2] - eu[2] * u];
      return [u / 2.4, Math.hypot(...along) / 2.4];
    };
    [a, b2, c, a, c, d].forEach((p) => {
      pos.push(...p);
      uv.push(...project(p));
    });
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  B.get('roof').add(g);

  // Fascia, ridge and hip caps, and the round tile ends along the eave.
  B.get('woodDark').add(box(x1 - x0, 0.06, 0.03), [[(x0 + x1) / 2, y0 - 0.02, zf + 0.01]]);
  const cap = (p0, p1) => {
    const a = new Vector3(...p0);
    const b = new Vector3(...p1);
    const len = a.distanceTo(b);
    // A half-cylinder whose open side faces down, laid along the ridge or hip.
    const c = new CylinderGeometry(0.075, 0.075, len, 10, 1, false, -Math.PI / 2, Math.PI);
    const dir = b.clone().sub(a).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    // Roll about the axis so the curved side is up.
    const side = new Vector3(0, 0, 1).applyQuaternion(q);
    const roll = Math.atan2(side.clone().cross(new Vector3(0, 1, 0)).dot(dir), side.dot(new Vector3(0, 1, 0)));
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), roll));
    B.get('terracotta').add(c, new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  };
  cap([rx0, y1 + 0.02, zr], [rx1, y1 + 0.02, zr]);
  cap([x0, y0 + 0.02, zf], [rx0, y1 + 0.02, zr]);
  cap([x1, y0 + 0.02, zf], [rx1, y1 + 0.02, zr]);
  for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.2) {
    const end = new CylinderGeometry(0.052, 0.058, 0.11, 10, 1, false, 0, Math.PI);
    B.get('terracotta').add(end, [[x, y0 + 0.012, zf + 0.02], [Math.PI / 2 - 0.42, 0, Math.PI / 2]]);
  }
}

/* --------------------------------------------------------------------------
   The pergola over the teacher's corner
   -------------------------------------------------------------------------- */
function pergola(B) {
  const p = LAYOUT.pergola;
  const wood = B.get('wood');
  const woodH = B.get('woodH');
  const beam = p.y - 0.04;
  wood.add(roundBox(0.12, beam, 0.12, 0.012), [[p.x0, beam / 2, p.z1]]);
  // Post base.
  B.get('dressed').add(roundBox(0.2, 0.08, 0.2, 0.012), [[p.x0, 0.04, p.z1]]);
  woodH.add(roundBox(0.1, 0.16, p.z1 - p.z0 + 0.12, 0.012), [[p.x0, beam, (p.z0 + p.z1) / 2 + 0.06]]);
  woodH.add(roundBox(p.x1 - p.x0 + 0.14, 0.16, 0.1, 0.012), [[(p.x0 + p.x1) / 2 + 0.05, beam, p.z1]]);
  woodH.add(roundBox(p.x1 - p.x0, 0.12, 0.08, 0.01), [[(p.x0 + p.x1) / 2, beam, p.z0 + 0.04]]);
  // Knee braces.
  [
    [[p.x0, beam - 0.28, p.z1 - 0.2], [0.7, 0, 0]],
    [[p.x0 + 0.2, beam - 0.28, p.z1], [0, 0, -0.7]]
  ].forEach(([pos, rot]) => wood.add(roundBox(0.06, 0.5, 0.06, 0.008), [pos, rot]));
  // Rafters: what the vine climbs on, and what throws the striped shade.
  for (let z = p.z0 + 0.18; z < p.z1 - 0.05; z += 0.3) {
    woodH.add(roundBox(p.x1 - p.x0 + 0.3, 0.07, 0.05, 0.008), [[(p.x0 + p.x1) / 2 - 0.05, beam + 0.115, z]]);
  }
}

/* --------------------------------------------------------------------------
   What lies beyond: the lane through the gate, neighbouring houses
   -------------------------------------------------------------------------- */
function lane(B) {
  const g = LAYOUT.gate;
  B.get('paver').add(box(2.6, 0.1, 4.2), [[g.cx, -0.05, Z - 2.5]]);
  B.get('stone').add(box(0.4, 3.6, 3.8), [[g.cx - 1.15, 1.8, Z - 2.3]]);
  B.get('stone').add(box(0.4, 3.6, 3.8), [[g.cx + 1.15, 1.8, Z - 2.3]]);
  const far = wallWithOpenings(g.cx - 1.6, g.cx + 1.6, 0, 4.4, 0.3, [{ type: 'arch', cx: g.cx + 0.25, bottom: 0, width: 0.9, spring: 1.5 }]);
  B.get('stone').add(far, [[0, 0, Z - 4.1]]);
  B.get('interior').add(box(1.0, 2.2, 0.05), [[g.cx + 0.25, 1.1, Z - 4.45]]);
  surround(B, g.cx + 0.25, 0, 0.9, 1.5, { band: 0.1 });
}

function neighbours(B) {
  // Pale houses beyond the garden wall: they give the sky above the wall a
  // middle distance, so the courtyard sits in a town and not on a stage.
  const r = rng(77);
  [
    [-7.2, 5.2, -11.5, 4.2],
    [-3.6, 4.6, -13.2, 3.6],
    [-10.4, 6.4, -15.0, 4.4],
    [-1.2, 9.4, -16.0, 3.0]
  ].forEach(([x, h, z, w]) => {
    B.get('far').add(box(w, h, 3), [[x, h / 2, z]]);
    const roofG = new CylinderGeometry(0.01, w * 0.72, 1.1, 4, 1);
    roofG.rotateY(Math.PI / 4);
    B.get('farRoof').add(roofG, [[x, h + 0.55, z], [0, r.signed(0.05), 0], [1, 1, 3 / w]]);
  });
}
