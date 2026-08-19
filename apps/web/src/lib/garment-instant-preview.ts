/**
 * Canvas instant garment preview — fabric mask + HSL recolor (preserves folds/shadows).
 * Honest limit: true realism for new colors requires a second AI run per color.
 */

import { colorOptionById, sizeToPreviewScale } from "./instant-preview";

export type GarmentCategory = "tops" | "bottoms" | "one_pieces" | string;

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  /** Y anchor for size scaling — shoulders for tops, waist for bottoms */
  anchorY: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function isStudioBackground(r: number, g: number, b: number): boolean {
  const l = lum(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return l > 196 && spread < 32;
}

function isSkinTone(r: number, g: number, b: number): boolean {
  const y = lum(r, g, b);
  if (y < 38 || y > 248) return false;
  const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
  const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
  if (cr >= 133 && cr <= 178 && cb >= 78 && cb <= 128 && y > 48) return true;
  if (r > 95 && g > 48 && b > 28 && r > g && r > b && r - g > 8 && y < 235) return true;
  return false;
}

function isLogoOrPrint(r: number, g: number, b: number): boolean {
  const l = lum(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (l > 168) return true;
  if (l > 118 && spread < 65) return true;
  return false;
}

function garmentRegion(category: GarmentCategory, w: number, h: number): Region {
  if (category === "tops") {
    const y0 = Math.floor(h * 0.18);
    const y1 = Math.floor(h * 0.5);
    return {
      x0: Math.floor(w * 0.14),
      y0,
      x1: Math.floor(w * 0.86),
      y1,
      cx: w * 0.5,
      cy: h * 0.34,
      anchorY: y0 + (y1 - y0) * 0.08,
    };
  }
  if (category === "bottoms") {
    const y0 = Math.floor(h * 0.48);
    const y1 = Math.floor(h * 0.92);
    return {
      x0: Math.floor(w * 0.12),
      y0,
      x1: Math.floor(w * 0.88),
      y1,
      cx: w * 0.5,
      cy: h * 0.7,
      anchorY: y0,
    };
  }
  const y0 = Math.floor(h * 0.17);
  const y1 = Math.floor(h * 0.9);
  return {
    x0: Math.floor(w * 0.1),
    y0,
    x1: Math.floor(w * 0.9),
    y1,
    cx: w * 0.5,
    cy: h * 0.52,
    anchorY: y0,
  };
}

function inHeadZone(x: number, y: number, w: number, h: number): boolean {
  const nx = (x - w * 0.5) / (w * 0.24);
  const ny = (y - h * 0.11) / (h * 0.13);
  return ny < 1 && nx * nx + ny * ny < 1.15;
}

function sampleGarmentColor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  region: Region
): [number, number, number] {
  const samples: [number, number, number][] = [];
  const yStart = Math.floor(region.y0 + (region.y1 - region.y0) * 0.2);
  const yEnd = Math.floor(region.y0 + (region.y1 - region.y0) * 0.55);
  for (let y = yStart; y < yEnd; y += 4) {
    for (let x = region.x0 + 12; x < region.x1 - 12; x += 4) {
      const p = (y * w + x) * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (isStudioBackground(r, g, b) || isSkinTone(r, g, b) || isLogoOrPrint(r, g, b)) continue;
      samples.push([r, g, b]);
    }
  }
  if (!samples.length) return [30, 30, 30];
  const avg = samples.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0]
  );
  const n = samples.length;
  return [Math.round(avg[0] / n), Math.round(avg[1] / n), Math.round(avg[2] / n)];
}

function keepLargestComponent(raw: Uint8Array, w: number, h: number): Uint8Array {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const sizes: number[] = [0];
  let bestLabel = 0;
  let bestSize = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!raw[i] || labels[i]) continue;
      const label = nextLabel++;
      sizes[label] = 0;
      const queue = [i];
      labels[i] = label;
      while (queue.length) {
        const ci = queue.pop()!;
        sizes[label]++;
        const cx = ci % w;
        const cy = (ci - cx) / w;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!raw[ni] || labels[ni]) continue;
          labels[ni] = label;
          queue.push(ni);
        }
      }
      if (sizes[label] > bestSize) {
        bestSize = sizes[label];
        bestLabel = label;
      }
    }
  }

  const out = new Uint8Array(w * h);
  if (!bestLabel) return out;
  for (let i = 0; i < w * h; i++) {
    if (labels[i] === bestLabel) out[i] = 1;
  }
  return out;
}

