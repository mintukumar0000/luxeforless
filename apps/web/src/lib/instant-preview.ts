/** Instant visual tweaks on the AI result — no second GPU run. */

export interface ColorOption {
  id: string;
  label: string;
  swatch: string;
}

export const GARMENT_COLOR_OPTIONS: ColorOption[] = [
  { id: "black", label: "Black", swatch: "#1a1a1a" },
  { id: "white", label: "White", swatch: "#f2f2f2" },
  { id: "navy", label: "Navy", swatch: "#1e3a5f" },
  { id: "forest", label: "Forest", swatch: "#2d5016" },
  { id: "burgundy", label: "Burgundy", swatch: "#6b1d3a" },
  { id: "sand", label: "Sand", swatch: "#c4a574" },
];

export function colorOptionById(id: string): ColorOption {
  return GARMENT_COLOR_OPTIONS.find((c) => c.id === id) ?? GARMENT_COLOR_OPTIONS[0];
}

/** Relative garment scale vs recommended AI size — visible but realistic. */
export function sizeToPreviewScale(size: string): number {
  const map: Record<string, number> = {
    XS: 0.9,
    S: 0.95,
    M: 1,
    L: 1.05,
    XL: 1.1,
    XXL: 1.15,
    "Free Size": 1,
    "28": 0.91,
    "30": 0.95,
    "32": 1,
    "34": 1.05,
    "36": 1.1,
    "38": 1.14,
    "40": 1.18,
  };
  return map[size] ?? 1;
}

export interface GarmentSizeTransform {
  scaleX: number;
  scaleY: number;
  originY: string;
}

/** Scale only the garment region — anchored at chest/waist/full body. */
export function sizeToGarmentTransform(
  size: string,
  category: string,
  recommendedSize: string
): GarmentSizeTransform {
  const selected = sizeToPreviewScale(size);
  const ref = sizeToPreviewScale(recommendedSize);
  const ratio = selected / ref;

  let originY = "50%";
  if (category === "tops") originY = "30%";
  else if (category === "bottoms") originY = "72%";

  // Width grows slightly less than height for a natural "size up" look
  const scaleY = ratio;
  const scaleX = 1 + (ratio - 1) * 0.75;

  return { scaleX, scaleY, originY };
}

export function tryOnCacheKey(productId: string, colorId: string): string {
  return `${productId}::${colorId}`;
}
