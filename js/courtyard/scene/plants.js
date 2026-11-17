/**
 * Hkeeli courtyard — what grows here.
 *
 * A lemon tree against the shaded wall, a grapevine over the pergola (the
 * Lebanese ʿarishe), bougainvillea spilling over the garden wall, geraniums in
 * pots, basil by the door, a sprig of jasmine in the café vase — and, beyond
 * the wall, cypresses and a stone pine against the sky.
 *
 * Every leaf of a kind is one InstancedMesh: one draw call for the whole
 * vine. Each instance carries its own colour, how far it is from where its
 * plant is rooted (`aSway`) and a phase (`aPhase`), which the wind shader in
 * library.js reads. Placement is seeded, so the plants grow the same way on
 * every visit.
 */

import {
  CatmullRomCurve3,
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3
} from '../../../vendor/three/three-hkeeli.min.js';
import { leafGeometry, OUTLINES, floretGeometry, rng, lathe } from './geometry.js';
import { windify } from './library.js';
import { LAYOUT } from './architecture.js';

const UP = new Vector3(0, 1, 0);

/** A set of instances of one geometry and material. */
class Batch {
  constructor(geometry, material, depth, { castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.depth = depth;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.matrices = [];
    this.colors = [];
    this.sway = [];
    this.phase = [];
  }

  push(m, color, sway, phase) {
    this.matrices.push(m);
    this.colors.push(color);
    this.sway.push(sway);
    this.phase.push(phase);
  }

  mesh() {
    const n = this.matrices.length;
    if (!n) return null;
    const geo = this.geometry.clone();
    geo.setAttribute('aSway', new InstancedBufferAttribute(new Float32Array(this.sway), 1));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(this.phase), 1));
    const mesh = new InstancedMesh(geo, this.material, n);
    for (let i = 0; i < n; i++) {
      mesh.setMatrixAt(i, this.matrices[i]);
      mesh.setColorAt(i, this.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.customDepthMaterial = this.depth;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    return mesh;
  }
}

/* Orientation for a leaf: its length along `dir`, its face towards `face`. */
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
function leafMatrix(pos, dir, face, scale) {
  _y.copy(dir).normalize();
  _x.crossVectors(_y, face);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).cross(_y);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  const m = new Matrix4().makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(m);
  _s.set(scale, scale, scale);
  return new Matrix4().compose(pos, _q, _s);
}

function jitterColour(hex, r, amount = 1) {
  const c = new Color(hex);
  c.offsetHSL(r.signed(0.012) * amount, r.signed(0.05) * amount, r.signed(0.045) * amount);
  return c;
}

function randomDir(r) {
  const u = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
}

/**
 * @param {object} B      bucket registry (stems and trunks are static)
 * @param {object} lib    material library
 * @param {object} wind   shared wind uniforms
 * @param {object} extra  { pots, sprigs, meshes }
 * @param {{ density: number }} quality
 */
export function buildPlants(B, lib, wind, extra, quality) {
  const depth = {
    leaf: windify(lib.mat.leaf, wind, 'leaf'),
    petal: windify(lib.mat.petal, wind, 'petal'),
    fruit: windify(lib.mat.fruit, wind, 'fruit')
  };
  const geo = {
    blade: leafGeometry({ width: 0.44, cup: 0.16, arch: 0.16 }),
    lemon: leafGeometry({ width: 0.34, cup: 0.12, arch: 0.18, tipSharpness: 1.1 }),
    grape: leafGeometry({ outline: OUTLINES.grape, cup: 0.05, arch: 0.1 }),
    geranium: leafGeometry({ outline: OUTLINES.geranium, cup: 0.09, arch: 0.07 }),
    floret: floretGeometry(1, 5, 0.5),
    bract: floretGeometry(1, 3, 0.18),
    fruit: new SphereGeometry(1, 8, 6)
  };
  const batch = {
    lemonLeaf: new Batch(geo.lemon, lib.mat.leaf, depth.leaf),
    grapeLeaf: new Batch(geo.grape, lib.mat.leaf, depth.leaf),
    geraniumLeaf: new Batch(geo.geranium, lib.mat.leaf, depth.leaf),
    smallLeaf: new Batch(geo.blade, lib.mat.leaf, depth.leaf),
    floret: new Batch(geo.floret, lib.mat.petal, depth.petal),
    bract: new Batch(geo.bract, lib.mat.petal, depth.petal),
    fruit: new Batch(geo.fruit, lib.mat.fruit, depth.fruit)
  };
  const density = quality.density;

  const potById = Object.fromEntries(extra.pots.map((p) => [p.id, p]));
  lemonTree(B, batch, potById.lemon, density);
  grapevine(B, batch, density);
  bougainvillea(B, batch, density);
  ['geranium-front', 'geranium-front-2', 'geranium-gate', 'geranium-wall', 'geranium-balcony-1', 'geranium-balcony-2'].forEach((id, i) =>
    geranium(B, batch, potById[id], i, density)
  );
  ['basil-door', 'basil-desk'].forEach((id, i) => basil(batch, potById[id], i, density));
  extra.sprigs.forEach((s, i) => jasmine(B, batch, s.pos, i));

  const meshes = Object.values(batch)
    .map((b) => b.mesh())
    .filter(Boolean);
  meshes.push(...skyline(lib));
  return meshes;
}

