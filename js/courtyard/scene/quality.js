/**
 * Hkeeli courtyard — how much to draw.
 *
 * Three tiers chosen up front from what the device says about itself, then
 * corrected by measurement: the presentation watches real frame times and
 * lowers the drawing resolution if frames are being dropped (see `adapt` in
 * presentation.js). A software renderer (no GPU) never gets the 3D scene at
 * all — the still image and the same lessons serve it far better.
 */

export const TIERS = {
  high: { name: 'high', dprMax: 2, antialias: true, shadows: true, shadowMap: 2048, textureScale: 1, density: 1, staticShadows: false },
  medium: { name: 'medium', dprMax: 1.25, antialias: true, shadows: true, shadowMap: 1536, textureScale: 0.5, density: 0.7, staticShadows: false },
  low: { name: 'low', dprMax: 1.25, antialias: false, shadows: true, shadowMap: 1024, textureScale: 0.5, density: 0.5, staticShadows: true }
};

/* Integrated and older mobile GPUs that draw this scene at well under 60 fps
   at full resolution (measured: Intel UHD at 1.25× ≈ 22 ms a frame). */
const MODEST_GPU = /intel.*(uhd|hd) graphics|mali-[gt]\d|adreno.*\b[1-5]\d\d\b|powervr|apple a(9|10|11)\b/i;

/**
 * What the device reports. Returns a tier, or null for "use the still view".
 * @param {string} [gpu]  the unmasked renderer string from probeWebGL()
 */
export function chooseTier(gpu = '') {
  const nav = navigator;
  if (nav.connection && nav.connection.saveData) return null;
  if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return null;

  const memory = nav.deviceMemory || 8;
  const cores = nav.hardwareConcurrency || 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;

  if (memory <= 2 || cores <= 2) return TIERS.low;
  // Start a modest GPU at native resolution rather than letting it find
  // that out by dropping frames for its first few seconds.
  if (MODEST_GPU.test(gpu)) return { ...TIERS.medium, dprMax: 1 };
  if (coarse || smallScreen || memory <= 4 || cores <= 4) return TIERS.medium;
  return TIERS.high;
}

/** Does this browser give us WebGL 2 on real hardware? */
export function probeWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return { ok: false, reason: 'no-webgl2' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return { ok: false, reason: 'software', renderer };
    return { ok: true, renderer };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
