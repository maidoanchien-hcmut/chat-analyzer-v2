import { Elysia, t } from "elysia";
import { analysisService } from "./analysis.service.ts";

const runIdParamsSchema = t.Object({
  id: t.String()
});

export const analysisController = new Elysia({ prefix: "/analysis" })
  .post("/runs/:id/execute", async ({ params }) => {
    return analysisService.executeLoadedRun(params.id);
  }, {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .get("/runs/:id", async ({ params }) => {
    return {
      analysis: await analysisService.getRunSummary(params.id)
    };
  }, {
    params: runIdParamsSchema,
    response: t.Any()
  });
