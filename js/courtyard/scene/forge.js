/**
 * Hkeeli courtyard — the texture forge.
 *
 * Every surface texture in the courtyard is drawn here, on the GPU, the moment
 * the scene is built: limestone blocks, pavers, wood grain, painted shutters,
 * marble, terracotta, roof tiles, cement floor tiles and linen. Nothing is
 * downloaded and there is nothing to license — the textures are this file.
 *
 * Each surface is one GLSL function that describes a material at a point:
 * its colour, its height (for bump mapping) and its roughness. It is rendered
 * twice into tileable render targets:
 *
 *   - colour, stored as sRGB so the GPU converts on write and on read;
 *   - data: height in red, roughness in green — the channels three.js reads
 *     for `bumpMap` and `roughnessMap`, so one texture serves both.
 *
 * Data targets are half-float where the GPU allows it: a bump map quantised
 * to 256 levels shows stair-steps across smooth stone in raking light.
 *
 * All noise is periodic (lattice coordinates wrap at an integer period), so
 * every texture tiles seamlessly in both directions.
 */

import {
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  WebGLRenderTarget,
  Vector3,
  Vector4,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  NoColorSpace,
  HalfFloatType,
  UnsignedByteType
} from '../../../vendor/three/three-hkeeli.min.js';

/* --------------------------------------------------------------------------
   GLSL: noise
   -------------------------------------------------------------------------- */

const NOISE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform int uMode;
uniform vec4 uParams;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec3 uTintC;

// Hash without sine (Dave Hoskins), stable across GPUs.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uSeed * 0.0137);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + uSeed * 0.0171);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Periodic gradient noise in [0, 1]. \`period\` must be a whole number of cells.
float gnoise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(mod(i, period)) * 6.2831853;
  float b = hash12(mod(i + vec2(1.0, 0.0), period)) * 6.2831853;
  float c = hash12(mod(i + vec2(0.0, 1.0), period)) * 6.2831853;
  float d = hash12(mod(i + vec2(1.0, 1.0), period)) * 6.2831853;
  float va = dot(vec2(cos(a), sin(a)), f);
  float vb = dot(vec2(cos(b), sin(b)), f - vec2(1.0, 0.0));
  float vc = dot(vec2(cos(c), sin(c)), f - vec2(0.0, 1.0));
  float vd = dot(vec2(cos(d), sin(d)), f - vec2(1.0, 1.0));
  return 0.5 + 0.7071 * mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}

float fbm(vec2 p, vec2 period, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int k = 0; k < 7; k++) {
    if (k >= octaves) break;
    sum += amp * gnoise(p, period);
    norm += amp;
    p *= 2.0;
    period *= 2.0;
    amp *= 0.5;
  }
  return sum / norm;
}

// Distance to the nearest feature point: pits, grit, mottling.
float cells(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float md = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + hash22(mod(i + o, period)) - f;
      md = min(md, dot(r, r));
    }
  }
  return sqrt(md);
}

// Colours are written as sRGB, the way a designer reads them, and converted
// once here — the shaders output linear light.
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
`;

/* --------------------------------------------------------------------------
   GLSL: surfaces
   --------------------------------------------------------------------------
   Every surface writes `col` (sRGB), `h` (0..1 height) and `r` (roughness).
   -------------------------------------------------------------------------- */

/* A course of dressed blocks: limestone walls and the courtyard pavers.
   uParams: x rows, y columns, z metres the texture spans, w bond (0 = random
   joints per course, 1 = running bond). */
const BLOCKS = /* glsl */ `
float jitterAt(float k, float row, float cols, float amount) {
  return (hash12(vec2(mod(k, cols), row * 7.13 + 1.7)) - 0.5) * amount;
}