/* --------------------------------------------------------------------------
   Lemon tree
   -------------------------------------------------------------------------- */
function lemonTree(B, batch, pot, density) {
  const r = rng(101);
  const [x, , z] = pot.pos;
  const soil = pot.h * 0.86;
  const trunk = new CatmullRomCurve3([new Vector3(x, soil - 0.02, z), new Vector3(x + 0.03, 0.85, z - 0.02), new Vector3(x - 0.02, 1.12, z + 0.02), new Vector3(x + 0.01, 1.32, z)]);
  B.get('bark').add(new TubeGeometry(trunk, 16, 0.028, 8));
  const C = new Vector3(x + 0.02, 1.74, z + 0.02);
  const R = new Vector3(0.66, 0.55, 0.62);
  for (let i = 0; i < 6; i++) {
    const d = randomDir(r);
    d.y = Math.abs(d.y) * 0.8 + 0.1;
    const end = C.clone().add(d.clone().multiply(R).multiplyScalar(0.7));
    B.get('bark').add(new TubeGeometry(new CatmullRomCurve3([new Vector3(x + 0.01, 1.28, z), new Vector3().lerpVectors(new Vector3(x, 1.3, z), end, 0.5).add(new Vector3(0, 0.05, 0)), end]), 8, 0.012, 6));
  }
  const n = Math.round(980 * density);
  for (let i = 0; i < n; i++) {
    const d = randomDir(r);
    if (d.y < -0.55 && r() < 0.7) continue;
    const k = 0.7 + 0.3 * Math.sqrt(r());
    const p = C.clone().add(d.clone().multiply(R).multiplyScalar(k));
    const dir = d.clone().add(new Vector3(r.signed(0.6), 0.45, r.signed(0.6))).normalize();
    const face = d.clone().add(UP).normalize();
    const s = 0.095 + r() * 0.035;
    batch.lemonLeaf.push(leafMatrix(p, dir, face, s), jitterColour(r() < 0.65 ? '#36602A' : '#4C7A33', r), 0.35 + 0.65 * Math.min(1, (p.y - 1.15) / 1.0), r());
  }
  for (let i = 0; i < 22; i++) {
    const d = randomDir(r);
    if (d.y > 0.6) d.y = 0.2;
    const p = C.clone().add(d.normalize().multiply(R).multiplyScalar(0.92 + r() * 0.1));
    const m = new Matrix4().compose(p, new Quaternion().setFromAxisAngle(new Vector3(r(), 0, r()).normalize(), r.signed(0.4)), new Vector3(0.038, 0.048, 0.038));
    batch.fruit.push(m, jitterColour(i % 6 === 0 ? '#B7B23A' : '#E6B52C', r, 0.6), 0.5, r());
  }
}

/* --------------------------------------------------------------------------
   Grapevine over the pergola
   -------------------------------------------------------------------------- */
