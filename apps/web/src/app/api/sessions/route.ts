import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { storeId, mirrorId, consentGiven } = body;

  if (!storeId || !consentGiven) {
    return NextResponse.json(
      { error: "Store ID and consent are required" },
      { status: 400 }
    );
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 2);

  const session = await prisma.session.create({
    data: {
      storeId,
      mirrorId: mirrorId || null,
      consentGiven: true,
      consentAt: new Date(),
      expiresAt,
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      sessionId: session.id,
      eventType: "session_started",
    },
  });

  return NextResponse.json(session);
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      bodyEstimates: { orderBy: { createdAt: "desc" }, take: 1 },
      tryons: {
        include: {
          productVariant: {
            include: { product: { include: { garmentAssets: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
