/**
 * Hkeeli courtyard — the café story, as the scene plays it.
 *
 * The conversation (js/courtyard/cafe-story.js) says what happens; this module
 * makes it happen at the table. You pick up the menu while the waiter asks
 * what you'd like; you hand it to him, he writes your order on his pad and
 * leaves the slip by your hand; he brings the coffee you chose, a manoushe if
 * you asked for one, and the bill when you ask for it, taking the slip away.
 * You leave the money on the saucer; he waves you off.
 *
 * ## One event at a time, never a queue
 *
 * `play(event)` runs one choreographed event: a list of timed segments that
 * move the waiter's body and hand, carry a prop, and set it down at its spot.
 * If an event is still running when the next arrives, the running one is
 * finished instantly (its prop lands where it was going) and the new one
 * starts from there. Nothing can arrive twice; `reset()` puts the table back
 * to how it was before you sat down.
 *
 * `gesture(name)` is the waiter's body language as he speaks: hand on heart
 * for "ahla w sahla", an open hand for a question, a hand towards the coffee
 * for "tfaddal", a nod. Gestures never interrupt an event, and an event that
 * arrives mid-gesture blends out of it rather than snapping.
 *
 * Everything runs on the frame delta, so timing is the same at any frame
 * rate; `immediate` (reduced motion) applies an event's end state at once.
 * Between events he breathes and shifts his weight, and his head follows you
 * — unless motion is paused.
 *
 * ## The waiter
 *
 * Modelled in code like the rest of the courtyard. The serving arm is a
 * two-bone chain solved to the hand's target every frame, so the hand goes
 * exactly where the tray goes; the other arm hangs, or holds his order pad.
 * Seated, you see him from the chest down, his hands doing the work.
 */

import {
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3
} from '../../../vendor/three/three-hkeeli.min.js';
import { roundBox, box, lathe, cylinder } from './geometry.js';
import { TABLE, SPOTS, VISITOR_CHAIR, chair, cupAndSaucer, rakweh } from './props.js';
import { steam } from './atmosphere.js';

const UP = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** From angle a to angle b, the short way round. */
const mixAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/* Where the waiter stands: at the right-hand side of the table, behind the
   empty chair, facing you across it; and where he waits, by the house door. */
const STAND = new Vector3(TABLE.x + 0.55, 0, TABLE.z - 0.27);
const AWAY = new Vector3(0.85, 0, -3.15);
const WALK = 2.8; // seconds, door to table: a brisk waiter
/* Roughly where you sit (the seat cameras in places.js): the things on the
   table are turned so you can read them from there. */
const SEAT = new Vector3(-2.4, 0, 2.5);

/** A flat thing on the table, turned so its top edge points away from you. */
function readable(spot, extraYaw = 0) {
  const ux = spot[0] - SEAT.x;
  const uz = spot[2] - SEAT.z;
  const yaw = Math.atan2(-ux, -uz) + extraYaw;
  return new Quaternion().setFromAxisAngle(UP, yaw);
}

/**
 * @param {object} deps  { lib, wind, Buckets }  (Buckets: world.js's merger)
 */