function grapevine(B, batch, density) {
  const r = rng(202);
  const p = LAYOUT.pergola;
  const top = p.y + 0.16;
  // The old trunk, twisting up the post, then along the beams.
  const trunk = new CatmullRomCurve3([
    new Vector3(p.x0 + 0.08, 0, p.z1 - 0.06),
    new Vector3(p.x0 + 0.1, 0.6, p.z1 - 0.02),
    new Vector3(p.x0 + 0.04, 1.3, p.z1 - 0.1),
    new Vector3(p.x0 + 0.1, 2.0, p.z1 - 0.04),
    new Vector3(p.x0 + 0.06, 2.6, p.z1 - 0.1),
    new Vector3(p.x0 + 0.04, top, p.z1 - 0.2)
  ]);
  B.get('bark').add(new TubeGeometry(trunk, 40, 0.032, 8));
  B.get('bark').add(new TubeGeometry(new CatmullRomCurve3([new Vector3(p.x0 + 0.04, top, p.z1 - 0.2), new Vector3(p.x0 + 0.1, top + 0.04, p.z1 - 1.0), new Vector3(p.x0 + 0.05, top + 0.02, p.z0 + 0.4)]), 20, 0.018, 6));
  B.get('bark').add(new TubeGeometry(new CatmullRomCurve3([new Vector3(p.x0 + 0.04, top, p.z1 - 0.2), new Vector3(p.x0 + 0.9, top + 0.05, p.z1 - 0.1), new Vector3(p.x1 - 0.2, top + 0.03, p.z1 - 0.18)]), 20, 0.016, 6));

  const leaf = (pos, dir, face, s, sway) => batch.grapeLeaf.push(leafMatrix(pos, dir, face, s), jitterColour(r() < 0.18 ? '#8E9A44' : r() < 0.6 ? '#5F7E34' : '#4B682B', r), sway, r());

  // Clumps over the rafters.
  const clumps = Math.round(34 * density);
  for (let c = 0; c < clumps; c++) {
    const cx = p.x0 + 0.05 + r() * (p.x1 - p.x0 - 0.1);
    const cz = p.z0 + 0.1 + r() * (p.z1 - p.z0 - 0.15);
    for (let i = 0; i < 13; i++) {
      const pos = new Vector3(cx + r.signed(0.22), top + 0.02 + r() * 0.09, cz + r.signed(0.22));
      const a = r() * Math.PI * 2;
      const dir = new Vector3(Math.cos(a), 0.15 + r() * 0.3, Math.sin(a));
      const face = new Vector3(r.signed(0.4), 1, r.signed(0.4)).normalize();
      leaf(pos, dir, face, 0.12 + r() * 0.06, 0.3 + r() * 0.3);
    }
  }
  // Curtains of leaves over the open edges, where the light comes through.
  const edge = Math.round(90 * density);
  for (let i = 0; i < edge; i++) {
    const front = i % 3 !== 0;
    const pos = front
      ? new Vector3(p.x0 + r() * (p.x1 - p.x0), top - 0.05 - r() * 0.35, p.z1 + 0.02 + r.signed(0.08))
      : new Vector3(p.x0 - 0.03 + r.signed(0.08), top - 0.05 - r() * 0.35, p.z0 + 0.3 + r() * (p.z1 - p.z0 - 0.3));
    const out = front ? new Vector3(r.signed(0.4), -0.7, 0.6) : new Vector3(-0.6, -0.7, r.signed(0.4));
    const face = front ? new Vector3(0, 0.3, 1) : new Vector3(-1, 0.3, 0);
    leaf(pos, out.normalize(), face.normalize(), 0.11 + r() * 0.05, 0.5 + r() * 0.5);
  }
  // Leaves up the trunk.
  for (let i = 0; i < 22; i++) {
    const t = 0.15 + r() * 0.8;
    const pos = trunk.getPoint(t).add(new Vector3(r.signed(0.12), 0, 0.06 + r() * 0.08));
    leaf(pos, new Vector3(r.signed(0.6), 0.4, 0.7).normalize(), new Vector3(0, 0.2, 1).normalize(), 0.1 + r() * 0.04, 0.2 + 0.3 * t);
  }
  // Grape clusters hanging between the rafters.
  for (let c = 0; c < 7; c++) {
    const hang = new Vector3(p.x0 + 0.3 + r() * (p.x1 - p.x0 - 0.5), top - 0.06, p.z0 + 0.4 + r() * (p.z1 - p.z0 - 0.6));
    const len = 0.13 + r() * 0.05;
    B.get('stem').add(new TubeGeometry(new CatmullRomCurve3([hang.clone(), hang.clone().add(new Vector3(0.01, -0.06, 0)), hang.clone().add(new Vector3(0, -0.1, 0.01))]), 6, 0.003, 4));
    const purple = c % 3 !== 0;
    for (let i = 0; i < 26; i++) {
      const t = r();
      const radius = (1 - t) * 0.042 + 0.008;
      const a = r() * Math.PI * 2;
      const pos = hang.clone().add(new Vector3(Math.cos(a) * radius * r(), -0.09 - t * len, Math.sin(a) * radius * r()));
      const s = 0.0105 + r() * 0.0035;
      batch.fruit.push(new Matrix4().compose(pos, new Quaternion(), new Vector3(s, s * 1.08, s)), jitterColour(purple ? (r() < 0.5 ? '#5B3456' : '#46293F') : '#9AA455', r, 0.5), 0.45, c / 7);
    }
  }
}

