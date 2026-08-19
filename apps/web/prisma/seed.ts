import { PrismaClient, ProductCategory, GarmentPhotoType } from "@prisma/client";

const prisma = new PrismaClient();

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

  const garmentUrl = "/garments/sample-garment.webp";
  const sizes = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];
  const topChart = {
    XS: { chestCm: 81, shoulderCm: 38, waistCm: 66, lengthCm: 64 },
    S: { chestCm: 86, shoulderCm: 40, waistCm: 71, lengthCm: 66 },
    M: { chestCm: 91, shoulderCm: 42, waistCm: 76, lengthCm: 68 },
    L: { chestCm: 97, shoulderCm: 44, waistCm: 81, lengthCm: 70 },
    XL: { chestCm: 102, shoulderCm: 46, waistCm: 86, lengthCm: 72 },
    XXL: { chestCm: 107, shoulderCm: 48, waistCm: 91, lengthCm: 74 },
    "Free Size": { chestCm: 95, shoulderCm: 44, waistCm: 80, lengthCm: 70 },
  };
  const bottomChart = {
    "28": { waistCm: 71, hipCm: 91, inseamCm: 76 },
    "30": { waistCm: 76, hipCm: 96, inseamCm: 76 },
    "32": { waistCm: 81, hipCm: 101, inseamCm: 77 },
    "34": { waistCm: 86, hipCm: 106, inseamCm: 77 },
    "36": { waistCm: 91, hipCm: 111, inseamCm: 78 },
    "38": { waistCm: 97, hipCm: 116, inseamCm: 78 },
    "40": { waistCm: 102, hipCm: 121, inseamCm: 79 },
    "Free Size": { waistCm: 86, hipCm: 110, inseamCm: 78 },
  };

  const sampleProducts = [
    {
      name: "Classic Cotton Tee",
      brand: "LuxeForLess",
      category: "tops" as ProductCategory,
      basePrice: 1299,
      color: "black",
      colors: ["black", "red", "navy"],
    },
    {
      name: "Slim Fit Denim",
      brand: "LuxeForLess",
      category: "bottoms" as ProductCategory,
      basePrice: 2499,
      color: "blue",
      colors: ["blue", "black"],
    },
    {
      name: "Floral Midi Dress",
      brand: "LuxeForLess",
      category: "one_pieces" as ProductCategory,
      basePrice: 3499,
      color: "pink",
      colors: ["pink"],
    },
  ];

  for (const sp of sampleProducts) {
    const existing = await prisma.product.findFirst({
      where: { storeId: store.id, name: sp.name },
    });
    if (existing) continue;

    const chart =
      sp.category === "bottoms"
        ? Object.entries(bottomChart).map(([size, m]) => ({ size, ...m }))
        : sizes.map((size) => ({ size, ...topChart[size as keyof typeof topChart] }));

    const sizeList = sp.category === "bottoms" ? Object.keys(bottomChart) : sizes;

    await prisma.product.create({
      data: {
        storeId: store.id,
        name: sp.name,
        brand: sp.brand,
        category: sp.category,
        basePrice: sp.basePrice,
        color: sp.color,
        variants: {
          create: sizeList.flatMap((size) =>
            sp.colors.map((color) => ({ size, color, stockQty: 10 }))
          ),
        },
        sizeChart: { create: chart },
        garmentAssets: {
          create: sp.colors.map((color, i) => ({
            color,
            imageUrl: garmentUrl,
            vtoReadyUrl: garmentUrl,
            garmentPhotoType: GarmentPhotoType.model,
            isPrimary: i === 0,
          })),
        },
      },
    });
  }

  console.log("Seed complete with color variants");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
