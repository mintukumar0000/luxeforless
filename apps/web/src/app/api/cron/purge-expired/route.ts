import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Purge expired sessions, body estimates, and related data (7-day privacy policy). */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expiredEstimates = await prisma.bodyEstimate.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const expiredSessions = await prisma.session.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
  });

  const sessionIds = expiredSessions.map((s) => s.id);
  if (sessionIds.length) {
    await prisma.analyticsEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.tryon.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.outfitItem.deleteMany({
      where: { outfit: { sessionId: { in: sessionIds } } },
    });
    await prisma.outfit.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.bodyEstimate.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  }

  return NextResponse.json({
    ok: true,
    purgedSessions: sessionIds.length,
    purgedEstimates: expiredEstimates.count,
    at: now.toISOString(),
  });
}
