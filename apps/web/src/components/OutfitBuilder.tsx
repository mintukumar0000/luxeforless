"use client";

import { formatPrice } from "@/lib/utils";
import { ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { OutfitSelection } from "@/lib/outfit-selection";

interface OutfitBuilderProps {
  selections: OutfitSelection[];
  onRemove: (productId: string) => void;
  onSaveOutfit: () => void;
  onTryFullOutfit: () => void;
  saving?: boolean;
  tryingFullOutfit?: boolean;
}

export function OutfitBuilder({
  selections,
  onRemove,
  onSaveOutfit,
  onTryFullOutfit,
  saving,
  tryingFullOutfit,
}: OutfitBuilderProps) {
  const total = selections.reduce((sum, s) => sum + Number(s.product.basePrice), 0);
  const hasTop = selections.some((s) => s.product.category === "tops");
  const hasBottom = selections.some((s) => s.product.category === "bottoms");

  if (selections.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-2xl p-4 z-40">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} />
            <span className="font-medium">Outfit Builder</span>
            <span className="text-stone-400 text-sm">({selections.length} items)</span>
          </div>
          <span className="font-serif text-lg">{formatPrice(total)}</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {selections.map(({ product, size, colorId }) => {
            const img =
              product.garmentAssets.find((a) => a.color === colorId)?.vtoReadyUrl ||
              product.garmentAssets[0]?.vtoReadyUrl ||
              product.garmentAssets[0]?.imageUrl;
            return (
              <div key={product.id} className="flex-shrink-0 w-24 relative group">
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
                <p className="text-[10px] text-stone-400">
                  {size} · {colorId}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          {hasTop && hasBottom && (
            <button
              type="button"
              onClick={onTryFullOutfit}
              disabled={tryingFullOutfit}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-stone-900 text-stone-900 font-medium disabled:opacity-50"
            >
              <Sparkles size={16} />
              {tryingFullOutfit ? "AI full outfit..." : "Try full outfit (AI)"}
            </button>
          )}
          <button
            onClick={onSaveOutfit}
            disabled={saving || selections.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save · ${formatPrice(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
