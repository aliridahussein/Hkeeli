/**
 * Hkeeli courtyard — geometry helpers.
 *
 * The courtyard is modelled in code, at real scale (metres). These helpers
 * keep that code short and the result consistent:
 *
 *   - `Bucket` collects static pieces that share a material and merges them
 *     into one mesh, so a wall of forty blocks is one draw call, not forty;
 *   - `boxUV` gives every merged piece UVs measured in metres, so a texture
 *     has the same scale on a door frame as on the wall around it;
 *   - arches, lathe profiles and rounded boxes are the shapes the place is
 *     built from.
 *
 * Randomness is seeded (`rng`), so the composition is identical on every
 * visit and the still images rendered from it stay true.
 */

import {
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Euler,
  Vector2,
  Vector3,
  Shape,
  Path,
  ExtrudeGeometry,
  LatheGeometry,
  ShapeGeometry,
  CylinderGeometry,
  BoxGeometry,
  Mesh,
  RoundedBoxGeometry,
  mergeGeometries
} from '../../../vendor/three/three-hkeeli.min.js';

/* --------------------------------------------------------------------------
   Seeded randomness
   -------------------------------------------------------------------------- */

/** mulberry32: small, fast, and the same sequence on every device. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.signed = (amount = 1) => (next() * 2 - 1) * amount;
  return next;
}

/* --------------------------------------------------------------------------
   Transforms
   -------------------------------------------------------------------------- */

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

/** A matrix from position, rotation (radians, XYZ) and scale. */
export function matrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
  return new Matrix4().compose(_p, _q, _s);
}

/* --------------------------------------------------------------------------
   UVs in metres
   -------------------------------------------------------------------------- */

/**
 * Cube-projected UVs from world position: each face takes the two axes it
 * isn't facing. `scale` is 1 / (metres one texture repeat covers).
 */
export function boxUV(geometry, scale = 1, offset = [0, 0]) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}

/* --------------------------------------------------------------------------
   Buckets: merge everything that shares a material
   -------------------------------------------------------------------------- */

/** Reduce a geometry to position/normal/uv, non-indexed, so any two merge. */
export function normalise(geometry) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  Object.keys(g.attributes).forEach((name) => {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  });
  if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}

export class Bucket {
  /**
   * @param {import('three').Material} material
   * @param {{ uvScale?: number, castShadow?: boolean, receiveShadow?: boolean, name?: string }} options
   *   `uvScale` set → UVs are recomputed in metres after placement; leave it
   *   unset for pieces that carry their own UVs (lathe, labels).
   */
  constructor(material, { uvScale = null, swapUV = false, castShadow = true, receiveShadow = true, name = '' } = {}) {
    this.material = material;
    this.uvScale = uvScale;
    this.swapUV = swapUV;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.name = name;
    this.parts = [];
  }

