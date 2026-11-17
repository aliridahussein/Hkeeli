/**
 * Hkeeli courtyard — the things people use.
 *
 * The café table is the closest the camera ever comes, so it carries the most
 * care: cups lathed with a real wall (the rim shows its thickness), a glazed
 * band, coffee with a crema ring, saucers with a foot, a brass rakweh on a
 * tray, a menu card standing on its fold, a bud vase with a sprig of jasmine.
 *
 * Further back: the telephone on the balcony — the family line, a rotary set
 * with a coiled cord — and the teacher's corner under the vine: desk, open
 * notebook, books, lamp, a slate on an easel, and the Hkeeli sign.
 */

import {
  CatmullRomCurve3,
  CircleGeometry,
  ExtrudeGeometry,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3
} from '../../../vendor/three/three-hkeeli.min.js';
import { roundBox, box, lathe, cylinder, matrix } from './geometry.js';
import { LAYOUT, scaleLatheUV } from './architecture.js';

export const TABLE = { x: -1.3, z: 2.2, top: 0.76, radius: 0.37 };
export const DESK = { x: 3.35, z: -3.05, top: 0.775 };
export const PHONE_TABLE = { x: 2.38, z: -3.5, y: LAYOUT.storey };

/** World placement of a local offset on something rotated about Y. */
function at(origin, yaw, local) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [origin[0] + local[0] * c + local[2] * s, origin[1] + local[1], origin[2] - local[0] * s + local[2] * c];
}

function lathed(points, segments, metres, bucket, B, transform) {
  const g = lathe(points, segments);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const radius = Math.max(...points.map((p) => p[0]));
  scaleLatheUV(g, (Math.PI * 2 * radius) / metres, length / metres);
  B.get(bucket).add(g, transform);
}

/**
 * @param {object} B      bucket registry
 * @param {object} lib    material library
 * @param {object} extra  collectors: blobs, lights, meshes, steam, cloth, pots
 */
export function buildProps(B, lib, extra) {
  cafe(B, lib, extra);
  balconyCorner(B, lib, extra);
  teacherCorner(B, lib, extra);
  courtyardThings(B, lib, extra);
}

/* --------------------------------------------------------------------------
   Chairs: wooden frame, rush seat — the Lebanese café chair
   -------------------------------------------------------------------------- */
export function chair(B, extra, origin, yaw, { finish = 'wood', seat = 0.45, back = 0.9 } = {}) {
  const w = 0.42;
  const d = 0.4;
  const put = (bucket, geo, local) => B.get(bucket).add(geo, [at(origin, yaw, local), [0, yaw, 0]]);
  const legX = w / 2 - 0.025;
  const legZ = d / 2 - 0.025;
  [-1, 1].forEach((sx) => {
    put(finish, cylinder(0.016, 0.018, seat, 10), [sx * legX, seat / 2, legZ]);
    put(finish, cylinder(0.016, 0.018, back, 10), [sx * legX, back / 2, -legZ]);
    put(finish, cylinder(0.009, 0.009, d - 0.05, 8).rotateX(Math.PI / 2), [sx * legX, 0.16, 0]);
  });
  put(finish, cylinder(0.009, 0.009, w - 0.05, 8).rotateZ(Math.PI / 2), [0, 0.21, legZ]);
  put(finish, cylinder(0.009, 0.009, w - 0.05, 8).rotateZ(Math.PI / 2), [0, 0.13, -legZ]);
  // Seat frame and the rush seat inside it.
  put(finish, roundBox(w, 0.035, 0.035, 0.008), [0, seat - 0.018, legZ]);
  put(finish, roundBox(w, 0.035, 0.035, 0.008), [0, seat - 0.018, -legZ]);
  put(finish, roundBox(0.035, 0.035, d, 0.008), [-legX, seat - 0.018, 0]);
  put(finish, roundBox(0.035, 0.035, d, 0.008), [legX, seat - 0.018, 0]);
  put('rush', roundBox(w - 0.05, 0.03, d - 0.05, 0.012), [0, seat - 0.008, 0]);
  // Back rails.
  [0.2, 0.31, 0.42].forEach((dy, i) => put(finish, roundBox(w - 0.04, i === 2 ? 0.06 : 0.035, 0.02, 0.008), [0, seat + dy, -legZ]));
  extra.blobs.push({ x: origin[0], y: origin[1] + 0.002, z: origin[2], rx: 0.36, rz: 0.34, a: 0.42 });
}

