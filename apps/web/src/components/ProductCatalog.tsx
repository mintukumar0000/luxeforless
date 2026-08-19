"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, formatPrice, CATEGORY_LABELS } from "@/lib/utils";
import { categoriesForFocus, TryOnFocus } from "@/lib/try-on-focus";
import { Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  basePrice: string;
  color: string;
  garmentAssets: {
    color: string;
    vtoReadyUrl: string | null;
    imageUrl: string;
    garmentPhotoType?: string;
  }[];
  variants: { id: string; size: string; color: string; stockQty: number }[];
}

export type { Product };

interface ProductCatalogProps {
  storeId: string;
  tryOnFocus: TryOnFocus;
  selectedIds: string[];
  onSelect: (product: Product) => void;
  onTryOn: (product: Product) => void;
  loadingProductId?: string | null;
}

const ALL_CATEGORIES = ["all", "tops", "bottoms", "one_pieces"];

export function ProductCatalog({
  storeId,
  tryOnFocus,
  selectedIds,
  onSelect,
  onTryOn,
  loadingProductId,
}: ProductCatalogProps) {
  const allowed = useMemo(() => categoriesForFocus(tryOnFocus), [tryOnFocus]);
  const visibleCategories = ALL_CATEGORIES.filter(
    (cat) => cat === "all" || allowed.includes(cat)
  );
  const initialCategory =
    tryOnFocus === "upper" ? "tops" : tryOnFocus === "lower" ? "bottoms" : "all";

  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState(initialCategory);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const params = new URLSearchParams({ storeId });
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/products?${params}`);
      const data: Product[] = await res.json();
      setProducts(data.filter((p) => allowed.includes(p.category)));
      setLoading(false);
    };
    fetchProducts();
  }, [storeId, category, allowed]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {visibleCategories.map((cat) => (
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
        <p className="text-center text-stone-500 py-12">No products in this category.</p>
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
                role="button"
                tabIndex={0}
                onClick={() => !isLoading && onTryOn(product)}
                onKeyDown={(e) => e.key === "Enter" && !isLoading && onTryOn(product)}
                className={cn(
                  "group rounded-xl border overflow-hidden transition cursor-pointer",
                  isSelected ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200 hover:border-stone-400"
                )}
              >
                <div className="aspect-[3/4] bg-stone-100 relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={product.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/50 to-transparent">
                    <span className="text-white text-xs font-medium">
                      {isLoading ? "Generating…" : "Tap to try on"}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-stone-400 uppercase">{product.brand}</p>
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm">{formatPrice(Number(product.basePrice))}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(product);
                      }}
                      className="text-xs text-stone-500 hover:text-stone-900 underline"
                    >
                      {isSelected ? "Added ✓" : "+ Outfit"}
                    </button>
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