/* --------------------------------------------------------------------------
   Bougainvillea over the garden wall
   -------------------------------------------------------------------------- */
function bougainvillea(B, batch, density) {
  const r = rng(303);
  const Z = LAYOUT.backZ;
  const wallTop = LAYOUT.gardenWallTop + 0.08;
  const arcs = [];
  for (let i = 0; i < 9; i++) {
    const x0 = -4.45 + i * 0.13 + r.signed(0.05);
    const drop = 0.6 + r() * 0.9;
    arcs.push(
      new CatmullRomCurve3([
        new Vector3(x0, wallTop - 0.02, Z - 0.3),
        new Vector3(x0 + r.signed(0.12), wallTop + 0.12 + r() * 0.1, Z - 0.05),
        new Vector3(x0 + r.signed(0.2), wallTop - 0.25, Z + 0.12 + r() * 0.08),
        new Vector3(x0 + r.signed(0.25), wallTop - drop, Z + 0.1 + r() * 0.1)
      ])
    );
  }
  // A smaller spill beside the gate, kept above the welcome plaque.
  for (let i = 0; i < 4; i++) {
    const x0 = -1.75 + i * 0.16;
    arcs.push(
      new CatmullRomCurve3([
        new Vector3(x0, wallTop - 0.02, Z - 0.25),
        new Vector3(x0 + 0.05, wallTop + 0.1, Z - 0.02),
        new Vector3(x0 + r.signed(0.1), wallTop - 0.3, Z + 0.1),
        new Vector3(x0 + r.signed(0.12), wallTop - 0.55 - r() * 0.2, Z + 0.09)
      ])
    );
  }
  const leaves = Math.round(46 * density);
  const bracts = Math.round(26 * density);
  arcs.forEach((curve, k) => {
    B.get('stem').add(new TubeGeometry(curve, 16, 0.007, 5));
    for (let i = 0; i < leaves; i++) {
      const t = r();
      const pos = curve.getPoint(t).add(new Vector3(r.signed(0.09), r.signed(0.07), r.signed(0.07) + 0.02));
      const dir = randomDir(r);
      dir.y -= 0.3;
      const face = new Vector3(r.signed(0.5), 0.4, 1).normalize();
      batch.smallLeaf.push(leafMatrix(pos, dir.normalize(), face, 0.045 + r() * 0.02), jitterColour(r() < 0.7 ? '#4A6F2E' : '#5E8436', r), 0.25 + 0.75 * t, r());
    }
    for (let i = 0; i < bracts; i++) {
      const t = 0.25 + r() * 0.75;
      const pos = curve.getPoint(t).add(new Vector3(r.signed(0.08), r.signed(0.06), 0.04 + r() * 0.05));
      const dir = new Vector3(r.signed(0.6), r.signed(0.4), 1).normalize();
      const m = new Matrix4().compose(pos, new Quaternion().setFromUnitVectors(UP, dir), new Vector3(1, 1, 1).multiplyScalar(0.022 + r() * 0.01));
      batch.bract.push(m, jitterColour(r() < 0.5 ? '#C9447A' : r() < 0.5 ? '#D86190' : '#B63A6C', r, 0.6), 0.3 + 0.7 * t, r());
    }
    if (k > 8) return;
  });
  // A few fallen on the paving: somebody will sweep this afternoon.
  for (let i = 0; i < 16; i++) {
    const pos = new Vector3(-4.2 + r() * 1.3, 0.004, Z + 0.25 + r() * 1.1);
    const m = new Matrix4().compose(pos, new Quaternion().setFromAxisAngle(UP, r() * 6.28), new Vector3(1, 0.4, 1).multiplyScalar(0.024));
    batch.bract.push(m, jitterColour('#B9467A', r, 0.6), 0, r());
  }
}

