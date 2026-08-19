"use client";

import { FitResult } from "@/lib/fit-scoring";
import { SizeIntelligence } from "@/lib/fit-intelligence";
import { formatPrice, cn } from "@/lib/utils";
import { AlertTriangle, Sparkles } from "lucide-react";

interface FitScorePanelProps {
  fitResult: FitResult;
  productName: string;
  price: number;
  userDeclaredSize?: string | null;
  sizeIntelligence?: SizeIntelligence | null;
}

export function FitScorePanel({
  fitResult,
  productName,
  price,
  userDeclaredSize,
  sizeIntelligence,
}: FitScorePanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
      <div>
        <h3 className="font-medium text-stone-900">{productName}</h3>
        <p className="text-stone-500 text-sm">{formatPrice(price)}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e7e5e4" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="#292524"
              strokeWidth="3"
              strokeDasharray={`${fitResult.fitScore} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold">
            {fitResult.fitScore}%
          </span>
        </div>
        <div>
          <p className="text-sm text-stone-500">Estimated fit match</p>
          <p className="text-xl font-serif">
            Recommended: <span className="font-semibold">{fitResult.recommendedSize}</span>
          </p>
          {userDeclaredSize && (
            <p className="text-xs text-stone-500 mt-1">
              Your stated size: <span className="font-medium text-stone-700">{userDeclaredSize}</span>
            </p>
          )}
        </div>
      </div>

      {sizeIntelligence && (
        <div
          className={cn(
            "rounded-xl p-3 text-sm space-y-1",
            sizeIntelligence.verdict === "ai_better"
              ? "bg-blue-50 text-blue-900 border border-blue-100"
              : sizeIntelligence.verdict === "match"
                ? "bg-green-50 text-green-900 border border-green-100"
                : "bg-stone-50 text-stone-800 border border-stone-100"
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            <Sparkles size={14} className="shrink-0" />
            {sizeIntelligence.headline}
          </div>
          <p className="text-xs opacity-90">{sizeIntelligence.detail}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Size breakdown</p>
        {fitResult.sizeRecommendations.map((rec) => (
          <div key={rec.size} className="flex items-center justify-between text-sm py-1">
            <span className={rec.size === fitResult.recommendedSize ? "font-semibold" : ""}>
              {rec.size}
            </span>
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-stone-700 rounded-full"
                  style={{ width: `${rec.matchPercent}%` }}
                />
              </div>
              <span className="text-stone-500 w-10 text-right">{rec.matchPercent}%</span>
              <span className={rec.inStock ? "text-green-600" : "text-red-400"}>
                {rec.inStock ? `${rec.stockQty} in stock` : "Out of stock"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <p>{fitResult.disclaimer}</p>
      </div>
    </div>
  );
}
