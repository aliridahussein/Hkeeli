/**
 * Hkeeli courtyard — assembling the place.
 *
 * Builds every piece (architecture, props, plants, light and air) into one
 * Scene. Static pieces that share a material are merged, so the whole
 * courtyard draws in roughly a hundred calls however much is in it.
 */

import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene
} from '../../../vendor/three/three-hkeeli.min.js';
import { Bucket, normalise, rng } from './geometry.js';
import { createLibrary, createWind } from './library.js';
import { fontsReady } from './canvas-art.js';
import { buildArchitecture, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildPlants } from './plants.js';
import { sky, hills, environment, sunLight, practicals, steam } from './atmosphere.js';
import { createStory } from './story.js';
import { mergeGeometries } from '../../../vendor/three/three-hkeeli.min.js';

/** Bucket name → [material key or material, metres per repeat, options]. */
function bucketSpecs(lib) {
  const { mat, metres } = lib;
  // The room behind the arcade glows a little of its own accord on tiers
  // without the warm practical light (see buildWorld).
  const room = new MeshStandardMaterial({ color: '#6B5644', roughness: 1, side: BackSide, emissive: new Color('#3A2618'), emissiveIntensity: 0 });
  const far = new MeshStandardMaterial({ color: '#E4D6BE', roughness: 0.95 });
  const farRoof = new MeshStandardMaterial({ color: '#B4613F', roughness: 0.9 });
  const noCast = { castShadow: false };
  return {
    stone: [mat.stone, metres.wall],
    dressed: [mat.dressed, metres.wall],
    paver: [mat.paver, metres.paver, noCast],
    cement: [mat.cement, metres.cement, noCast],
    wood: [mat.wood, metres.wood],
    woodH: [mat.wood, metres.wood, { swapUV: true }],
    woodDark: [mat.woodDark, metres.wood],
    teal: [mat.teal, metres.teal],
    tealDoor: [mat.tealDoor, metres.teal],
    iron: [mat.iron],
    brass: [mat.brass],
    brassDark: [mat.brassDark],
    marble: [mat.marble, metres.marble],
    marbleCol: [mat.marble],
    terracotta: [mat.terracotta],
    roof: [mat.roof],
    ceramic: [mat.ceramic],
    ceramicTeal: [mat.ceramicTeal],
    ceramicCitrus: [mat.ceramicCitrus],
    coffee: [mat.coffee, null, noCast],
    crema: [mat.crema, null, noCast],
    bakelite: [mat.bakelite],
    rubber: [mat.rubber],
    linen: [mat.linen],
    rush: [mat.rush, metres.rush],
    soil: [mat.soil, null, noCast],
    page: [mat.pageEdge],
    bookTeal: [mat.bookTeal],
    bookCitrus: [mat.bookCitrus],
    bookCream: [mat.bookCream],
    lantern: [mat.lanternGlass, null, noCast],
    room: [room, null, { castShadow: false, receiveShadow: false }],
    interior: [mat.interior, null, { castShadow: false, receiveShadow: false }],
    glass: [mat.glass, null, noCast],
    far: [far, null, { castShadow: false, receiveShadow: false }],
    farRoof: [farRoof, null, { castShadow: false, receiveShadow: false }],
    bark: [mat.bark],
    stem: [mat.stem]
  };
}

export class Buckets {
  constructor(lib) {
    this.specs = bucketSpecs(lib);
    this.map = new Map();
  }

  get(name) {
    if (!this.map.has(name)) {
      const spec = this.specs[name];
      if (!spec) throw new Error(`Unknown bucket "${name}"`);
      const [material, metres, options = {}] = spec;
      this.map.set(name, new Bucket(material, { uvScale: metres ? 1 / metres : null, name, ...options }));
    }
    return this.map.get(name);
  }

  meshes() {
    return [...this.map.values()].map((b) => b.mesh()).filter(Boolean);
  }
}

/**
 * Build the courtyard.
 * @param {import('three').WebGLRenderer} renderer
 * @param {object} quality  see quality.js
 */
export async function buildWorld(renderer, quality) {
  await fontsReady();
  const lib = createLibrary(renderer, quality);
  const wind = createWind();
  const scene = new Scene();
  const B = new Buckets(lib);
  const extra = { blobs: [], fades: [], lights: [], meshes: [], steam: [], sprigs: [], pots: [] };

  buildArchitecture(B, extra);
  buildProps(B, lib, extra);
  const plants = buildPlants(B, lib, wind, extra, quality);

  B.meshes().forEach((m) => scene.add(m));
  extra.meshes.forEach((m) => scene.add(m));
  plants.forEach((m) => scene.add(m));
  scene.add(contactShadows(extra.blobs, lib.mat.blob));
  scene.add(wallFades(extra.fades, lib.mat.fade));
  scene.add(cloth(lib, wind));

  scene.add(sky());
  hills().forEach((h) => scene.add(h));

  const sun = sunLight(quality);
  scene.add(sun, sun.target);
  // Point lights cost something on every lit pixel of the scene, so the desk
  // lamp and the lit room are real lights only where the GPU has room for
  // them; elsewhere the lamp's bulb and shade still glow, and the room glows
  // through its own material.
  if (quality.name === 'high') practicals(extra.lights).forEach((l) => scene.add(l));
  else B.specs.room[0].emissiveIntensity = 1;
  scene.environment = environment(renderer);
  scene.environmentIntensity = 0.62;

  const vapour = steam(extra.steam, wind);
  vapour.meshes.forEach((m) => scene.add(m));

  // The café story: the waiter and everything he brings to the table.
  const story = createStory({ lib, wind, Buckets });
  scene.add(story.root);

  scene.traverse((o) => {
    if (o.isMesh && o.matrixAutoUpdate === false) o.updateMatrix();
  });

  return {
    scene,
    wind,
    sun,
    lib,
    steamNear: vapour.near,
    story,
    cups: extra.steam.map((p) => p.slice())
  };
}

