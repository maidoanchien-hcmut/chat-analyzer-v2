import { createControlPlaneAdapter } from "../src/adapters/http/control-plane-adapter.ts";

type RawConfigVersion = {
  id: string;
  versionNo: number;
  promptText: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  notes: string | null;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: {
    versionCode: string;
  };
  createdAt: string;
};

type RawConnectedPage = {
  id: string;
  pancakePageId: string;
  pageName: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  activeConfigVersion: RawConfigVersion | null;
  configVersions: RawConfigVersion[];
  updatedAt: string;
};

const createdAt = "2026-04-04T09:00:00.000Z";

const configV1: RawConfigVersion = {
  id: "cfg_v1",
  versionNo: 1,
  promptText: "Prompt A10",
  tagMappingJson: { version: 1, defaultRole: "noise", entries: [] },
  openingRulesJson: { version: 1, selectors: [] },
  schedulerJson: { official_daily_time: "00:00" },
  notificationTargetsJson: { telegram: ["ops@example.com"] },
  notes: "default",
  analysisTaxonomyVersionId: "tax_01",
  analysisTaxonomyVersion: { versionCode: "tax-2026-04" },
  createdAt
};

let connectedPage: RawConnectedPage = {
  id: "cp_demo_01",
  pancakePageId: "pk_101",
  pageName: "Page Da Liễu Quận 1",
  businessTimezone: "Asia/Ho_Chi_Minh",
  etlEnabled: true,
  analysisEnabled: false,
  activeConfigVersionId: configV1.id,
  activeConfigVersion: configV1,
  configVersions: [configV1],
  updatedAt: createdAt
};

