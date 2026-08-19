/** Client-side VTO job helpers — single garment or chained full outfit. */

import {
  pollTryOnJob,
  submitTryOnJob,
  toProxiedResultUrl,
  urlToDataUrl,
} from "./vto-client";
import { vtoCategoryForProduct } from "./try-on-focus";
import { CatalogGarmentAsset, CatalogProduct } from "./product-variants";

export interface TryOnJobOptions {
  personImageBase64: string;
  product: CatalogProduct;
  garmentAsset: CatalogGarmentAsset;
  onProgress?: (progress: string | null) => void;
}

export async function runSingleTryOn({
  personImageBase64,
  product,
  garmentAsset,
  onProgress,
}: TryOnJobOptions): Promise<{ resultUrl: string; processingTimeMs: number }> {
  if (!garmentAsset.vtoReadyUrl) {
    throw new Error("Garment image not found for this color");
  }

  const garmentDataUrl = await urlToDataUrl(garmentAsset.vtoReadyUrl);
  const isDemoModelShot =
    garmentAsset.vtoReadyUrl.includes("sample-garment") ||
    garmentAsset.garmentPhotoType === "model";

  const submit = await submitTryOnJob({
    personImageBase64,
    garmentDataUrl,
    category: vtoCategoryForProduct(product.category),
    garmentPhotoType: isDemoModelShot ? "model" : "flat-lay",
    preserveBackground: true,
  });

  const vtoResult = await pollTryOnJob(submit.job_id, {
    backend: submit.backend ?? "local",
    onProgress,
  });
  return {
    resultUrl: toProxiedResultUrl(vtoResult.result_url),
    processingTimeMs: vtoResult.processing_time_ms,
  };
}

export async function runFullOutfitTryOn(
  personImageBase64: string,
  top: CatalogProduct,
  topAsset: CatalogGarmentAsset,
  bottom: CatalogProduct,
  bottomAsset: CatalogGarmentAsset,
  onProgress?: (progress: string | null) => void
): Promise<{ resultUrl: string; processingTimeMs: number }> {
  onProgress?.("generating_top");
  const topResult = await runSingleTryOn({
    personImageBase64,
    product: top,
    garmentAsset: topAsset,
    onProgress,
  });

  onProgress?.("generating_bottom");
  const topPersonDataUrl = await urlToDataUrl(topResult.resultUrl);
  const bottomResult = await runSingleTryOn({
    personImageBase64: topPersonDataUrl,
    product: bottom,
    garmentAsset: bottomAsset,
    onProgress,
  });

  return {
    resultUrl: bottomResult.resultUrl,
    processingTimeMs: topResult.processingTimeMs + bottomResult.processingTimeMs,
  };
}
