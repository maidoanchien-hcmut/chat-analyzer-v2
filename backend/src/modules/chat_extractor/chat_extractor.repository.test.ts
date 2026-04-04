import { afterEach, describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import { chatExtractorRepository } from "./chat_extractor.repository.ts";

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()!();
  }
});

describe("chat_extractor repository", () => {
  it("reuses an existing prompt identity when a concurrent create hits the unique hash constraint", async () => {
    patchValue(prisma, "$transaction", async (callback: (tx: any) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ id: "11111111-1111-4111-8111-111111111111" }],
      pagePromptIdentity: {
        findUnique: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          connectedPageId: "11111111-1111-4111-8111-111111111111",
          compiledPromptHash: "sha256:existing-hash",
          promptVersion: "A",
          compiledPromptText: "compiled prompt",
          createdAt: new Date("2026-04-01T00:00:00.000Z")
        }),
        findMany: async () => [],
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("unique constraint", {
            code: "P2002",
            clientVersion: "test"
          });
        }
      }
    }));

    const result = await chatExtractorRepository.createPromptIdentity({
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:existing-hash",
      compiledPromptText: "compiled prompt"
    });

    expect(result).toMatchObject({
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:existing-hash",
      promptVersion: "A"
    });
  });

  it("allocates the next prompt version inside the repository transaction", async () => {
    const createCalls: Array<{ promptVersion: string }> = [];

    patchValue(prisma, "$transaction", async (callback: (tx: any) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ id: "11111111-1111-4111-8111-111111111111" }],
      pagePromptIdentity: {
        findUnique: async () => null,
        findMany: async () => [
          { promptVersion: "A" },
          { promptVersion: "B" }
        ],
        create: async ({ data }: { data: any }) => {
          createCalls.push({ promptVersion: data.promptVersion });
          return {
            id: "55555555-5555-4555-8555-555555555555",
            connectedPageId: data.connectedPageId,
            compiledPromptHash: data.compiledPromptHash,
            promptVersion: data.promptVersion,
            compiledPromptText: data.compiledPromptText,
            createdAt: new Date("2026-04-02T00:00:00.000Z")
          };
        }
      }
    }));

    const result = await chatExtractorRepository.createPromptIdentity({
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:new-hash",
      compiledPromptText: "compiled prompt"
    });

    expect(createCalls).toEqual([{ promptVersion: "C" }]);
    expect(result.promptVersion).toBe("C");
  });

  it("derives run group timestamps from the earliest start and latest finish", async () => {
    let updatedPayload: any;

    patchValue(prisma.pipelineRun, "findMany", async () => [
      {
        status: "loaded",
        startedAt: new Date("2026-04-04T10:00:00.000Z"),
        finishedAt: new Date("2026-04-04T10:07:00.000Z")
      },
      {
        status: "loaded",
        startedAt: new Date("2026-04-04T09:00:00.000Z"),
        finishedAt: new Date("2026-04-04T09:05:00.000Z")
      }
    ]);
    patchValue(prisma.pipelineRunGroup, "update", async (payload: any) => {
      updatedPayload = payload;
      return payload;
    });

    await chatExtractorRepository.refreshRunGroupStatus("77777777-7777-4777-8777-777777777777");

    expect(updatedPayload.data.status).toBe("loaded");
    expect(updatedPayload.data.startedAt?.toISOString()).toBe("2026-04-04T09:00:00.000Z");
    expect(updatedPayload.data.finishedAt?.toISOString()).toBe("2026-04-04T10:07:00.000Z");
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}