export function createStory({ lib, wind, Buckets }) {
  const root = new Group();
  root.name = 'cafe-story';
  const tmp = new Vector3();
  const tmp2 = new Vector3();

  /* ---- Materials for the waiter -------------------------------------- */
  const skin = new MeshStandardMaterial({ color: '#B98A68', roughness: 0.55 });
  const shirt = new MeshStandardMaterial({ color: '#F1ECE2', roughness: 0.82 });
  const apron = new MeshStandardMaterial({ color: '#2C5C58', roughness: 0.86, side: 2 });
  const trousers = new MeshStandardMaterial({ color: '#2B2724', roughness: 0.9 });
  const leather = new MeshStandardMaterial({ color: '#4A3326', roughness: 0.6 });
  const hair = new MeshStandardMaterial({ color: '#2A211C', roughness: 0.75 });
  const card = new MeshStandardMaterial({ color: '#6B4A33', roughness: 0.8 });

  const add = (parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new Mesh(geometry, material);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** A limb: a tapered cylinder from one point to another (parent space). */
  const limb = (parent, from, to, r0, r1, material) => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const m = add(parent, cylinder(r0, r1, 1, 12), material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    m.scale.set(1, a.distanceTo(b), 1);
    return m;
  };

  /* ---- The waiter's body ---------------------------------------------- */
  const body = new Group(); // origin on the floor between the feet, facing -x
  const hips = new Group();
  hips.position.y = 0.96;
  body.add(hips);
  // Legs and shoes.
  [-0.09, 0.09].forEach((z) => add(body, cylinder(0.062, 0.055, 0.94, 14), trousers, [0, 0.47, z]));
  [-0.09, 0.09].forEach((z) => add(body, roundBox(0.26, 0.07, 0.1, 0.03), leather, [-0.05, 0.035, z]));
  // Torso: a lathed shirt from waist to shoulders, a little deeper than wide.
  const torso = add(
    hips,
    lathe(
      [
        [0, 0],
        [0.16, 0],
        [0.165, 0.12],
        [0.17, 0.28],
        [0.19, 0.42],
        [0.18, 0.5],
        [0.11, 0.56],
        [0.06, 0.6],
        [0, 0.6]
      ],
      28
    ),
    shirt
  );
  const TORSO_SCALE = [0.78, 1, 1.12];
  torso.scale.set(...TORSO_SCALE);
  add(hips, cylinder(0.168, 0.168, 0.05, 28), leather, [0, 0.02, 0]).scale.set(0.79, 1, 1.13);
  // Apron: tied at the waist, falling to the knee. It hangs from the legs'
  // frame, not the torso's, so it stays put when he bows.
  const apronGeo = new PlaneGeometry(0.34, 0.62, 6, 8);
  const ap = apronGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) ap.setZ(i, Math.cos((ap.getX(i) / 0.17) * 0.9) * 0.03);
  apronGeo.computeVertexNormals();
  add(body, apronGeo, apron, [-0.142, 0.7, 0], [0, -Math.PI / 2, 0]);

  // The other arm: hanging at his side, or bent to hold his order pad.
  const armHang = new Group();
  hips.add(armHang);
  add(armHang, cylinder(0.042, 0.036, 0.58, 12), shirt, [0, 0.27, -0.215], [0.08, 0, 0]);
  add(armHang, roundBox(0.06, 0.1, 0.04, 0.018), skin, [0, -0.06, -0.225]);
  const armPad = new Group();
  armPad.visible = false;
  hips.add(armPad);
  // Held at the waist, where you can see him write from your seat.
  limb(armPad, [0, 0.48, -0.2], [0.02, 0.14, -0.24], 0.047, 0.042, shirt);
  limb(armPad, [0.02, 0.14, -0.24], [-0.24, 0.1, -0.14], 0.036, 0.03, skin);
  const pad = new Group();
  pad.position.set(-0.3, 0.1, -0.09);
  pad.rotation.set(0, 0.25, -0.3); // tilted up towards him
  armPad.add(pad);
  add(pad, roundBox(0.088, 0.006, 0.116, 0.002), card);
  add(pad, roundBox(0.082, 0.003, 0.108, 0.001), new MeshStandardMaterial({ color: '#EED992', roughness: 0.9 }), [0, 0.004, 0]);
  add(pad, roundBox(0.06, 0.022, 0.07, 0.01), skin, [0.02, -0.012, -0.03]); // his fingers under it
  const padTop = new Group();
  padTop.position.set(0, 0.0062, 0);
  pad.add(padTop);

  // Neck and head: simple and featureless but for hair and a moustache.
  add(hips, cylinder(0.048, 0.054, 0.1, 14), skin, [0, 0.63, 0]);
  const head = new Group();
  head.position.set(0, 0.665, 0);
  hips.add(head);
  add(head, lathe([[0, 0], [0.05, 0.008], [0.08, 0.045], [0.09, 0.1], [0.087, 0.155], [0.068, 0.2], [0.034, 0.224], [0, 0.23]], 22), skin).scale.set(1.06, 1, 0.92);
  add(head, lathe([[0.094, 0.11], [0.095, 0.16], [0.074, 0.212], [0.038, 0.238], [0, 0.244]], 22), hair, [0.008, 0, 0]).scale.set(1.06, 1, 0.95);
  add(head, roundBox(0.016, 0.016, 0.07, 0.007), hair, [-0.088, 0.07, 0]);

  // The serving arm: upper arm, forearm, hand — posed every frame.
  const shoulder = new Group();
  shoulder.position.set(0, 0.48, 0.2);
  hips.add(shoulder);
  const upper = add(root, cylinder(0.047, 0.042, 1, 12), shirt);
  const fore = add(root, cylinder(0.036, 0.03, 1, 12), skin);
  const hand = new Group();
  root.add(hand);
  add(hand, roundBox(0.085, 0.026, 0.1, 0.012), skin, [0, 0, 0.05]);
  [-0.03, -0.01, 0.01, 0.03].forEach((x, i) => {
    const len = [0.06, 0.07, 0.068, 0.055][i];
    add(hand, cylinder(0.0085, 0.008, len, 8), skin, [x, -0.004, 0.1 + len / 2], [Math.PI / 2, 0, 0]);
  });
  add(hand, cylinder(0.01, 0.009, 0.055, 8), skin, [0.05, -0.002, 0.05], [Math.PI / 2, 0, -0.9]);
  add(hand, cylinder(0.034, 0.036, 0.05, 12), shirt, [0, 0, -0.035], [Math.PI / 2, 0, 0]);
  root.add(body);

  /* ---- Props ------------------------------------------------------------ */
  const dummy = { blobs: [], steam: [], sprigs: [], pots: [], lights: [], meshes: [] };
  const blobMat = lib.mat.blob.clone();
  blobMat.vertexColors = false;
  const blob = (r, a = 0.5) => {
    const m = new Mesh(new PlaneGeometry(r, r).rotateX(-Math.PI / 2), blobMat.clone());
    m.material.opacity = a;
    m.position.y = 0.0009;
    m.renderOrder = 2;
    return m;
  };
  const merged = (build) => {
    const b = new Buckets(lib);
    build(b);
    const g = new Group();
    b.meshes().forEach((m) => {
      m.matrixAutoUpdate = true;
      g.add(m);
    });
    return g;
  };

  // Your chair. Seen until you sit in it: it fades as the camera settles
  // into the seat (you don't see the chair you're sitting on), and is back
  // when you stand. Its own materials, so the fade touches nothing else.
  const seatChair = merged((b) => chair(b, dummy, VISITOR_CHAIR.pos, VISITOR_CHAIR.yaw));
  const chairBlob = blob(0.62, 0.42);
  chairBlob.position.set(VISITOR_CHAIR.pos[0], 0.0025, VISITOR_CHAIR.pos[2]);
  seatChair.add(chairBlob);
  const chairMats = [];
  seatChair.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    chairMats.push(o.material);
  });
  root.add(seatChair);
  let chairOpacity = 1;

  // The menu: a card lying in front of your seat, face up and turned to you.
  const menu = new Group();
  const menuCard = new Mesh(box(0.112, 0.158, 0.0014), lib.mat.menu);
  menuCard.castShadow = true;
  menuCard.receiveShadow = true;
  menu.add(menuCard);
  // Lying on the table: the card's face (+z) up, its top edge away from you.
  const menuOnTable = readable(SPOTS.menu, 0.15).multiply(new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2));
  const menuBlob = blob(0.19, 0.3);

  // The coffee: rakweh and your cup on a brass tray; grounds in the cup for
  // when you've finished it.
  const tray = merged((b) => {
    rakweh(b, dummy, [-0.05, 0, -0.02]);
    cupAndSaucer(b, dummy, [0.055, 0.0045, 0.05], -0.4);
  });
  tray.add(blob(0.3, 0.45));
  const grounds = add(tray, cylinder(0.021, 0.021, 0.002, 24), new MeshStandardMaterial({ color: '#1C110A', roughness: 0.9 }), [0.055, 0.0045 + 0.0085 + 0.0105, 0.05]);
  grounds.castShadow = false;
  const coffeeSurface = tray.children.filter((m) => m.name === 'coffee' || m.name === 'crema');
  const vapour = steam([[0.055, 0.0045 + 0.0085 + 0.06, 0.05]], wind);
  vapour.meshes.forEach((m) => tray.add(m));

  // A zaatar manoushe on a plate, still warm.
  const plate = merged((b) => {
    b.get('ceramic').add(
      lathe(
        [
          [0, 0.001],
          [0.07, 0.001],
          [0.08, 0.006],
          [0.105, 0.014],
          [0.112, 0.019],
          [0.108, 0.02],
          [0.08, 0.011],
          [0, 0.009]
        ],
        48
      )
    );
  });
  const bread = new Mesh(cylinder(0.088, 0.09, 0.012, 40), new MeshStandardMaterial({ map: manousheTexture(), roughness: 0.7 }));
  bread.position.y = 0.017;
  bread.rotation.y = 0.6;
  bread.castShadow = true;
  plate.add(bread);
  plate.add(blob(0.27, 0.45));
  const warmth = steam([[0, 0.03, 0]], wind);
  warmth.meshes.forEach((m) => plate.add(m));

  // The order slip: written on his pad, then left by your hand.
  const slipCanvas = document.createElement('canvas');
  slipCanvas.width = 256;
  slipCanvas.height = 360;
  const slipTex = new CanvasTexture(slipCanvas);
  slipTex.colorSpace = SRGBColorSpace;
  slipTex.anisotropy = 4;
  const slip = new Group();
  // Yellow, like a waiter's order pad: it shows against the marble.
  const slipPaper = new Mesh(roundBox(0.078, 0.0012, 0.104, 0.0005), new MeshStandardMaterial({ color: '#EED992', roughness: 0.9 }));
  const slipFace = new Mesh(new PlaneGeometry(0.075, 0.1).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: slipTex, roughness: 0.88 }));
  slipFace.position.y = 0.0007;
  slipPaper.castShadow = true;
  slip.add(slipPaper, slipFace);
  const slipBlob = blob(0.14, 0.3);
  slip.add(slipBlob);

  // The bill: a folded note on a small saucer.
  const billCanvas = document.createElement('canvas');
  billCanvas.width = 256;
  billCanvas.height = 160;
  drawBill(billCanvas);
  const billTex = new CanvasTexture(billCanvas);
  billTex.colorSpace = SRGBColorSpace;
  const bill = merged((b) => {
    b.get('ceramic').add(
      lathe(
        [
          [0, 0.001],
          [0.05, 0.001],
          [0.058, 0.007],
          [0.062, 0.01],
          [0.058, 0.01],
          [0.05, 0.005],
          [0, 0.004]
        ],
        36
      )
    );
  });
  const folded = new Mesh(roundBox(0.07, 0.003, 0.045, 0.001), new MeshStandardMaterial({ map: billTex, roughness: 0.9 }));
  folded.position.y = 0.008;
  folded.castShadow = true;
  bill.add(folded, blob(0.16, 0.35));

  // Your money, folded, left on the saucer.
  const moneyCanvas = document.createElement('canvas');
  moneyCanvas.width = 256;
  moneyCanvas.height = 128;
  drawMoney(moneyCanvas);
  const moneyTex = new CanvasTexture(moneyCanvas);
  moneyTex.colorSpace = SRGBColorSpace;
  const money = new Group();
  const note = new Mesh(roundBox(0.066, 0.002, 0.033, 0.0008), new MeshStandardMaterial({ map: moneyTex, roughness: 0.85 }));
  note.castShadow = true;
  money.add(note);

  const props = { menu, tray, plate, slip, bill, money };
  Object.values(props).forEach((p) => {
    p.visible = false;
    root.add(p);
  });
  root.add(menuBlob);

  const spot = (name) => new Vector3(...SPOTS[name]);
  const place = {
    menu: spot('menu'),
    tray: spot('tray'),
    plate: spot('plate'),
    slip: spot('slip'),
    bill: spot('bill'),
    money: spot('bill').add(new Vector3(-0.004, 0.0105, 0.004))
  };
  // How each prop sits once put down.
  const rest = {
    menu: menuOnTable,
    tray: new Quaternion(),
    plate: new Quaternion(),
    slip: readable(SPOTS.slip),
    bill: readable(SPOTS.bill, 0.3),
    money: readable(SPOTS.bill, -0.5)
  };
  // Where the hand grips each prop, relative to the prop's origin.
  const grip = {
    menu: new Vector3(0.03, 0.06, 0),
    tray: new Vector3(0.12, 0.012, 0),
    plate: new Vector3(0.1, 0.02, 0),
    slip: new Vector3(0.03, 0.004, 0),
    bill: new Vector3(0.05, 0.01, 0)
  };
  // The menu in his hand: upright, its face towards you.
  const menuInHand = new Quaternion().setFromAxisAngle(UP, -Math.PI / 2);

  /* ---- Order slip: written as he writes ---------------------------------- */
  const order = { lines: [], reveal: 0 };
  function drawSlip() {
    const ctx = slipCanvas.getContext('2d');
    const w = slipCanvas.width;
    const h = slipCanvas.height;
    ctx.fillStyle = '#F4E2A4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,110,150,0.4)';
    ctx.lineWidth = 2;
    for (let y = 70; y < h; y += 46) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(w - 14, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#C0563E';
    ctx.font = '700 22px Karla, sans-serif';
    ctx.fillText('No. 7', 18, 38);
    // Revealed as if written: the Arabic from the right, the Latin from the left.
    const total = order.lines.length;
    order.lines.forEach((line, i) => {
      const k = Math.max(0, Math.min(1, order.reveal * total - i));
      if (k <= 0) return;
      const y = 108 + i * 92;
      ctx.save();
      ctx.beginPath();
      ctx.rect(w * (1 - k), y - 46, w * k, 50);
      ctx.clip();
      ctx.fillStyle = '#26364F';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = '700 44px "Markazi Text", serif';
      ctx.fillText(line.ar, w - 16, y);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y - 4, w * k, 46);
      ctx.clip();
      ctx.fillStyle = '#4C5A3F';
      ctx.font = '700 24px Karla, sans-serif';
      ctx.fillText(line.tr, 16, y + 32);
      ctx.restore();
    });
    slipTex.needsUpdate = true;
  }
  drawSlip();

  /* ---- Posing -------------------------------------------------------------- */
  const pose = {
    body: AWAY.clone(),
    yaw: 0, // 0 faces the table (-x)
    lean: 0,
    nod: 0,
    hand: new Vector3(),
    handRest: true,
    carry: null
  };
  const restHand = new Vector3();
  const S = new Vector3();
  const q = new Quaternion();
  const idle = { t: 0, amount: 0, look: 0 };
  /** A point in the waiter's torso frame, in the world (follows bow and turn). */
  const inHips = (x, y, z) => () => hips.localToWorld(tmp2.set(x, y, z)).clone();

  function solveArm() {
    body.position.copy(pose.body);
    body.rotation.y = pose.yaw;
    hips.rotation.z = pose.lean; // a bow towards the table (-x)
    body.updateMatrixWorld(true);
    shoulder.getWorldPosition(S);
    restHand.copy(S).add(tmp.set(0.03, -0.6, 0.05).applyAxisAngle(UP, pose.yaw));
    // Hanging, the hand swings a little as he breathes.
    restHand.y += Math.sin(idle.t * 1.7) * 0.004 * idle.amount;
    const H = pose.handRest ? restHand : pose.hand;
    // Two-bone IK in the plane that contains the pole.
    const a = 0.34;
    const b = 0.32;
    const dir = tmp.copy(H).sub(S);
    let d = dir.length();
    d = Math.min(d, a + b - 0.001);
    dir.normalize();
    const pole = new Vector3(0.45, -0.7, 0.35).applyAxisAngle(UP, pose.yaw);
    pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const along = (a * a - b * b + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, a * a - along * along));
    const E = S.clone().addScaledVector(dir, along).addScaledVector(pole, off);
    const W = S.clone().addScaledVector(dir, d);
    segment(upper, S, E);
    segment(fore, E, W);
    hand.position.copy(W);
    q.setFromUnitVectors(new Vector3(0, 0, 1), W.clone().sub(E).normalize());
    hand.quaternion.copy(q);
    if (pose.carry) {
      const p = props[pose.carry];
      p.position.copy(W).sub(grip[pose.carry]);
      p.position.y = Math.max(p.position.y, TABLE.top);
    }
  }

  function segment(mesh, from, to) {
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, tmp.copy(to).sub(from).normalize());
    mesh.scale.set(1, from.distanceTo(to), 1);
  }

  /* ---- Things that move on their own -------------------------------------
     A prop can fly to a pose (a function, so the target can be moving: his
     hand, or a pose in front of your eyes). The menu, held, follows the
     camera; the slip, on his pad, follows the pad. */
  const flights = new Map();
  let camera = null;
  const modes = { menu: 'table', slip: 'free' };

  /** Start a prop moving; resolves true when it arrives, false if overtaken. */
  function fly(name, to, dur, then) {
    const p = props[name];
    flights.get(name)?.settle(false);
    return new Promise((settle) => {
      flights.set(name, { p0: p.position.clone(), q0: p.quaternion.clone(), to, t: 0, dur, then, settle });
    });
  }
  function stepFlights(dt, landAll = false) {
    for (const [name, f] of flights) {
      f.t = landAll ? f.dur : f.t + dt;
      const k = f.dur > 0 ? Math.min(1, f.t / f.dur) : 1;
      const e = ease(k);
      const target = f.to();
      const o = props[name];
      o.position.lerpVectors(f.p0, target.p, e);
      o.quaternion.slerpQuaternions(f.q0, target.q, e);
      if (k >= 1) {
        flights.delete(name);
        f.then?.();
        f.settle(true);
      }
    }
  }
  /** Set a prop down on its spot: a short glide from wherever the hand left it. */
  const land = (name) => () => {
    if (pose.carry === name) pose.carry = null;
    fly(name, () => ({ p: place[name], q: rest[name] }), 0.14);
  };

  /** The menu as you hold it up to read: below and left of your eye-line. */
  function menuHeld() {
    if (!camera) return { p: place.menu, q: menuOnTable };
    const tall = camera.aspect < 1;
    const p = camera.localToWorld(tmp2.set(tall ? -0.055 : -0.17, tall ? -0.02 : -0.045, tall ? -0.4 : -0.5)).clone();
    const qq = camera.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(AXIS_X, -0.22));
    return { p, q: qq };
  }
  /** Your money, from your side of the table. */
  function moneyFrom() {
    if (!camera) return { p: place.money.clone().add(tmp2.set(-0.3, 0.2, 0)), q: rest.money };
    return { p: camera.localToWorld(tmp2.set(0.05, -0.16, -0.32)).clone(), q: rest.money };
  }

  /* ---- Events --------------------------------------------------------------
     Each is a list of segments: how long; where the body, hand, bow and nod
     go; what the hand picks up or sets down; `start`/`end` hooks for the
     props. Hand targets are functions so they read the live scene. */
  const above = (name, lift) => () => place[name].clone().add(grip[name]).add(tmp2.set(0, lift, 0));
  const onProp = (name) => () => props[name].position.clone().add(grip[name]);
  const writing = () => {
    padTop.getWorldPosition(tmp2);
    const t = run.t;
    // Short strokes along the line, lifting between words.
    return tmp2.clone().add(new Vector3(0.02 + Math.sin(t * 2.3) * 0.012, 0.028 + Math.abs(Math.sin(t * 9)) * 0.01, Math.sin(t * 11) * 0.022 + 0.01));
  };
  const carryPose = inHips(-0.32, 0.26, 0.12); // a tray held in front of him

  const EVENTS = {
    arrive: [{ dur: WALK, body: STAND, rest: true, lean: 0, nod: 0 }],
    leave: [{ dur: WALK, body: AWAY, rest: true, lean: 0, nod: 0 }],

    // You hand him the menu; he tucks it away, writes on his pad, and leaves
    // the slip by your hand.
    note: [
      {
        dur: 0.75,
        lean: 0.3,
        hand: () => new Vector3(TABLE.x + 0.12, 1.02, TABLE.z + 0.06),
        start: () => {
          modes.menu = 'passing';
          fly('menu', () => ({ p: pose.hand.clone().sub(grip.menu), q: menuInHand }), 0.75, () => {
            modes.menu = 'hand';
            pose.carry = 'menu';
          });
        }
      },
      {
        dur: 0.5,
        lean: 0,
        hand: inHips(-0.04, 0.02, 0.27),
        end: () => {
          if (pose.carry === 'menu') pose.carry = null;
          props.menu.visible = false;
          menuBlob.visible = false;
          modes.menu = 'gone';
        }
      },
      {
        dur: 0.35,
        hand: () => writing(),
        start: () => {
          armHang.visible = false;
          armPad.visible = true;
          props.slip.visible = true;
          slipBlob.visible = false;
          modes.slip = 'pad';
        }
      },
      { dur: 1.6, track: true, hand: () => writing(), write: true },
      {
        dur: 0.3,
        hand: onProp('slip'),
        end: () => {
          modes.slip = 'free';
          pose.carry = 'slip';
        }
      },
      {
        dur: 0.25,
        hand: inHips(-0.36, 0.2, 0.1),
        end: () => {
          armPad.visible = false;
          armHang.visible = true;
        }
      },
      { dur: 0.8, lean: 0.82, hand: above('slip', 0.06), turn: 'slip' },
      { dur: 0.35, hand: above('slip', 0) },
      {
        dur: 0.15,
        end: () => {
          slipBlob.visible = true;
          land('slip')();
        }
      },
      { dur: 0.55, lean: 0, rest: true }
    ],

    coffee: [
      { dur: 0.01, hand: carryPose, start: () => show('tray', true) },
      { dur: WALK, body: STAND },
      { dur: 0.8, lean: 0.72, hand: above('tray', 0.08) },
      { dur: 0.4, hand: above('tray', 0) },
      { dur: 0.15, end: land('tray') },
      { dur: 0.55, lean: 0, rest: true }
    ],

    manoushe: [
      { dur: 0.01, hand: carryPose, start: () => show('plate', true) },
      { dur: WALK, body: STAND },
      { dur: 0.8, lean: 0.6, hand: above('plate', 0.08) },
      { dur: 0.4, hand: above('plate', 0) },
      { dur: 0.15, end: land('plate') },
      { dur: 0.55, lean: 0, rest: true }
    ],

    // He brings the bill and takes the order slip away.
    bill: [
      { dur: 0.01, hand: carryPose, start: () => show('bill', true) },
      { dur: WALK, body: STAND },
      { dur: 0.7, lean: 0.75, hand: above('bill', 0.07) },
      { dur: 0.35, hand: above('bill', 0) },
      { dur: 0.15, end: land('bill') },
      { dur: 0.4, lean: 0.8, hand: () => onProp('slip')().add(tmp2.set(0, 0.03, 0)) },
      {
        dur: 0.2,
        hand: onProp('slip'),
        end: () => {
          pose.carry = 'slip';
          slipBlob.visible = false;
        }
      },
      {
        dur: 0.55,
        lean: 0,
        rest: true,
        end: () => {
          if (pose.carry === 'slip') pose.carry = null;
          props.slip.visible = false;
        }
      }
    ],

    wave: [
      { dur: 0.5, hand: () => restHand.clone().add(tmp2.set(-0.12, 0.62, 0.12)), lean: 0, nod: 0 },
      { dur: 0.25, hand: () => restHand.clone().add(tmp2.set(-0.12, 0.66, 0.2)) },
      { dur: 0.25, hand: () => restHand.clone().add(tmp2.set(-0.12, 0.62, 0.06)) },
      { dur: 0.25, hand: () => restHand.clone().add(tmp2.set(-0.12, 0.66, 0.2)) },
      { dur: 0.5, rest: true }
    ]
  };

  /* Body language as he speaks. Soft: they never interrupt an event. */
  const GESTURES = {
    // "ahla w sahla": hand on heart, a small bow.
    greet: [
      { dur: 0.45, hand: inHips(-0.17, 0.36, 0.07), lean: 0.12, nod: 0.14 },
      { dur: 0.8 },
      { dur: 0.5, rest: true, lean: 0, nod: 0 }
    ],
    // A question: an open hand towards you.
    ask: [
      { dur: 0.4, hand: inHips(-0.36, 0.14, 0.16), nod: 0.05 },
      { dur: 0.7 },
      { dur: 0.5, rest: true, nod: 0 }
    ],
    // "tfaddal": a hand towards what he has just put down.
    offer: [
      { dur: 0.5, hand: () => place.tray.clone().add(tmp2.set(0.1, 0.16, -0.03)), lean: 0.3 },
      { dur: 0.6 },
      { dur: 0.55, rest: true, lean: 0 }
    ],
    nod: [
      { dur: 0.3, lean: 0.14, nod: 0.26 },
      { dur: 0.45, lean: 0, nod: 0 }
    ]
  };

  /* What you do yourself. These move only your things, so they never wait
     for the waiter or interrupt him. Each resolves when it has settled. */
  const ACTS = {
    // You pick up the menu to read it.
    menuUp: () => {
      if (modes.menu !== 'table') return Promise.resolve(false);
      modes.menu = 'held';
      return fly('menu', menuHeld, 0.8);
    },
    // You finish your coffee: the cup is empty but for the grounds.
    drink: () => {
      coffeeSurface.forEach((m) => (m.visible = false));
      cupEmpty = true;
      return Promise.resolve(true);
    },
    // You leave the money on the saucer.
    pay: () => {
      const from = moneyFrom();
      props.money.position.copy(from.p);
      props.money.quaternion.copy(from.q);
      props.money.visible = true;
      return fly('money', () => ({ p: place.money, q: rest.money }), 0.75);
    }
  };

  const run = { event: null, soft: false, index: 0, t: 0, dur: 0, from: null, started: false, resolve: null };
  let cupEmpty = false;

  function show(name, inHand) {
    const p = props[name];
    p.visible = true;
    p.quaternion.copy(rest[name]);
    if (inHand) pose.carry = name;
  }

  function startSegment() {
    const seg = run.event[run.index];
    run.started = true;
    seg.start?.();
    if (seg.hand) {
      if (pose.handRest) pose.hand.copy(restHand);
      pose.handRest = false;
    }
    run.from = {
      body: pose.body.clone(),
      yaw: pose.yaw,
      lean: pose.lean,
      nod: pose.nod,
      hand: pose.hand.clone(),
      turn: seg.turn ? props[seg.turn].quaternion.clone() : null
    };
    run.t = 0;
    // A walk to where he already stands takes no time.
    run.dur = seg.body && run.from.body.distanceTo(seg.body) < 0.05 ? 0.001 : seg.dur;
    if (seg.hand && pose.carry) solveArm(); // a prop appears in the hand, not on the floor
  }

  function applySegment(k) {
    const seg = run.event[run.index];
    const e = ease(k);
    if (seg.body) {
      pose.body.lerpVectors(run.from.body, seg.body, e);
      // He turns to face where he's going, walks, and turns back to the
      // table when he gets there (walking away, he keeps facing away).
      const dx = seg.body.x - run.from.body.x;
      const dz = seg.body.z - run.from.body.z;
      if (Math.hypot(dx, dz) > 0.3) {
        const travel = Math.atan2(dz, -dx);
        const end = seg.body === STAND ? 0 : travel;
        const turnIn = Math.min(1, k / 0.18);
        const turnOut = Math.max(0, (k - 0.82) / 0.18);
        pose.yaw = turnOut > 0 ? mixAngle(travel, end, ease(turnOut)) : mixAngle(run.from.yaw, travel, ease(turnIn));
      }
      // Walking with something in hand: the hand walks (and turns) with him.
      if (!seg.hand && !pose.handRest && !seg.rest) {
        pose.hand.copy(run.from.hand).sub(run.from.body).applyAxisAngle(UP, pose.yaw - run.from.yaw).add(pose.body);
      }
    }
    if ('lean' in seg) pose.lean = run.from.lean + (seg.lean - run.from.lean) * e;
    if ('nod' in seg) pose.nod = run.from.nod + (seg.nod - run.from.nod) * e;
    if (seg.hand) {
      if (seg.track && k > 0) pose.hand.copy(seg.hand());
      else pose.hand.lerpVectors(run.from.hand, seg.hand(), e);
    }
    if (seg.rest) {
      pose.hand.lerpVectors(run.from.hand, restHand, e);
      if (k >= 1) pose.handRest = true;
    }
    if (seg.turn && run.from.turn) props[seg.turn].quaternion.slerpQuaternions(run.from.turn, rest[seg.turn], e);
    if (seg.write) {
      order.reveal = e;
      drawSlip();
    }
  }

  function endSegment() {
    run.event[run.index].end?.();
    run.started = false;
  }

  function finishRunning() {
    if (!run.event) return;
    // Land everything this event was doing, in order, without waiting.
    for (; run.index < run.event.length; run.index++) {
      if (!run.started) startSegment();
      applySegment(1);
      solveArm();
      endSegment();
      stepFlights(0, true);
    }
    const done = run.resolve;
    run.event = null;
    run.resolve = null;
    done?.(true);
  }

  /** Stop a gesture where it is; whatever comes next blends out of it. */
  function cancelSoft() {
    if (!run.event || !run.soft) return;
    const done = run.resolve;
    run.event = null;
    run.resolve = null;
    done?.(false);
  }

  function begin(list, soft) {
    // Coming out of a gesture into an event that doesn't move the hand, or
    // the bow: bring them home first instead of leaving them hanging.
    const first = list[0];
    const busy = !pose.handRest || Math.abs(pose.lean) > 0.01 || Math.abs(pose.nod) > 0.01;
    if (busy && !pose.carry && !first.hand && !first.rest && !first.body) {
      list = [{ dur: 0.35, rest: true, lean: 0, nod: 0 }, ...list];
    }
    run.event = list;
    run.soft = soft;
    run.index = 0;
    run.t = 0;
    run.started = false;
    const promise = new Promise((resolve) => {
      run.resolve = resolve;
    });
    startSegment();
    return promise;
  }

  /* ---- Steam, the chair, and the waiter between events --------------------- */
  function ambient(dt, motion) {
    idle.t += dt;
    idle.amount += ((motion ? 1 : 0) - idle.amount) * Math.min(1, dt * 2);
    const a = idle.amount;
    const breathe = Math.sin(idle.t * 1.7);
    torso.scale.set(TORSO_SCALE[0] * (1 + 0.007 * breathe * a), TORSO_SCALE[1] * (1 + 0.004 * breathe * a), TORSO_SCALE[2] * (1 + 0.009 * breathe * a));
    hips.position.y = 0.96 + 0.0025 * breathe * a;
    // Weight from one foot to the other, slowly.
    body.rotation.x = 0.011 * Math.sin(idle.t * 0.45) * a;
    // His head follows you, within what a neck allows; nods on top.
    let look = 0;
    if (camera && motion) {
      head.getWorldPosition(tmp2);
      const dx = camera.position.x - tmp2.x;
      const dz = camera.position.z - tmp2.z;
      look = Math.max(-0.75, Math.min(0.75, mixAngle(0, Math.atan2(dz, -dx) - pose.yaw, 1)));
    }
    idle.look += (look - idle.look) * Math.min(1, dt * 3);
    head.rotation.set(0, idle.look, pose.nod);

    // Steam: from the coffee while it's hot and on the table, from the
    // manoushe while it's warm; only near enough to see it.
    const near = (obj) => (camera ? Math.min(1, Math.max(0, (2.2 - camera.position.distanceTo(obj.position)) / 0.9)) : 0);
    const cup = props.tray.visible && pose.carry !== 'tray' && !cupEmpty ? near(tray) : 0;
    vapour.near.value += (cup - vapour.near.value) * Math.min(1, dt * 2);
    const bread = props.plate.visible && pose.carry !== 'plate' ? near(plate) * 0.6 : 0;
    warmth.near.value += (bread - warmth.near.value) * Math.min(1, dt * 2);

    // Your chair fades as you sit in it, and is back when you stand.
    if (camera) {
      const d = Math.hypot(camera.position.x - VISITOR_CHAIR.pos[0], camera.position.z - VISITOR_CHAIR.pos[2]);
      const target = smoothstep(1.02, 1.45, d);
      if (Math.abs(target - chairOpacity) > 0.002) {
        chairOpacity = target;
        chairMats.forEach((m) => {
          m.opacity = m === chairBlob.material ? 0.42 * chairOpacity : chairOpacity;
          m.depthWrite = chairOpacity > 0.98;
        });
        seatChair.visible = chairOpacity > 0.01;
        return true;
      }
    }
    return false;
  }

  /** Props that follow something: the held menu, the slip on his pad. */
  function follow() {
    if (modes.menu === 'held' && !flights.has('menu')) {
      const h = menuHeld();
      props.menu.position.copy(h.p);
      props.menu.quaternion.copy(h.q);
    }
    if (modes.slip === 'pad') {
      padTop.getWorldPosition(props.slip.position);
      padTop.getWorldQuaternion(props.slip.quaternion);
    }
    menuBlob.visible = modes.menu === 'table' && props.menu.visible;
  }

  const api = {
    root,
    get busy() {
      return Boolean(run.event) && !run.soft;
    },

    /** Play an event; resolves when it has finished (or was overtaken). */
    play(name, { immediate = false } = {}) {
      if (run.soft) cancelSoft();
      else finishRunning();
      const event = EVENTS[name];
      if (!event) return Promise.resolve(false);
      const promise = begin(event, false);
      if (immediate) finishRunning();
      solveArm();
      follow();
      return promise;
    },

    /** Something you do (see ACTS); `immediate` lands it at once. */
    act(name, { immediate = false } = {}) {
      const fn = ACTS[name];
      if (!fn) return Promise.resolve(false);
      const done = fn();
      if (immediate) stepFlights(0, true);
      follow();
      return done;
    },

    /** The story's objects, by layer, for rendering still frames of it. */
    layers() {
      return {
        waiter: [body, upper, fore, hand],
        chair: seatChair,
        menu: [props.menu, menuBlob],
        tray: props.tray,
        plate: props.plate,
        slip: props.slip,
        bill: props.bill,
        money: props.money
      };
    },

    /** Body language for a line he says; ignored while he's busy. */
    gesture(name, { immediate = false } = {}) {
      if (immediate || (run.event && !run.soft)) return Promise.resolve(false);
      cancelSoft();
      const list = GESTURES[name];
      return list ? begin(list, true) : Promise.resolve(false);
    },

    /** What the slip says. `lines`: [{ ar, tr }]. */
    setOrder(lines) {
      order.lines = lines.slice();
      order.reveal = 1;
      drawSlip();
    },

    writeOrder(lines) {
      order.lines = lines.slice();
      order.reveal = 0;
      drawSlip();
    },

    /** Back to the table as it was before you sat down, the waiter by the door. */
    reset() {
      run.event = null;
      run.resolve?.(false);
      run.resolve = null;
      run.soft = false;
      flights.forEach((f) => f.settle(false));
      flights.clear();
      Object.values(props).forEach((p) => {
        p.visible = false;
      });
      props.menu.visible = true;
      props.menu.position.copy(place.menu);
      props.menu.quaternion.copy(menuOnTable);
      menuBlob.position.set(place.menu.x, place.menu.y + 0.0009, place.menu.z);
      modes.menu = 'table';
      modes.slip = 'free';
      slipBlob.visible = true;
      armHang.visible = true;
      armPad.visible = false;
      coffeeSurface.forEach((m) => (m.visible = true));
      cupEmpty = false;
      pose.body.copy(AWAY);
      pose.yaw = 0;
      pose.lean = 0;
      pose.nod = 0;
      pose.handRest = true;
      pose.carry = null;
      order.lines = [];
      order.reveal = 0;
      drawSlip();
      solveArm();
      follow();
    },

    /**
     * Advance everything by dt. `motion`: idle movement allowed. Returns
     * true while something is moving that needs a frame drawn.
     */
    update(dt, cam, motion = true) {
      camera = cam;
      let moving = false;
      if (run.event) {
        moving = true;
        run.t += dt;
        const k = Math.min(1, run.t / run.dur);
        applySegment(k);
        solveArm();
        if (k >= 1) {
          endSegment();
          run.index += 1;
          if (run.index >= run.event.length) {
            const done = run.resolve;
            run.event = null;
            run.resolve = null;
            done?.(true);
          } else startSegment();
        }
      }
      if (flights.size) {
        moving = true;
        stepFlights(dt);
      }
      if (ambient(dt, motion)) moving = true;
      solveArm();
      follow();
      return moving;
    }
  };

  api.reset();
  return api;
}

