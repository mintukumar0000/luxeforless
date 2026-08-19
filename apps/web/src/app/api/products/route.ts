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
      variants: true,
      garmentAssets: { where: { isPrimary: true }, take: 1 },
      sizeChart: true,
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

  const product = await prisma.product.create({
    data: {
      storeId,
      name,
      brand,
      description,
      category: category as ProductCategory,
      basePrice,
      color,
      pattern,
      variants: {
        create: (sizes || ["S", "M", "L", "XL"]).map((size: string) => ({
          size,
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
          }) => ({
            size: entry.size,
            chestCm: entry.chestCm,
            shoulderCm: entry.shoulderCm,
            waistCm: entry.waistCm,
            hipCm: entry.hipCm,
            lengthCm: entry.lengthCm,
          })
        ),
      },
      garmentAssets: vtoReadyUrl
        ? {
            create: {
              imageUrl: vtoReadyUrl,
              vtoReadyUrl,
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
