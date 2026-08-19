import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, name, variantIds } = body;

  if (!sessionId || !variantIds?.length) {
    return NextResponse.json(
      { error: "sessionId and variantIds required" },
      { status: 400 }
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  const totalPrice = variants.reduce(
    (sum, v) => sum + Number(v.product.basePrice) + Number(v.priceAdj),
    0
  );

  const outfit = await prisma.outfit.create({
    data: {
      sessionId,
      name: name || "My Outfit",
      totalPrice,
      items: {
        create: variantIds.map((id: string) => ({ productVariantId: id })),
      },
    },
    include: {
      items: {
        include: {
          productVariant: { include: { product: { include: { garmentAssets: true } } } },
        },
      },
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      sessionId,
      eventType: "outfit_created",
      metadata: { outfitId: outfit.id, itemCount: variantIds.length },
    },
  });

  return NextResponse.json(outfit, { status: 201 });
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const outfits = await prisma.outfit.findMany({
    where: { sessionId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: { include: { garmentAssets: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(outfits);
}