void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float rows = uParams.x;
  float cols = uParams.y;
  float world = uParams.z;
  float bond = uParams.w;

  float ry = uv.y * rows;
  float row = floor(ry);
  float fy = ry - row;

  float shift = mix(hash12(vec2(row, 3.1)) * cols, mod(row, 2.0) * 0.5, bond);
  float x = uv.x * cols + shift;
  float amount = mix(0.62, 0.16, bond);

  float k0 = floor(x);
  float bPrev = k0 - 1.0 + jitterAt(k0 - 1.0, row, cols, amount);
  float b0 = k0 + jitterAt(k0, row, cols, amount);
  float b1 = k0 + 1.0 + jitterAt(k0 + 1.0, row, cols, amount);
  float b2 = k0 + 2.0 + jitterAt(k0 + 2.0, row, cols, amount);
  float a;
  float b;
  float id;
  if (x < b0) { a = bPrev; b = b0; id = k0 - 1.0; }
  else if (x < b1) { a = b0; b = b1; id = k0; }
  else { a = b1; b = b2; id = k0 + 1.0; }

  float mx = world / cols;
  float my = world / rows;
  float edge = min(min((x - a) * mx, (b - x) * mx), min((1.0 - fy) * my, fy * my));
  float cell = hash12(vec2(mod(id, cols), row) + 0.37);
  float cell2 = hash12(vec2(mod(id, cols) * 1.3, row * 2.1) + 5.1);

  // Each block a slightly different stone from the same quarry.
  vec3 base = mix(mix(uTintA, uTintB, smoothstep(0.15, 0.85, cell)), uTintC, cell2 * 0.45);
  float blotch = fbm(uv * 6.0 + cell * 3.0, vec2(6.0), 5);
  base *= 0.95 + 0.09 * blotch;
  float stain = smoothstep(0.6, 0.86, fbm(uv * 3.0 + 7.0, vec2(3.0), 4));
  base = mix(base, base * vec3(1.01, 0.95, 0.86), stain * 0.32);
  // Grain: the stone is never one flat colour up close.
  float grainy = fbm(uv * 64.0, vec2(64.0), 3);
  base *= 0.96 + 0.08 * grainy;
  float speck = smoothstep(0.72, 1.0, gnoise(uv * 190.0, vec2(190.0)));
  base *= 1.0 - 0.07 * speck;

  float pit = smoothstep(0.11, 0.0, cells(uv * 52.0, vec2(52.0))) * step(0.45, hash12(floor(uv * 52.0) + 2.0));
  base *= 1.0 - pit * 0.28;

  // Faces: gentle undulation, the tooling marks of a dressed block, pits.
  float face = 0.74 + (fbm(uv * 14.0, vec2(14.0), 5) - 0.5) * 0.24;
  float angle = cell * 3.14159;
  vec2 dir = vec2(cos(angle), sin(angle));
  float strokes = sin(dot(uv * world, dir) * 230.0 + fbm(uv * 22.0, vec2(22.0), 3) * 7.0);
  face += strokes * 0.014 * step(0.38, cell) * (1.0 - bond * 0.7);
  face -= pit * 0.22;

  // Joint and chamfer. The chamfer is what catches raking light.
  float joint = mix(0.0055, 0.004, bond);
  float chamfer = mix(0.016, 0.01, bond);
  float c = smoothstep(joint, joint + chamfer, edge + (gnoise(uv * 120.0, vec2(120.0)) - 0.5) * 0.004);
  // Edges darken a little with old dirt.
  base *= mix(0.92, 1.0, smoothstep(0.0, 0.05, edge));

  vec3 mortar = uTintC * vec3(0.94, 0.92, 0.88) * (0.92 + 0.1 * gnoise(uv * 90.0, vec2(90.0)));
  col = mix(mortar, base, c);
  h = mix(0.16, face, c);
  r = mix(0.96, 0.84 + 0.07 * blotch - bond * 0.1 * (1.0 - blotch), c);
}
`;

/* Wood grain along v. uParams: x ring count across u, y fibre frequency,
   z warp strength. uTintA light wood, uTintB dark wood. */
const WOOD = /* glsl */ `
float grain(vec2 uv, out float fibre) {
  float warp = fbm(uv * vec2(3.0, 1.0), vec2(3.0, 1.0), 4) - 0.5;
  float knot = fbm(uv * vec2(2.0, 1.0) + 4.0, vec2(2.0, 1.0), 3);
  float rings = uv.x * uParams.x + warp * uParams.z + knot * 1.5;
  float g = 0.5 + 0.5 * sin(rings * 6.2831853);
  g = pow(g, 2.6);
  fibre = gnoise(vec2(uv.x * uParams.y, uv.y * 6.0), vec2(uParams.y, 6.0));
  return g;
}

