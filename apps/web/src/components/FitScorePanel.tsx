"use client";

import { FitResult } from "@/lib/fit-scoring";
import { formatPrice } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface FitScorePanelProps {
  fitResult: FitResult;
  productName: string;
  price: number;
}

export function FitScorePanel({ fitResult, productName, price }: FitScorePanelProps) {
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
        </div>
      </div>

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