/* --------------------------------------------------------------------------
   Contact shadows and wall fades: one mesh each, alpha in vertex colour
   -------------------------------------------------------------------------- */
function quads(specs, build) {
  const parts = specs.map((spec) => {
    const g = new PlaneGeometry(1, 1);
    build(g, spec);
    // normalise() keeps only position/normal/uv; the alpha goes on after it.
    const out = normalise(g);
    const alpha = spec.a ?? spec.opacity ?? 1;
    const colour = new Float32Array(out.attributes.position.count * 4);
    for (let i = 0; i < out.attributes.position.count; i++) colour.set([1, 1, 1, alpha], i * 4);
    out.setAttribute('color', new Float32BufferAttribute(colour, 4));
    return out;
  });
  return parts.length ? mergeGeometries(parts, false) : new BufferGeometry();
}

function contactShadows(blobs, material) {
  const g = quads(blobs, (geo, b) => {
    geo.rotateX(-Math.PI / 2);
    geo.scale(b.rx, 1, b.rz);
    geo.translate(b.x, b.y, b.z);
  });
  material.vertexColors = true;
  const m = new Mesh(g, material);
  m.renderOrder = 2;
  m.name = 'contact-shadows';
  return m;
}

function wallFades(fades, material) {
  const g = quads(fades, (geo, f) => {
    geo.rotateX(-Math.PI / 2);
    geo.scale(f.w, 1, f.d);
    geo.rotateY(f.rot);
    geo.translate(f.x, 0.003, f.z);
  });
  material.vertexColors = true;
  const m = new Mesh(g, material);
  m.renderOrder = 1;
  m.name = 'wall-fades';
  return m;
}

/* --------------------------------------------------------------------------
   Linen over the balcony rail
   --------------------------------------------------------------------------
   Draped over the front rail: a short fall inside, a longer one outside, soft
   folds that deepen towards the hems. It sways a centimetre or two — a cloth
   put out to air, not a flag.
   -------------------------------------------------------------------------- */
function cloth(lib, wind) {
  const r = rng(909);
  const railZ = LAYOUT.backZ + LAYOUT.balcony.depth - 0.04;
  const railY = LAYOUT.storey + 0.98 + 0.018;
  const x0 = 0.42;
  const width = 0.6;
  const g = new PlaneGeometry(width, 1, 18, 30);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const sway = new Float32Array(pos.count);
  const phase = new Float32Array(pos.count);
  const inner = 0.28;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = 1 - uv.getY(i);
    let y;
    let z;
    let hang;
    if (v < inner) {
      const a = v / inner;
      y = railY - 0.24 * (1 - a) - 0.01 * Math.sin(a * Math.PI);
      z = railZ - 0.035 + 0.02 * a * a;
      hang = 1 - a;
    } else if (v < inner + 0.06) {
      const a = (v - inner) / 0.06;
      const ang = Math.PI * (1 - a);
      y = railY + Math.sin(ang) * 0.028;
      z = railZ + Math.cos(ang) * -0.03;
      hang = 0;
    } else {
      const a = (v - inner - 0.06) / (1 - inner - 0.06);
      y = railY - 0.46 * a - 0.015 * Math.sin(u * Math.PI);
      z = railZ + 0.032 + 0.03 * a;
      hang = a;
    }
    const fold = Math.sin(u * Math.PI * 2 * 3.2 + 0.7) * 0.013 * hang + Math.sin(u * Math.PI * 9 + 1.2) * 0.004 * hang;
    pos.setXYZ(i, x0 + u * width + fold * 0.3, y + r.signed(0.0015) * hang, z + fold);
    sway[i] = hang * hang;
    phase[i] = u * 0.6;
  }
  g.computeVertexNormals();
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
  g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  const material = lib.mat.linen.clone();
  material.color = new Color('#F6EFE2');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uWind = wind.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float aSway;\nattribute float aPhase;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat breeze = sin(uTime * 0.9 + aPhase * 4.0) * 0.7 + sin(uTime * 1.7 + aPhase * 7.0) * 0.3;\ntransformed.z += breeze * 0.016 * uWind * aSway;\ntransformed.x += breeze * 0.006 * uWind * aSway;'
      );
  };
  material.customProgramCacheKey = () => 'cloth';
  const m = new Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'cloth';
  return m;
}
