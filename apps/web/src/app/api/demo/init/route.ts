import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const org = await prisma.organization.upsert({
    where: { slug: "luxeforless-demo" },
    update: {},
    create: { name: "LuxeForLess Demo", slug: "luxeforless-demo" },
  });

  const store = await prisma.store.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "demo-store" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Demo Store",
      slug: "demo-store",
      address: "123 Fashion Street",
    },
  });

  const mirror = await prisma.mirror.upsert({
    where: { deviceId: "demo-mirror-1" },
    update: {},
    create: {
      storeId: store.id,
      name: "Mirror 1",
      deviceId: "demo-mirror-1",
    },
  });

  return NextResponse.json({
    organization: org,
    store,
    mirror,
  });
}

export async function GET() {
  const org = await prisma.organization.findFirst({
    where: { slug: "luxeforless-demo" },
    include: {
      stores: {
        include: { mirrors: true },
      },
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Demo not initialized" }, { status: 404 });
  }

  return NextResponse.json(org);
}