/* --------------------------------------------------------------------------
   The café table
   -------------------------------------------------------------------------- */
function cafe(B, lib, extra) {
  const T = TABLE;
  // Marble top with a rounded, polished edge.
  const edge = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    edge.push([T.radius - 0.012 + Math.cos(a) * 0.014, T.top - 0.016 + Math.sin(a) * 0.016]);
  }
  const top = lathe([[0, T.top - 0.032], ...edge, [0, T.top]], 64);
  B.get('marble').add(top, [[T.x, 0, T.z]]);

  // Cast-iron pedestal: column, collar, three feet.
  const base = lathe(
    [
      [0, 0.02],
      [0.05, 0.02],
      [0.045, 0.05],
      [0.028, 0.09],
      [0.024, 0.2],
      [0.03, 0.24],
      [0.022, 0.28],
      [0.02, T.top - 0.12],
      [0.03, T.top - 0.09],
      [0.06, T.top - 0.05],
      [0.11, T.top - 0.035],
      [0, T.top - 0.035]
    ],
    24
  );
  B.get('iron').add(base, [[T.x, 0, T.z]]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const foot = new TubeGeometry(
      new CatmullRomCurve3([new Vector3(0, 0.07, 0), new Vector3(0.12, 0.045, 0), new Vector3(0.24, 0.022, 0), new Vector3(0.28, 0.015, 0)]),
      12,
      0.013,
      6
    );
    B.get('iron').add(foot, [[T.x, 0, T.z], [0, a, 0]]);
    B.get('iron').add(cylinder(0.022, 0.026, 0.014, 12), [at([T.x, 0, T.z], a, [0.28, 0.007, 0])]);
  }
  extra.blobs.push({ x: T.x, y: 0.002, z: T.z, rx: 0.62, rz: 0.62, a: 0.38 });

  // The empty chair across from you, pulled out a little; the waiter stands
  // behind it. Your own chair is part of the story (scene/story.js): it is
  // there until you sit in it, and you don't see a chair you're sitting on.
  chair(B, extra, [T.x + 0.6, 0, T.z + 0.32], -Math.PI / 2 + 0.32);

  // A sprig of jasmine. The menu lies in front of your seat (story.js, so you
  // can pick it up); everything else — coffee, manoushe, the bill — arrives
  // because you asked for it.
  budVase(B, extra, [T.x + 0.13, T.top, T.z - 0.25]);
}

/** Your chair, at the café table: the story shows it, and fades it as you sit. */
export const VISITOR_CHAIR = { pos: [TABLE.x - 0.6, 0, TABLE.z - 0.12], yaw: Math.PI / 2 + 0.22 };

/**
 * Where things sit on the café table (see scene/story.js), as you see them
 * from your seat: the menu at your left hand, the coffee in front of you, the
 * slip and later the bill at your right, the manoushe beyond the coffee.
 * Each is within the waiter's reach when he bows across from the far side.
 */
export const SPOTS = {
  menu: [TABLE.x - 0.2, TABLE.top, TABLE.z - 0.1],
  tray: [TABLE.x - 0.04, TABLE.top, TABLE.z + 0.06],
  plate: [TABLE.x + 0.1, TABLE.top, TABLE.z - 0.12],
  slip: [TABLE.x + 0.0, TABLE.top, TABLE.z + 0.25],
  bill: [TABLE.x + 0.12, TABLE.top, TABLE.z + 0.22]
};

