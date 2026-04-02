import { DEFAULT_PLATFORM_CODE, DEFAULT_PLATFORM_NAME } from "../../config/auth.ts";
import { prisma } from "../../infra/prisma.ts";

export class PlatformsService {
  async ensureDefaultPlatform() {
    return prisma.platform.upsert({
      where: {
        code: DEFAULT_PLATFORM_CODE
      },
      update: {
        name: DEFAULT_PLATFORM_NAME,
        isDefault: true,
        isActive: true
      },
      create: {
        code: DEFAULT_PLATFORM_CODE,
        name: DEFAULT_PLATFORM_NAME,
        isDefault: true,
        isActive: true
      }
    });
  }
}

export const platformsService = new PlatformsService();
