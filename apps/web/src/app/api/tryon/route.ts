import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeFitScore, BodyEstimates } from "@/lib/fit-scoring";
import { VTO_SERVICE_URL, VTO_CATEGORY_MAP } from "@/lib/utils";

export const maxDuration = 1800;

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 1_800_000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollVtoJob(jobId: string) {
  const start = Date.now();
  let lastError = "VTO service unavailable";

  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${VTO_SERVICE_URL}/v1/jobs/${jobId}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        lastError = `VTO status error (${res.status})`;
        continue;
      }
      const job = await res.json();
      if (job.status === "completed") return job;
      if (job.status === "failed") {
        throw new Error(job.error || "Try-on failed on VTO service");
      }
      lastError = "";
    } catch (e) {
      if (e instanceof Error && e.message.includes("Try-on failed")) throw e;
      lastError = e instanceof Error ? e.message : "fetch failed";
    }
  }

  throw new Error(
    lastError
      ? `Cannot reach VTO service at ${VTO_SERVICE_URL}. Is it running? (${lastError})`
      : "Try-on timed out after 30 minutes"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, productId, personImageBase64 } = body;

  if (!sessionId || !productId || !personImageBase64) {
    return NextResponse.json(
      { error: "sessionId, productId, and personImageBase64 required" },
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

  if (!product || !product.garmentAssets[0]?.vtoReadyUrl) {
    return NextResponse.json(
      { error: "Product or garment asset not found" },
      { status: 404 }
    );
  }

  const garmentUrl = product.garmentAssets[0].vtoReadyUrl;
  let garmentBase64 = garmentUrl;
  if (!garmentUrl.startsWith("data:")) {
    const origin = req.nextUrl.origin;
    const fullUrl = garmentUrl.startsWith("http") ? garmentUrl : `${origin}${garmentUrl}`;
    const res = await fetch(fullUrl);
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/png";
    garmentBase64 = `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  }

  const vtoCategory = VTO_CATEGORY_MAP[product.category] || "tops";

  let submitRes: Response;
  try {
    submitRes = await fetch(`${VTO_SERVICE_URL}/v1/tryon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_image: personImageBase64,
        garment_image: garmentBase64.split(",")[1] || garmentBase64,
        category: vtoCategory,
        garment_photo_type:
          product.garmentAssets[0].garmentPhotoType === "model" ? "model" : "flat-lay",
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Cannot reach VTO service at ${VTO_SERVICE_URL}. Is it running? (${msg})`,
      },
      { status: 504 }
    );
  }

  if (!submitRes.ok) {
    const detail = await submitRes.text();
    return NextResponse.json(
      { error: `VTO service error (${submitRes.status}): ${detail}` },
      { status: 502 }
    );
  }

  const submit = await submitRes.json();
  if (submit.status === "failed") {
    return NextResponse.json({ error: submit.error || "Try-on failed" }, { status: 500 });
  }

  let vtoResult = submit;
  if (submit.status === "processing") {
    try {
      vtoResult = await pollVtoJob(submit.job_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 504 });
    }
  }

  if (vtoResult.status === "failed") {
    return NextResponse.json(
      { error: vtoResult.error || "Try-on failed" },
      { status: 500 }
    );
  }

  const resultUrl = vtoResult.result_url.startsWith("http")
    ? vtoResult.result_url
    : `${VTO_SERVICE_URL}${vtoResult.result_url}`;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { bodyEstimates: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const estimates = (session?.bodyEstimates[0]?.estimates as BodyEstimates) || {};
  const fitResult = computeFitScore(
    estimates,
    product.sizeChart,
    product.variants.map((v) => ({ size: v.size, stockQty: v.stockQty })),
    product.category
  );

  const variant =
    product.variants.find((v) => v.size === fitResult.recommendedSize) ||
    product.variants[0];

  const tryon = await prisma.tryon.create({
    data: {
      sessionId,
      productVariantId: variant.id,
      resultUrl,
      processingTimeMs: vtoResult.processing_time_ms,
      fitScore: fitResult.fitScore,
      recommendedSize: fitResult.recommendedSize,
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      sessionId,
      eventType: "tryon_completed",
      productVariantId: variant.id,
      metadata: { processingTimeMs: vtoResult.processing_time_ms },
    },
  });

  return NextResponse.json({
    tryon,
    resultUrl,
    fitResult,
    product,
    processingTimeMs: vtoResult.processing_time_ms,
    aiDisclaimer: "AI-generated preview — results may vary with pose, lighting, and garment type.",
  });
}
