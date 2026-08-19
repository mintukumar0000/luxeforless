import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { sessionId, captureImageUrl, estimates } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (captureImageUrl) updates.captureImageUrl = captureImageUrl;

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: updates,
  });

  if (estimates) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.bodyEstimate.create({
      data: {
        sessionId,
        estimates,
        expiresAt,
      },
    });
  }

  return NextResponse.json(session);
}