export function cupAndSaucer(B, extra, pos, yaw) {
  const [x, y, z] = pos;
  // Saucer: foot ring, well, rim — with thickness.
  lathed(
    [
      [0, 0.001],
      [0.035, 0.001],
      [0.037, 0.004],
      [0.04, 0.004],
      [0.05, 0.006],
      [0.064, 0.012],
      [0.072, 0.016],
      [0.073, 0.0185],
      [0.0705, 0.0185],
      [0.062, 0.015],
      [0.046, 0.01],
      [0.03, 0.0085],
      [0, 0.0085]
    ],
    48,
    0.4,
    'ceramic',
    B,
    [[x, y, z]]
  );
  const cy = y + 0.0085;
  // Cup: outer wall up to the rim, a rounded lip, the inner wall down.
  lathed(
    [
      [0, 0.0],
      [0.019, 0.0],
      [0.021, 0.003],
      [0.024, 0.004],
      [0.029, 0.012],
      [0.034, 0.028],
      [0.0365, 0.046],
      [0.0375, 0.058],
      [0.038, 0.0605],
      [0.0365, 0.0618],
      [0.035, 0.0605],
      [0.0345, 0.05],
      [0.032, 0.03],
      [0.027, 0.014],
      [0.02, 0.009],
      [0, 0.008]
    ],
    48,
    0.4,
    'ceramic',
    B,
    [[x, cy, z]]
  );
  // The glazed band, a hair proud of the wall.
  lathed(
    [
      [0.03662, 0.0465],
      [0.0368, 0.0485],
      [0.0371, 0.0515],
      [0.03725, 0.0535]
    ],
    48,
    0.4,
    'ceramicTeal',
    B,
    [[x, cy, z]]
  );
  // Handle: most of a torus, stood upright on the cup's side.
  const handle = new TorusGeometry(0.0145, 0.0036, 8, 20, Math.PI * 1.25);
  handle.rotateZ(-Math.PI * 0.62);
  B.get('ceramic').add(handle, [at([x, cy, z], yaw, [0.0405, 0.032, 0]), [Math.PI / 2, yaw, 0]]);
  // Coffee and its crema ring.
  B.get('coffee').add(new CircleGeometry(0.0335, 40).rotateX(-Math.PI / 2), [[x, cy + 0.049, z]]);
  B.get('crema').add(new RingGeometry(0.0285, 0.0338, 40).rotateX(-Math.PI / 2), [[x, cy + 0.0492, z]]);
  extra.blobs.push({ x, y: y + 0.0008, z, rx: 0.17, rz: 0.17, a: 0.5 });
  extra.steam.push([x, cy + 0.06, z]);
}

export function rakweh(B, extra, pos) {
  const [x, y, z] = pos;
  // Tray.
  lathed(
    [
      [0, 0.001],
      [0.118, 0.001],
      [0.124, 0.006],
      [0.128, 0.014],
      [0.124, 0.014],
      [0.118, 0.006],
      [0, 0.0045]
    ],
    48,
    0.5,
    'brass',
    B,
    [[x, y, z]]
  );
  const by = y + 0.0045;
  // Body: round belly, pinched waist, flared mouth.
  lathed(
    [
      [0, 0],
      [0.042, 0],
      [0.05, 0.008],
      [0.054, 0.025],
      [0.05, 0.045],
      [0.04, 0.065],
      [0.034, 0.082],
      [0.036, 0.094],
      [0.044, 0.104],
      [0.046, 0.108],
      [0.042, 0.106],
      [0.033, 0.098],
      [0, 0.096]
    ],
    40,
    0.5,
    'brass',
    B,
    [[x, by, z]]
  );
  // The long handle, rising gently away from the pot.
  const yaw = 2.6;
  const handle = new TubeGeometry(
    new CatmullRomCurve3([new Vector3(0.03, 0.085, 0), new Vector3(0.09, 0.1, 0), new Vector3(0.17, 0.12, 0), new Vector3(0.24, 0.135, 0)]),
    16,
    0.0055,
    8
  );
  B.get('brassDark').add(handle, [[x, by, z], [0, yaw, 0]]);
  B.get('woodDark').add(cylinder(0.0085, 0.0075, 0.07, 10).rotateZ(Math.PI / 2 - 0.12), [at([x, by, z], yaw, [0.265, 0.139, 0]), [0, yaw, 0]]);
  extra.blobs.push({ x, y: y + 0.0008, z, rx: 0.3, rz: 0.3, a: 0.45 });
}

