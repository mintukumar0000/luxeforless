import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveDataUrl } from "@/lib/storage";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { sessionId, captureImage, estimates, sizeProfile, tryOnFocus, validationPassed } =
    body;

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (captureImage?.startsWith("data:")) {
    try {
      updates.captureImageUrl = await saveDataUrl("captures", captureImage);
    } catch {
      /* non-fatal on serverless without storage */
    }
  } else if (captureImage) {
    updates.captureImageUrl = captureImage;
  }

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: updates,
  });

  if (estimates || sizeProfile || tryOnFocus || validationPassed != null) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.bodyEstimate.create({
      data: {
        sessionId,
        estimates: {
          ...(estimates || {}),
          ...(sizeProfile ? { size_profile: sizeProfile } : {}),
          ...(tryOnFocus ? { try_on_focus: tryOnFocus } : {}),
          ...(validationPassed != null ? { validation_passed: validationPassed } : {}),
        },
        expiresAt,
      },
    });
  }

  return NextResponse.json(session);
}
