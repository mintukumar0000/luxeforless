"use client";

import { formatPrice } from "@/lib/utils";
import { FitScorePanel } from "./FitScorePanel";
import { FitResult } from "@/lib/fit-scoring";
import { Sparkles, X } from "lucide-react";

interface TryOnResultProps {
  resultUrl: string;
  productName: string;
  price: number;
  fitResult: FitResult;
  processingTimeMs: number;
  onClose: () => void;
  onAddToOutfit: () => void;
}

export function TryOnResultView({
  resultUrl,
  productName,
  price,
  fitResult,
  processingTimeMs,
  onClose,
  onAddToOutfit,
}: TryOnResultProps) {
  const vtoBase = process.env.NEXT_PUBLIC_VTO_SERVICE_URL || "http://localhost:8000";
  const fullUrl = resultUrl.startsWith("http") ? resultUrl : `${vtoBase}${resultUrl}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-stone-50 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="font-serif text-lg">AI Try-On Preview</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4">
          <div>
            <div className="aspect-[3/4] bg-stone-200 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fullUrl} alt="Try-on result" className="w-full h-full object-cover" />
            </div>
            <p className="text-xs text-stone-400 mt-2 text-center">
              AI-generated preview · Generated in {(processingTimeMs / 1000).toFixed(1)}s · Not an exact fit guarantee
            </p>
          </div>

          <div className="space-y-4">
            <FitScorePanel fitResult={fitResult} productName={productName} price={price} />

            <button
              onClick={onAddToOutfit}
              className="w-full py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800"
            >
              Add to Outfit · {formatPrice(price)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
