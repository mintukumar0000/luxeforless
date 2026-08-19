"use client";

import { formatPrice } from "@/lib/utils";
import { ShoppingBag, Trash2 } from "lucide-react";
import { Product } from "./ProductCatalog";

interface OutfitBuilderProps {
  selectedProducts: Product[];
  onRemove: (productId: string) => void;
  onSaveOutfit: () => void;
  saving?: boolean;
}

export function OutfitBuilder({
  selectedProducts,
  onRemove,
  onSaveOutfit,
  saving,
}: OutfitBuilderProps) {
  const total = selectedProducts.reduce((sum, p) => sum + Number(p.basePrice), 0);

  if (selectedProducts.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-2xl p-4 z-40">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} />
            <span className="font-medium">Outfit Builder</span>
            <span className="text-stone-400 text-sm">({selectedProducts.length} items)</span>
          </div>
          <span className="font-serif text-lg">{formatPrice(total)}</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {selectedProducts.map((product) => {
            const img = product.garmentAssets[0]?.vtoReadyUrl || product.garmentAssets[0]?.imageUrl;
            return (
              <div key={product.id} className="flex-shrink-0 w-20 relative group">
                <div className="aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={product.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <button
                  onClick={() => onRemove(product.id)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={12} />
                </button>
                <p className="text-xs truncate mt-1">{product.name}</p>
              </div>
            );
          })}
        </div>

        <button
          onClick={onSaveOutfit}
          disabled={saving || selectedProducts.length === 0}
          className="mt-3 w-full py-2.5 rounded-xl bg-stone-900 text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : `Save Outfit · ${formatPrice(total)}`}
        </button>
      </div>
    </div>
  );
}
