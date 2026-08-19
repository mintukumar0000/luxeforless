"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { ConsentScreen } from "@/components/ConsentScreen";
import { WebcamCapture } from "@/components/WebcamCapture";
import { ProductCatalog, Product } from "@/components/ProductCatalog";
import { TryOnResultView } from "@/components/TryOnResultView";
import { OutfitBuilder } from "@/components/OutfitBuilder";
import { FitResult } from "@/lib/fit-scoring";
import { BodyEstimates } from "@/lib/fit-scoring";
import { SizeProfile } from "@/lib/size-options";
import { productMatchesFocus, vtoCategoryForProduct, TryOnFocus } from "@/lib/try-on-focus";
import { SizeIntelligence } from "@/lib/fit-intelligence";
import { GARMENT_COLOR_OPTIONS, tryOnCacheKey } from "@/lib/instant-preview";
import { APP_NAME } from "@/lib/utils";
import {
  pollTryOnJob,
  submitTryOnJob,
  toProxiedResultUrl,
  urlToDataUrl,
} from "@/lib/vto-client";
import { Camera, Upload, Sparkles } from "lucide-react";

type Step = "welcome" | "consent" | "capture" | "browse";

const TRYON_PROGRESS_LABELS: Record<string, string> = {
  queued: "Queued",
  preprocessing: "Preparing your studio photo",
  loading_model: "Loading AI models",
  generating: "Generating ultra-realistic try-on",
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
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [tryOnState, setTryOnState] = useState<TryOnState | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [tryOnProgress, setTryOnProgress] = useState<string | null>(null);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const [outfitSaved, setOutfitSaved] = useState(false);
  const [tryOnCache, setTryOnCache] = useState<Record<string, string>>({});

  const handleConsent = async () => {
    await startSession();
    const demoRes = await fetch("/api/demo/init");
    const demoData = await demoRes.json();
    setStoreId(demoData.stores?.[0]?.id || demo?.storeId || null);
    setStep("capture");
  };

  const handleCapture = useCallback(
    async (image: string, estimates: BodyEstimates | null, profile: SizeProfile, focus: TryOnFocus) => {
      setCaptureImage(image);
      setSizeProfile(profile);
      setTryOnFocus(focus);
      if (estimates) setBodyEstimates(estimates);

      if (sessionId) {
        await fetch("/api/sessions/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, estimates, sizeProfile: profile, tryOnFocus: focus }),
        });
      }

      setStep("browse");
    },
    [sessionId, setCaptureImage, setBodyEstimates, setSizeProfile, setTryOnFocus]
  );

  const handleTryOn = async (product: Product) => {
    if (!captureImage || !sessionId) return;

    if (!productMatchesFocus(product.category, tryOnFocus)) {
      alert(`This item doesn't match your "${tryOnFocus}" mode. Switch mode by retaking your photo.`);
      return;
    }

    setLoadingProductId(product.id);
    setTryOnProgress("queued");

    try {
      const garmentAsset = product.garmentAssets?.[0];
      if (!garmentAsset?.vtoReadyUrl) {
        alert("Garment image not found for this product");
        return;
      }

      const garmentDataUrl = await urlToDataUrl(garmentAsset.vtoReadyUrl);
      const isDemoModelShot =
        garmentAsset.vtoReadyUrl?.includes("sample-garment") ||
        garmentAsset.garmentPhotoType === "model";
      const submit = await submitTryOnJob({
        personImageBase64: captureImage,
        garmentDataUrl,
        category: vtoCategoryForProduct(product.category),
        garmentPhotoType: isDemoModelShot ? "model" : "flat-lay",
      });

      const vtoResult = await pollTryOnJob(submit.job_id, {
        onProgress: setTryOnProgress,
      });
      const resultUrl = toProxiedResultUrl(vtoResult.result_url);

      const res = await fetch("/api/tryon/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          productId: product.id,
          resultUrl,
          processingTimeMs: vtoResult.processing_time_ms,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || `Try-on failed (${res.status})`);
        return;
      }

      const colorId =
        GARMENT_COLOR_OPTIONS.find((c) => c.label.toLowerCase() === product.color?.toLowerCase())
          ?.id ?? "black";
      setTryOnCache((prev) => ({
        ...prev,
        [tryOnCacheKey(product.id, colorId)]: data.resultUrl,
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
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Try-on failed: ${msg}`);
    } finally {
      setLoadingProductId(null);
      setTryOnProgress(null);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      if (exists) return prev.filter((p) => p.id !== product.id);
      const filtered = prev.filter((p) => p.category !== product.category);
      return [...filtered, product];
    });
  };

  const handleSaveOutfit = async () => {
    if (!sessionId || selectedProducts.length === 0) return;
    setSavingOutfit(true);

    const variantIds = selectedProducts.map((p) => p.variants[0]?.id).filter(Boolean);

    await fetch("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, variantIds, name: "My Look" }),
    });

    setSavingOutfit(false);
    setOutfitSaved(true);
    setSelectedProducts([]);
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-serif tracking-tight">{APP_NAME}</h1>
            <p className="text-xs text-stone-400">Virtual Try-On · Stage 1 MVP</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/studio" className="flex items-center gap-1 text-stone-600 hover:text-stone-900">
              <Upload size={14} /> Upload Studio
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
              Browse our catalog, virtually try on clothes with AI, and get an estimated size recommendation — all before visiting the fitting room.
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
          <ConsentScreen
            onAccept={handleConsent}
            onDecline={() => setStep("welcome")}
          />
        )}

        {step === "capture" && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <Camera className="mx-auto text-stone-400 mb-2" size={32} />
              <h2 className="text-2xl font-serif">Body Scan</h2>
              <p className="text-stone-500 text-sm mt-1">
                Stand 6 feet back, full body visible, arms at your sides
              </p>
            </div>
            <WebcamCapture
              onCapture={handleCapture}
              onCancel={() => setStep("consent")}
            />
          </div>
        )}

        {step === "browse" && storeId && (
          <div className="space-y-6 pb-32">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif">Browse & Try On</h2>
                <p className="text-stone-500 text-sm">
                  Tap a garment to try it on · Build an outfit with tops + bottoms
                </p>
                {sizeProfile && (
                  <p className="text-xs text-stone-400 mt-1">
                    {tryOnFocus === "upper" && `Tops · size ${sizeProfile.upper}`}
                    {tryOnFocus === "lower" && `Bottoms · waist ${sizeProfile.lower}`}
                    {tryOnFocus === "full" && `Full outfit · ${sizeProfile.upper} top · ${sizeProfile.lower} waist`}
                    {" · "}
                    <span className="text-stone-500">Tap any item to try on</span>
                  </p>
                )}
              </div>
              {captureImage && (
                <div className="w-12 h-16 rounded-lg overflow-hidden border-2 border-stone-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={captureImage} alt="You" className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
                </div>
              )}
            </div>

            {outfitSaved && (
              <div className="bg-green-50 text-green-800 p-4 rounded-xl text-sm">
                Outfit saved! You can continue trying on more items.
              </div>
            )}

            <ProductCatalog
              storeId={storeId}
              tryOnFocus={tryOnFocus}
              selectedIds={selectedProducts.map((p) => p.id)}
              onSelect={handleSelectProduct}
              onTryOn={handleTryOn}
              loadingProductId={loadingProductId}
            />

            {loadingProductId && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 max-w-sm text-center space-y-3 shadow-2xl">
                  <div className="w-10 h-10 border-4 border-stone-200 border-t-stone-900 rounded-full animate-spin mx-auto" />
                  <h3 className="font-serif text-lg">Generating AI Try-On</h3>
                  <p className="text-sm text-stone-500">
                    Real AI is running on your GPU session.
                    {tryOnProgress ? ` ${formatTryOnProgress(tryOnProgress)}.` : " "}
                    First try-on after a Kaggle restart can take 5–8 min — don&apos;t close this tab.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <OutfitBuilder
        selectedProducts={selectedProducts}
        onRemove={(id) => setSelectedProducts((p) => p.filter((x) => x.id !== id))}
        onSaveOutfit={handleSaveOutfit}
        saving={savingOutfit}
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
          onAddToOutfit={() => {
            handleSelectProduct(tryOnState.product);
            setTryOnState(null);
          }}
        />
      )}
    </div>
  );
}
