import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveDataUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
      garmentAssets: { orderBy: { color: "asc" } },
      sizeChart: { orderBy: { size: "asc" } },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { sizeChart, name, brand, basePrice } = body;

  if (sizeChart && Array.isArray(sizeChart)) {
    for (const entry of sizeChart) {
      await prisma.sizeChartEntry.upsert({
        where: {
          productId_size: { productId: params.id, size: entry.size },
        },
        create: {
          productId: params.id,
          size: entry.size,
          chestCm: entry.chestCm ?? null,
          shoulderCm: entry.shoulderCm ?? null,
          waistCm: entry.waistCm ?? null,
          hipCm: entry.hipCm ?? null,
          lengthCm: entry.lengthCm ?? null,
          inseamCm: entry.inseamCm ?? null,
        },
        update: {
          chestCm: entry.chestCm ?? null,
          shoulderCm: entry.shoulderCm ?? null,
          waistCm: entry.waistCm ?? null,
          hipCm: entry.hipCm ?? null,
          lengthCm: entry.lengthCm ?? null,
          inseamCm: entry.inseamCm ?? null,
        },
      });
    }
  }

  const product = await prisma.product.update({
    where: { id: params.id },
    data: {
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
      ...(basePrice != null ? { basePrice } : {}),
    },
    include: {
      variants: true,
      garmentAssets: true,
      sizeChart: true,
    },
  });

  return NextResponse.json(product);
}

/** Add a new color variant with garment asset + size variants. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { color, vtoReadyUrl, garmentPhotoType } = body;
  if (!color || !vtoReadyUrl) {
    return NextResponse.json({ error: "color and vtoReadyUrl required" }, { status: 400 });
  }

  const normalizedColor = color.toLowerCase();
  let persistedUrl = vtoReadyUrl;
  if (vtoReadyUrl.startsWith("data:")) {
    persistedUrl = await saveDataUrl("garments", vtoReadyUrl);
  }

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { variants: true, sizeChart: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sizes = Array.from(new Set(product.variants.map((v) => v.size)));

  await prisma.garmentAsset.upsert({
    where: { productId_color: { productId: params.id, color: normalizedColor } },
    create: {
      productId: params.id,
      color: normalizedColor,
      imageUrl: persistedUrl,
      vtoReadyUrl: persistedUrl,
      garmentPhotoType: garmentPhotoType || "flat_lay",
      isPrimary: false,
    },
    update: {
      imageUrl: persistedUrl,
      vtoReadyUrl: persistedUrl,
    },
  });

  for (const size of sizes) {
    await prisma.productVariant.upsert({
      where: {
        productId_size_color: { productId: params.id, size, color: normalizedColor },
      },
      create: { productId: params.id, size, color: normalizedColor, stockQty: 10 },
      update: {},
    });
  }

  const updated = await prisma.product.findUnique({
    where: { id: params.id },
    include: { variants: true, garmentAssets: true, sizeChart: true },
  });

  return NextResponse.json(updated);
}