void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float fibre;
  float g = grain(uv, fibre);
  float tone = fbm(uv * vec2(1.0, 4.0) + 1.3, vec2(1.0, 4.0), 3);
  col = mix(uTintA, uTintB, clamp(g * 0.6 + (1.0 - fibre) * 0.22 + (tone - 0.5) * 0.3, 0.0, 1.0));
  h = 0.5 + g * 0.07 + fibre * 0.05;
  r = 0.6 + g * 0.12 + (1.0 - fibre) * 0.06;
}
`;

/* Painted wood: the shutters, doors and the café chairs. Paint over grain,
   brushed along it, sun-faded in patches and worn through to the wood here and
   there. uTintA paint, uTintB faded paint, uTintC the wood beneath. */
const PAINTED = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float warp = fbm(uv * vec2(3.0, 1.0), vec2(3.0, 1.0), 4) - 0.5;
  float g = 0.5 + 0.5 * sin((uv.x * 30.0 + warp * 3.0) * 6.2831853);
  float brush = gnoise(vec2(uv.x * 70.0, uv.y * 3.0), vec2(70.0, 3.0));
  float fade = smoothstep(0.35, 0.8, fbm(uv * 2.0 + 9.0, vec2(2.0), 4));
  vec3 paint = mix(uTintA, uTintB, fade * 0.75) * (0.94 + 0.08 * brush);
  float wear = smoothstep(0.66, 0.74, fbm(uv * vec2(6.0, 3.0) + 2.0, vec2(6.0, 3.0), 5) + (gnoise(uv * 40.0, vec2(40.0)) - 0.5) * 0.12);
  vec3 wood = uTintC * (0.85 + 0.25 * g);
  col = mix(paint, wood, wear * uParams.x);
  h = 0.55 + brush * 0.04 + g * 0.05 * (1.0 - wear) - wear * 0.08 * uParams.x;
  r = mix(0.5 + 0.12 * fade, 0.78, wear * uParams.x);
}
`;

/* Polished marble with soft veins: the café table top, the columns. */
const MARBLE = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float n = fbm(uv * 4.0, vec2(4.0), 6);
  float m = fbm(uv * 9.0 + 3.0, vec2(9.0), 5);
  float v = abs(sin((uv.x * 2.0 + uv.y + n * 1.4) * 6.2831853));
  float vein = pow(1.0 - v, 22.0);
  float v2 = abs(sin((uv.x * 3.0 - uv.y * 2.0 + m * 1.1) * 6.2831853));
  float fine = pow(1.0 - v2, 48.0) * 0.6;
  vec3 base = mix(uTintA, uTintB, smoothstep(0.3, 0.75, n) * 0.35);
  col = mix(base, uTintC, clamp(vein * 0.8 + fine * 0.5, 0.0, 1.0));
  h = 0.5 - vein * 0.02;
  r = 0.2 + m * 0.08 + vein * 0.06;
}
`;

/* Terracotta: pots, the water jar. Mottled clay, grit, faint throwing rings
   (lathe UVs run v along the profile). */
const TERRACOTTA = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float mott = fbm(uv * vec2(4.0, 3.0), vec2(4.0, 3.0), 5);
  float grit = smoothstep(0.16, 0.0, cells(uv * vec2(120.0, 90.0), vec2(120.0, 90.0)));
  float rings = 0.5 + 0.5 * sin(uv.y * 6.2831853 * 46.0 + mott * 3.0);
  float bloom = smoothstep(0.62, 0.82, fbm(uv * vec2(3.0, 2.0) + 5.0, vec2(3.0, 2.0), 4));
  vec3 clay = mix(uTintA, uTintB, mott);
  clay = mix(clay, uTintC, bloom * 0.55);
  clay *= 1.0 - grit * 0.12;
  col = clay;
  h = 0.5 + rings * 0.035 + grit * 0.05 + (mott - 0.5) * 0.06;
  r = 0.86 + grit * 0.06 - bloom * 0.04;
}
`;

