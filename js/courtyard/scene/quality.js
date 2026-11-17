/**
 * Hkeeli courtyard — how much to draw.
 *
 * Three tiers chosen up front from what the device says about itself, then
 * corrected by measurement: the presentation watches real frame times and
 * lowers the drawing resolution if frames are being dropped (see `adapt` in
 * presentation.js). A software renderer (no GPU — virtual machines, some
 * remote desktops, headless test browsers) still gets the real scene, on the
 * `minimal` tier: lower resolution, no shadows, fewer leaves. Only a browser
 * without WebGL 2, or one asking to save data, gets the still image.
 */

export const TIERS = {
  high: { name: 'high', dprMax: 2, antialias: true, shadows: true, shadowMap: 2048, textureScale: 1, density: 1, staticShadows: false },
  medium: { name: 'medium', dprMax: 1.25, antialias: true, shadows: true, shadowMap: 1536, textureScale: 0.5, density: 0.7, staticShadows: false },
  low: { name: 'low', dprMax: 1.25, antialias: false, shadows: true, shadowMap: 1024, textureScale: 0.5, density: 0.5, staticShadows: true },
  minimal: { name: 'minimal', dprMax: 0.75, antialias: false, shadows: false, shadowMap: 512, textureScale: 0.5, density: 0.35, staticShadows: true }
};

/* Integrated and older mobile GPUs that draw this scene at well under 60 fps
   at full resolution (measured: Intel UHD at 1.25× ≈ 22 ms a frame). */
const MODEST_GPU = /intel.*(uhd|hd) graphics|mali-[gt]\d|adreno.*\b[1-5]\d\d\b|powervr|apple a(9|10|11)\b/i;

/**
 * What the device reports. Returns a tier, or null for "use the still view".
 * @param {string} [gpu]  the unmasked renderer string from probeWebGL()
 */
export function chooseTier(gpu = '', software = false) {
  const nav = navigator;
  if (nav.connection && nav.connection.saveData) return null;
  if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return null;

  const memory = nav.deviceMemory || 8;
  const cores = nav.hardwareConcurrency || 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;

  if (software) return TIERS.minimal;
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
    // First ask for hardware; if the browser would only give us a software
    // rasteriser, take that — on the minimal tier — rather than no scene.
    let gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    let software = false;
    if (!gl) {
      gl = document.createElement('canvas').getContext('webgl2');
      software = Boolean(gl);
    }
    if (!gl) return { ok: false, reason: 'no-webgl2' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) software = true;
    return { ok: true, renderer, software };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
