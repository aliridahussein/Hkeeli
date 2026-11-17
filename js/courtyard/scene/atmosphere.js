/**
 * Hkeeli courtyard — light and air.
 *
 * Late afternoon: a low, warm sun from the front-left, so the house front is
 * lit at an angle that brings out the dressing on the stone, the balcony and
 * shutters throw shadows you can read, and the vine over the pergola dapples
 * the teacher's desk. The sky behind the house is the side away from the sun
 * — pale blue, warming to peach at the horizon.
 *
 * The same sky, with a sun disc and a warm ground, is pre-filtered into the
 * environment map (PMREM). That is what gives the glaze on the cups and the
 * brass of the rakweh a reflection to hold, and the shaded walls their soft
 * fill — no extra lights needed for either.
 */

import {
  BackSide,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PMREMGenerator,
  PlaneGeometry,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3
} from '../../../vendor/three/three-hkeeli.min.js';
import { rng } from './geometry.js';

/** Towards the sun: from the front-left, 28° above the horizon. */
export const SUN = new Vector3(-0.72, 0.47, 0.51).normalize();

const SKY = {
  zenith: new Color('#9DBCD0'),
  horizon: new Color('#F2D7BD'),
  belt: new Color('#E9C3B4'),
  glow: new Color('#FFD9A8')
};

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uBelt;
uniform vec3 uGlow;
uniform vec3 uSun;
uniform float uSunDisc;
uniform vec3 uGround;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.8, h), 0.62));
  // The warm band low on the sky away from the sun.
  col = mix(col, uBelt, exp(-pow((h - 0.05) / 0.07, 2.0)) * 0.4);
  float s = max(dot(d, uSun), 0.0);
  col += uGlow * (pow(s, 6.0) * 0.28 + pow(s, 1200.0) * uSunDisc);
  // Below the horizon: warm ground (only seen by the environment map).
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function skyMaterial({ sunDisc = 0, toneMapped = true } = {}) {
  return new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uBelt: { value: SKY.belt },
      uGlow: { value: SKY.glow },
      uSun: { value: SUN },
      uSunDisc: { value: sunDisc },
      uGround: { value: new Color('#B69A78') }
    },
    side: BackSide,
    depthWrite: false,
    toneMapped,
    fog: false
  });
}

export function sky() {
  const mesh = new Mesh(new SphereGeometry(420, 32, 16), skyMaterial());
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Pre-filtered environment from the same sky, plus a bright sun disc. */
export function environment(renderer) {
  const scene = new Scene();
  scene.add(new Mesh(new SphereGeometry(50, 32, 16), skyMaterial({ sunDisc: 40, toneMapped: false })));
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.children[0].geometry.dispose();
  scene.children[0].material.dispose();
  return target.texture;
}

export function sunLight(quality) {
  const light = new DirectionalLight(new Color('#FFDDB6'), 3.0);
  const target = new Vector3(0.4, 1.4, -1.2);
  light.position.copy(target).addScaledVector(SUN, 26);
  light.target.position.copy(target);
  light.castShadow = quality.shadows;
  const s = light.shadow;
  s.mapSize.set(quality.shadowMap, quality.shadowMap);
  s.camera.left = -8.5;
  s.camera.right = 8.5;
  s.camera.top = 7.5;
  s.camera.bottom = -7.5;
  s.camera.near = 8;
  s.camera.far = 46;
  s.bias = -0.00035;
  s.normalBias = 0.022;
  s.radius = 2.2;
  return light;
}

/** Warm practical lights: the desk lamp, and the room behind the arcade. */
export function practicals(specs) {
  return specs.map((spec) => {
    const lamp = spec.kind === 'lamp';
    const light = new PointLight(new Color(lamp ? '#FFB566' : '#FFC88A'), lamp ? 0.55 : 1.4, lamp ? 2.6 : 3.4, 2);
    light.position.set(...spec.pos);
    return light;
  });
}

/* --------------------------------------------------------------------------
   Distance: the mountain behind the town
   -------------------------------------------------------------------------- */
export function hills() {
  const r = rng(808);
  const ridge = (z, base, height, color, seed) => {
    const pos = [];
    const col = [];
    const n = 64;
    const c = new Color(color);
    const top = new Color(color).offsetHSL(0, -0.03, 0.04);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -520 + t * 1040;
      const y = base + height * (0.55 + 0.25 * Math.sin(t * 7.1 + seed) + 0.12 * Math.sin(t * 19.3 + seed * 2) + 0.08 * r());
      if (prev) {
        const [px, py] = prev;
        pos.push(px, base - 40, z, x, base - 40, z, x, y, z, px, base - 40, z, x, y, z, px, py, z);
        [c, c, top, c, top, top].forEach((k) => col.push(k.r, k.g, k.b));
      }
      prev = [x, y];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const m = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    m.renderOrder = -9;
    m.frustumCulled = false;
    return m;
  };
  return [ridge(-380, 0, 120, '#B6B0BB', 1.3), ridge(-260, 0, 70, '#A7AAA0', 4.1)];
}

/* --------------------------------------------------------------------------
   Steam from the cups
   --------------------------------------------------------------------------
   A quad per cup that always faces the camera about its vertical axis, with
   wisps drawn by noise in the shader. Faint, slow, and only visible once the
   camera has sat down at the table (`uNear`).
   -------------------------------------------------------------------------- */
const STEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - centre;
  toCam.y = 0.0;
  vec3 fwd = normalize(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 world = centre + right * position.x + vec3(0.0, position.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const STEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uNear;
uniform float uSeed;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float t = uTime * 0.35 + uSeed;
  vec2 p = vec2(vUv.x * 2.6 + sin(vUv.y * 4.0 + t * 1.3) * 0.35, vUv.y * 3.2 - t);
  float w = n(p) * 0.6 + n(p * 2.1 + 3.0) * 0.4;
  float wisp = smoothstep(0.52, 0.86, w);
  float fade = smoothstep(0.0, 0.18, vUv.y) * pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  float a = wisp * fade * 0.22 * uNear;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a);
}
`;

export function steam(points, wind) {
  const uniforms = { uTime: wind.uTime, uNear: { value: 0 }, uSeed: { value: 0 } };
  const meshes = points.map((p, i) => {
    const material = new ShaderMaterial({
      vertexShader: STEAM_VERTEX,
      fragmentShader: STEAM_FRAGMENT,
      uniforms: { ...uniforms, uSeed: { value: i * 3.7 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending
    });
    const g = new PlaneGeometry(0.075, 0.17);
    g.translate(0, 0.085, 0);
    const m = new Mesh(g, material);
    m.position.set(...p);
    m.renderOrder = 5;
    m.frustumCulled = false;
    return m;
  });
  return { meshes, near: uniforms.uNear };
}