const runGroup = {
  run_group: {
    id: "rg_001",
    run_mode: "manual",
    status: "loaded",
    publish_intent: "official",
    frozen_prompt_version: "Prompt A11",
    frozen_compiled_prompt_hash: "sha256:prompt-a11",
    frozen_config_version_id: "cfg_v2",
    created_at: createdAt,
    started_at: createdAt,
    finished_at: "2026-04-04T09:05:00.000Z",
    connected_page: { page_name: connectedPage.pageName }
  },
  child_runs: [
    {
      id: "run_001",
      target_date: "2026-04-03",
      status: "loaded",
      publish_state: "draft",
      publish_eligibility: "official_full_day",
      window_start_at: "2026-04-03T00:00:00.000Z",
      window_end_exclusive_at: "2026-04-04T00:00:00.000Z",
      supersedes_run_id: "run_prev_001",
      published_at: null
    }
  ]
};

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/chat-extractor/control-center/pages/list-from-token" && request.method === "POST") {
      return json([{ pageId: "pk_101", pageName: connectedPage.pageName }]);
    }

    if (path === "/chat-extractor/control-center/pages/register" && request.method === "POST") {
      return json({ page: connectedPage });
    }

    if (path === "/chat-extractor/control-center/pages" && request.method === "GET") {
      return json({ pages: [connectedPage] });
    }

    if (path === `/chat-extractor/control-center/pages/${connectedPage.id}` && request.method === "GET") {
      return json({ page: connectedPage });
    }

    if (path === `/chat-extractor/control-center/pages/${connectedPage.id}/config-versions` && request.method === "POST") {
      const configV2: RawConfigVersion = {
        ...configV1,
        id: "cfg_v2",
        versionNo: 2,
        promptText: "Prompt A11",
        notes: "new",
        createdAt: "2026-04-04T09:10:00.000Z"
      };
      connectedPage = {
        ...connectedPage,
        configVersions: [configV2, ...connectedPage.configVersions],
        updatedAt: "2026-04-04T09:10:00.000Z"
      };
      return json({ configVersion: configV2, active: false });
    }

    if (path === `/chat-extractor/control-center/pages/${connectedPage.id}/config-versions/cfg_v2/activate` && request.method === "POST") {
      const configV2 = connectedPage.configVersions.find((item) => item.id === "cfg_v2") ?? configV1;
      connectedPage = {
        ...connectedPage,
        activeConfigVersionId: configV2.id,
        activeConfigVersion: configV2,
        updatedAt: "2026-04-04T09:12:00.000Z"
      };
      return json({ page: connectedPage });
    }

    if (path === "/chat-extractor/jobs/preview" && request.method === "POST") {
      return json({
        run_group: {
          page_name: connectedPage.pageName,
          requested_window_start_at: null,
          requested_window_end_exclusive_at: null,
          requested_target_date: "2026-04-03",
          will_use_config_version: 2,
          will_use_prompt_version: "Prompt A11"
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

    if (path === "/chat-extractor/jobs/execute" && request.method === "POST") {
      return json(runGroup);
    }

    if (path === "/chat-extractor/run-groups/rg_001" && request.method === "GET") {
      return json(runGroup);
    }

    if (path === "/chat-extractor/runs/run_001" && request.method === "GET") {
      return json({
        run: runGroup.child_runs[0],
        counts: {
          threadDayCount: 182,
          messageCount: 1648
        }
      });
    }

    if (path === "/chat-extractor/runs/run_001/publish" && request.method === "POST") {
      runGroup.child_runs[0] = {
        ...runGroup.child_runs[0],
        status: "published",
        publish_state: "published_official",
        published_at: "2026-04-04T09:20:00.000Z"
      };
      return json({
        run: runGroup.child_runs[0],
        counts: {
          threadDayCount: 182,
          messageCount: 1648
        }
      });
    }

    return new Response("Not found", { status: 404 });
  }
});

const baseUrl = `http://127.0.0.1:${server.port}`;
const adapter = createControlPlaneAdapter(() => baseUrl);

try {
  const listedPages = await adapter.listPagesFromToken("token_demo");
  const registeredPage = await adapter.registerPage({
    pancakePageId: listedPages[0]?.pageId ?? "pk_101",
    userAccessToken: "token_demo",
    businessTimezone: "Asia/Ho_Chi_Minh",
    etlEnabled: true,
    analysisEnabled: false
  });
  console.log(`FLOW 1 list-from-token -> register: ${listedPages.length} page, registered ${registeredPage.id}`);

  const beforeConfig = await adapter.getConnectedPage(registeredPage.id);
  await adapter.createConfigVersion(registeredPage.id, {
    promptText: "Prompt A11",
    tagMappingJson: { version: 1, defaultRole: "noise", entries: [] },
    openingRulesJson: { version: 1, selectors: [] },
    schedulerJson: { official_daily_time: "00:00" },
    notificationTargetsJson: { telegram: ["ops@example.com"] },
    notes: "new",
    activate: false,
    etlEnabled: true,
    analysisEnabled: false
  });
  const createdConfig = await adapter.getConnectedPage(registeredPage.id);
  const latestConfig = createdConfig.configVersions[0];
  const activatedPage = await adapter.activateConfigVersion(registeredPage.id, latestConfig.id);
  console.log(`FLOW 2 create config version -> activate: before ${beforeConfig.activeConfigVersionId}, created ${latestConfig.id}, active ${activatedPage.activeConfigVersionId}`);

  const preview = await adapter.previewManualRun({
    connectedPageId: registeredPage.id,
    processingMode: "etl_only",
    targetDate: "2026-04-03"
  });
  const executed = await adapter.executeManualRun({
    connectedPageId: registeredPage.id,
    processingMode: "etl_only",
    targetDate: "2026-04-03"
  });
  const group = await adapter.getRunGroup(executed.id);
  const detail = await adapter.getRun(group.childRuns[0]?.id ?? "run_001");
  const published = await adapter.publishRun(group.childRuns[0]?.id ?? "run_001", {
    publishAs: "official",
    confirmHistoricalOverwrite: true,
    expectedReplacedRunId: "run_prev_001"
  });
  console.log(`FLOW 3 preview -> execute -> get run detail -> publish: preview ${preview.children[0]?.publishEligibility}, runGroup ${group.id}, run ${detail.run.id}, publish ${published.run.publishState}`);
} finally {
  server.stop(true);
}

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
