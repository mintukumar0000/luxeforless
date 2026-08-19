"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { ConsentScreen } from "@/components/ConsentScreen";
import { WebcamCapture, CaptureSource } from "@/components/WebcamCapture";
import { ProductCatalog, Product } from "@/components/ProductCatalog";
import { TryOnResultView } from "@/components/TryOnResultView";
import { OutfitBuilder } from "@/components/OutfitBuilder";
import { FitResult } from "@/lib/fit-scoring";
import { BodyEstimates } from "@/lib/fit-scoring";
import { SizeProfile } from "@/lib/size-options";
import { productMatchesFocus, TryOnFocus } from "@/lib/try-on-focus";
import { SizeIntelligence } from "@/lib/fit-intelligence";
import { GARMENT_COLOR_OPTIONS, tryOnCacheKey } from "@/lib/instant-preview";
import {
  garmentForColor,
  normalizeColorId,
  variantForSizeColor,
} from "@/lib/product-variants";
import { runFullOutfitTryOn, runSingleTryOn } from "@/lib/vto-pipeline";
import { APP_NAME } from "@/lib/utils";
import { Camera, Upload, Sparkles } from "lucide-react";

import { OutfitSelection } from "@/lib/outfit-selection";

type Step = "welcome" | "consent" | "capture" | "browse";

const TRYON_PROGRESS_LABELS: Record<string, string> = {
  queued: "Queued",
  preprocessing: "Preparing your studio photo",
  loading_model: "Loading AI models (first run can take 5–15 min on Kaggle)",
  generating: "Generating ultra-realistic try-on",
  generating_top: "AI try-on: top garment",
  generating_bottom: "AI try-on: bottom garment",
  done: "Done",
  error: "Failed",
};

function formatTryOnProgress(progress: string | null): string {
  if (!progress) return "";
  return TRYON_PROGRESS_LABELS[progress] ?? progress.replaceAll("_", " ");
}

interface TryOnState {
  resultUrl: string;
  productName: string;
  price: number;
  fitResult: FitResult;
  processingTimeMs: number;
  product: Product;
  userDeclaredSize: string | null;
  sizeIntelligence: SizeIntelligence | null;
  selectedSize: string;
  selectedColorId: string;
}

