export interface BodyEstimates {
  shoulder_width_estimate?: { min: number; max: number; label: string };
  chest_estimate?: { min: number; max: number; label: string };
  waist_estimate?: { min: number; max: number; label: string };
  hip_estimate?: { min: number; max: number; label: string };
}

export interface SizeChartEntry {
  size: string;
  chestCm?: number | null;
  shoulderCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
}

export interface SizeRecommendation {
  size: string;
  matchPercent: number;
  inStock: boolean;
  stockQty: number;
}

export interface FitResult {
  recommendedSize: string;
  fitScore: number;
  sizeRecommendations: SizeRecommendation[];
  disclaimer: string;
}

const PROPORTION_TO_CM = { shoulder: 45, chest: 95, waist: 80, hip: 95 };

function estimateCm(prop: { min: number; max: number } | undefined, scale: number) {
  if (!prop) return null;
  return { min: prop.min * scale, max: prop.max * scale };
}

function overlapScore(est: { min: number; max: number }, chart: number): number {
  const diff = Math.abs((est.min + est.max) / 2 - chart);
  const tolerance = chart * 0.15;
  if (diff <= tolerance) return 100;
  if (diff <= tolerance * 2) return 75;
  if (diff <= tolerance * 3) return 50;
  return 30;
}

export function computeFitScore(
  estimates: BodyEstimates,
  sizeChart: SizeChartEntry[],
  variants: { size: string; stockQty: number }[],
  category: string,
  declaredSize?: string
): FitResult {
  const disclaimer = "Size recommendation combines your stated size with AI body scan — not a guarantee of fit.";
  if (!sizeChart.length) {
    return {
      recommendedSize: variants[0]?.size || "M",
      fitScore: 0,
      sizeRecommendations: variants.map((v) => ({ size: v.size, matchPercent: 0, inStock: v.stockQty > 0, stockQty: v.stockQty })),
      disclaimer,
    };
  }
  const shoulderEst = estimateCm(estimates.shoulder_width_estimate, PROPORTION_TO_CM.shoulder);
  const chestEst = estimateCm(estimates.chest_estimate, PROPORTION_TO_CM.chest);
  const waistEst = estimateCm(estimates.waist_estimate, PROPORTION_TO_CM.waist);
  const hipEst = estimateCm(estimates.hip_estimate, PROPORTION_TO_CM.hip);

  const sizeRecommendations = sizeChart.map((entry) => {
    const scores: number[] = [];
    if (category === "tops" || category === "one_pieces") {
      if (chestEst && entry.chestCm) scores.push(overlapScore(chestEst, entry.chestCm));
      if (shoulderEst && entry.shoulderCm) scores.push(overlapScore(shoulderEst, entry.shoulderCm));
    }
    if (category === "bottoms") {
      if (waistEst && entry.waistCm) scores.push(overlapScore(waistEst, entry.waistCm));
      if (hipEst && entry.hipCm) scores.push(overlapScore(hipEst, entry.hipCm));
    }
    const matchPercent = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;
    const variant = variants.find((v) => v.size === entry.size);
    return { size: entry.size, matchPercent, inStock: (variant?.stockQty ?? 0) > 0, stockQty: variant?.stockQty ?? 0 };
  }).sort((a, b) => b.matchPercent - a.matchPercent);

  if (declaredSize) {
    const existing = sizeRecommendations.find((r) => r.size === declaredSize);
    if (existing) {
      existing.matchPercent = Math.min(100, existing.matchPercent + 25);
    } else {
      sizeRecommendations.unshift({
        size: declaredSize,
        matchPercent: 88,
        inStock: true,
        stockQty: variants.find((v) => v.size === declaredSize)?.stockQty ?? 10,
      });
    }
    sizeRecommendations.sort((a, b) => b.matchPercent - a.matchPercent);
  }

  const top = sizeRecommendations[0];
  return {
    recommendedSize: top?.size || declaredSize || "M",
    fitScore: top?.matchPercent ?? 0,
    sizeRecommendations,
    disclaimer,
  };
}