  /** Add a geometry, placed by a matrix or [pos, rot, scale]. */
  add(geometry, transform) {
    let g = geometry;
    if (transform instanceof Matrix4) g.applyMatrix4(transform);
    else if (Array.isArray(transform)) g.applyMatrix4(matrix(...transform));
    g = normalise(g);
    if (this.uvScale) boxUV(g, this.uvScale);
    if (this.swapUV) {
      // Grain along the length of horizontal timbers rather than up them.
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
    this.parts.push(g);
    return this;
  }

  mesh() {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, this.material);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.name = this.name;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/* --------------------------------------------------------------------------
   Shapes
   -------------------------------------------------------------------------- */

/** A rounded box: the edges are what catch the light on close objects. */
export function roundBox(w, h, d, radius = 0.01, segments = 1) {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

export function box(w, h, d) {
  return new BoxGeometry(w, h, d);
}

/**
 * An arched opening outline: straight jambs up to `spring`, a semicircle
 * (or a segmental arch when `rise` is less than half the width) on top.
 * Coordinates are in the plane of the wall.
 */
/**
 * The outline of an arched opening as points, bottom-left → up → over the
 * crown → down → bottom-right.
 */
export function archPoints(cx, bottom, width, spring, { rise = width / 2, segments = 28 } = {}) {
  const half = width / 2;
  const pts = [new Vector2(cx - half, bottom), new Vector2(cx - half, spring)];
  // Circle through both springing points and the crown.
  const radius = (half * half + rise * rise) / (2 * rise);
  const centreY = spring + rise - radius;
  // When the arch rises more than half its width the centre sits above the
  // springing line and atan2 returns the left springing angle as negative;
  // without the wrap the arc would sweep under the centre and the outline
  // would cross itself (and be triangulated solid).
  let start = Math.atan2(spring - centreY, -half);
  if (start < 0) start += Math.PI * 2;
  const end = Math.atan2(spring - centreY, half);
  for (let i = 1; i < segments; i++) {
    const a = start + (end - start) * (i / segments);
    pts.push(new Vector2(cx + Math.cos(a) * radius, centreY + Math.sin(a) * radius));
  }
  pts.push(new Vector2(cx + half, spring), new Vector2(cx + half, bottom));
  return pts;
}

export function archPath(target, cx, bottom, width, spring, { rise = width / 2, segments = 28, reverse = false } = {}) {
  const pts = archPoints(cx, bottom, width, spring, { rise, segments });
  if (reverse) pts.reverse();
  target.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) target.lineTo(pts[i].x, pts[i].y);
  target.closePath?.();
  return target;
}

export function rectPath(target, x0, y0, x1, y1) {
  target.moveTo(x0, y0);
  target.lineTo(x1, y0);
  target.lineTo(x1, y1);
  target.lineTo(x0, y1);
  target.lineTo(x0, y0);
  return target;
}

/**
 * A wall slab in the XY plane, `depth` thick towards -z from z = 0, with
 * openings punched through. Openings: { type: 'arch'|'rect', cx, bottom,
 * width, spring|top, rise }.
 */
export function wallWithOpenings(x0, x1, y0, y1, depth, openings = []) {
  // Openings that stand on the wall's foot (doors, gates) are cut into the
  // outline as notches; only openings wholly inside the wall are holes.
  // A hole that touches the outline is an invalid polygon, and the
  // triangulator quietly fills it in.
  const notches = openings.filter((o) => o.bottom <= y0 + 1e-4).sort((a, b) => a.cx - b.cx);
  const holes = openings.filter((o) => o.bottom > y0 + 1e-4);

  const shape = new Shape();
  shape.moveTo(x0, y0);
  notches.forEach((o) => {
    const pts = o.type === 'rect'
      ? [new Vector2(o.cx - o.width / 2, y0), new Vector2(o.cx - o.width / 2, o.top), new Vector2(o.cx + o.width / 2, o.top), new Vector2(o.cx + o.width / 2, y0)]
      : archPoints(o.cx, y0, o.width, o.spring, { rise: o.rise ?? o.width / 2 });
    pts.forEach((p) => shape.lineTo(p.x, p.y));
  });
  shape.lineTo(x1, y0);
  shape.lineTo(x1, y1);
  shape.lineTo(x0, y1);
  shape.lineTo(x0, y0);

  holes.forEach((o) => {
    const hole = new Path();
    if (o.type === 'rect') rectPath(hole, o.cx - o.width / 2, o.bottom, o.cx + o.width / 2, o.top);
    else archPath(hole, o.cx, o.bottom, o.width, o.spring, { rise: o.rise ?? o.width / 2 });
    shape.holes.push(hole);
  });
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -depth);
  return g;
}

/**
 * The stone surround of an arched opening: a band `band` wide following the
 * jambs and arch, standing `proud` in front of the wall, with a small bevel.
 * Drawn as one horseshoe outline (outer edge up and over, inner edge back),
 * never as a shape with a hole — see wallWithOpenings.
 */
export function archSurround(cx, bottom, width, spring, { band = 0.12, proud = 0.03, rise = width / 2, head = 0 } = {}) {
  const outer = archPoints(cx, bottom, width + band * 2, spring, { rise: rise + band + head });
  const inner = archPoints(cx, bottom, width, spring, { rise }).reverse();
  const shape = new Shape();
  [...outer, ...inner].forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: proud,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 28
  });
  return g;
}

/** A profile swept around Y. `points` are [radius, height] pairs. */
export function lathe(points, segments = 40, phiStart = 0, phiLength = Math.PI * 2) {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(Math.max(0, r), y)), segments, phiStart, phiLength);
}

/** A profile extruded along X (cornices, mouldings). `points` are [z, y]. */
export function moulding(points, length) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([z, y]) => shape.lineTo(z, y));
  const g = new ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 4 });
  // The profile is drawn in (z, y) and extruded along +z. A quarter turn about
  // Y maps the drawing's first axis onto +z and the extrusion onto -x; the
  // translate brings it back to run from x = 0 to x = length.
  g.rotateY(-Math.PI / 2);
  g.translate(length, 0, 0);
  return g;
}

