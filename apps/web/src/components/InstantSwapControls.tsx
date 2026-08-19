"use client";

import { useCallback, useEffect, useState } from "react";
import { FitResult } from "@/lib/fit-scoring";
import { analyzeSizeFit, SizeIntelligence } from "@/lib/fit-intelligence";
import { normalizeColorId } from "@/lib/product-variants";
import { processGarmentInstantPreview } from "@/lib/garment-instant-preview";
import { GARMENT_COLOR_OPTIONS, freeSizeFitHint, sizesWithFreeSize, tryOnCacheKey } from "@/lib/instant-preview";
import { cn } from "@/lib/utils";
import { Palette, Ruler, Zap } from "lucide-react";

interface InstantSwapControlsProps {
  category: string;
  fitResult: FitResult;
  userDeclaredSize: string | null;
  selectedSize: string;
  onSizeChange: (size: string) => void;
  selectedColorId: string;
  onColorChange: (colorId: string) => void;
  productId: string;
  tryOnCache: Record<string, string>;
  baseColorId: string;
  aiColorIds?: string[];
}

function sizesForCategory(category: string, fitResult: FitResult): string[] {
  const fromChart = fitResult.sizeRecommendations.map((r) => r.size);
  const filtered =
    category === "bottoms"
      ? fromChart.filter((s) => /^\d+$/.test(s) || s === "Free Size")
      : fromChart.filter((s) => !/^\d+$/.test(s) || s === "Free Size");
  return sizesWithFreeSize(filtered, category);
}

