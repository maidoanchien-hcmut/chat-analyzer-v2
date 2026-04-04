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
    patchValue(prisma.pagePromptIdentity, "create", async () => {
      throw new Prisma.PrismaClientKnownRequestError("unique constraint", {
        code: "P2002",
        clientVersion: "test"
      });
    });
    patchValue(prisma.pagePromptIdentity, "findUnique", async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:existing-hash",
      promptVersion: "A",
      compiledPromptText: "compiled prompt",
      createdAt: new Date("2026-04-01T00:00:00.000Z")
    }));

    const result = await chatExtractorRepository.createPromptIdentity({
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:existing-hash",
      promptVersion: "A",
      compiledPromptText: "compiled prompt"
    });

    expect(result).toMatchObject({
      connectedPageId: "11111111-1111-4111-8111-111111111111",
      compiledPromptHash: "sha256:existing-hash",
      promptVersion: "A"
    });
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}
