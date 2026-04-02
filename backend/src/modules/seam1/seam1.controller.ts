import { Elysia, t } from "elysia";
import {
  executeJobBodySchema,
  listPagesBodySchema,
  previewJobBodySchema,
  registerPageBodySchema
} from "./seam1.types.ts";
import { seam1Service } from "./seam1.service.ts";

const runIdParamsSchema = t.Object({
  id: t.String()
});

export const seam1Controller = new Elysia({ prefix: "/seam1" })
  .post("/pages/list-from-token", async ({ body }) => {
    const parsed = listPagesBodySchema.parse(body);
    return seam1Service.listPagesFromToken(parsed.user_access_token);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/control-center/pages/register", async ({ body }) => {
    const parsed = registerPageBodySchema.parse(body);
    return seam1Service.registerPageConfig({
      organizationId: parsed.organization_id,
      pageSlug: parsed.page_slug,
      userAccessToken: parsed.user_access_token,
      pageId: parsed.page_id,
      businessTimezone: parsed.business_timezone,
      initialConversationLimit: parsed.initial_conversation_limit,
      autoScraper: parsed.auto_scraper,
      autoAiAnalysis: parsed.auto_ai_analysis
    });
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .get("/health/summary", async () => seam1Service.getHealthSummary(), {
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => seam1Service.getRun(params.id), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .post("/jobs/preview", async ({ body }) => {
    const parsed = previewJobBodySchema.parse(body);
    return seam1Service.previewJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  })
  .post("/jobs/execute", async ({ body }) => {
    const parsed = executeJobBodySchema.parse(body);
    return seam1Service.executeJobRequest(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  });
