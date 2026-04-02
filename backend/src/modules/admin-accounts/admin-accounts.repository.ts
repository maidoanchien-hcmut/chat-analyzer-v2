import type { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";

export class AdminAccountsRepository {
  listUsers(platformId: number) {
    return prisma.authUser.findMany({
      where: {
        platformId
      },
      orderBy: [
        {
          createdAt: "asc"
        }
      ],
      include: {
        roles: {
          where: {
            isActive: true,
            role: {
              isActive: true
            }
          },
          include: {
            role: true
          }
        }
      }
    });
  }

  findUser(platformId: number, userId: number) {
    return prisma.authUser.findFirst({
      where: {
        id: userId,
        platformId
      },
      include: {
        roles: {
          where: {
            isActive: true,
            role: {
              isActive: true
            }
          },
          include: {
            role: true
          }
        }
      }
    });
  }

  findRole(platformId: number, roleId: number) {
    return prisma.authRole.findFirst({
      where: {
        id: roleId,
        platformId,
        isActive: true
      }
    });
  }

  listRoles(platformId: number) {
    return prisma.authRole.findMany({
      where: {
        platformId,
        isActive: true
      },
      include: {
        permissions: {
          where: {
            isActive: true,
            permission: {
              isActive: true
            }
          },
          include: {
            permission: true
          }
        }
      },
      orderBy: {
        id: "asc"
      }
    });
  }

  listPermissions(platformId: number) {
    return prisma.authPermission.findMany({
      where: {
        platformId,
        isActive: true
      },
      orderBy: {
        id: "asc"
      }
    });
  }

  countActiveAdmins(platformId: number) {
    return prisma.authUsersOnRoles.count({
      where: {
        platformId,
        isActive: true,
        role: {
          code: "admin",
          isActive: true
        },
        user: {
          isActive: true
        }
      }
    });
  }

  findUserByIdentifierOrEmail(platformId: number, identifier: string, email: string | null) {
    return prisma.authUser.findFirst({
      where: {
        platformId,
        OR: [
          {
            identifier
          },
          ...(email
            ? [
                {
                  email
                }
              ]
            : [])
        ]
      }
    });
  }

  async deactivateRoles(platformId: number, userId: number, tx: Prisma.TransactionClient) {
    await tx.authUsersOnRoles.updateMany({
      where: {
        platformId,
        userId,
        isActive: true
      },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });
  }

  async activateRole(
    platformId: number,
    userId: number,
    roleId: number,
    tx: Prisma.TransactionClient
  ) {
    const existing = await tx.authUsersOnRoles.findFirst({
      where: {
        platformId,
        userId,
        roleId
      }
    });

    if (existing) {
      return tx.authUsersOnRoles.update({
        where: {
          id: existing.id
        },
        data: {
          isActive: true,
          revokedAt: null
        }
      });
    }

    return tx.authUsersOnRoles.create({
      data: {
        platformId,
        userId,
        roleId,
        isActive: true
      }
    });
  }

  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(callback);
  }
}

export const adminAccountsRepository = new AdminAccountsRepository();
