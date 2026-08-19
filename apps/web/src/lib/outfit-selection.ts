import { Product } from "@/components/ProductCatalog";

export interface OutfitSelection {
  product: Product;
  size: string;
  colorId: string;
  variantId: string;
}