function budVase(B, extra, pos) {
  const [x, y, z] = pos;
  lathed(
    [
      [0, 0],
      [0.018, 0],
      [0.024, 0.012],
      [0.026, 0.03],
      [0.018, 0.058],
      [0.011, 0.072],
      [0.013, 0.08],
      [0.0095, 0.08],
      [0.008, 0.07],
      [0, 0.068]
    ],
    32,
    0.3,
    'ceramicTeal',
    B,
    [[x, y, z]]
  );
  extra.sprigs.push({ pos: [x, y + 0.072, z] });
  extra.blobs.push({ x, y: y + 0.0008, z, rx: 0.07, rz: 0.07, a: 0.45 });
}

/* --------------------------------------------------------------------------
   The balcony: the family telephone
   -------------------------------------------------------------------------- */
function balconyCorner(B, lib, extra) {
  const P = PHONE_TABLE;
  // A small round table: iron legs, marble top, a linen doily.
  const top = P.y + 0.64;
  B.get('marble').add(lathe([[0, top - 0.025], [0.2, top - 0.025], [0.205, top - 0.012], [0.2, top], [0, top]], 40), [[P.x, 0, P.z]]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    B.get('iron').add(cylinder(0.009, 0.011, 0.64, 8), [at([P.x, P.y, P.z], a, [0.13, 0.31, 0]), [0, a, 0.2]]);
  }
  B.get('iron').add(new TorusGeometry(0.1, 0.006, 6, 24).rotateX(Math.PI / 2), [[P.x, P.y + 0.22, P.z]]);
  B.get('linen').add(new CircleGeometry(0.15, 32).rotateX(-Math.PI / 2), [[P.x, top + 0.001, P.z]]);
  extra.blobs.push({ x: P.x, y: P.y + 0.003, z: P.z, rx: 0.48, rz: 0.48, a: 0.35 });

  phone(B, extra, [P.x, top + 0.002, P.z], 0.35);
  chair(B, extra, [P.x - 0.55, P.y, P.z - 0.05], 0.55, { finish: 'teal' });
}

function phone(B, extra, pos, yaw) {
  // The body, from its side profile: sloped front for the dial, flat top for
  // the cradle.
  const s = new Shape();
  s.moveTo(-0.1, 0);
  s.lineTo(0.1, 0);
  s.lineTo(0.098, 0.012);
  s.lineTo(0.05, 0.085);
  s.lineTo(-0.04, 0.092);
  s.lineTo(-0.094, 0.05);
  s.lineTo(-0.1, 0.012);
  s.lineTo(-0.1, 0);
  const body = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
  body.translate(0, 0, -0.08);
  body.rotateY(-Math.PI / 2);
  B.get('bakelite').add(body, [pos, [0, yaw, 0]]);

  // Dial on the sloped front, square to it. The face runs from (z 0.098,
  // y 0.012) up to (z 0.05, y 0.085); its outward normal is n, its upward
  // direction in the face is t. A cylinder stands along +y, so tipping it by
  // `tip` about x lays its axis along n.
  const n = [0, 0.549, 0.835];
  const t = [0, 0.835, -0.549];
  const tip = Math.atan2(n[2], n[1]);
  const centre = [0, 0.0485 + n[1] * 0.012, 0.074 + n[2] * 0.012];
  const onFace = (u, v, lift) => [u, centre[1] + t[1] * v + n[1] * lift, centre[2] + t[2] * v + n[2] * lift];
  const dial = cylinder(0.045, 0.045, 0.007, 36);
  dial.rotateX(tip);
  B.get('ceramic').add(dial, [at(pos, yaw, centre), [0, yaw, 0]]);
  const hub = cylinder(0.016, 0.016, 0.011, 24);
  hub.rotateX(tip);
  B.get('bakelite').add(hub, [at(pos, yaw, onFace(0, 0, 0.003)), [0, yaw, 0]]);
  for (let k = 0; k < 10; k++) {
    const a = 0.5 + (k / 12) * Math.PI * 2;
    const hole = cylinder(0.0062, 0.0062, 0.003, 12);
    hole.rotateX(tip);
    B.get('rubber').add(hole, [at(pos, yaw, onFace(Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0.0034)), [0, yaw, 0]]);
  }

  // Cradle prongs and the handset resting across them.
  [-0.055, 0.055].forEach((dx) => B.get('bakelite').add(roundBox(0.02, 0.03, 0.03, 0.008), [at(pos, yaw, [dx, 0.1, -0.012]), [0, yaw, 0]]));
  const hy = 0.128;
  const handset = new TubeGeometry(
    new CatmullRomCurve3([new Vector3(-0.1, hy - 0.01, -0.012), new Vector3(-0.05, hy + 0.006, -0.012), new Vector3(0.05, hy + 0.006, -0.012), new Vector3(0.1, hy - 0.01, -0.012)]),
    20,
    0.012,
    10
  );
  B.get('bakelite').add(handset, [pos, [0, yaw, 0]]);
  [-0.105, 0.105].forEach((dx) => {
    const cup = cylinder(0.026, 0.018, 0.03, 20);
    B.get('bakelite').add(cup, [at(pos, yaw, [dx, hy - 0.026, -0.012]), [0, yaw, 0]]);
  });

  // The coiled cord, from the handset down to the body.
  const pts = [];
  const coils = 18;
  for (let i = 0; i <= coils * 10; i++) {
    const t = i / (coils * 10);
    const base = [-0.112 + t * 0.006 - Math.sin(t * Math.PI) * 0.035, hy - 0.04 - t * 0.075 + Math.sin(t * Math.PI) * -0.012, -0.012 + t * 0.03 + Math.sin(t * Math.PI) * 0.03];
    const a = t * coils * Math.PI * 2;
    pts.push(new Vector3(base[0] + Math.cos(a) * 0.006, base[1] + Math.sin(a) * 0.006, base[2] + Math.sin(a) * 0.004));
  }
  const cord = new TubeGeometry(new CatmullRomCurve3(pts), coils * 10, 0.0022, 5);
  B.get('rubber').add(cord, [pos, [0, yaw, 0]]);
  // And the line itself, away through the open door.
  const line = new TubeGeometry(
    new CatmullRomCurve3([
      new Vector3(0, 0.01, -0.09),
      new Vector3(0, -0.3, -0.16),
      new Vector3(-0.15, -0.6, -0.25),
      new Vector3(-0.6, -0.63, -0.3),
      new Vector3(-0.95, -0.635, -0.6)
    ]),
    40,
    0.0028,
    5
  );
  B.get('rubber').add(line, [pos, [0, yaw, 0]]);
  extra.blobs.push({ x: pos[0], y: pos[1] + 0.0008, z: pos[2], rx: 0.3, rz: 0.26, a: 0.45 });
}

