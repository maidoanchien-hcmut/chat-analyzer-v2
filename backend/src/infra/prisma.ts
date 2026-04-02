import { env } from "../config/env.ts";
import { PrismaClient } from "@prisma/client";

declare global {
  var __chatAnalyzerPrisma__: PrismaClient | undefined;
}

process.env.DATABASE_URL = env.databaseUrl;

export const prisma =
  globalThis.__chatAnalyzerPrisma__ ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (Bun.env.NODE_ENV !== "production") {
  globalThis.__chatAnalyzerPrisma__ = prisma;
}
