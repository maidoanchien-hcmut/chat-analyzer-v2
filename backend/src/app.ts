import { Prisma } from "@prisma/client";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./config/env.ts";
import { isAppError } from "./core/errors.ts";
import { prisma } from "./infra/prisma.ts";
import { redisManager } from "./infra/redis.ts";
import { chatExtractorController } from "./modules/chat_extractor/chat_extractor.controller.ts";

export const app = new Elysia()
  .use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
    })
  )
  .get("/health", async () => {
    const databaseOk = await prisma.$queryRaw`SELECT 1`;
    const redisResult = await redisManager.ping();

    return {
      status: databaseOk ? "ok" : "degraded",
      database: "ok",
      redis: redisResult === "PONG" ? "ok" : "degraded",
      timestamp: new Date().toISOString()
    };
  })
  .use(chatExtractorController)
  .onError(({ code, error, set }) => {
    if (isAppError(error)) {
      set.status = error.status;
      return {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        set.status = 409;
        return {
          code: "CONFLICT",
          message: "Resource already exists."
        };
      }

      if (error.code === "P2025") {
        set.status = 404;
        return {
          code: "NOT_FOUND",
          message: "Resource was not found."
        };
      }
    }

    console.error(error);
    set.status = 500;
    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error."
    };
  });
