import { Elysia, t } from "elysia";
import {
  clonePromptVersionBodySchema,
  createPromptVersionBodySchema,
  executeJobBodySchema,
  listPagesBodySchema,
  onboardingJobBodySchema,
  previewJobBodySchema,
  registerPageBodySchema,
  updateConnectedPageBodySchema
} from "./chat_extractor.types.ts";
import { chatExtractorService } from "./chat_extractor.service.ts";

const pageIdParamsSchema = t.Object({
  id: t.String()
});

const runIdParamsSchema = t.Object({
  id: t.String()
});

const promptVersionParamsSchema = t.Object({
  id: t.String(),
  promptVersionId: t.String()
});

export const chatExtractorController = new Elysia({ prefix: "/chat-extractor" })
  .post("/pages/list-from-token", async ({ body }) => {
    const parsed = listPagesBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.listPagesFromToken(parsed.user_access_token);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .get("/control-center/pages", async () => chatExtractorService.listConnectedPages(), {
    response: t.Any()
  })
  .get("/control-center/pages/:id", async ({ params }) => chatExtractorService.getConnectedPage(params.id), {
    params: pageIdParamsSchema,
    response: t.Any()
  })
  .post("/control-center/pages/register", async ({ body }) => {
    const parsed = registerPageBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.registerPageConfig(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .patch("/control-center/pages/:id", async ({ params, body }) => {
    const parsed = updateConnectedPageBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.updateConnectedPage(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/onboarding/preview", async ({ params, body }) => {
    const parsed = onboardingJobBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.previewJobRequest({
      kind: "onboarding",
      connectedPageId: params.id,
      job: parsed
    });
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/onboarding/execute", async ({ params, body }) => {
    const normalizedBody = normalizeBodyKeys(body) as { write_artifacts?: boolean };
    const parsed = onboardingJobBodySchema.parse(normalizedBody);
    const writeArtifacts = typeof normalizedBody.write_artifacts === "boolean" ? normalizedBody.write_artifacts : true;
    return chatExtractorService.executeJobRequest({
      kind: "onboarding",
      connectedPageId: params.id,
      job: parsed,
      writeArtifacts
    });
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .get("/control-center/pages/:id/prompts", async ({ params }) => chatExtractorService.listPagePrompts(params.id), {
    params: pageIdParamsSchema,
    response: t.Any()
  })
  .post("/control-center/pages/:id/prompts", async ({ params, body }) => {
    const parsed = createPromptVersionBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.createPromptVersion(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/prompts/clone", async ({ params, body }) => {
    const parsed = clonePromptVersionBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.clonePromptVersion(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/prompts/:promptVersionId/activate", async ({ params }) => {
    return chatExtractorService.activatePromptVersion(params.id, params.promptVersionId);
  }, {
    params: promptVersionParamsSchema,
    response: t.Any()
  })
  .get("/health/summary", async () => chatExtractorService.getHealthSummary(), {
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => chatExtractorService.getRun(params.id), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .post("/jobs/preview", async ({ body }) => {
    const parsed = previewJobBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.previewJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/jobs/execute", async ({ body }) => {
    const parsed = executeJobBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.executeJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/jobs/scheduler/preview", async ({ body }) => {
    const normalizedBody = normalizeBodyKeys(body);
    const parsed = previewJobBodySchema.parse({
      kind: "scheduler",
      job: normalizedBody
    });
    return chatExtractorService.previewJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/jobs/scheduler/execute", async ({ body }) => {
    const normalizedBody = normalizeBodyKeys(body);
    const parsed = executeJobBodySchema.parse({
      kind: "scheduler",
      job: normalizedBody,
      write_artifacts: false
    });
    return chatExtractorService.executeJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  });

export function normalizeBodyKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBodyKeys(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/([A-Z])/g, "_$1").toLowerCase(),
        normalizeBodyKeys(item)
      ])
    );
  }

  return value;
}
