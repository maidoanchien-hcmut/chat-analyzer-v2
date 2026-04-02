import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedCatalogs() {
  console.log("No Prisma seed steps are required for the current standalone backend.");
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
