import { existsSync } from "node:fs";
import { createConnection } from "node:net";
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
  const [host, rawPort] = env.analysisServiceGrpcTarget.split(":");
  const port = Number(rawPort);
  if (!host || !Number.isFinite(port)) {
    return {
      status: "warning",
      detail: `Target khong hop le: ${env.analysisServiceGrpcTarget}`
    };
  }

  try {
    await new Promise<void>((resolveProbe, rejectProbe) => {
      const socket = createConnection({ host, port, timeout: 1500 }, () => {
        socket.end();
        resolveProbe();
      });
      socket.once("timeout", () => {
        socket.destroy();
        rejectProbe(new Error("connect timeout"));
      });
      socket.once("error", (error) => {
        socket.destroy();
        rejectProbe(error);
      });
    });
    return {
      status: "ready",
      detail: `TCP ready @ ${env.analysisServiceGrpcTarget}`
    };
  } catch (error) {
    return {
      status: "warning",
      detail: compactError(error)
    };
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