export function InstantSwapControls({
  category,
  fitResult,
  selectedSize,
  onSizeChange,
  selectedColorId,
  onColorChange,
  productId,
  tryOnCache,
  baseColorId,
  aiColorIds = [],
}: InstantSwapControlsProps) {
  const sizes = sizesForCategory(category, fitResult);
  const hasCachedColor = (colorId: string) =>
    Boolean(tryOnCache[tryOnCacheKey(productId, colorId)]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-medium text-stone-500 uppercase tracking-wide">
        <Zap size={14} className="text-amber-500" />
        Instant swap · no new AI run
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Ruler size={15} className="text-stone-400" />
          Size
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((size) => {
            const rec = fitResult.sizeRecommendations.find((r) => r.size === size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => onSizeChange(size)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm border transition-all duration-300 ease-out",
                  selectedSize === size
                    ? "bg-stone-900 text-white border-stone-900 scale-105 shadow-md"
                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:scale-[1.02]"
                )}
              >
                {size}
                {rec && (
                  <span className="ml-1 text-[10px] opacity-70">{rec.matchPercent}%</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-400">
          Cloth area grows/shrinks — body & background stay fixed. Free Size = loose oversized fit.
        </p>
        {freeSizeFitHint(selectedSize) && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
            {freeSizeFitHint(selectedSize)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Palette size={15} className="text-stone-400" />
          Color
        </div>
        <div className="flex flex-wrap gap-2">
          {GARMENT_COLOR_OPTIONS.map((color) => {
            const cached = hasCachedColor(color.id);
            const hasAiAsset = aiColorIds.includes(color.id) || aiColorIds.includes(normalizeColorId(color.id));
            const isBase = color.id === baseColorId;
            return (
              <button
                key={color.id}
                type="button"
                title={
                  cached || isBase
                    ? `${color.label} · AI render cached`
                    : hasAiAsset
                      ? `${color.label} · Run AI for realistic`
                      : `${color.label} · quick preview only`
                }
                onClick={() => onColorChange(color.id)}
                className={cn(
                  "relative w-9 h-9 rounded-full border-2 transition-all duration-300 ease-out",
                  selectedColorId === color.id
                    ? "border-stone-900 scale-110 ring-2 ring-stone-400 ring-offset-2"
                    : "border-stone-200 hover:scale-105 hover:border-stone-400"
                )}
                style={{ backgroundColor: color.swatch }}
              >
                {(cached || isBase || hasAiAsset) && (
                  <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white ${cached || isBase ? "bg-green-500" : "bg-blue-500"}`} />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-400">
          Green = AI cached · Blue = garment in catalog · Tap Run AI for photo-realistic color
        </p>
      </div>
    </div>
  );
}

interface UseInstantSwapPreviewOptions {
  resultUrl: string;
  productId: string;
  category: string;
  fitResult: FitResult;
  userDeclaredSize: string | null;
  initialSize: string;
  initialColorId: string;
  tryOnCache: Record<string, string>;
}

export function useInstantSwapPreview({
  resultUrl,
  productId,
  category,
  fitResult,
  userDeclaredSize,
  initialSize,
  initialColorId,
  tryOnCache,
}: UseInstantSwapPreviewOptions) {
  const [selectedSize, setSelectedSize] = useState(initialSize);
  const [selectedColorId, setSelectedColorId] = useState(initialColorId);
  const [swapFlash, setSwapFlash] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const triggerFlash = useCallback(() => {
    setSwapFlash(true);
    const t = setTimeout(() => setSwapFlash(false), 450);
    return () => clearTimeout(t);
  }, []);

  const onSizeChange = useCallback(
    (size: string) => {
      setSelectedSize(size);
      triggerFlash();
    },
    [triggerFlash]
  );

  const onColorChange = useCallback(
    (colorId: string) => {
      setSelectedColorId(colorId);
      triggerFlash();
    },
    [triggerFlash]
  );

  const cachedUrl = tryOnCache[tryOnCacheKey(productId, selectedColorId)];
  const sourceUrl =
    cachedUrl ?? (selectedColorId === initialColorId ? resultUrl : resultUrl);
  const isDefault =
    selectedSize === fitResult.recommendedSize &&
    selectedColorId === initialColorId &&
    !cachedUrl;

  useEffect(() => {
    if (isDefault) {
      setPreviewUrl(null);
      setProcessing(false);
      return;
    }

    let cancelled = false;
    setProcessing(true);

    processGarmentInstantPreview({
      imageUrl: sourceUrl,
      category,
      selectedSize,
      recommendedSize: fitResult.recommendedSize,
      colorId: selectedColorId,
      baseColorId: initialColorId,
    })
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url);
          setProcessing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(null);
          setProcessing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    sourceUrl,
    category,
    selectedSize,
    selectedColorId,
    fitResult.recommendedSize,
    initialColorId,
    isDefault,
  ]);

  const displayUrl = isDefault ? resultUrl : previewUrl ?? sourceUrl;
  const needsPreview = !isDefault;

  const selectedRec = fitResult.sizeRecommendations.find((r) => r.size === selectedSize);
  const liveFitScore =
    selectedRec?.matchPercent ??
    (selectedSize === "Free Size" ? 68 : fitResult.fitScore);
  const liveIntelligence: SizeIntelligence = analyzeSizeFit(
    selectedSize === userDeclaredSize ? userDeclaredSize : selectedSize,
    {
      ...fitResult,
      recommendedSize: selectedSize,
      fitScore: liveFitScore,
    }
  );

  return {
    selectedSize,
    selectedColorId,
    onSizeChange,
    onColorChange,
    displayUrl,
    swapFlash,
    liveFitScore,
    liveIntelligence,
    isApproximateColor: needsPreview,
    processing,
    category,
  };
}

/** Animated wrapper for try-on image — crossfade + garment region scaling */
export function AnimatedTryOnImage({
  src,
  alt,
  swapFlash,
  isApproximateColor,
  processing,
  category,
}: {
  src: string;
  alt: string;
  swapFlash: boolean;
  isApproximateColor: boolean;
  processing?: boolean;
  category: string;
}) {
  const [layers, setLayers] = useState<{ src: string; visible: boolean }[]>([
    { src, visible: true },
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top?.src === src) return prev;
      return [...prev.slice(-1), { src, visible: false }];
    });
  }, [src]);

  const handleLoad = (index: number) => {
    setLayers((prev) =>
      prev.map((layer, i) => ({
        ...layer,
        visible: i === index,
      }))
    );
  };

  return (
    <div className="relative aspect-[3/4] bg-stone-200 rounded-xl overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 bg-white transition-opacity duration-300 pointer-events-none z-10",
          swapFlash ? "opacity-35" : "opacity-0"
        )}
      />
      {layers.map((layer, index) => (
        <div
          key={`${layer.src}-${index}`}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-in-out",
            layer.visible ? "opacity-100 z-[2]" : "opacity-0 z-[1]"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={layer.src}
            alt={alt}
            onLoad={() => handleLoad(index)}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
      {processing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isApproximateColor && !processing && (
        <span className="absolute bottom-2 left-2 right-2 text-center text-[10px] bg-black/50 text-white rounded-md py-1 px-2 z-20">
          Instant preview · {category === "bottoms" ? "bottoms" : "top"} cloth only
        </span>
      )}
    </div>
  );
}
