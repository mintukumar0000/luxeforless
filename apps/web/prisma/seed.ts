import { PrismaClient, ProductCategory, GarmentPhotoType } from "@prisma/client";

const prisma = new PrismaClient();

async function copyExampleGarment(): Promise<string> {
  return "/garments/sample-garment.webp";
}

async function main() {
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
      address: "123 Fashion Street, Mumbai",
    },
  });

  await prisma.mirror.upsert({
    where: { deviceId: "demo-mirror-1" },
    update: {},
    create: { storeId: store.id, name: "Mirror 1", deviceId: "demo-mirror-1" },
  });

  const garmentUrl = await copyExampleGarment();

  const sampleProducts = [
    {
      name: "Classic Cotton Tee",
      brand: "LuxeForLess",
      category: "tops" as ProductCategory,
      basePrice: 1299,
      color: "white",
    },
    {
      name: "Slim Fit Denim",
      brand: "LuxeForLess",
      category: "bottoms" as ProductCategory,
      basePrice: 2499,
      color: "blue",
    },
    {
      name: "Floral Midi Dress",
      brand: "LuxeForLess",
      category: "one_pieces" as ProductCategory,
      basePrice: 3499,
      color: "pink",
    },
  ];

  const sizes = ["XS", "S", "M", "L", "XL"];
  const sizeChart = {
    XS: { chestCm: 81, shoulderCm: 38, waistCm: 66, lengthCm: 64 },
    S: { chestCm: 86, shoulderCm: 40, waistCm: 71, lengthCm: 66 },
    M: { chestCm: 91, shoulderCm: 42, waistCm: 76, lengthCm: 68 },
    L: { chestCm: 97, shoulderCm: 44, waistCm: 81, lengthCm: 70 },
    XL: { chestCm: 102, shoulderCm: 46, waistCm: 86, lengthCm: 72 },
  };

  for (const sp of sampleProducts) {
    const existing = await prisma.product.findFirst({
      where: { storeId: store.id, name: sp.name },
    });
    if (existing) continue;

    await prisma.product.create({
      data: {
        storeId: store.id,
        ...sp,
        variants: {
          create: sizes.map((size) => ({ size, stockQty: 10 })),
        },
        sizeChart: {
          create: sizes.map((size) => ({ size, ...sizeChart[size as keyof typeof sizeChart] })),
        },
        garmentAssets: {
              create: {
                imageUrl: garmentUrl,
                vtoReadyUrl: garmentUrl,
                garmentPhotoType: GarmentPhotoType.model,
                isPrimary: true,
              },
            },
      },
    });
  }

  console.log("Seed complete:", { org: org.slug, store: store.slug, products: sampleProducts.length });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
