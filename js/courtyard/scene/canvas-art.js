/**
 * Hkeeli courtyard — the printed and written things.
 *
 * The café menu, the teacher's notebook and slate, the welcome plaque by the
 * gate and the Hkeeli sign are drawn on canvases in the site's own typefaces
 * (Markazi Text, Fraunces, Karla), so they read as part of Hkeeli rather than
 * as stock props.
 *
 * Every word on them comes from data/lessons.json — the sugar levels on the
 * menu are Unit 2's tip, the plaque is the greeting from the teacher's
 * introduction, the slate is Unit 1's first phrase. Nothing new is written in
 * Lebanese here.
 */

import { CanvasTexture, SRGBColorSpace } from '../../../vendor/three/three-hkeeli.min.js';

const INK = '#22302E';
const SEA_DEEP = '#153534';
const SEA = '#1F4B4A';
const CITRUS = '#E8A33D';
const OLIVE_INK = '#5C6845';

/** The Hkeeli mark (favicon.svg): a speech bubble holding a citrus ح. */
const MARK_PATH =
  'M864 -487Q932 -487 1002.5 -480.0Q1073 -473 1143 -459L1088 -689Q938 -719 799 -719Q618 -719 475.0 -666.0Q332 -613 249.5 -504.0Q167 -395 167 -229Q167 -68 241.5 57.5Q316 183 446.0 274.0Q576 365 740 421L759 367Q630 402 544.5 423.5Q459 445 380 445Q319 445 272.5 420.0Q226 395 198 315L90 378Q100 436 132.5 504.0Q165 572 230.5 621.0Q296 670 406 670Q461 670 522.0 657.0Q583 644 637.5 627.5Q692 611 728 598Q791 576 848.5 557.0Q906 538 948 531Q979 526 1024.5 522.5Q1070 519 1113 517L1093 319Q965 303 827.5 262.5Q690 222 572.0 158.5Q454 95 380.5 11.5Q307 -72 307 -174Q307 -276 382.5 -346.0Q458 -416 584.5 -451.5Q711 -487 864 -487Z';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c, anisotropy = 4) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Fibres and mottling, so paper doesn't read as a flat fill. */
function paper(ctx, w, h, base, seed = 7) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 900; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#ffffff' : '#a08a62';
    ctx.lineWidth = 0.6 + rand();
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const l = 4 + rand() * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Soft edge darkening: handled paper.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(90,70,40,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function arabic(ctx, text, x, y, size, color, align = 'right', weight = 700) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Markazi Text", "Segoe UI", serif`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function latin(ctx, text, x, y, size, color, { align = 'left', weight = 700, family = 'Karla', italic = false } = {}) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}, system-ui, sans-serif`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function rule(ctx, x0, x1, y, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

/**
 * Wait (briefly) for the faces the canvases use. Google Fonts serves Arabic
 * as a separate subset, so the Arabic sample text matters.
 */
export async function fontsReady(timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return;
  const loads = Promise.all([
    document.fonts.load('700 64px "Markazi Text"', 'قهوة أهلا'),
    document.fonts.load('700 32px Karla', 'ahwe'),
    document.fonts.load('600 32px Fraunces', 'Hkeeli')
  ]).catch(() => {});
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, timeout))]);
}

/* --------------------------------------------------------------------------
   The café menu: coffee by sugar level, and the manoushe — Unit 2.
   -------------------------------------------------------------------------- */
