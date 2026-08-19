import { FitResult } from "@/lib/fit-scoring";

export type SizeVerdict = "match" | "ai_better" | "user_ok" | "ai_only";

export interface SizeIntelligence {
  verdict: SizeVerdict;
  headline: string;
  detail: string;
  declaredSize: string | null;
  recommendedSize: string;
  declaredMatch: number | null;
  recommendedMatch: number;
}

export function analyzeSizeFit(
  declaredSize: string | null | undefined,
  fitResult: FitResult
): SizeIntelligence {
  const recommendedSize = fitResult.recommendedSize;
  const recommendedMatch =
    fitResult.sizeRecommendations.find((r) => r.size === recommendedSize)?.matchPercent ??
    fitResult.fitScore;

  if (!declaredSize) {
    return {
      verdict: "ai_only",
      headline: `Best fit: ${recommendedSize}`,
      detail: "Based on your body scan — select your usual size next time for a smarter blend.",
      declaredSize: null,
      recommendedSize,
      declaredMatch: null,
      recommendedMatch,
    };
  }

  const declaredMatch =
    fitResult.sizeRecommendations.find((r) => r.size === declaredSize)?.matchPercent ?? null;

  if (declaredSize === recommendedSize) {
    return {
      verdict: "match",
      headline: `${recommendedSize} is your best fit`,
      detail: "Your stated size matches the AI body scan — high confidence recommendation.",
      declaredSize,
      recommendedSize,
      declaredMatch,
      recommendedMatch,
    };
  }

  if (
    declaredMatch !== null &&
    recommendedMatch >= declaredMatch + 8
  ) {
    return {
      verdict: "ai_better",
      headline: `${recommendedSize} may fit better than your ${declaredSize}`,
      detail: `AI scan: ${recommendedSize} (${recommendedMatch}% match) vs your ${declaredSize} (${declaredMatch}%). Consider the AI size for a closer fit.`,
      declaredSize,
      recommendedSize,
      declaredMatch,
      recommendedMatch,
    };
  }

  return {
    verdict: "user_ok",
    headline: `${declaredSize} works — ${recommendedSize} is also strong`,
    detail: `Your size ${declaredSize} (${declaredMatch ?? "?"}%) is close to AI pick ${recommendedSize} (${recommendedMatch}%). Either should work depending on fit preference.`,
    declaredSize,
    recommendedSize,
    declaredMatch,
    recommendedMatch,
  };
}
