/** Client-side garment-only recolor — preserves skin, background, and logo/text. */

export type GarmentCategory = "tops" | "bottoms" | "one_pieces" | string;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 35) return false;
  const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
  const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
  if (cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127 && y > 50) return true;
  if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 12 && y < 230) {
    return true;
  }
  return false;
}

function isBackground(r: number, g: number, b: number): boolean {
  return r > 205 && g > 205 && b > 205;
}

/** Preserve bright logos / printed text on dark fabric. */
function isDesignDetail(r: number, g: number, b: number): boolean {
  const lum = luminance(r, g, b);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return lum > 0.72 && chroma < 80;
}

function garmentBand(category: GarmentCategory, h: number): [number, number] {
  if (category === "tops") return [Math.floor(h * 0.1), Math.floor(h * 0.58)];
  if (category === "bottoms") return [Math.floor(h * 0.42), Math.floor(h * 0.92)];
  return [Math.floor(h * 0.1), Math.floor(h * 0.92)];
}

function isGarmentPixel(
  r: number,
  g: number,
  b: number,
  y: number,
  y0: number,
  y1: number
): boolean {
  if (y < y0 || y > y1) return false;
  if (isBackground(r, g, b) || isSkin(r, g, b) || isDesignDetail(r, g, b)) return false;
  const lum = luminance(r, g, b);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  // Fabric: not ultra-bright studio, has some color or is dark cloth
  return lum < 0.92 || (chroma > 8 && lum < 0.85);
}

function applyTargetWithLuminance(
  target: [number, number, number],
  lum: number,
  isLightColor: boolean
): [number, number, number] {
  const [tr, tg, tb] = target;
  const tLum = Math.max(luminance(tr, tg, tb), 0.05);
  const scale = isLightColor ? Math.min(lum / tLum + 0.15, 1.35) : lum / tLum;
  return [
    Math.min(255, Math.round(tr * scale)),
    Math.min(255, Math.round(tg * scale)),
    Math.min(255, Math.round(tb * scale)),
  ];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for recolor"));
    img.src = url;
  });
}

const recolorCache = new Map<string, string>();

export async function recolorGarmentOnImage(
  imageUrl: string,
  targetHex: string,
  category: GarmentCategory
): Promise<string> {
  const cacheKey = `${imageUrl}::${targetHex}::${category}`;
  const cached = recolorCache.get(cacheKey);
  if (cached) return cached;

  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const target = hexToRgb(targetHex);
  const isLightColor = luminance(target[0], target[1], target[2]) > 0.65;
  const [y0, y1] = garmentBand(category, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isGarmentPixel(r, g, b, y, y0, y1)) continue;
      const lum = luminance(r, g, b);
      const [nr, ng, nb] = applyTargetWithLuminance(target, lum, isLightColor);
      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const out = canvas.toDataURL("image/png");
  recolorCache.set(cacheKey, out);
  return out;
}
