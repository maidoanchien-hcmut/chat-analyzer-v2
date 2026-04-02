import { Elysia, t } from "elysia";
import { seam1Service } from "./seam1.service.ts";

const kindParamsSchema = t.Object({
  kind: t.Union([t.Literal("manual"), t.Literal("onboarding"), t.Literal("scheduler")]),
  name: t.String()
});

const runIdParamsSchema = t.Object({
  id: t.String()
});

const pageParamsSchema = t.Object({
  pageSlug: t.String()
});

export const seam1Controller = new Elysia({ prefix: "/seam1" })
  .get("/control-center/pages", async () => seam1Service.listPages(), {
    response: t.Any()
  })
  .get("/control-center/pages/:pageSlug", async ({ params }) => seam1Service.getPage(params.pageSlug), {
    params: pageParamsSchema,
    response: t.Any()
  })
  .get("/health/summary", async () => seam1Service.getHealthSummary(), {
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => seam1Service.getRun(params.id), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .get("/jobs/:kind/:name/preview", async ({ params }) => seam1Service.previewJob(params.kind, params.name), {
    params: kindParamsSchema,
    response: t.Any()
  })
  .post("/jobs/:kind/:name/execute", async ({ params }) => seam1Service.executeJob(params.kind, params.name), {
    params: kindParamsSchema,
    response: t.Any()
  });
