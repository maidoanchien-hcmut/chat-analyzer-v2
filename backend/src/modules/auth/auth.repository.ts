import type { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import type { RequestMetadata } from "./auth.types.ts";

type RefreshTokenCreateInput = {
  platformId: number;
  userId: number;
  tokenHash: string;
  familyId: string;
  rotatedFromTokenId?: number;
  expiresAt: Date;
  metadata: RequestMetadata;
};

export class AuthRepository {
  findUserByIdentifier(identifier: string) {
    return prisma.authUser.findFirst({
      where: {
        identifier
      },
      include: this.userInclude()
    });
  }

  findUserById(userId: number) {
    return prisma.authUser.findUnique({
      where: {
        id: userId
      },
      include: this.userInclude()
    });
  }

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.authRefreshToken.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: {
          include: this.userInclude()
        },
        platform: true
      }
    });
  }

  async createRefreshToken(input: RefreshTokenCreateInput) {
    return prisma.authRefreshToken.create({
      data: {
        platformId: input.platformId,
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        rotatedFromTokenId: input.rotatedFromTokenId,
        expiresAt: input.expiresAt,
        ipAddress: input.metadata.ipAddress,
        userAgent: input.metadata.userAgent,
        deviceLabel: input.metadata.userAgent ?? "unknown",
        lastSeenAt: new Date()
      }
    });
  }

  async revokeRefreshToken(id: number, reason: string) {
    await prisma.authRefreshToken.updateMany({
      where: {
        id,
        isActive: true
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      }
    });
  }

  async revokeRefreshTokenFamily(familyId: string, reason: string) {
    await prisma.authRefreshToken.updateMany({
      where: {
        familyId,
        isActive: true
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      }
    });
  }

  async revokeUserRefreshTokens(userId: number, platformId: number, reason: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    await client.authRefreshToken.updateMany({
      where: {
        userId,
        platformId,
        isActive: true
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      }
    });
  }

  async updatePassword(userId: number, passwordHash: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;

    return client.authUser.update({
      where: {
        id: userId
      },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        authzVersion: {
          increment: 1
        }
      },
      include: this.userInclude()
    });
  }

  async incrementAuthzVersion(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;

    return client.authUser.update({
      where: {
        id: userId
      },
      data: {
        authzVersion: {
          increment: 1
        }
      }
    });
  }

  createAuditLog(input: {
    platformId: number;
    userId?: number | null;
    action: string;
    targetType?: string;
    targetId?: string;
    success?: boolean;
    metadata?: Prisma.InputJsonValue;
    request: RequestMetadata;
  }) {
    return prisma.authAuditLog.create({
      data: {
        platformId: input.platformId,
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        success: input.success ?? true,
        metadata: input.metadata,
        ipAddress: input.request.ipAddress,
        userAgent: input.request.userAgent
      }
    });
  }

  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(callback);
  }

  private userInclude() {
    return {
      platform: true,
      roles: {
        where: {
          isActive: true,
          role: {
            isActive: true
          }
        },
        include: {
          role: {
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
            }
          }
        }
      }
    } satisfies Prisma.AuthUserInclude;
  }
}

export const authRepository = new AuthRepository();
