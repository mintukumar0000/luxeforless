"use client";

import { formatPrice } from "@/lib/utils";
import { FitScorePanel } from "./FitScorePanel";
import { FitResult } from "@/lib/fit-scoring";
import { SizeIntelligence } from "@/lib/fit-intelligence";
import { GARMENT_COLOR_OPTIONS, colorOptionById } from "@/lib/instant-preview";
import {
  AnimatedTryOnImage,
  InstantSwapControls,
  useInstantSwapPreview,
} from "./InstantSwapControls";
import { Product } from "./ProductCatalog";
import { Sparkles, X } from "lucide-react";

interface TryOnResultProps {
  resultUrl: string;
  product: Product;
  productName: string;
  price: number;
  fitResult: FitResult;
  userDeclaredSize?: string | null;
  sizeIntelligence?: SizeIntelligence | null;
  processingTimeMs: number;
  tryOnCache: Record<string, string>;
  onClose: () => void;
  onAddToOutfit: (size: string, colorId: string) => void;
}

export function TryOnResultView({
  resultUrl,
  product,
  productName,
  price,
  fitResult,
  userDeclaredSize,
  processingTimeMs,
  tryOnCache,
  onClose,
  onAddToOutfit,
}: TryOnResultProps) {
  const baseColorId =
    GARMENT_COLOR_OPTIONS.find((c) => c.label.toLowerCase() === product.color?.toLowerCase())?.id ??
    "black";

  const swap = useInstantSwapPreview({
    resultUrl,
    productId: product.id,
    category: product.category,
    fitResult,
    userDeclaredSize: userDeclaredSize ?? null,
    initialSize: fitResult.recommendedSize,
    initialColorId: baseColorId,
    tryOnCache,
  });

  const liveFitResult: FitResult = {
    ...fitResult,
    recommendedSize: swap.selectedSize,
    fitScore: swap.liveFitScore,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-stone-50 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-[modalIn_0.35s_ease-out]">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="font-serif text-lg">AI Try-On Preview</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4">
          <div>
            <AnimatedTryOnImage
              src={swap.displayUrl}
              alt="Try-on result"
              swapFlash={swap.swapFlash}
              isApproximateColor={swap.isApproximateColor}
              processing={swap.processing}
              category={swap.category}
            />
            <p className="text-xs text-stone-400 mt-2 text-center">
              AI base · {(processingTimeMs / 1000).toFixed(1)}s · Size/color swaps are instant
            </p>
          </div>

          <div className="space-y-4">
            <InstantSwapControls
              category={product.category}
              fitResult={fitResult}
              userDeclaredSize={userDeclaredSize ?? null}
              selectedSize={swap.selectedSize}
              onSizeChange={swap.onSizeChange}
              selectedColorId={swap.selectedColorId}
              onColorChange={swap.onColorChange}
              productId={product.id}
              tryOnCache={tryOnCache}
              baseColorId={baseColorId}
            />

            <FitScorePanel
              fitResult={liveFitResult}
              productName={productName}
              price={price}
              userDeclaredSize={userDeclaredSize}
              sizeIntelligence={swap.liveIntelligence}
              animateKey={`${swap.selectedSize}-${swap.selectedColorId}`}
            />

            <button
              type="button"
              onClick={() => onAddToOutfit(swap.selectedSize, swap.selectedColorId)}
              className="w-full py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-transform active:scale-[0.98]"
            >
              Add to Outfit · {formatPrice(price)} · {swap.selectedSize} ·{" "}
              {colorOptionById(swap.selectedColorId).label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