/* A zaatar manoushe: golden dough, a green-brown slick of zaatar and oil. */
function manousheTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, '#6E6A2E');
  g.addColorStop(0.78, '#7A6F33');
  g.addColorStop(0.84, '#C9934E');
  g.addColorStop(1, '#B9783C');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  let s = 11;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 2200; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 100;
    ctx.fillStyle = r() < 0.55 ? 'rgba(52,62,24,0.8)' : r() < 0.6 ? 'rgba(150,120,50,0.7)' : 'rgba(230,200,120,0.5)';
    ctx.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function drawBill(c) {
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F6EEDD';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#1F4B4A';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = '#153534';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.font = '700 58px "Markazi Text", serif';
  ctx.fillText('الحساب', c.width / 2, 92);
  ctx.direction = 'ltr';
  ctx.fillStyle = '#5C6845';
  ctx.font = '700 24px Karla, sans-serif';
  ctx.fillText('el 7seb', c.width / 2, 132);
}

/* A folded banknote: not any real currency's design, just paper money. */
function drawMoney(c) {
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#CBD9BE');
  g.addColorStop(1, '#B9CBB0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6F8B66';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    for (let x = 18; x <= w - 18; x += 6) {
      const y = 30 + i * 8 + Math.sin(x / 14 + i) * 3;
      if (x === 18) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(111,139,102,0.45)';
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.52, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4E6847';
  ctx.fillRect(22, h - 34, 70, 10);
}