export function cylinder(rTop, rBottom, height, segments = 16, open = false) {
  return new CylinderGeometry(rTop, rBottom, height, segments, 1, open);
}

/* --------------------------------------------------------------------------
   Leaves
   -------------------------------------------------------------------------- */

/**
 * A leaf from an outline r(θ) or from a width profile, then bent: cupped
 * across the blade and arched along it, so it catches light like a leaf and
 * not like a paper cut-out. The base sits at the origin, the tip at +y = 1.
 * UV y runs base → tip (the wind shader flutters by it).
 */
export function leafGeometry({ width = 0.42, tipSharpness = 1.3, steps = 9, cup = 0.12, arch = 0.18, outline = null } = {}) {
  const shape = new Shape();
  if (outline) {
    const n = 30;
    for (let i = 0; i < n; i++) {
      const [x, y] = outline(i / n);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
  } else {
    // A simple blade: widest a third of the way up, pointed at the tip.
    const n = steps;
    const left = [];
    const right = [];
    for (let i = 0; i <= n; i++) {
      const y = i / n;
      const w = Math.sin(Math.pow(y, 0.82) * Math.PI) ** tipSharpness * width * 0.5 * (1 - 0.25 * y);
      left.push([-w, y]);
      right.push([w, y]);
    }
    shape.moveTo(0, 0);
    right.forEach(([x, y]) => shape.lineTo(x, y));
    left.reverse().forEach(([x, y]) => shape.lineTo(x, y));
  }
  const g = new ShapeGeometry(shape, 6);
  // Normalise: base on the origin, tip at y = 1, whatever the outline drew.
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const height = bb.max.y - bb.min.y || 1;
  g.translate(0, -bb.min.y, 0);
  g.scale(1 / height, 1 / height, 1);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Cup across the midrib, arch along it.
    const z = cup * (x * x) * 4 + arch * Math.sin(y * Math.PI * 0.9) * 0.5 - arch * y * y * 0.4;
    pos.setZ(i, z);
    uv[i * 2] = x + 0.5;
    uv[i * 2 + 1] = Math.max(0, Math.min(1, y));
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Palmate (grape) and round-scalloped (geranium) outlines for leafGeometry. */
export const OUTLINES = {
  // Five lobes, one at the tip, a deep sinus where the stalk joins.
  grape: (t) => {
    const a = -Math.PI / 2 + t * Math.PI * 2;
    // Three deep lobes up top, two at the shoulders, teeth all round, a
    // narrow sinus at the stalk; a little wider than tall, like a vine leaf.
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(5 * (a - Math.PI / 2)), 1.6);
    const teeth = 0.035 * Math.max(0, Math.sin(23 * a));
    const sinus = 1 - 0.7 * Math.exp(-(((a + Math.PI / 2) / 0.32) ** 2)) - 0.7 * Math.exp(-(((a - 1.5 * Math.PI) / 0.32) ** 2));
    const r = 0.5 * (0.62 + 0.38 * lobe + teeth) * sinus;
    return [Math.cos(a) * r * 1.12, 0.5 + Math.sin(a) * r];
  },
  // Round, finely scalloped, notched at the stalk.
  geranium: (t) => {
    const a = -Math.PI / 2 + t * Math.PI * 2;
    const notch = 1 - 0.45 * Math.exp(-(((a + Math.PI / 2) / 0.22) ** 2)) - 0.45 * Math.exp(-(((a - 1.5 * Math.PI) / 0.22) ** 2));
    const r = 0.5 * (1 + 0.06 * Math.sin(13 * a)) * notch;
    return [Math.cos(a) * r, 0.5 + Math.sin(a) * r];
  }
};

/** A small five-petal flower, flat, facing +y. */
export function floretGeometry(radius = 0.012, petals = 5, round = 0.55) {
  const shape = new Shape();
  const n = petals * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (round + (1 - round) * Math.abs(Math.cos((a * petals) / 2)));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new ShapeGeometry(shape, 2);
  g.rotateX(-Math.PI / 2);
  // A slight cup so the petals catch light.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / radius;
    pos.setY(i, d * d * radius * 0.35);
  }
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5;
    uv[i * 2 + 1] = 0.6;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