/* Canal roof tiles in courses. u across the tiles, v down the slope. */
const ROOF = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  float cols = uParams.x;
  float rows = uParams.y;
  vec2 p = vec2(uv.x * cols, uv.y * rows);
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float over = mod(cell.x, 2.0);
  float profile = sqrt(max(0.0, 1.0 - pow(f.x * 2.0 - 1.0, 2.0)));
  float barrel = mix(0.38 - profile * 0.22, 0.62 + profile * 0.3, over);
  float lap = smoothstep(0.0, 0.08, f.y) * (0.92 + 0.08 * f.y);
  float tileId = hash12(mod(cell, vec2(cols, rows)) + 1.9);
  vec3 tile = mix(uTintA, uTintB, tileId);
  tile = mix(tile, uTintC, smoothstep(0.62, 0.85, fbm(uv * vec2(6.0, 4.0), vec2(6.0, 4.0), 4)) * 0.45);
  tile *= mix(0.72, 1.0, over * 0.7 + 0.3);
  tile *= 0.9 + 0.12 * gnoise(uv * 80.0, vec2(80.0));
  float shade = mix(0.65, 1.0, lap);
  col = tile * shade;
  h = barrel * lap;
  r = 0.8 + 0.1 * tileId;
}
`;

/* Patterned cement tiles: the teacher's corner. One 20 cm tile is drawn per
   quarter of the texture; the pattern mirrors into a rosette and the corner
   quarter-circles join into rings across neighbouring tiles. uTintA ground,
   uTintB pattern (teal), uTintC accent (ochre). */
const CEMENT = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  vec2 p = uv * uParams.x;
  vec2 cell = floor(p);
  vec2 q = p - cell;
  vec2 c = q - 0.5;
  float d = length(c);
  float ang = atan(c.y, c.x);

  float petal = d - (0.17 + 0.13 * abs(cos(ang * 4.0)));
  float flower = smoothstep(0.012, -0.012, petal) * step(0.07, d);
  float heart = smoothstep(0.075, 0.06, d);
  vec2 corner = min(q, 1.0 - q);
  float cd = length(corner);
  float ring = smoothstep(0.012, 0.0, abs(cd - 0.24) - 0.035);
  float quarter = smoothstep(0.1, 0.088, cd);
  float frame = smoothstep(0.012, 0.0, abs(max(abs(c.x), abs(c.y)) - 0.43) - 0.012);
  float diamond = smoothstep(0.01, 0.0, abs(abs(c.x) + abs(c.y) - 0.36) - 0.01);

  vec3 ground = uTintA;
  vec3 colour = ground;
  colour = mix(colour, uTintC, frame);
  colour = mix(colour, uTintB, ring);
  colour = mix(colour, uTintC, quarter);
  colour = mix(colour, uTintB, max(flower, diamond * 0.85));
  colour = mix(colour, uTintC, heart);

  float wear = fbm(uv * 5.0, vec2(5.0), 4);
  colour = mix(colour, ground * 1.04, smoothstep(0.62, 0.8, wear) * 0.35);
  colour *= 0.94 + 0.08 * gnoise(uv * 140.0, vec2(140.0));
  float grout = smoothstep(0.012, 0.0, min(q.x, min(q.y, min(1.0 - q.x, 1.0 - q.y))));
  colour = mix(colour, uTintA * 0.62, grout);

  col = colour;
  h = 0.6 - grout * 0.4 + (wear - 0.5) * 0.04;
  r = 0.5 + grout * 0.4 + wear * 0.12;
}
`;

/* Woven fabric: linen, and the rush seats of the café chairs.
   uParams: x threads across, y slub strength, z diagonal (0 or 1). */