export function menuTexture() {
  const w = 512;
  const h = 720;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  paper(ctx, w, h, '#F6EEDC', 11);

  // Double frame.
  ctx.strokeStyle = SEA;
  ctx.lineWidth = 5;
  ctx.strokeRect(26, 26, w - 52, h - 52);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, w - 80, h - 80);

  // A small cup, drawn.
  ctx.save();
  ctx.translate(w / 2, 104);
  ctx.strokeStyle = CITRUS;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-34, -8);
  ctx.lineTo(34, -8);
  ctx.quadraticCurveTo(32, 36, 0, 38);
  ctx.quadraticCurveTo(-32, 36, -34, -8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(42, 10, 11, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12, -22);
  ctx.quadraticCurveTo(-20, -34, -10, -44);
  ctx.moveTo(10, -22);
  ctx.quadraticCurveTo(2, -34, 12, -44);
  ctx.stroke();
  ctx.restore();

  arabic(ctx, 'قهوة', w / 2, 212, 84, SEA_DEEP, 'center');
  latin(ctx, '2ahwe', w / 2, 252, 30, OLIVE_INK, { align: 'center' });
  rule(ctx, 96, w - 96, 284, CITRUS, 2);

  const rows = [
    ['سادة', 'sada'],
    ['وسط', 'wasat'],
    ['حلوة', '7elwe'],
    ['عالريحة', '3al ri7a']
  ];
  rows.forEach(([ar, tr], i) => {
    const y = 344 + i * 62;
    arabic(ctx, ar, w - 86, y, 50, INK);
    latin(ctx, tr, 86, y - 4, 27, OLIVE_INK);
    ctx.fillStyle = 'rgba(34,48,46,0.28)';
    for (let x = 200; x < w - 196; x += 12) ctx.fillRect(x, y - 10, 3, 3);
  });

  rule(ctx, 96, w - 96, 600, CITRUS, 2);
  arabic(ctx, 'منقوشة زعتر', w / 2, 650, 50, SEA_DEEP, 'center');
  latin(ctx, "man2ushe za3tar", w / 2, 684, 24, OLIVE_INK, { align: 'center' });
  return texture(c, 8);
}

/** The menu's back: plain card with the Hkeeli name. */
export function menuBackTexture() {
  const w = 256;
  const h = 360;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  paper(ctx, w, h, '#F3EAD6', 5);
  ctx.strokeStyle = SEA;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  arabic(ctx, 'إحكيلي', w / 2, h / 2 + 18, 64, CITRUS, 'center');
  return texture(c);
}

/* --------------------------------------------------------------------------
   The teacher's notebook: Unit 1, in her hand.
   -------------------------------------------------------------------------- */
export function notebookTexture() {
  const w = 1024;
  const h = 640;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  paper(ctx, w, h, '#FBF6EA', 3);

  // Ruled lines and a margin on each page.
  ctx.strokeStyle = 'rgba(70,110,150,0.32)';
  ctx.lineWidth = 2;
  for (let y = 96; y < h - 30; y += 46) {
    rule(ctx, 30, w / 2 - 24, y, 'rgba(70,110,150,0.3)', 2);
    rule(ctx, w / 2 + 24, w - 30, y, 'rgba(70,110,150,0.3)', 2);
  }
  rule(ctx, w / 2 - 8, w / 2 - 8, 0, 'rgba(0,0,0,0)', 1);
  ctx.strokeStyle = 'rgba(190,80,70,0.35)';
  ctx.beginPath();
  ctx.moveTo(96, 20);
  ctx.lineTo(96, h - 20);
  ctx.moveTo(w / 2 + 90, 20);
  ctx.lineTo(w / 2 + 90, h - 20);
  ctx.stroke();

  // The spine's shadow.
  const spine = ctx.createLinearGradient(w / 2 - 40, 0, w / 2 + 40, 0);
  spine.addColorStop(0, 'rgba(60,45,25,0)');
  spine.addColorStop(0.5, 'rgba(60,45,25,0.25)');
  spine.addColorStop(1, 'rgba(60,45,25,0)');
  ctx.fillStyle = spine;
  ctx.fillRect(w / 2 - 40, 0, 80, h);

  const pen = '#2B3F6B';
  const tilt = (fn, angle) => {
    ctx.save();
    ctx.rotate(angle);
    fn();
    ctx.restore();
  };
  tilt(() => {
    latin(ctx, 'mar7aba', 120, 132, 44, pen, { family: 'Fraunces', weight: 600 });
    latin(ctx, '— hello', 300, 132, 32, pen, { family: 'Fraunces', weight: 400 });
    latin(ctx, 'kifak?', 120, 224, 44, pen, { family: 'Fraunces', weight: 600 });
    latin(ctx, '(to a man)', 270, 224, 28, pen, { family: 'Fraunces', weight: 400 });
    latin(ctx, 'kifik?', 120, 316, 44, pen, { family: 'Fraunces', weight: 600 });
    latin(ctx, '(to a woman)', 262, 316, 28, pen, { family: 'Fraunces', weight: 400 });
    latin(ctx, 'mni7, w inte?', 120, 408, 40, pen, { family: 'Fraunces', weight: 600 });
  }, -0.012);
  tilt(() => {
    arabic(ctx, 'مرحبا', w - 110, 150, 72, pen);
    arabic(ctx, 'كيفك؟', w - 110, 262, 72, pen);
    arabic(ctx, 'أهلا وسهلا', w - 110, 380, 66, pen);
  }, 0.01);
  // A citrus underline: the word she wants you to remember.
  ctx.strokeStyle = 'rgba(232,163,61,0.85)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(116, 150);
  ctx.quadraticCurveTo(200, 158, 284, 146);
  ctx.stroke();
  return texture(c, 8);
}

