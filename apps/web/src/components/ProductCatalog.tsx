"use client";

import { useEffect, useState } from "react";
import { cn, formatPrice, CATEGORY_LABELS } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  basePrice: string;
  color: string;
  garmentAssets: {
    vtoReadyUrl: string | null;
    imageUrl: string;
    garmentPhotoType?: string;
  }[];
  variants: { id: string; size: string; stockQty: number }[];
}

interface ProductCatalogProps {
  storeId: string;
  selectedIds: string[];
  onSelect: (product: Product) => void;
  onTryOn: (product: Product) => void;
  loadingProductId?: string | null;
}

const CATEGORIES = ["all", "tops", "bottoms", "one_pieces"];

export function ProductCatalog({
  storeId,
  selectedIds,
  onSelect,
  onTryOn,
  loadingProductId,
}: ProductCatalogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const params = new URLSearchParams({ storeId });
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data);
      setLoading(false);
    };
    fetchProducts();
  }, [storeId, category]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm transition",
              category === cat
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            )}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-stone-400" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-stone-500 py-12">
          No products yet. Add garments in the Upload Studio.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => {
            const img =
              product.garmentAssets[0]?.vtoReadyUrl ||
              product.garmentAssets[0]?.imageUrl ||
              "/placeholder-garment.png";
            const isSelected = selectedIds.includes(product.id);
            const isLoading = loadingProductId === product.id;

            return (
              <div
                key={product.id}
                className={cn(
                  "group rounded-xl border overflow-hidden transition",
                  isSelected ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200 hover:border-stone-400"
                )}
              >
                <div className="aspect-[3/4] bg-stone-100 relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={product.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-end justify-center pb-3 gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => onTryOn(product)}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-white rounded-lg text-sm font-medium shadow disabled:opacity-50"
                    >
                      {isLoading ? "Trying on..." : "Try On"}
                    </button>
                    <button
                      onClick={() => onSelect(product)}
                      className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-sm font-medium shadow"
                    >
                      {isSelected ? "Selected ✓" : "Add to Outfit"}
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-stone-400 uppercase">{product.brand}</p>
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm">{formatPrice(Number(product.basePrice))}</span>
                    <span className="text-xs text-stone-400 capitalize">{product.color}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { Product };