const WEAVE = /* glsl */ `
void surface(vec2 uv, out vec3 col, out float h, out float r) {
  vec2 st = uv;
  if (uParams.z > 0.5) st = vec2(uv.x + uv.y, uv.y - uv.x);
  vec2 p = st * uParams.x;
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float over = mod(cell.x + cell.y, 2.0);
  float warp = sin(f.x * 3.14159);
  float weft = sin(f.y * 3.14159);
  float thread = mix(warp * (0.65 + 0.35 * weft), weft * (0.65 + 0.35 * warp), over);
  float slub = fbm(vec2(uv.x * 3.0, uv.y * 40.0), vec2(3.0, 40.0), 3) * 0.5
             + fbm(vec2(uv.x * 40.0, uv.y * 3.0), vec2(40.0, 3.0), 3) * 0.5;
  col = mix(uTintA, uTintB, clamp((1.0 - thread) * 0.45 + (slub - 0.5) * uParams.y, 0.0, 1.0));
  h = thread * 0.6 + slub * 0.15;
  r = 0.88 - thread * 0.06;
}
`;

const MAIN = /* glsl */ `
void main() {
  vec3 col;
  float h;
  float r;
  surface(vUv, col, h, r);
  if (uMode == 0) gl_FragColor = vec4(lin(clamp(col, 0.0, 1.0)), 1.0);
  else gl_FragColor = vec4(clamp(h, 0.0, 1.0), clamp(r, 0.0, 1.0), 0.0, 1.0);
}
`;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SURFACES = { blocks: BLOCKS, wood: WOOD, painted: PAINTED, marble: MARBLE, terracotta: TERRACOTTA, roof: ROOF, cement: CEMENT, weave: WEAVE };

/* --------------------------------------------------------------------------
   The forge
   -------------------------------------------------------------------------- */

export class TextureForge {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {{ scale?: number }} options  `scale` halves texture sizes on small GPUs
   */
  constructor(renderer, { scale = 1 } = {}) {
    this.renderer = renderer;
    this.scale = scale;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.scene.add(this.quad);
    this.materials = new Map();
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const gl = renderer.getContext();
    this.halfFloat = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.targets = [];
  }

  material(kind) {
    if (this.materials.has(kind)) return this.materials.get(kind);
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: NOISE + SURFACES[kind] + MAIN,
      uniforms: {
        uSeed: { value: 0 },
        uMode: { value: 0 },
        uParams: { value: new Vector4() },
        uTintA: { value: new Vector3() },
        uTintB: { value: new Vector3() },
        uTintC: { value: new Vector3() }
      },
      depthTest: false,
      depthWrite: false
    });
    this.materials.set(kind, material);
    return material;
  }

  /**
   * Render one surface into a colour texture and a data texture.
   *
   * @param {string} kind   a key of SURFACES
   * @param {object} spec   { size, params:[4], tints:[[r,g,b]×3] (sRGB 0..1), seed }
   * @returns {{ map: Texture, data: Texture }}
   */
  make(kind, { size = 512, params = [0, 0, 0, 0], tints = [], seed = 1 } = {}) {
    const material = this.material(kind);
    const px = Math.max(128, Math.round(size * this.scale));
    material.uniforms.uSeed.value = seed;
    material.uniforms.uParams.value.set(...params);
    ['uTintA', 'uTintB', 'uTintC'].forEach((name, i) => {
      const tint = tints[i] || tints[0] || [1, 1, 1];
      material.uniforms[name].value.set(...tint);
    });
    this.quad.material = material;

    const map = this.#render(material, px, 0, SRGBColorSpace, UnsignedByteType);
    const data = this.#render(material, px, 1, NoColorSpace, this.halfFloat ? HalfFloatType : UnsignedByteType);
    return { map, data };
  }

  #render(material, px, mode, colorSpace, type) {
    const target = new WebGLRenderTarget(px, px, {
      type,
      colorSpace,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      anisotropy: this.anisotropy
    });
    material.uniforms.uMode.value = mode;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previous);
    this.targets.push(target);
    return target.texture;
  }

  /** The generator shaders are only needed while building. The textures stay. */
  dispose() {
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.quad.geometry.dispose();
  }
}

/** sRGB hex → [r, g, b] in 0..1, for tints. */
export function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
