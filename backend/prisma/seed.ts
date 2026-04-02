import { PrismaClient } from "@prisma/client";
import { DEFAULT_PLATFORM_CODE, DEFAULT_PLATFORM_NAME } from "../src/config/auth.ts";
import { permissionCatalog, roleCatalog, rolePermissionMap } from "../src/modules/authz/permissions.ts";

const prisma = new PrismaClient();

async function seedCatalogs() {
  const platform = await prisma.platform.upsert({
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

  for (const role of roleCatalog) {
    await prisma.authRole.upsert({
      where: {
        platformId_code: {
          platformId: platform.id,
          code: role.code
        }
      },
      update: {
        name: role.name,
        description: role.description,
        isActive: true
      },
      create: {
        platformId: platform.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isActive: true
      }
    });
  }

  for (const permission of permissionCatalog) {
    await prisma.authPermission.upsert({
      where: {
        platformId_code: {
          platformId: platform.id,
          code: permission.code
        }
      },
      update: {
        name: permission.name,
        description: permission.description,
        screen: permission.screen,
        isActive: true
      },
      create: {
        platformId: platform.id,
        code: permission.code,
        name: permission.name,
        description: permission.description,
        screen: permission.screen,
        isActive: true
      }
    });
  }

  const roles = await prisma.authRole.findMany({
    where: {
      platformId: platform.id
    }
  });
  const permissions = await prisma.authPermission.findMany({
    where: {
      platformId: platform.id
    }
  });

  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  for (const role of roleCatalog) {
    const roleId = roleIdByCode.get(role.code);

    if (!roleId) {
      continue;
    }

    for (const permissionCode of rolePermissionMap[role.code]) {
      const permissionId = permissionIdByCode.get(permissionCode);

      if (!permissionId) {
        continue;
      }

      await prisma.authRolesOnPermissions.upsert({
        where: {
          platformId_roleId_permissionId: {
            platformId: platform.id,
            roleId,
            permissionId
          }
        },
        update: {
          isActive: true,
          revokedAt: null
        },
        create: {
          platformId: platform.id,
          roleId,
          permissionId,
          isActive: true
        }
      });
    }
  }
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
