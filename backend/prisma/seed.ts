import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedCatalogs() {
  await prisma.analysisTaxonomyVersion.upsert({
    where: {
      versionCode: "default.v1"
    },
    update: {
      taxonomyJson: {
        version: 1,
        note: "Default dev taxonomy bootstrap for extraction control-plane.",
        categories: {}
      },
      isActive: true
    },
    create: {
      versionCode: "default.v1",
      taxonomyJson: {
        version: 1,
        note: "Default dev taxonomy bootstrap for extraction control-plane.",
        categories: {}
      },
      isActive: true
    }
  });

  await prisma.analysisTaxonomyVersion.updateMany({
    where: {
      NOT: {
        versionCode: "default.v1"
      }
    },
    data: {
      isActive: false
    }
  });

  console.log("Seeded default analysis taxonomy version.");
}

seedCatalogs()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
