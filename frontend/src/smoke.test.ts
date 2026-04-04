import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createBusinessAdapter } from "./adapters/demo/business-adapter.ts";
import { createControlPlaneAdapter } from "./adapters/http/control-plane-adapter.ts";
import type { BusinessFilters } from "./core/types.ts";

let server: ReturnType<typeof Bun.serve>;
let baseUrl = "";
const seenRequests: string[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seenRequests.push(`${request.method} ${url.pathname}`);
      return routeStub(request.method, url.pathname);
    }
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

describe("frontend smoke", () => {
  it("walks the pinned http-first flows through the real frontend adapter chain", async () => {
    const adapter = createControlPlaneAdapter(() => baseUrl);

    const tokenPages = await adapter.listPagesFromToken("token-123");
    expect(tokenPages).toHaveLength(2);

    const registered = await adapter.registerPage({
      pancakePageId: "pk_101",
      userAccessToken: "token-123",
      businessTimezone: "Asia/Ho_Chi_Minh",
      etlEnabled: true,
      analysisEnabled: false
    });
    expect(registered.pageName).toBe("Page Da Lieu Quan 1");

    const page = await adapter.getConnectedPage("cp-101");
    expect(page.configVersions.length).toBeGreaterThan(0);

    await adapter.createConfigVersion("cp-101", {
      promptText: "new prompt",
      tagMappingJson: { version: 1, entries: [] },
      openingRulesJson: { version: 1, selectors: [] },
      schedulerJson: null,
      notificationTargetsJson: null,
      notes: null,
      activate: false,
      etlEnabled: true,
      analysisEnabled: false
    });

    const activated = await adapter.activateConfigVersion("cp-101", "cfg-18");
    expect(activated.activeConfigVersion?.id).toBe("cfg-18");

    const preview = await adapter.previewManualRun({
      connectedPageId: "cp-101",
      processingMode: "etl_only",
      targetDate: "2026-04-03"
    });
    expect(preview.children[0]?.publishEligibility).toBe("official_full_day");

    const executed = await adapter.executeManualRun({
      connectedPageId: "cp-101",
      processingMode: "etl_only",
      targetDate: "2026-04-03"
    });
    expect(executed.childRuns[0]?.id).toBe("run-201");

    const runGroup = await adapter.getRunGroup("rg-201");
    expect(runGroup.childRuns[0]?.publishEligibility).toBe("official_full_day");

    const runDetail = await adapter.getRun("run-201");
    expect(runDetail.threadDayCount).toBe(42);

    const published = await adapter.publishRun("run-201", {
      publishAs: "official",
      confirmHistoricalOverwrite: true,
      expectedReplacedRunId: "run-155"
    });
    expect(published.run.publishState).toBe("Published official");

    expect(seenRequests).toEqual([
      "POST /chat-extractor/control-center/pages/list-from-token",
      "POST /chat-extractor/control-center/pages/register",
      "GET /chat-extractor/control-center/pages/cp-101",
      "POST /chat-extractor/control-center/pages/cp-101/config-versions",
      "POST /chat-extractor/control-center/pages/cp-101/config-versions/cfg-18/activate",
      "POST /chat-extractor/jobs/preview",
      "POST /chat-extractor/jobs/execute",
      "GET /chat-extractor/run-groups/rg-201",
      "GET /chat-extractor/runs/run-201",
      "POST /chat-extractor/runs/run-201/publish"
    ]);
  });

  it("keeps export as an explicit workflow and thread list grain at thread", async () => {
    const adapter = createBusinessAdapter();
    const filters: BusinessFilters = {
      pageId: "page-a",
      slicePreset: "yesterday",
      startDate: "2026-04-03",
      endDate: "2026-04-03",
      publishSnapshot: "provisional",
      inboxBucket: "all",
      revisit: "all",
      need: "all",
      outcome: "all",
      risk: "all",
      staff: "all"
    };

    const overview = await adapter.getOverview(filters);
    expect(overview.warning?.title).toContain("tạm thời");

    const workbook = await adapter.getExportWorkbook({
      pageId: "page-a",
      startDate: "2026-03-01",
      endDate: "2026-03-03"
    });
    expect(workbook.allowed).toBe(false);

    const history = await adapter.getThreadHistory(filters, null, "analysis-history");
    expect(history.threads.every((thread) => !thread.id.includes("thread_day"))).toBe(true);
    expect(history.analysisHistory.length).toBeGreaterThan(0);
  });
});