/* --------------------------------------------------------------------------
   The teacher's corner
   -------------------------------------------------------------------------- */
function teacherCorner(B, lib, extra) {
  const D = DESK;
  const top = D.top;
  // Desk: top with a rounded edge, apron, four tapered legs.
  B.get('wood').add(roundBox(1.15, 0.035, 0.62, 0.012), [[D.x, top - 0.0175, D.z]]);
  B.get('wood').add(roundBox(1.05, 0.09, 0.52, 0.008), [[D.x, top - 0.08, D.z]]);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => B.get('wood').add(cylinder(0.022, 0.016, top - 0.04, 10), [[D.x + sx * 0.52, (top - 0.04) / 2, D.z + sz * 0.25]]))
  );
  extra.blobs.push({ x: D.x, y: 0.012, z: D.z, rx: 1.4, rz: 0.85, a: 0.35 });

  chair(B, extra, [D.x - 0.05, 0.012, D.z - 0.55], 0.06);
  // The second chair, pulled out and turned towards the courtyard: there is
  // room at this desk for you.
  chair(B, extra, [D.x - 0.4, 0.012, D.z + 0.66], Math.PI + 0.95);

  // Open notebook: card cover, page block, and pages that bow at the spine.
  const nb = [D.x - 0.08, top, D.z + 0.06];
  B.get('tealDoor').add(roundBox(0.45, 0.006, 0.31, 0.003), [[nb[0], top + 0.003, nb[2]], [0, 0.12, 0]]);
  B.get('page').add(box(0.42, 0.01, 0.285), [[nb[0], top + 0.011, nb[2]], [0, 0.12, 0]]);
  const pages = new PlaneGeometry(0.42, 0.285, 24, 1);
  pages.rotateX(-Math.PI / 2);
  const pp = pages.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const px = pp.getX(i) / 0.21;
    pp.setY(i, Math.abs(px) * 0.004 + (1 - Math.abs(px)) * -0.002 + Math.pow(Math.abs(px), 3) * 0.004);
  }
  pages.computeVertexNormals();
  const pageMesh = new Mesh(pages, lib.mat.notebook);
  pageMesh.applyMatrix4(matrix([nb[0], top + 0.0175, nb[2]], [0, 0.12, 0]));
  pageMesh.receiveShadow = true;
  extra.meshes.push(pageMesh);
  extra.blobs.push({ x: nb[0], y: top + 0.0008, z: nb[2], rx: 0.6, rz: 0.42, a: 0.35 });
  // Pen across the right-hand page.
  B.get('tealDoor').add(cylinder(0.0048, 0.0048, 0.14, 10).rotateZ(Math.PI / 2), [[nb[0] + 0.1, top + 0.023, nb[2] + 0.05], [0, 0.7, 0]]);
  B.get('brass').add(cylinder(0.0052, 0.0052, 0.03, 10).rotateZ(Math.PI / 2), [[nb[0] + 0.155, top + 0.023, nb[2] + 0.002], [0, 0.7, 0]]);

  // A stack of books: cloth covers, cream page blocks.
  const stack = [
    ['bookTeal', 0.26, 0.04, 0.19, 0.05],
    ['bookCitrus', 0.24, 0.035, 0.175, -0.08],
    ['bookCream', 0.22, 0.032, 0.16, 0.16]
  ];
  let sy = top;
  stack.forEach(([bucket, w, h, d, rot]) => {
    const p = [D.x + 0.36, sy + h / 2, D.z - 0.12];
    B.get(bucket).add(roundBox(w, h, d, 0.004), [p, [0, rot, 0]]);
    B.get('page').add(box(w - 0.01, h - 0.008, d - 0.006), [[p[0] + Math.cos(rot) * 0.006, p[1], p[2] - Math.sin(rot) * 0.006], [0, rot, 0]]);
    sy += h;
  });
  extra.blobs.push({ x: D.x + 0.36, y: top + 0.0008, z: D.z - 0.12, rx: 0.36, rz: 0.28, a: 0.45 });

  // Mug.
  const mug = [D.x + 0.27, top, D.z + 0.17];
  lathed(
    [
      [0, 0],
      [0.034, 0],
      [0.037, 0.004],
      [0.039, 0.05],
      [0.04, 0.09],
      [0.0405, 0.093],
      [0.037, 0.093],
      [0.0355, 0.06],
      [0.034, 0.012],
      [0, 0.01]
    ],
    40,
    0.35,
    'ceramicCitrus',
    B,
    [mug]
  );
  B.get('ceramicCitrus').add(new TorusGeometry(0.022, 0.006, 8, 18, Math.PI * 1.2).rotateZ(-Math.PI * 0.6), [[mug[0] + 0.044, mug[1] + 0.047, mug[2]], [Math.PI / 2, 0.3, 0]]);
  extra.blobs.push({ x: mug[0], y: top + 0.0008, z: mug[2], rx: 0.13, rz: 0.13, a: 0.5 });

  // Desk lamp: brass base and arm, a cream shade with a warm bulb.
  const lamp = [D.x - 0.43, top, D.z - 0.14];
  lathed([[0, 0], [0.075, 0], [0.078, 0.008], [0.06, 0.02], [0.012, 0.026], [0, 0.026]], 32, 0.4, 'brass', B, [lamp]);
  B.get('brass').add(cylinder(0.008, 0.008, 0.36, 10), [[lamp[0], top + 0.2, lamp[2]], [0, 0, -0.18]]);
  B.get('brass').add(cylinder(0.007, 0.007, 0.25, 10), [[lamp[0] + 0.14, top + 0.42, lamp[2]], [0, 0, -1.05]]);
  const shadeAt = [lamp[0] + 0.25, top + 0.44, lamp[2]];
  const shade = lathe([[0.03, 0.07], [0.05, 0.04], [0.085, 0], [0.083, -0.004], [0.048, 0.036], [0.028, 0.066]], 32);
  const shadeMesh = new Mesh(shade, lib.mat.shade);
  shadeMesh.applyMatrix4(matrix([shadeAt[0], shadeAt[1] - 0.06, shadeAt[2]], [0, 0, 0.35]));
  shadeMesh.castShadow = true;
  extra.meshes.push(shadeMesh);
  const bulb = new Mesh(new SphereGeometry(0.022, 16, 12), lib.mat.bulb);
  bulb.position.set(shadeAt[0] - 0.012, shadeAt[1] - 0.04, shadeAt[2]);
  extra.meshes.push(bulb);
  extra.lights.push({ kind: 'lamp', pos: [shadeAt[0] - 0.02, shadeAt[1] - 0.09, shadeAt[2]] });
  extra.blobs.push({ x: lamp[0], y: top + 0.0008, z: lamp[2], rx: 0.2, rz: 0.2, a: 0.5 });

  // The slate on its easel, turned to whoever walks over.
  const easel = [2.66, 0.012, -2.42];
  const yaw = -0.12;
  const put = (bucket, geo, local, rot = [0, 0, 0]) => B.get(bucket).add(geo, [at(easel, yaw, local), [rot[0], yaw + rot[1], rot[2]]]);
  put('wood', roundBox(0.035, 1.42, 0.03, 0.006), [-0.2, 0.7, 0.04], [-0.14, 0, 0.08]);
  put('wood', roundBox(0.035, 1.42, 0.03, 0.006), [0.2, 0.7, 0.04], [-0.14, 0, -0.08]);
  put('wood', roundBox(0.03, 1.38, 0.03, 0.006), [0, 0.66, -0.2], [0.3, 0, 0]);
  put('wood', roundBox(0.52, 0.035, 0.05, 0.006), [0, 0.86, 0.0], [-0.14, 0, 0]);
  put('wood', roundBox(0.5, 0.39, 0.025, 0.008), [0, 1.08, -0.03], [-0.14, 0, 0]);
  const slate = new Mesh(new PlaneGeometry(0.44, 0.33), lib.mat.slate);
  slate.applyMatrix4(matrix(at(easel, yaw, [0, 1.08, -0.016]), [-0.14, yaw, 0]));
  slate.receiveShadow = true;
  extra.meshes.push(slate);
  extra.blobs.push({ x: easel[0], y: 0.014, z: easel[2], rx: 0.6, rz: 0.5, a: 0.32 });

  // The Hkeeli sign on the wing wall.
  const signAt = [LAYOUT.wingInner - 0.012, 1.86, -2.35];
  B.get('tealDoor').add(roundBox(0.025, 0.42, 0.345, 0.006), [[signAt[0] + 0.004, signAt[1], signAt[2]]]);
  const sign = new Mesh(new PlaneGeometry(0.32, 0.4), lib.mat.sign);
  sign.applyMatrix4(matrix([signAt[0] - 0.01, signAt[1], signAt[2]], [0, -Math.PI / 2, 0]));
  sign.receiveShadow = true;
  extra.meshes.push(sign);
}

