/** Resolve garment asset and product variant by size + color. */

export interface CatalogGarmentAsset {
  color: string;
  vtoReadyUrl: string | null;
  imageUrl: string;
  garmentPhotoType?: string;
}

export interface CatalogVariant {
  id: string;
  size: string;
  color: string;
  stockQty: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  basePrice: string;
  color: string;
  garmentAssets: CatalogGarmentAsset[];
  variants: CatalogVariant[];
}

export function normalizeColorId(color: string): string {
  return color.toLowerCase().trim().replace(/\s+/g, "-");
}

export function garmentForColor(
  product: CatalogProduct,
  colorId: string
): CatalogGarmentAsset | undefined {
  const assets = product.garmentAssets ?? [];
  return (
    assets.find((a) => normalizeColorId(a.color) === normalizeColorId(colorId)) ??
    assets.find((a) => a.color === product.color) ??
    assets[0]
  );
}

export function variantForSizeColor(
  product: CatalogProduct,
  size: string,
  colorId: string
): CatalogVariant | undefined {
  const color = normalizeColorId(colorId);
  return (
    product.variants.find(
      (v) => v.size === size && normalizeColorId(v.color) === color
    ) ??
    product.variants.find((v) => v.size === size) ??
    product.variants[0]
  );
}

export function availableColors(product: CatalogProduct): string[] {
  const fromAssets = product.garmentAssets.map((a) => normalizeColorId(a.color));
  const fromVariants = product.variants.map((v) => normalizeColorId(v.color));
  return Array.from(
    new Set([...fromAssets, ...fromVariants, normalizeColorId(product.color)])
  );
}