/* --------------------------------------------------------------------------
   The slate: chalk, Unit 1's first word.
   -------------------------------------------------------------------------- */
export function slateTexture() {
  const w = 512;
  const h = 384;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  // Seeded, so the slate looks the same in the 3D scene and the still image.
  let s = 29;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.fillStyle = '#26302F';
  ctx.fillRect(0, 0, w, h);
  // Old chalk, wiped.
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 40 + rand() * 90, 10 + rand() * 30, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  arabic(ctx, 'مرحبا', w / 2, 178, 128, 'rgba(246,242,232,0.92)', 'center');
  latin(ctx, 'mar7aba', w / 2, 262, 50, 'rgba(232,190,110,0.92)', { align: 'center', family: 'Fraunces', weight: 600 });
  latin(ctx, 'hello', w / 2, 320, 34, 'rgba(246,242,232,0.75)', { align: 'center', family: 'Fraunces', weight: 400 });
  // Chalk grain: knock tiny holes out of the strokes.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + rand() * 0.5})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#26302F';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return texture(c, 4);
}

/* --------------------------------------------------------------------------
   The welcome plaque by the gate: the teacher's own first words.
   -------------------------------------------------------------------------- */
export function plaqueTexture() {
  const w = 640;
  const h = 300;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F4EBDA';
  ctx.fillRect(0, 0, w, h);
  // Glaze pooling at the edges.
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(120,96,60,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = SEA;
  ctx.lineWidth = 14;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 3;
  ctx.strokeStyle = CITRUS;
  ctx.strokeRect(36, 36, w - 72, h - 72);
  // Corner diamonds.
  [
    [36, 36],
    [w - 36, 36],
    [36, h - 36],
    [w - 36, h - 36]
  ].forEach(([x, y]) => {
    ctx.fillStyle = CITRUS;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 12, y);
    ctx.lineTo(x, y + 12);
    ctx.lineTo(x - 12, y);
    ctx.fill();
  });
  arabic(ctx, 'أهلا وسهلا', w / 2, 168, 118, SEA_DEEP, 'center');
  latin(ctx, 'ahla w sahla', w / 2, 236, 36, OLIVE_INK, { align: 'center' });
  return texture(c, 8);
}

/* --------------------------------------------------------------------------
   The Hkeeli sign in the teacher's corner: the mark, enamelled.
   -------------------------------------------------------------------------- */
export function signTexture() {
  const w = 512;
  const h = 640;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F6EFE0';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = SEA_DEEP;
  ctx.lineWidth = 12;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  // The mark, as in favicon.svg (64×64 viewBox), drawn at 5×.
  ctx.save();
  ctx.translate(w / 2 - 160, 70);
  ctx.scale(5, 5);
  ctx.fillStyle = SEA_DEEP;
  roundRect(ctx, 0, 0, 64, 64, 14.72);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(19.2, 53.12);
  ctx.lineTo(19.2, 63.36);
  ctx.lineTo(33.28, 53.12);
  ctx.closePath();
  ctx.fill();
  ctx.translate(17.797, 28.556);
  ctx.scale(0.023038, -0.023038);
  ctx.fillStyle = CITRUS;
  ctx.fill(new Path2D(MARK_PATH));
  ctx.restore();

  latin(ctx, 'Hkeeli', w / 2, 500, 74, SEA_DEEP, { align: 'center', family: 'Fraunces', weight: 700 });
  arabic(ctx, 'إحكيلي', w / 2, 588, 78, CITRUS, 'center');
  return texture(c, 8);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* --------------------------------------------------------------------------
   Soft contact shadow: what grounds a cup on a table.
   -------------------------------------------------------------------------- */
/* Both of these are alpha maps, which three.js reads from the green channel:
   white is opaque, black is clear. */
export function contactShadowTexture() {
  const s = 128;
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.35, 'rgb(160,160,160)');
  g.addColorStop(0.7, 'rgb(46,46,46)');
  g.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new CanvasTexture(c);
}

/** A linear fade, for the darkening where walls meet the floor. */
export function edgeFadeTexture() {
  const c = canvas(4, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgb(0,0,0)');
  g.addColorStop(1, 'rgb(255,255,255)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new CanvasTexture(c);
}
