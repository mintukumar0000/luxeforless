import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProductCategory } from "@prisma/client";

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId");
  const category = req.nextUrl.searchParams.get("category");

  if (!storeId) {
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: {
      storeId,
      ...(category ? { category: category as ProductCategory } : {}),
    },
    include: {
      variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
      garmentAssets: { orderBy: { color: "asc" } },
      sizeChart: { orderBy: { size: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    storeId,
    name,
    brand,
    description,
    category,
    basePrice,
    color,
    pattern,
    sizes,
    sizeChart,
    vtoReadyUrl,
    garmentPhotoType,
  } = body;

  const normalizedColor = (color || "black").toLowerCase();
  const sizeList: string[] = sizes || ["S", "M", "L", "XL"];

  let persistedUrl = vtoReadyUrl;
  if (vtoReadyUrl?.startsWith("data:")) {
    const { saveDataUrl } = await import("@/lib/storage");
    persistedUrl = await saveDataUrl("garments", vtoReadyUrl);
  }

  const product = await prisma.product.create({
    data: {
      storeId,
      name,
      brand,
      description,
      category: category as ProductCategory,
      basePrice,
      color: normalizedColor,
      pattern,
      variants: {
        create: sizeList.map((size: string) => ({
          size,
          color: normalizedColor,
          stockQty: 10,
        })),
      },
      sizeChart: {
        create: (sizeChart || []).map(
          (entry: {
            size: string;
            chestCm?: number;
            shoulderCm?: number;
            waistCm?: number;
            hipCm?: number;
            lengthCm?: number;
            inseamCm?: number;
          }) => ({
            size: entry.size,
            chestCm: entry.chestCm,
            shoulderCm: entry.shoulderCm,
            waistCm: entry.waistCm,
            hipCm: entry.hipCm,
            lengthCm: entry.lengthCm,
            inseamCm: entry.inseamCm,
          })
        ),
      },
      garmentAssets: persistedUrl
        ? {
            create: {
              color: normalizedColor,
              imageUrl: persistedUrl,
              vtoReadyUrl: persistedUrl,
              garmentPhotoType: garmentPhotoType || "flat_lay",
              isPrimary: true,
            },
          }
        : undefined,
    },
    include: {
      variants: true,
      garmentAssets: true,
      sizeChart: true,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
