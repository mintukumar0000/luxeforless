import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeFitScore, BodyEstimates } from "@/lib/fit-scoring";
import { analyzeSizeFit } from "@/lib/fit-intelligence";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, productId, resultUrl, processingTimeMs } = body;

  if (!sessionId || !productId || !resultUrl) {
    return NextResponse.json(
      { error: "sessionId, productId, and resultUrl required" },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: true,
      garmentAssets: { where: { isPrimary: true }, take: 1 },
      sizeChart: true,
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { bodyEstimates: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const estimatesRaw = (session?.bodyEstimates[0]?.estimates as BodyEstimates & {
    size_profile?: { upper?: string; lower?: string };
    try_on_focus?: string;
  }) || {};
  const { size_profile: sizeProfile, try_on_focus: tryOnFocus, ...estimates } = estimatesRaw;

  const declaredSize =
    product.category === "bottoms"
      ? sizeProfile?.lower
      : sizeProfile?.upper;

  const fitResult = computeFitScore(
    estimates,
    product.sizeChart,
    product.variants.map((v) => ({ size: v.size, stockQty: v.stockQty })),
    product.category,
    declaredSize
  );

  const sizeIntelligence = analyzeSizeFit(declaredSize, fitResult);

  const variant =
    product.variants.find((v) => v.size === fitResult.recommendedSize) ||
    product.variants[0];

  const tryon = await prisma.tryon.create({
    data: {
      sessionId,
      productVariantId: variant.id,
      resultUrl,
      processingTimeMs: processingTimeMs ?? 0,
      fitScore: fitResult.fitScore,
      recommendedSize: fitResult.recommendedSize,
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      sessionId,
      eventType: "tryon_completed",
      productVariantId: variant.id,
      metadata: { processingTimeMs: processingTimeMs ?? 0 },
    },
  });

  return NextResponse.json({
    tryon,
    resultUrl,
    fitResult,
    sizeIntelligence,
    userDeclaredSize: declaredSize ?? null,
    tryOnFocus: tryOnFocus ?? null,
    product,
    processingTimeMs: processingTimeMs ?? 0,
    aiDisclaimer: "AI-generated preview — results may vary with pose, lighting, and garment type.",
  });
}
