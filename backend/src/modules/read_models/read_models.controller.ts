import { Elysia, t } from "elysia";
import { normalizeBodyKeys } from "../chat_extractor/chat_extractor.controller.ts";
import {
  comparisonQuerySchema,
  dashboardQuerySchema,
  mappingReviewQuerySchema,
  pageThreadsQuerySchema,
  runGroupThreadsQuerySchema,
  threadDetailQuerySchema
} from "./read_models.types.ts";
import { readModelsService } from "./read_models.service.ts";

const pageIdParamsSchema = t.Object({
  id: t.String()
});

const threadParamsSchema = t.Object({
  id: t.String(),
  threadId: t.String()
});

const runGroupParamsSchema = t.Object({
  id: t.String()
});

export const readModelsController = new Elysia({ prefix: "/chat-extractor/control-center" })
  .get("/pages-lite", async () => readModelsService.listPagesLite(), {
    response: t.Any()
  })
  .get("/dashboard", async ({ query }) => {
    const parsed = dashboardQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getDashboard(parsed);
  }, {
    query: t.Any(),
    response: t.Any()
  })
  .get("/comparison", async ({ query }) => {
    const parsed = comparisonQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getComparison(parsed);
  }, {
    query: t.Any(),
    response: t.Any()
  })
  .get("/pages/:id/threads", async ({ params, query }) => {
    const parsed = pageThreadsQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getPageThreads(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    query: t.Any(),
    response: t.Any()
  })
  .get("/pages/:id/threads/:threadId", async ({ params, query }) => {
    const parsed = threadDetailQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getThreadDetail(params.id, params.threadId, parsed);
  }, {
    params: threadParamsSchema,
    query: t.Any(),
    response: t.Any()
  })
  .get("/run-groups/:id/threads", async ({ params, query }) => {
    const parsed = runGroupThreadsQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getRunGroupThreads(params.id, parsed);
  }, {
    params: runGroupParamsSchema,
    query: t.Any(),
    response: t.Any()
  })
  .get("/pages/:id/mapping-review", async ({ params, query }) => {
    const parsed = mappingReviewQuerySchema.parse(normalizeBodyKeys(query));
    return readModelsService.getMappingReview(params.id, parsed);
  }, {
    params: pageIdParamsSchema,
    query: t.Any(),
    response: t.Any()
  });