/* --------------------------------------------------------------------------
   Around the courtyard: plaque, lantern, jars, pots
   -------------------------------------------------------------------------- */
function courtyardThings(B, lib, extra) {
  const Z = LAYOUT.backZ;
  // The welcome plaque beside the gate: glazed tile on a stone wall.
  const plaqueAt = [-1.42, 1.56, Z + 0.016];
  B.get('ceramic').add(roundBox(0.39, 0.2, 0.016, 0.005), [[plaqueAt[0], plaqueAt[1], Z + 0.006]]);
  const plaque = new Mesh(new PlaneGeometry(0.36, 0.169), lib.mat.plaque);
  plaque.position.set(...plaqueAt);
  plaque.receiveShadow = true;
  extra.meshes.push(plaque);

  // Wall lantern beside the front door.
  const lx = LAYOUT.door.cx + LAYOUT.door.width / 2 + 0.32;
  const ly = 2.34;
  B.get('iron').add(roundBox(0.03, 0.16, 0.02, 0.004), [[lx, ly + 0.06, Z + 0.01]]);
  B.get('iron').add(box(0.016, 0.016, 0.2), [[lx, ly + 0.12, Z + 0.1]]);
  B.get('iron').add(new TorusGeometry(0.07, 0.006, 6, 16, Math.PI / 2), [[lx, ly + 0.05, Z + 0.06], [0, Math.PI / 2, Math.PI]]);
  const lanternAt = [lx, ly - 0.06, Z + 0.2];
  B.get('lantern').add(cylinder(0.055, 0.045, 0.16, 6), [lanternAt]);
  B.get('iron').add(cylinder(0.012, 0.075, 0.06, 6), [[lanternAt[0], lanternAt[1] + 0.11, lanternAt[2]]]);
  B.get('iron').add(new SphereGeometry(0.013, 8, 6), [[lanternAt[0], lanternAt[1] + 0.15, lanternAt[2]]]);
  B.get('iron').add(cylinder(0.048, 0.04, 0.02, 6), [[lanternAt[0], lanternAt[1] - 0.09, lanternAt[2]]]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    B.get('iron').add(box(0.008, 0.165, 0.008), [[lanternAt[0] + Math.cos(a) * 0.051, lanternAt[1], lanternAt[2] + Math.sin(a) * 0.051]]);
  }

  // Water jars in the shaded corner by the gate.
  jar(B, extra, [-3.86, 0, -3.42], 1);
  jar(B, extra, [-3.42, 0, -3.66], 0.62);

  // Pots: where plants stand. Their plants are grown in plants.js.
  const pots = [
    { id: 'lemon', pos: [-3.45, 0, -1.35], h: 0.62, r: 0.36 },
    { id: 'geranium-front', pos: [1.78, 0, 3.4], h: 0.4, r: 0.23 },
    { id: 'geranium-front-2', pos: [2.22, 0, 2.9], h: 0.3, r: 0.17 },
    { id: 'geranium-gate', pos: [-1.72, 0, -3.62], h: 0.34, r: 0.19 },
    { id: 'geranium-wall', pos: [-4.0, 0, -0.55], h: 0.32, r: 0.18 },
    { id: 'basil-door', pos: [0.58, 0, -3.66], h: 0.3, r: 0.16 },
    { id: 'geranium-balcony-1', pos: [0.32, LAYOUT.storey, -3.28], h: 0.28, r: 0.16 },
    { id: 'geranium-balcony-2', pos: [0.82, LAYOUT.storey, -3.32], h: 0.24, r: 0.14 },
    { id: 'basil-desk', pos: [DESK.x - 0.45, DESK.top, DESK.z + 0.2], h: 0.09, r: 0.055 }
  ];
  pots.forEach((p) => {
    pot(B, extra, p);
    extra.pots.push(p);
  });
}

