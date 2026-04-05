import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHttpBusinessAdapter } from "./adapters/http/business-adapter.ts";
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

beforeEach(() => {
  seenRequests.length = 0;
});

afterAll(() => {
  server.stop(true);
});

describe("frontend smoke", () => {
  it("walks the pinned http-first control-plane flows through the real frontend adapter chain", async () => {
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
    expect(runDetail.analysisMetrics?.analysisRunId).toBe("analysis-run-1");
    expect(runDetail.martMetrics?.factThreadDayCount).toBe(42);

    const published = await adapter.publishRun("run-201", {
      publishAs: "official",
      confirmHistoricalOverwrite: true,
      expectedReplacedRunId: "run-155"
    });
    expect(published.run.publishState).toBe("Published official");

    const health = await adapter.getHealthSummary();
    expect(health.cards.some((card) => card.label === "queue")).toBe(true);

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
      "POST /chat-extractor/runs/run-201/publish",
      "GET /read-models/health"
    ]);
  });

  it("serves business views from read-model HTTP endpoints instead of demo fixtures", async () => {
    const adapter = createHttpBusinessAdapter(() => baseUrl);
    const catalog = await adapter.loadCatalog();
    expect(catalog.pages[0]?.id).toBe("cp-101");

    const filters: BusinessFilters = {
      pageId: "cp-101",
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
    expect(overview.warning?.title).toContain("Tam");

    const workbook = await adapter.getExportWorkbook({
      pageId: "cp-101",
      startDate: "2026-03-01",
      endDate: "2026-03-03"
    });
    expect(workbook.allowed).toBe(false);

    const history = await adapter.getThreadHistory(filters, null, null, "analysis-history");
    expect(history.threads.every((thread) => !thread.id.includes("thread_day"))).toBe(true);
    expect(history.analysisHistory.length).toBeGreaterThan(0);

    expect(seenRequests).toEqual([
      "GET /read-models/catalog",
      "GET /read-models/overview",
      "GET /read-models/export-workbook",
      "GET /read-models/thread-history"
    ]);
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
    return json(buildRunDetail("draft"));
  }

  if (method === "POST" && pathname.endsWith("/runs/run-201/publish")) {
    return json(buildRunDetail("published_official"));
  }

  if (method === "GET" && pathname.endsWith("/read-models/health")) {
    return json({
      healthSummary: {
        generatedAt: "2026-04-05T10:00:00.000Z",
        cards: [
          { key: "backend", label: "backend", status: "ready", detail: "HTTP control-plane dang phan hoi." },
          { key: "queue", label: "queue", status: "ready", detail: "Redis PONG." }
        ]
      }
    });
  }

  if (method === "GET" && pathname.endsWith("/read-models/catalog")) {
    return json({
      catalog: {
        pages: [
          { id: "cp-101", label: "Page Da Lieu Quan 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" }
        ],
        needs: [{ value: "all", label: "Tat ca nhu cau" }],
        outcomes: [{ value: "all", label: "Tat ca outcome" }],
        risks: [{ value: "all", label: "Tat ca rui ro" }],
        staff: [{ value: "all", label: "Tat ca nhan vien" }]
      }
    });
  }

  if (method === "GET" && pathname.endsWith("/read-models/overview")) {
    return json({
      overview: {
        pageLabel: "Page Da Lieu Quan 1",
        snapshot: {
          kind: "published_provisional",
          label: "Tam thoi",
          coverage: "2026-04-03 -> 2026-04-03",
          promptVersion: "Prompt A12",
          configVersion: "v18",
          taxonomyVersion: "tax-2026-04"
        },
        warning: {
          title: "Tam thoi",
          body: "Slice dang doc provisional.",
          tone: "warning"
        },
        metrics: [],
        openingNew: [],
        openingRevisit: [],
        needs: [],
        outcomes: [],
        sources: [],
        priorities: []
      }
    });
  }

  if (method === "GET" && pathname.endsWith("/read-models/export-workbook")) {
    return json({
      workbook: {
        allowed: false,
        reason: "Khong co official snapshot.",
        fileName: "export.xlsx",
        pageId: "cp-101",
        pageLabel: "Page Da Lieu Quan 1",
        startDate: "2026-03-01",
        endDate: "2026-03-03",
        generatedAt: "2026-04-05T10:00:00.000Z",
        promptVersion: "Khong co du lieu official",
        configVersion: "Khong co du lieu official",
        taxonomyVersion: "Khong co du lieu official",
        rows: []
      }
    });
  }

  if (method === "GET" && pathname.endsWith("/read-models/thread-history")) {
    return json({
      threadHistory: {
        warning: null,
        threads: [
          {
            id: "thread-1",
            customer: "Lan Anh",
            snippet: "Khach hoi gia",
            updatedAt: "2026-04-03",
            badges: ["Inbox moi"]
          }
        ],
        activeThreadId: "thread-1",
        activeThreadDayId: "thread-day-1",
        activeTab: "analysis-history",
        transcript: [
          {
            id: "msg-1",
            at: "03/04/2026 09:05",
            author: "Lan Anh",
            role: "customer",
            text: "Cho em hoi gia",
            isFirstMeaningful: true,
            isStaffFirstResponse: false,
            isSupportingEvidence: true
          }
        ],
        analysisHistory: [
          {
            threadDayId: "thread-day-1",
            date: "2026-04-03",
            openingTheme: "Hoi gia",
            need: "Dat lich",
            outcome: "Da chot hen",
            mood: "Tich cuc",
            risk: "Cao",
            quality: "Tot",
            aiCost: "2 đ",
            active: true
          }
        ],
        audit: {
          model: "gpt-5.4-mini",
          promptVersion: "Prompt A12",
          promptHash: "sha256:prompt-a12",
          taxonomyVersion: "tax-2026-04",
          evidence: ["Khach hoi gia"],
          explanations: [{ field: "outcome", explanation: "Da co slot cu the." }],
          supportingMessageIds: ["msg-1"]
        },
        crmLink: {
          customer: "CRM KH-7712",
          method: "deterministic",
          confidence: "0.97",
          history: ["2026-04-03T09:00:00.000Z | deterministic -> linked -> KH-7712"]
        }
      }
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
    createdAt: "2026-04-04T09:00:00.000Z",
    promptVersionLabel: id === "cfg-18" ? "Prompt A12" : "Prompt A10",
    promptHash: id === "cfg-18" ? "sha256:prompt-a12" : "sha256:prompt-a10",
    evidenceBundle: id === "cfg-18"
      ? ["Opening block = Khach hang tai kham", "Khach yeu cau doi lich sang chieu mai"]
      : ["Khach hoi gia dich vu", "Staff bao gia nhung chua chot lich"],
    fieldExplanations: id === "cfg-18"
      ? [{ field: "risk_level", explanation: "Khach co nhu cau ro nhung staff phan hoi cham." }]
      : [{ field: "outcome", explanation: "Prompt cu nghieng ve booked khi khach hoi slot ro rang." }]
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
    historical_overwrite: {
      replaced_run_id: "run-155",
      replaced_snapshot_label: "Snapshot official 2026-04-03",
      previous_prompt_version: "Prompt A10",
      previous_config_version: "v17",
      next_prompt_version: "Prompt A12",
      next_config_version: "v18",
      export_impact: "Export .xlsx của ngày này sẽ regenerate theo snapshot mới."
    },
    published_at: publishState === "draft" ? null : "2026-04-04T10:05:00.000Z"
  };
}

function buildRunDetail(publishState: string) {
  return {
    run: buildRun(publishState),
    artifact_counts: {
      thread_day_count: 42,
      message_count: 388
    },
    analysis_metrics: {
      analysis_run_id: "analysis-run-1",
      status: "completed",
      unit_count_planned: 42,
      unit_count_succeeded: 41,
      unit_count_unknown: 1,
      unit_count_failed: 0,
      total_cost_micros: 120000,
      prompt_hash: "sha256:prompt-a12",
      prompt_version: "Prompt A12",
      taxonomy_version_id: "tax-1",
      output_schema_version: "conversation-analysis.v1",
      resumed: true,
      skipped_thread_day_ids: ["thread-day-9"]
    },
    mart_metrics: {
      materialized: true,
      analysis_run_id: "analysis-run-1",
      fact_thread_day_count: 42,
      fact_staff_thread_day_count: 14,
      prompt_hash: "sha256:prompt-a12",
      prompt_version: "Prompt A12",
      config_version_id: "cfg-18",
      config_version_no: 18,
      taxonomy_version_id: "tax-1",
      taxonomy_version_code: "tax-2026-04"
    },
    publish_warning: null,
    error_text: null
  };
}

function json(value: unknown) {
  return Response.json(value, { headers: { "Content-Type": "application/json" } });
}
