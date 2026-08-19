/** Instant visual tweaks on the AI result — no second GPU run. */

export interface ColorOption {
  id: string;
  label: string;
  swatch: string;
}

export const GARMENT_COLOR_OPTIONS: ColorOption[] = [
  { id: "black", label: "Black", swatch: "#141414" },
  { id: "white", label: "White", swatch: "#ececec" },
  { id: "red", label: "Red", swatch: "#b91c1c" },
  { id: "navy", label: "Navy", swatch: "#1e3a5f" },
  { id: "forest", label: "Forest", swatch: "#2d5016" },
  { id: "burgundy", label: "Burgundy", swatch: "#6b1d3a" },
  { id: "sand", label: "Sand", swatch: "#c4a574" },
];

export function colorOptionById(id: string): ColorOption {
  return GARMENT_COLOR_OPTIONS.find((c) => c.id === id) ?? GARMENT_COLOR_OPTIONS[0];
}

/** Garment fit scale relative to AI recommended size. Free Size = loose oversized. */
export function sizeToPreviewScale(size: string): number {
  const map: Record<string, number> = {
    XS: 0.92,
    S: 0.96,
    M: 1,
    L: 1.04,
    XL: 1.08,
    XXL: 1.12,
    "Free Size": 1.16,
    "28": 0.92,
    "30": 0.96,
    "32": 1,
    "34": 1.04,
    "36": 1.08,
    "38": 1.12,
    "40": 1.16,
  };
  return map[size] ?? 1;
}

export function tryOnCacheKey(productId: string, colorId: string): string {
  return `${productId}::${colorId}`;
}

/** Ensure Free Size always appears in instant swap chips. */
export function sizesWithFreeSize(sizes: string[], category: string): string[] {
  const free = "Free Size";
  const numeric = sizes.some((s) => /^\d+$/.test(s));
  const letter = sizes.some((s) => !/^\d+$/.test(s));
  const out = [...sizes];
  if (!out.includes(free)) {
    if (category === "bottoms" && (numeric || out.length === 0)) out.push(free);
    else if (category !== "bottoms" && (letter || out.length === 0)) out.push(free);
  }
  return out;
}

export function freeSizeFitHint(size: string): string | null {
  if (size !== "Free Size") return null;
  return "One size · loose fit · best for S–L frames";
}
