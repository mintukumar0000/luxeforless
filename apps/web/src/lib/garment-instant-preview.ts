/**
 * Canvas-based instant garment preview — size + color without touching skin, hair, logo, or background.
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
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isStudioBackground(r: number, g: number, b: number): boolean {
  const l = lum(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return l > 198 && spread < 28;
}

function isSkinTone(r: number, g: number, b: number): boolean {
  const y = lum(r, g, b);
  if (y < 40 || y > 245) return false;
  const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
  const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
  if (cr >= 135 && cr <= 175 && cb >= 80 && cb <= 125) return true;
  if (r > 100 && g > 50 && b > 25 && r > g && r > b && r - g > 10) return true;
  return false;
}

/** White / light print, logo, or graphic — always keep original pixels. */
function isLogoOrPrint(r: number, g: number, b: number): boolean {
  const l = lum(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (l > 175) return true;
  if (l > 125 && spread < 60) return true;
  return false;
}

function garmentRegion(category: GarmentCategory, w: number, h: number): Region {
  if (category === "tops") {
    return {
      x0: Math.floor(w * 0.14),
      y0: Math.floor(h * 0.24),
      x1: Math.floor(w * 0.86),
      y1: Math.floor(h * 0.56),
      cx: w * 0.5,
      cy: h * 0.38,
    };
  }
  if (category === "bottoms") {
    return {
      x0: Math.floor(w * 0.16),
      y0: Math.floor(h * 0.5),
      x1: Math.floor(w * 0.84),
      y1: Math.floor(h * 0.9),
      cx: w * 0.5,
      cy: h * 0.7,
    };
  }
  return {
    x0: Math.floor(w * 0.14),
    y0: Math.floor(h * 0.24),
    x1: Math.floor(w * 0.86),
    y1: Math.floor(h * 0.9),
    cx: w * 0.5,
    cy: h * 0.55,
  };
}

function inHeadZone(x: number, y: number, w: number, h: number): boolean {
  const nx = (x - w * 0.5) / (w * 0.22);
  const ny = (y - h * 0.12) / (h * 0.14);
  return ny < 1 && nx * nx + ny * ny < 1.2;
}

function buildFabricMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  category: GarmentCategory
): Uint8Array {
  const region = garmentRegion(category, w, h);
  const mask = new Uint8Array(w * h);
  const skinBuf = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      if (isSkinTone(data[p], data[p + 1], data[p + 2])) skinBuf[i] = 1;
    }
  }

  const skinDilated = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        skinBuf[i] ||
        skinBuf[i - 1] ||
        skinBuf[i + 1] ||
        skinBuf[i - w] ||
        skinBuf[i + w]
      ) {
        skinDilated[i] = 1;
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) continue;
      if (inHeadZone(x, y, w, h)) continue;

      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      if (isStudioBackground(r, g, b)) continue;
      if (skinDilated[i]) continue;
      if (isLogoOrPrint(r, g, b)) continue;

      const l = lum(r, g, b);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (l < 195 && (l < 120 || spread > 6)) mask[i] = 1;
    }
  }

  return mask;
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

function applyFabricColor(
  r: number,
  g: number,
  b: number,
  target: [number, number, number]
): [number, number, number] {
  const origL = Math.max(lum(r, g, b), 1) / 255;
  const [tr, tg, tb] = target;
  const targetL = Math.max(lum(tr, tg, tb), 1) / 255;
  const shade = origL / Math.max(targetL, 0.08);
  const fold = 0.72 + shade * 0.28;
  return [
    Math.min(255, Math.round(tr * fold)),
    Math.min(255, Math.round(tg * fold)),
    Math.min(255, Math.round(tb * fold)),
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
      if (!fabricMask[i]) continue;

      const p = i * 4;
      let sx = x;
      let sy = y;
      if (needsSize) {
        sx = region.cx + (x - region.cx) / scaleRatio;
        sy = region.cy + (y - region.cy) / scaleRatio;
      }

      let [r, g, b] = sampleBilinear(src.data, w, h, sx, sy);

      if (needsColor && !isLogoOrPrint(r, g, b) && !isSkinTone(r, g, b) && !isStudioBackground(r, g, b)) {
        [r, g, b] = applyFabricColor(r, g, b, targetRgb);
      }

      out.data[p] = r;
      out.data[p + 1] = g;
      out.data[p + 2] = b;
    }
  }

  ctx.putImageData(out, 0, 0);
  const url = canvas.toDataURL("image/png");
  previewCache.set(cacheKey, url);
  return url;
}
