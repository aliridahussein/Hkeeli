/**
 * Hkeeli courtyard — the material library.
 *
 * One place where every surface in the courtyard is defined, so the style is
 * consistent: the same limestone on every wall, the same teal paint on every
 * shutter, the same glaze on every cup.
 *
 * Texture scale is carried by the geometry, not the material: architectural
 * pieces get UVs in metres (see `Bucket` in geometry.js), and each texture
 * here records how many metres one repeat covers (`metres`). That is what
 * lets one stone texture serve a gate surround and a garden wall at the same
 * apparent scale.
 */

import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial
} from '../../../vendor/three/three-hkeeli.min.js';
import { TextureForge, rgb } from './forge.js';
import {
  menuTexture,
  menuBackTexture,
  notebookTexture,
  slateTexture,
  plaqueTexture,
  signTexture,
  contactShadowTexture,
  edgeFadeTexture
} from './canvas-art.js';

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ textureScale: number }} quality
 */
export function createLibrary(renderer, quality) {
  const forge = new TextureForge(renderer, { scale: quality.textureScale });

  const tex = {
    wall: forge.make('blocks', {
      size: 1024,
      params: [8, 4, 2.4, 0],
      tints: [rgb('#ECE2CE'), rgb('#DFD0B3'), rgb('#F4EDDF')],
      seed: 3
    }),
    // Dressed stone: surrounds, sills, coping — larger, finer-jointed blocks.
    dressed: forge.make('blocks', {
      size: 512,
      params: [3, 2, 2.4, 1],
      tints: [rgb('#F3EBDB'), rgb('#EADFC9'), rgb('#F7F2E8')],
      seed: 21
    }),
    paver: forge.make('blocks', {
      size: 1024,
      params: [6, 4, 2.4, 1],
      tints: [rgb('#DED1B7'), rgb('#CFC0A3'), rgb('#E9DFCB')],
      seed: 9
    }),
    wood: forge.make('wood', {
      size: 512,
      params: [9, 260, 2.4, 0],
      tints: [rgb('#BE8E5E'), rgb('#7C5532')],
      seed: 4
    }),
    teal: forge.make('painted', {
      size: 512,
      params: [1, 0, 0, 0],
      tints: [rgb('#2B5C58'), rgb('#4B7B75'), rgb('#9A7550')],
      seed: 6
    }),
    tealDoor: forge.make('painted', {
      size: 512,
      params: [0.6, 0, 0, 0],
      tints: [rgb('#23504D'), rgb('#3C6C67'), rgb('#9A7550')],
      seed: 16
    }),
    marble: forge.make('marble', {
      size: 512,
      tints: [rgb('#F2ECDF'), rgb('#E5DBC7'), rgb('#B7AEA2')],
      seed: 2
    }),
    terracotta: forge.make('terracotta', {
      size: 512,
      tints: [rgb('#B9673F'), rgb('#9B4F31'), rgb('#DCC1A4')],
      seed: 5
    }),
    roof: forge.make('roof', {
      size: 512,
      params: [12, 6, 0, 0],
      tints: [rgb('#B85A3B'), rgb('#CC7A50'), rgb('#7A7158')],
      seed: 8
    }),
    cement: forge.make('cement', {
      size: 512,
      params: [2, 0, 0, 0],
      tints: [rgb('#EFE5D1'), rgb('#2E625F'), rgb('#C88E3B')],
      seed: 1
    }),
    linen: forge.make('weave', {
      size: 256,
      params: [64, 0.7, 0, 0],
      tints: [rgb('#F1EADB'), rgb('#D8CBB2')],
      seed: 12
    }),
    rush: forge.make('weave', {
      size: 256,
      params: [16, 0.5, 1, 0],
      tints: [rgb('#D7B46C'), rgb('#9C7A3E')],
      seed: 13
    })
  };
  forge.dispose();

  const art = {
    menu: menuTexture(),
    menuBack: menuBackTexture(),
    notebook: notebookTexture(),
    slate: slateTexture(),
    plaque: plaqueTexture(),
    sign: signTexture(),
    blob: contactShadowTexture(),
    fade: edgeFadeTexture()
  };

  const surface = (t, { bump = 1, color = '#ffffff', roughness = 1, ...rest } = {}) =>
    new MeshStandardMaterial({
      map: t.map,
      bumpMap: t.data,
      bumpScale: bump,
      roughnessMap: t.data,
      roughness,
      color: new Color(color),
      ...rest
    });

  const mat = {
    stone: surface(tex.wall, { bump: 3.2 }),
    // Lintels, sills, arch surrounds and coping: finer stone, so the dressed
    // pieces read against the coursed wall around them.
    dressed: surface(tex.dressed, { bump: 1.8 }),
    paver: surface(tex.paver, { bump: 2.6 }),
    wood: surface(tex.wood, { bump: 0.9 }),
    woodDark: surface(tex.wood, { bump: 0.9, color: '#8C6A4E' }),
    teal: surface(tex.teal, { bump: 0.8 }),
    tealDoor: surface(tex.tealDoor, { bump: 0.8 }),
    marble: new MeshPhysicalMaterial({
      map: tex.marble.map,
      roughnessMap: tex.marble.data,
      roughness: 1,
      clearcoat: 0.55,
      clearcoatRoughness: 0.14
    }),
    terracotta: surface(tex.terracotta, { bump: 1.4 }),
    roof: surface(tex.roof, { bump: 3 }),
    cement: surface(tex.cement, { bump: 0.8 }),
    linen: new MeshPhysicalMaterial({
      map: tex.linen.map,
      bumpMap: tex.linen.data,
      bumpScale: 0.5,
      roughnessMap: tex.linen.data,
      roughness: 1,
      sheen: 0.7,
      sheenRoughness: 0.55,
      sheenColor: new Color('#FFF3E0'),
      side: DoubleSide
    }),
    rush: surface(tex.rush, { bump: 1.6 }),

    iron: new MeshStandardMaterial({ color: '#2A2A27', metalness: 0.6, roughness: 0.46 }),
    brass: new MeshStandardMaterial({ color: '#C79B52', metalness: 1, roughness: 0.26 }),
    brassDark: new MeshStandardMaterial({ color: '#9C7437', metalness: 1, roughness: 0.38 }),

    // Glaze: a thin clear layer over a satin body. The clearcoat carries the
    // sharp reflection; the body stays soft, so cups don't read as plastic.
    ceramic: new MeshPhysicalMaterial({ color: '#F5EEE2', roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05 }),
    ceramicTeal: new MeshPhysicalMaterial({ color: '#2C6560', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    ceramicCitrus: new MeshPhysicalMaterial({ color: '#D99A3E', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.07 }),
    coffee: new MeshPhysicalMaterial({ color: '#2B170C', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02 }),
    crema: new MeshStandardMaterial({ color: '#8C5A32', roughness: 0.5 }),
    bakelite: new MeshPhysicalMaterial({ color: '#D7A140', roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
    rubber: new MeshStandardMaterial({ color: '#1E1B18', roughness: 0.7 }),

    menu: [
      new MeshStandardMaterial({ color: '#EFE5D0', roughness: 0.9 }),
      new MeshStandardMaterial({ color: '#EFE5D0', roughness: 0.9 }),
      new MeshStandardMaterial({ color: '#EFE5D0', roughness: 0.9 }),
      new MeshStandardMaterial({ color: '#EFE5D0', roughness: 0.9 }),
      new MeshStandardMaterial({ map: art.menu, roughness: 0.86 }),
      new MeshStandardMaterial({ map: art.menuBack, roughness: 0.88 })
    ],
    notebook: new MeshStandardMaterial({ map: art.notebook, roughness: 0.88 }),
    pageEdge: new MeshStandardMaterial({ color: '#F1E9D8', roughness: 0.95 }),
    slate: new MeshStandardMaterial({ map: art.slate, roughness: 0.92 }),
    plaque: new MeshPhysicalMaterial({ map: art.plaque, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    sign: new MeshPhysicalMaterial({ map: art.sign, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
    bookTeal: new MeshStandardMaterial({ color: '#2C5D59', roughness: 0.8 }),
    bookCitrus: new MeshStandardMaterial({ color: '#C98E3A', roughness: 0.8 }),
    bookCream: new MeshStandardMaterial({ color: '#E6DAC0', roughness: 0.85 }),
    bookRust: new MeshStandardMaterial({ color: '#9A4B33', roughness: 0.8 }),

    soil: new MeshStandardMaterial({ color: '#4E3D2C', roughness: 1 }),
    bark: surface(tex.wood, { bump: 2, color: '#7D6A55', roughness: 1 }),
    stem: new MeshStandardMaterial({ color: '#5E6B3A', roughness: 0.8 }),

    // One material for every leaf and petal in the courtyard: colour comes
    // per instance, so species differ in colour and shape, not in shader.
    leaf: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, side: DoubleSide }),
    petal: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, side: DoubleSide }),
    fruit: new MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    needles: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),

    interior: new MeshBasicMaterial({ color: '#2A211A' }),
    interiorWarm: new MeshStandardMaterial({ color: '#5A4636', roughness: 1 }),
    glass: new MeshPhysicalMaterial({ color: '#1D2524', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
    bulb: new MeshBasicMaterial({ color: '#FFE2B0' }),
    lanternGlass: new MeshStandardMaterial({ color: '#F6E7C4', emissive: '#F2C37A', emissiveIntensity: 0.35, roughness: 0.3 }),
    shade: new MeshStandardMaterial({ color: '#EADFC8', emissive: '#FFCB86', emissiveIntensity: 0.55, roughness: 0.8, side: DoubleSide }),

    blob: new MeshBasicMaterial({
      color: '#1B140C',
      alphaMap: art.blob,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    fade: new MeshBasicMaterial({
      color: '#2A1E12',
      alphaMap: art.fade,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  };

  /** Metres covered by one repeat of each tiling texture. */
  const metres = { wall: 2.4, paver: 2.4, wood: 0.7, teal: 0.9, marble: 0.8, terracotta: 0.9, roof: 2.4, cement: 0.4, linen: 0.5, rush: 0.4 };

  const textures = [...Object.values(tex).flatMap((t) => [t.map, t.data]), ...Object.values(art)];

  return { mat, tex, art, metres, textures };
}

/* --------------------------------------------------------------------------
   Wind
   --------------------------------------------------------------------------
   Plants move by shader, not by animating thousands of instance matrices:
   per instance, `aSway` says how far this leaf is from where its plant is
   rooted (0 = rigid, 1 = the tip of the canopy) and `aPhase` desynchronises
   it from its neighbours. Two motions combine — the slow sway of a branch,
   and the quick flutter of a leaf about its stalk — both kept small: this is
   an afternoon breeze, and the page has text to read.

   The same code is injected into the material's shadow (depth) pass, so
   dappled light under the vine moves with the leaves that cast it.
   -------------------------------------------------------------------------- */

export function createWind() {
  return {
    uTime: { value: 0 },
    uWind: { value: 1 }
  };
}

const WIND_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
attribute float aSway;
attribute float aPhase;
`;

const WIND_FLUTTER = /* glsl */ `
#include <begin_vertex>
float flutter = sin(uTime * 4.7 + aPhase * 6.2831) * 0.6 + sin(uTime * 7.9 + aPhase * 3.7) * 0.4;
transformed.z += flutter * 0.05 * uWind * uv.y * uv.y * (0.4 + aSway);
`;

const WIND_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec2 gust = vec2(
  sin(uTime * 0.83 + aPhase * 2.1) + 0.55 * sin(uTime * 1.61 + aPhase * 4.3),
  0.6 * cos(uTime * 0.67 + aPhase * 3.3)
);
mvPosition.xz += gust * 0.018 * uWind * aSway;
mvPosition.y -= abs(gust.x) * 0.004 * uWind * aSway;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

function inject(material, wind, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uWind = wind.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_PARS}`)
      .replace('#include <begin_vertex>', WIND_FLUTTER)
      .replace('#include <project_vertex>', WIND_PROJECT);
  };
  // Distinct program cache keys: the wind code changes the shader.
  material.customProgramCacheKey = () => key;
}

/** Make a material sway, and return the matching depth material for shadows. */
export function windify(material, wind, key = 'wind') {
  inject(material, wind, `${key}-colour`);
  // Shadow maps are depth textures here, so the default packing is the one
  // three.js itself uses for casters without a custom material.
  const depth = new MeshDepthMaterial();
  depth.side = DoubleSide;
  inject(depth, wind, `${key}-depth`);
  return depth;
}