function jar(B, extra, pos, s) {
  lathed(
    [
      [0, 0],
      [0.13 * s, 0],
      [0.2 * s, 0.06 * s],
      [0.29 * s, 0.24 * s],
      [0.3 * s, 0.36 * s],
      [0.26 * s, 0.52 * s],
      [0.15 * s, 0.66 * s],
      [0.1 * s, 0.71 * s],
      [0.1 * s, 0.76 * s],
      [0.125 * s, 0.78 * s],
      [0.12 * s, 0.8 * s],
      [0.085 * s, 0.8 * s],
      [0.08 * s, 0.72 * s],
      [0, 0.7 * s]
    ],
    40,
    0.9,
    'terracotta',
    B,
    [pos]
  );
  extra.blobs.push({ x: pos[0], y: pos[1] + 0.002, z: pos[2], rx: 0.85 * s, rz: 0.85 * s, a: 0.45 });
}

function pot(B, extra, { pos, h, r }) {
  const [x, y, z] = pos;
  const lip = Math.max(0.012, r * 0.09);
  lathed(
    [
      [0, 0],
      [r * 0.68, 0],
      [r * 0.7, h * 0.03],
      [r * 0.92, h * 0.82],
      [r * 0.95, h * 0.84],
      [r + lip * 0.4, h * 0.86],
      [r + lip * 0.5, h],
      [r - lip * 0.6, h],
      [r - lip * 0.8, h * 0.9],
      [r * 0.84, h * 0.82],
      [0, h * 0.8]
    ],
    40,
    0.9,
    'terracotta',
    B,
    [[x, y, z]]
  );
  B.get('soil').add(new CircleGeometry(r * 0.86, 24).rotateX(-Math.PI / 2), [[x, y + h * 0.86, z]]);
  extra.blobs.push({ x, y: y + 0.002, z, rx: r * 3.2, rz: r * 3.2, a: 0.42 });
}

