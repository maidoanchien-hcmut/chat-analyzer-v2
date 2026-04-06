import { Elysia, t } from "elysia";
import {
  createConfigVersionBodySchema,
  executeJobBodySchema,
  listPagesBodySchema,
  onboardingSamplePreviewBodySchema,
  promptPreviewArtifactBodySchema,
  promptWorkspaceSampleBodySchema,
  previewJobBodySchema,
  publishRunBodySchema,
  registerPageBodySchema
} from "./chat_extractor.types.ts";
import { chatExtractorService } from "./chat_extractor.service.ts";

const pageIdParamsSchema = t.Object({
  id: t.String()
});

const configVersionParamsSchema = t.Object({
  id: t.String(),
  configVersionId: t.String()
});

const runIdParamsSchema = t.Object({
  id: t.String()
});

const promptPreviewArtifactParamsSchema = t.Object({
  id: t.String(),
  artifactId: t.String()
});

export const chatExtractorController = new Elysia({ prefix: "/chat-extractor" })
  .post("/control-center/pages/list-from-token", async ({ body }) => {
    const parsed = listPagesBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.listPagesFromToken(parsed.user_access_token);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/register", async ({ body }) => {
    const parsed = registerPageBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.registerPageConfig(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/onboarding-sample/preview", async ({ body }) => {
    const parsed = onboardingSamplePreviewBodySchema.parse(normalizeBodyKeys(body));
    return {
      samplePreview: await chatExtractorService.previewOnboardingSample(parsed)
    };
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/prompt-workspace/sample", async ({ params, body }) => {
    const parsed = promptWorkspaceSampleBodySchema.parse(normalizeBodyKeys(body));
    return {
      samplePreview: await chatExtractorService.previewPromptWorkspaceSample(params.id, parsed)
    };
  }, {
    params: pageIdParamsSchema,
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
  .post("/control-center/pages/:id/config-versions", async ({ params, body }) => {
    const parsed = createConfigVersionBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.createConfigVersion(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/:id/config-versions/:configVersionId/activate", async ({ params }) => {
    return chatExtractorService.activateConfigVersion(params.id, params.configVersionId);
  }, {
    params: configVersionParamsSchema,
    response: t.Any()
  })
  .post("/control-center/pages/:id/prompt-preview-artifacts", async ({ params, body }) => {
    const parsed = promptPreviewArtifactBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.previewPromptArtifacts(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .get("/control-center/pages/:id/prompt-preview-artifacts/:artifactId", async ({ params }) => {
    return chatExtractorService.getPromptPreviewArtifact(params.id, params.artifactId);
  }, {
    params: promptPreviewArtifactParamsSchema,
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
  .post("/runs/:id/publish", async ({ params, body }) => {
    const parsed = publishRunBodySchema.parse(normalizeBodyKeys(body));
    return chatExtractorService.publishRun(params.id, parsed);
  }, {
    params: runIdParamsSchema,
    body: t.Any(),
    response: t.Any()
  })
  .get("/run-groups/:id", async ({ params }) => chatExtractorService.getRunGroup(params.id), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => chatExtractorService.getRun(params.id), {
    params: runIdParamsSchema,
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