export default function MirrorPage() {
  const {
    sessionId,
    demo,
    captureImage,
    sizeProfile,
    tryOnFocus,
    startSession,
    setCaptureImage,
    setBodyEstimates,
    setSizeProfile,
    setTryOnFocus,
  } = useSession();
  const [step, setStep] = useState<Step>("welcome");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [outfitSelections, setOutfitSelections] = useState<OutfitSelection[]>([]);
  const [tryOnState, setTryOnState] = useState<TryOnState | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [tryOnProgress, setTryOnProgress] = useState<string | null>(null);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const [outfitSaved, setOutfitSaved] = useState(false);
  const [tryOnCache, setTryOnCache] = useState<Record<string, string>>({});
  const [captureSource, setCaptureSource] = useState<CaptureSource>("live");

  const handleConsent = async () => {
    await startSession();
    const demoRes = await fetch("/api/demo/init");
    const demoData = await demoRes.json();
    setStoreId(demoData.stores?.[0]?.id || demo?.storeId || null);
    setStep("capture");
  };

  const handleCapture = useCallback(
    async (
      image: string,
      estimates: BodyEstimates | null,
      profile: SizeProfile,
      focus: TryOnFocus,
      validationPassed: boolean,
      source: CaptureSource
    ) => {
      setCaptureImage(image);
      setCaptureSource(source);
      setSizeProfile(profile);
      setTryOnFocus(focus);
      if (estimates) setBodyEstimates(estimates);

      if (sessionId) {
        await fetch("/api/sessions/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            captureImage: image,
            estimates,
            sizeProfile: profile,
            tryOnFocus: focus,
            validationPassed,
          }),
        });
      }

      setStep("browse");
    },
    [sessionId, setCaptureImage, setBodyEstimates, setSizeProfile, setTryOnFocus]
  );

  const completeTryOn = async (
    product: Product,
    resultUrl: string,
    processingTimeMs: number,
    opts: { colorId: string; selectedSize?: string; variantId?: string }
  ) => {
    const res = await fetch("/api/tryon/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        productId: product.id,
        resultUrl,
        processingTimeMs,
        colorId: opts.colorId,
        selectedSize: opts.selectedSize,
        variantId: opts.variantId,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `Try-on failed (${res.status})`);
    }

    setTryOnCache((prev) => ({
      ...prev,
      [tryOnCacheKey(product.id, opts.colorId)]: data.resultUrl,
    }));

    setTryOnState({
      resultUrl: data.resultUrl,
      productName: product.name,
      price: Number(product.basePrice),
      fitResult: data.fitResult,
      processingTimeMs: data.processingTimeMs,
      product,
      userDeclaredSize: data.userDeclaredSize ?? null,
      sizeIntelligence: data.sizeIntelligence ?? null,
      selectedSize: data.fitResult.recommendedSize,
      selectedColorId: opts.colorId,
    });
  };

  const handleTryOn = async (product: Product, colorId?: string) => {
    if (!captureImage || !sessionId) return;

    if (!productMatchesFocus(product.category, tryOnFocus)) {
      alert(`This item doesn't match your "${tryOnFocus}" mode. Retake your photo to switch mode.`);
      return;
    }

    const resolvedColorId =
      colorId ??
      GARMENT_COLOR_OPTIONS.find((c) => c.label.toLowerCase() === product.color?.toLowerCase())
        ?.id ??
      normalizeColorId(product.color);

    const garmentAsset = garmentForColor(product, resolvedColorId);
    if (!garmentAsset?.vtoReadyUrl) {
      alert(
        `No AI garment photo for color "${resolvedColorId}". Upload it in Upload Studio → Add color variant.`
      );
      return;
    }

    setLoadingProductId(product.id);
    setTryOnProgress("queued");

    try {
      const { resultUrl, processingTimeMs } = await runSingleTryOn({
        personImageBase64: captureImage,
        product,
        garmentAsset,
        onProgress: setTryOnProgress,
      });

      const variant = variantForSizeColor(product, product.variants[0]?.size ?? "M", resolvedColorId);

      await completeTryOn(product, resultUrl, processingTimeMs, {
        colorId: resolvedColorId,
        variantId: variant?.id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Try-on failed: ${msg}`);
    } finally {
      setLoadingProductId(null);
      setTryOnProgress(null);
    }
  };

  const handleRunAiColor = async (colorId: string) => {
    if (!tryOnState) return;
    await handleTryOn(tryOnState.product, colorId);
  };

  const handleFullOutfitTryOn = async () => {
    if (!captureImage || !sessionId) return;

    const top = outfitSelections.find((s) => s.product.category === "tops");
    const bottom = outfitSelections.find((s) => s.product.category === "bottoms");
    if (!top || !bottom) {
      alert("Select a top and a bottom in Outfit Builder first.");
      return;
    }

    const topAsset = garmentForColor(top.product, top.colorId);
    const bottomAsset = garmentForColor(bottom.product, bottom.colorId);
    if (!topAsset?.vtoReadyUrl || !bottomAsset?.vtoReadyUrl) {
      alert("Missing garment images for selected colors.");
      return;
    }

    setLoadingProductId("full-outfit");
    setTryOnProgress("generating_top");

    try {
      const { resultUrl, processingTimeMs } = await runFullOutfitTryOn(
        captureImage,
        top.product,
        topAsset,
        bottom.product,
        bottomAsset,
        setTryOnProgress
      );

      await completeTryOn(top.product, resultUrl, processingTimeMs, {
        colorId: top.colorId,
        selectedSize: top.size,
        variantId: top.variantId,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Full outfit try-on failed");
    } finally {
      setLoadingProductId(null);
      setTryOnProgress(null);
    }
  };

  const handleToggleProduct = (product: Product) => {
    setOutfitSelections((prev) => {
      const exists = prev.find((s) => s.product.id === product.id);
      if (exists) return prev.filter((s) => s.product.id !== product.id);
      const filtered = prev.filter((s) => s.product.category !== product.category);
      const colorId = normalizeColorId(product.color);
      const size =
        product.category === "bottoms"
          ? sizeProfile?.lower ?? "32"
          : sizeProfile?.upper ?? "M";
      const variant = variantForSizeColor(product, size, colorId);
      return [
        ...filtered,
        {
          product,
          size,
          colorId,
          variantId: variant?.id ?? product.variants[0]?.id ?? "",
        },
      ];
    });
  };

  const handleAddToOutfit = (size: string, colorId: string) => {
    if (!tryOnState) return;
    const product = tryOnState.product;
    const variant = variantForSizeColor(product, size, colorId);
    setOutfitSelections((prev) => {
      const filtered = prev.filter((s) => s.product.category !== product.category);
      return [
        ...filtered,
        {
          product,
          size,
          colorId,
          variantId: variant?.id ?? product.variants[0]?.id ?? "",
        },
      ];
    });
    setTryOnState(null);
  };

  const handleSaveOutfit = async () => {
    if (!sessionId || outfitSelections.length === 0) return;
    setSavingOutfit(true);

    const variantIds = outfitSelections.map((s) => s.variantId).filter(Boolean);

    await fetch("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, variantIds, name: "My Look" }),
    });

    setSavingOutfit(false);
    setOutfitSaved(true);
    setOutfitSelections([]);
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-serif tracking-tight">{APP_NAME}</h1>
            <p className="text-xs text-stone-400">Virtual Try-On · Stage 1 Complete</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/studio" className="flex items-center gap-1 text-stone-600 hover:text-stone-900">
              <Upload size={14} /> Upload Studio
            </Link>
            <Link href="/admin" className="text-stone-600 hover:text-stone-900">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {step === "welcome" && (
          <div className="text-center py-16 space-y-6">
            <Sparkles className="mx-auto text-amber-500" size={48} />
            <h2 className="text-4xl font-serif">See Yourself in Any Outfit</h2>
            <p className="text-stone-500 max-w-md mx-auto">
              Browse our catalog, virtually try on clothes with AI, and get an estimated size recommendation.
            </p>
            <button
              onClick={() => setStep("consent")}
              className="px-8 py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800"
            >
              Get Started
            </button>
          </div>
        )}

        {step === "consent" && (
          <ConsentScreen onAccept={handleConsent} onDecline={() => setStep("welcome")} />
        )}

        {step === "capture" && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <Camera className="mx-auto text-stone-400 mb-2" size={32} />
              <h2 className="text-2xl font-serif">Your photo</h2>
              <p className="text-stone-500 text-sm mt-1">
                In-store mirror, phone camera, or upload — same AI try-on after this step
              </p>
            </div>
            <WebcamCapture onCapture={handleCapture} onCancel={() => setStep("consent")} />
          </div>
        )}

        {step === "browse" && storeId && (
          <div className="space-y-6 pb-32">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif">Browse & Try On</h2>
                <p className="text-stone-500 text-sm">
                  Tap try-on for AI render · Build outfit · Try full look
                </p>
              </div>
              {captureImage && (
                <div className="w-12 h-16 rounded-lg overflow-hidden border-2 border-stone-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={captureImage}
                    alt="You"
                    className="w-full h-full object-cover"
                    style={captureSource === "live" ? { transform: "scaleX(-1)" } : undefined}
                  />
                </div>
              )}
            </div>

            {outfitSaved && (
              <div className="bg-green-50 text-green-800 p-4 rounded-xl text-sm">
                Outfit saved with your selected sizes!
              </div>
            )}

            <ProductCatalog
              storeId={storeId}
              tryOnFocus={tryOnFocus}
              selectedIds={outfitSelections.map((s) => s.product.id)}
              onSelect={handleToggleProduct}
              onTryOn={handleTryOn}
              loadingProductId={loadingProductId}
            />

            {loadingProductId && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 max-w-sm text-center space-y-3 shadow-2xl">
                  <div className="w-10 h-10 border-4 border-stone-200 border-t-stone-900 rounded-full animate-spin mx-auto" />
                  <h3 className="font-serif text-lg">Generating AI Try-On</h3>
                  <p className="text-sm text-stone-500">
                    {tryOnProgress ? formatTryOnProgress(tryOnProgress) : "Starting..."}
                    {" · "}Real AI on GPU — first try-on after notebook restart can take up to 20 min.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <OutfitBuilder
        selections={outfitSelections}
        onRemove={(id) => setOutfitSelections((p) => p.filter((s) => s.product.id !== id))}
        onSaveOutfit={handleSaveOutfit}
        onTryFullOutfit={handleFullOutfitTryOn}
        saving={savingOutfit}
        tryingFullOutfit={loadingProductId === "full-outfit"}
      />

      {tryOnState && (
        <TryOnResultView
          resultUrl={tryOnState.resultUrl}
          product={tryOnState.product}
          productName={tryOnState.productName}
          price={tryOnState.price}
          fitResult={tryOnState.fitResult}
          userDeclaredSize={tryOnState.userDeclaredSize}
          processingTimeMs={tryOnState.processingTimeMs}
          tryOnCache={tryOnCache}
          onClose={() => setTryOnState(null)}
          onAddToOutfit={handleAddToOutfit}
          onRunAiColor={handleRunAiColor}
          runningAiColor={loadingProductId === tryOnState.product.id}
        />
      )}
    </div>
  );
}
