import { Elysia, t } from "elysia";
import { analysisService } from "./analysis.service.ts";

const runIdParamsSchema = t.Object({
  id: t.String()
});

export const analysisController = new Elysia({ prefix: "/analysis" })
  .post("/runs/:id/execute", async ({ params }) => {
    const summary = await analysisService.executeLoadedRun(params.id);
    if (summary.status === "completed") {
      const { readModelsService } = await import("../read_models/read_models.service.ts");
      return {
        analysis: summary,
        materialization: await readModelsService.materializeRun(params.id)
      };
    }
    return {
      analysis: summary,
      materialization: null
    };
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