/* --------------------------------------------------------------------------
   Pot plants
   -------------------------------------------------------------------------- */
function geranium(B, batch, pot, seed, density) {
  const r = rng(400 + seed);
  const [x, y, z] = pot.pos;
  const soil = y + pot.h * 0.86;
  const size = pot.r / 0.2;
  const n = Math.round(30 * size * density);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * pot.r * 1.05;
    const pos = new Vector3(x + Math.cos(a) * rad, soil + 0.03 + (1 - rad / (pot.r * 1.05)) * 0.12 * size + r() * 0.03, z + Math.sin(a) * rad);
    const dir = new Vector3(Math.cos(a), 0.5 + r() * 0.5, Math.sin(a)).normalize();
    const face = new Vector3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
    batch.geraniumLeaf.push(leafMatrix(pos, dir, face, (0.06 + r() * 0.03) * Math.max(0.75, size)), jitterColour(r() < 0.6 ? '#4D7934' : '#638A3E', r), 0.25, r());
  }
  const umbels = Math.max(2, Math.round(4 * size));
  const colour = seed >= 4 ? '#E0677A' : '#D5463A';
  for (let u = 0; u < umbels; u++) {
    const a = r() * Math.PI * 2;
    const rad = r() * pot.r * 0.8;
    const head = new Vector3(x + Math.cos(a) * rad, soil + (0.2 + r() * 0.1) * size, z + Math.sin(a) * rad);
    B.get('stem').add(new TubeGeometry(new CatmullRomCurve3([new Vector3(x + Math.cos(a) * rad * 0.4, soil + 0.05, z + Math.sin(a) * rad * 0.4), head.clone().add(new Vector3(0, -0.06, 0)), head.clone()]), 6, 0.003, 4));
    for (let i = 0; i < 12; i++) {
      const d = randomDir(r);
      d.y = Math.abs(d.y) * 0.7 + 0.3;
      d.normalize();
      const pos = head.clone().add(d.clone().multiplyScalar(0.03 * Math.max(0.8, size)));
      const m = new Matrix4().compose(pos, new Quaternion().setFromUnitVectors(UP, d), new Vector3(1, 1, 1).multiplyScalar(0.015 * Math.max(0.8, size)));
      batch.floret.push(m, jitterColour(colour, r, 0.5), 0.4, r());
    }
  }
}

function basil(batch, pot, seed, density) {
  const r = rng(500 + seed);
  const [x, y, z] = pot.pos;
  const soil = y + pot.h * 0.86;
  const scale = pot.r / 0.16;
  const n = Math.round(48 * density * Math.max(0.5, scale));
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * pot.r * 1.1;
    const pos = new Vector3(x + Math.cos(a) * rad, soil + (0.03 + (1 - rad / (pot.r * 1.1)) * 0.16 + r() * 0.04) * scale, z + Math.sin(a) * rad);
    const dir = new Vector3(Math.cos(a), 0.6 + r() * 0.6, Math.sin(a)).normalize();
    const face = new Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize();
    batch.smallLeaf.push(leafMatrix(pos, dir, face, (0.04 + r() * 0.018) * Math.max(0.55, scale)), jitterColour(r() < 0.5 ? '#6A9C3A' : '#579031', r), 0.2, r());
  }
}