function erodeBinary(raw: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let current = raw;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (
          current[i] &&
          current[i - 1] &&
          current[i + 1] &&
          current[i - w] &&
          current[i + w]
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function buildFabricMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  category: GarmentCategory
): Float32Array {
  const region = garmentRegion(category, w, h);
  const garmentColor = sampleGarmentColor(data, w, h, region);
  const threshold = category === "tops" ? 58 : 68;

  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (inHeadZone(x, y, w, h)) blocked[i] = 1;
      else if (isSkinTone(r, g, b)) blocked[i] = 1;
      else if (isStudioBackground(r, g, b)) blocked[i] = 1;
      else if (isLogoOrPrint(r, g, b)) blocked[i] = 1;
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(blocked);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (
          blocked[i] ||
          blocked[i - 1] ||
          blocked[i + 1] ||
          blocked[i - w] ||
          blocked[i + w]
        ) {
          next[i] = 1;
        }
      }
    }
    blocked.set(next);
  }

  const raw = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let y = region.y0; y <= region.y1; y += 2) {
    for (let x = region.x0; x <= region.x1; x += 2) {
      const i = y * w + x;
      if (blocked[i]) continue;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (colorDist(r, g, b, garmentColor[0], garmentColor[1], garmentColor[2]) < threshold) {
        raw[i] = 1;
        queue.push(i);
      }
    }
  }

  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const ni of [i - 1, i + 1, i - w, i + w]) {
      if (ni < 0 || ni >= w * h) continue;
      const nx = ni % w;
      const ny = (ni - nx) / w;
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      if (nx < region.x0 - 2 || nx > region.x1 + 2 || ny < region.y0 - 4 || ny > region.y1 + 2) continue;
      if (raw[ni] || blocked[ni]) continue;
      const p = ni * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (isLogoOrPrint(r, g, b)) continue;
      if (colorDist(r, g, b, garmentColor[0], garmentColor[1], garmentColor[2]) < threshold + 12) {
        raw[ni] = 1;
        queue.push(ni);
      }
    }
  }

  let refined = keepLargestComponent(raw, w, h);
  refined = erodeBinary(refined, w, h, category === "tops" ? 2 : 1);

  const feather = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!refined[i]) {
        feather[i] = 0;
        continue;
      }
      let minDist = 6;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!refined[ni]) {
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
          }
        }
      }
      feather[i] = Math.min(1, minDist / 3);
    }
  }

  return feather;
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number
): [number, number, number] {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(sy)));
  const i = (y0 * w + x0) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

/** Preserve original folds/shadows — only shift hue toward target fabric color */
function applyFabricColor(
  r: number,
  g: number,
  b: number,
  target: [number, number, number]
): [number, number, number] {
  const [, os, ol] = rgbToHsl(r, g, b);
  const [th, ts] = rgbToHsl(target[0], target[1], target[2]);
  const sat = Math.min(1, ts * 0.82 + os * 0.18);
  const light = Math.max(0.04, Math.min(0.92, ol));
  return hslToRgb(th, sat, light);
}

function mapGarmentPixel(
  x: number,
  y: number,
  region: Region,
  scaleRatio: number,
  needsSize: boolean
): [number, number] {
  if (!needsSize) return [x, y];
  const widthScale = 1 + (scaleRatio - 1) * 0.55;
  return [
    region.cx + (x - region.cx) / widthScale,
    region.anchorY + (y - region.anchorY) / scaleRatio,
  ];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load try-on image"));
    img.src = url;
  });
}

const previewCache = new Map<string, string>();

export interface InstantPreviewOptions {
  imageUrl: string;
  category: GarmentCategory;
  selectedSize: string;
  recommendedSize: string;
  colorId: string;
  baseColorId: string;
}

export async function processGarmentInstantPreview(opts: InstantPreviewOptions): Promise<string> {
  const { imageUrl, category, selectedSize, recommendedSize, colorId, baseColorId } = opts;
  const scaleRatio = sizeToPreviewScale(selectedSize) / sizeToPreviewScale(recommendedSize);
  const needsColor = colorId !== baseColorId;
  const needsSize = Math.abs(scaleRatio - 1) > 0.008;

  if (!needsColor && !needsSize) return imageUrl;

  const cacheKey = `${imageUrl}|${category}|${selectedSize}|${colorId}`;
  const hit = previewCache.get(cacheKey);
  if (hit) return hit;

  const img = await loadImage(imageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;

  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  out.data.set(src.data);

  const fabricMask = buildFabricMask(src.data, w, h, category);
  const region = garmentRegion(category, w, h);
  const targetRgb = hexToRgb(colorOptionById(colorId).swatch);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const alpha = fabricMask[i];
      if (alpha <= 0) continue;

      const p = i * 4;
      const [sx, sy] = mapGarmentPixel(x, y, region, scaleRatio, needsSize);
      const [sr, sg, sb] = needsSize
        ? sampleBilinear(src.data, w, h, sx, sy)
        : [src.data[p], src.data[p + 1], src.data[p + 2]];
      const [or, og, ob] = [src.data[p], src.data[p + 1], src.data[p + 2]];

      if (needsColor && !isLogoOrPrint(sr, sg, sb)) {
        const [nr, ng, nb] = applyFabricColor(sr, sg, sb, targetRgb);
        const t = alpha * 0.92;
        out.data[p] = Math.round(or * (1 - t) + nr * t);
        out.data[p + 1] = Math.round(og * (1 - t) + ng * t);
        out.data[p + 2] = Math.round(ob * (1 - t) + nb * t);
      } else if (needsSize) {
        out.data[p] = sr;
        out.data[p + 1] = sg;
        out.data[p + 2] = sb;
      }
    }
  }

  ctx.putImageData(out, 0, 0);
  const url = canvas.toDataURL("image/png");
  previewCache.set(cacheKey, url);
  return url;
}
