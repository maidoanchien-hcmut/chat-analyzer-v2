import { Elysia, t } from "elysia";
import { analysisService } from "./analysis.service.ts";
import { executeAnalysisRunBodySchema } from "./analysis.types.ts";
import { normalizeBodyKeys } from "../chat_extractor/chat_extractor.controller.ts";

const pageIdParamsSchema = t.Object({
  id: t.String()
});

const runIdParamsSchema = t.Object({
  id: t.String()
});

export const analysisController = new Elysia({ prefix: "/analysis" })
  .get("/pages/:id/runs", async ({ params }) => analysisService.listPageRuns(params.id), {
    params: pageIdParamsSchema,
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => analysisService.getRun(params.id), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .post("/runs/execute", async ({ body }) => {
    const parsed = executeAnalysisRunBodySchema.parse(normalizeBodyKeys(body));
    return analysisService.executeRun(parsed);
  }, {
    body: t.Any(),
    response: t.Any()
  });