function jasmine(B, batch, base, seed) {
  const r = rng(600 + seed);
  const [x, y, z] = base;
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2 + 0.4;
    const tipPos = new Vector3(x + Math.cos(a) * 0.035, y + 0.09 + s * 0.022, z + Math.sin(a) * 0.035);
    B.get('stem').add(new TubeGeometry(new CatmullRomCurve3([new Vector3(x, y - 0.01, z), new Vector3(x + Math.cos(a) * 0.012, y + 0.05, z + Math.sin(a) * 0.012), tipPos]), 8, 0.0016, 4));
    for (let i = 0; i < 2; i++) {
      const p = tipPos.clone().add(new Vector3(r.signed(0.012), r.signed(0.01), r.signed(0.012)));
      const d = new Vector3(Math.cos(a) + r.signed(0.3), 0.8, Math.sin(a) + r.signed(0.3)).normalize();
      batch.floret.push(new Matrix4().compose(p, new Quaternion().setFromUnitVectors(UP, d), new Vector3(1, 1, 1).multiplyScalar(0.0095)), jitterColour('#FBF7EE', r, 0.2), 0.12, r());
    }
    const leafAt = new Vector3(x + Math.cos(a) * 0.02, y + 0.045 + s * 0.01, z + Math.sin(a) * 0.02);
    batch.smallLeaf.push(leafMatrix(leafAt, new Vector3(Math.cos(a), 0.5, Math.sin(a)).normalize(), UP, 0.026), jitterColour('#4F7A33', r), 0.1, r());
  }
}

/* --------------------------------------------------------------------------
   The skyline beyond the wall: cypresses and a stone pine
   -------------------------------------------------------------------------- */
function skyline(lib) {
  const meshes = [];
  const dark = new MeshStandardMaterial({ color: '#33502F', roughness: 0.95 });
  const pineGreen = new MeshStandardMaterial({ color: '#3C5833', roughness: 0.95 });
  const trunk = new MeshStandardMaterial({ color: '#6B5745', roughness: 1 });

  const cypress = (x, z, h, seed) => {
    const r = rng(seed);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const radius = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.6) * (1 - 0.55 * t) * (h / 9);
      pts.push([radius, t * h]);
    }
    const g = lathe(pts, 18);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const a = Math.atan2(pz, px);
      const k = 1 + 0.12 * Math.sin(py * 5.3 + a * 3 + seed) + 0.08 * Math.sin(py * 11.7 - a * 5);
      pos.setXYZ(i, px * k, py, pz * k);
    }
    g.computeVertexNormals();
    const m = new Mesh(g, dark);
    m.position.set(x, 0, z);
    m.rotation.y = r() * 6;
    m.castShadow = false;
    m.receiveShadow = false;
    meshes.push(m);
  };
  // Beyond the lane's far wall (z = -8.1), never in the lane itself.
  cypress(-3.5, -9.6, 9.6, 11);
  cypress(-1.75, -10.6, 8.4, 12);
  cypress(-5.8, -12.8, 10.5, 13);

  // Stone pine: a leaning trunk and a flat, layered crown.
  const r = rng(14);
  const base = new Vector3(-8.2, 0, -14);
  const t = new TubeGeometry(new CatmullRomCurve3([base, base.clone().add(new Vector3(0.3, 3, 0.1)), base.clone().add(new Vector3(0.9, 5.6, 0.3))]), 12, 0.18, 8);
  const tm = new Mesh(t, trunk);
  meshes.push(tm);
  for (let i = 0; i < 7; i++) {
    const g = new IcosahedronGeometry(1, 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const f = 1 + 0.12 * Math.sin(pos.getX(k) * 4 + i) * Math.cos(pos.getZ(k) * 4);
      pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k) * f);
    }
    g.computeVertexNormals();
    const m = new Mesh(g, pineGreen);
    m.position.set(base.x + 0.9 + r.signed(1.6), 5.9 + r() * 0.7, base.z + 0.3 + r.signed(1.2));
    m.scale.set(1.15 + r() * 0.4, 0.38 + r() * 0.12, 1.0 + r() * 0.3);
    meshes.push(m);
  }
  return meshes;
}
