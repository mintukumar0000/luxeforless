import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { sessionId, captureImageUrl, estimates, sizeProfile, tryOnFocus } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (captureImageUrl) updates.captureImageUrl = captureImageUrl;

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: updates,
  });

  if (estimates || sizeProfile || tryOnFocus) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.bodyEstimate.create({
      data: {
        sessionId,
        estimates: {
          ...(estimates || {}),
          ...(sizeProfile ? { size_profile: sizeProfile } : {}),
          ...(tryOnFocus ? { try_on_focus: tryOnFocus } : {}),
        },
        expiresAt,
      },
    });
  }

  return NextResponse.json(session);
}
