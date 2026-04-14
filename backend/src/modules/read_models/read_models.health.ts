import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../../config/env.ts";
import { prisma } from "../../infra/prisma.ts";
import { redisManager } from "../../infra/redis.ts";

const workerRoot = resolve(import.meta.dir, "../../..", "go-worker");

export async function buildHealthSummary() {
  const [database, queue, analysisService] = await Promise.all([
    probeDatabase(),
    probeQueue(),
    probeAnalysisService()
  ]);

  return {
    generatedAt: new Date().toISOString(),
    cards: [
      {
        key: "backend",
        label: "backend",
        status: "ready",
        detail: "HTTP control-plane dang phan hoi."
      },
      {
        key: "database",
        label: "database",
        status: database.status,
        detail: database.detail
      },
      {
        key: "queue",
        label: "queue",
        status: queue.status,
        detail: queue.detail
      },
      {
        key: "ai-service",
        label: "AI service",
        status: analysisService.status,
        detail: analysisService.detail
      },
      {
        key: "go-worker",
        label: "go-worker",
        status: probeGoWorkerStatus(),
        detail: probeGoWorkerDetail()
      }
    ]
  };
}

async function probeDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ready",
      detail: "Prisma query OK."
    };
  } catch (error) {
    return {
      status: "danger",
      detail: compactError(error)
    };
  }
}

async function probeQueue() {
  try {
    const result = await redisManager.ping();
    if (result === "PONG") {
      return {
        status: "ready",
        detail: "Redis PONG."
      };
    }
    return {
      status: "warning",
      detail: "Redis khong phan hoi ping."
    };
  } catch (error) {
    return {
      status: "danger",
      detail: compactError(error)
    };
  }
}

async function probeAnalysisService() {
  let healthUrl: string;
  try {
    healthUrl = new URL("/health", env.analysisServiceBaseUrl).toString();
  } catch {
    return {
      status: "warning",
      detail: `Base URL khong hop le: ${env.analysisServiceBaseUrl}`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        status: "warning",
        detail: `HTTP ${response.status} @ ${healthUrl}`
      };
    }
    return {
      status: "ready",
      detail: `HTTP ready @ ${healthUrl}`
    };
  } catch (error) {
    return {
      status: "warning",
      detail: compactError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function probeGoWorkerStatus() {
  return Bun.which("go") && existsSync(resolve(workerRoot, "go.mod")) ? "ready" : "warning";
}

function probeGoWorkerDetail() {
  if (!Bun.which("go")) {
    return "Khong tim thay binary go trong PATH.";
  }
  if (!existsSync(resolve(workerRoot, "go.mod"))) {
    return "Khong tim thay go-worker workspace.";
  }
  return `Workspace OK @ ${workerRoot}`;
}

function compactError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