function routeStub(method: string, pathname: string) {
  if (method === "POST" && pathname.endsWith("/list-from-token")) {
    return json([
      { pageId: "pk_101", pageName: "Page Da Lieu Quan 1" },
      { pageId: "pk_202", pageName: "Page Nha Khoa Thu Duc" }
    ]);
  }

  if (method === "POST" && pathname.endsWith("/register")) {
    return json({ page: buildPage("cfg-17") });
  }

  if (method === "GET" && pathname.endsWith("/pages/cp-101")) {
    return json({ page: buildPage("cfg-17") });
  }

  if (method === "POST" && pathname.endsWith("/config-versions")) {
    return json({ ok: true });
  }

  if (method === "POST" && pathname.endsWith("/activate")) {
    return json({ page: buildPage("cfg-18") });
  }

  if (method === "POST" && pathname.endsWith("/jobs/preview")) {
    return json({
      run_group: {
        page_name: "Page Da Lieu Quan 1",
        requested_window_start_at: null,
        requested_window_end_exclusive_at: null,
        requested_target_date: "2026-04-03",
        will_use_config_version: 18,
        will_use_prompt_version: "Prompt A12"
      },
      child_runs: [
        {
          target_date: "2026-04-03",
          window_start_at: "2026-04-03T00:00:00.000Z",
          window_end_exclusive_at: "2026-04-04T00:00:00.000Z",
          is_full_day: true,
          publish_eligibility: "official_full_day",
          historical_overwrite_required: true
        }
      ]
    });
  }

  if (method === "POST" && pathname.endsWith("/jobs/execute")) {
    return json({
      run_group: {
        id: "rg-201",
        run_mode: "manual",
        status: "loaded",
        publish_intent: "official",
        frozen_prompt_version: "Prompt A12",
        frozen_compiled_prompt_hash: "sha256:prompt-a12",
        frozen_config_version_id: "cfg-18",
        created_at: "2026-04-04T10:00:00.000Z",
        started_at: "2026-04-04T10:01:00.000Z",
        finished_at: "2026-04-04T10:03:00.000Z",
        connected_page: { page_name: "Page Da Lieu Quan 1" }
      },
      child_runs: [buildRun("draft")]
    });
  }

  if (method === "GET" && pathname.endsWith("/run-groups/rg-201")) {
    return json({
      run_group: {
        id: "rg-201",
        run_mode: "manual",
        status: "loaded",
        publish_intent: "official",
        frozen_prompt_version: "Prompt A12",
        frozen_compiled_prompt_hash: "sha256:prompt-a12",
        frozen_config_version_id: "cfg-18",
        created_at: "2026-04-04T10:00:00.000Z",
        started_at: "2026-04-04T10:01:00.000Z",
        finished_at: "2026-04-04T10:03:00.000Z",
        connected_page: { page_name: "Page Da Lieu Quan 1" }
      },
      child_runs: [buildRun("draft")]
    });
  }

  if (method === "GET" && pathname.endsWith("/runs/run-201")) {
    return json({
      run: buildRun("draft"),
      counts: { threadDayCount: 42, messageCount: 388 }
    });
  }

  if (method === "POST" && pathname.endsWith("/runs/run-201/publish")) {
    return json({
      run: buildRun("published_official"),
      counts: { threadDayCount: 42, messageCount: 388 }
    });
  }

  return new Response("not found", { status: 404 });
}

function buildPage(activeConfigId: string) {
  return {
    id: "cp-101",
    pancakePageId: "pk_101",
    pageName: "Page Da Lieu Quan 1",
    businessTimezone: "Asia/Ho_Chi_Minh",
    etlEnabled: true,
    analysisEnabled: false,
    activeConfigVersionId: activeConfigId,
    activeConfigVersion: buildConfig(activeConfigId),
    configVersions: [buildConfig("cfg-18"), buildConfig("cfg-17")],
    updatedAt: "2026-04-04T09:00:00.000Z"
  };
}

function buildConfig(id: string) {
  return {
    id,
    versionNo: id === "cfg-18" ? 18 : 17,
    promptText: "prompt text",
    tagMappingJson: { version: 1, entries: [] },
    openingRulesJson: { version: 1, selectors: [] },
    schedulerJson: null,
    notificationTargetsJson: null,
    notes: null,
    analysisTaxonomyVersionId: "tax-2026-04",
    analysisTaxonomyVersion: { versionCode: "tax-2026-04" },
    createdAt: "2026-04-04T09:00:00.000Z"
  };
}

function buildRun(publishState: string) {
  return {
    id: "run-201",
    target_date: "2026-04-03",
    status: publishState === "draft" ? "loaded" : "published",
    publish_state: publishState,
    publish_eligibility: "official_full_day",
    window_start_at: "2026-04-03T00:00:00.000Z",
    window_end_exclusive_at: "2026-04-04T00:00:00.000Z",
    supersedes_run_id: "run-155",
    published_at: publishState === "draft" ? null : "2026-04-04T10:05:00.000Z"
  };
}

function json(value: unknown) {
  return Response.json(value, { headers: { "Content-Type": "application/json" } });
}
