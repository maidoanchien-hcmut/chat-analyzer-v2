import { describe, expect, it } from "bun:test";
import type { ConfigurationState, OnboardingState } from "../../app/screen-state.ts";
import { renderConfiguration } from "./render.ts";
import { buildCreateConfigVersionInput, configVersionToDraft } from "./state.ts";

describe("configuration workflow", () => {
  it("serializes structured configuration editors into the control-plane contract", () => {
    const payload = buildCreateConfigVersionInput({
      promptText: "Giữ distinction draft / provisional / official",
      tagMappings: [
        { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ],
      openingRules: [
        { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
      ],
      scheduler: { useSystemDefaults: false, officialDailyTime: "00:30", lookbackHours: 3 },
      notificationTargets: [
        { channel: "telegram", value: "@ops-alert" }
      ],
      notes: "sample",
      activate: true,
      etlEnabled: true,
      analysisEnabled: false
    });

    expect(payload.tagMappingJson).toEqual({
      version: 1,
      defaultRole: "noise",
      entries: [
        {
          sourceTagId: "tag-1",
          sourceTagText: "KH mới",
          role: "journey",
          canonicalCode: "new_to_clinic",
          mappingSource: "operator",
          status: "active"
        }
      ]
    });
    expect(payload.openingRulesJson).toEqual({
      version: 1,
      selectors: [
        {
          selectorId: "opening-rule-1",
          signalRole: "journey",
          signalCode: "revisit",
          allowedMessageTypes: ["postback", "quick_reply_selection", "text"],
          options: [
            { rawText: "Khách hàng tái khám", matchMode: "exact" }
          ]
        }
      ]
    });
    expect(payload.schedulerJson).toEqual({
      version: 1,
      timezone: "Asia/Ho_Chi_Minh",
      officialDailyTime: "00:30",
      lookbackHours: 3,
      maxConversationsPerRun: 0,
      maxMessagePagesPerThread: 0
    });
    expect(payload.notificationTargetsJson).toEqual({
      version: 1,
      telegram: [
        { chatId: "@ops-alert", events: [] }
      ],
      email: []
    });
  });

  it("parses backend config payload back into the editor draft shape", () => {
    const draft = configVersionToDraft({
      id: "cfg-18",
      versionNo: 18,
      promptText: "Prompt active có rubric risk cho khách tái khám.",
      tagMappingJson: {
        version: 1,
        defaultRole: "noise",
        entries: [
          {
            sourceTagId: "tag-1",
            sourceTagText: "KH mới",
            role: "journey",
            canonicalCode: "new_to_clinic",
            mappingSource: "operator",
            status: "active"
          }
        ]
      },
      openingRulesJson: {
        version: 1,
        selectors: [
          {
            selectorId: "opening-rule-1",
            signalRole: "journey",
            signalCode: "revisit",
            allowedMessageTypes: ["postback", "quick_reply_selection", "text"],
            options: [
              { rawText: "Khách hàng tái khám", matchMode: "exact" }
            ]
          }
        ]
      },
      schedulerJson: {
        version: 1,
        timezone: "Asia/Ho_Chi_Minh",
        officialDailyTime: "00:30",
        lookbackHours: 3,
        maxConversationsPerRun: 0,
        maxMessagePagesPerThread: 0
      },
      notificationTargetsJson: {
        version: 1,
        telegram: [
          { chatId: "@ops-alert", events: [] }
        ],
        email: [
          { address: "ops@example.com", events: [] }
        ]
      },
      notes: "sample",
      analysisTaxonomyVersionId: "tax-2026-04",
      analysisTaxonomyVersionCode: "tax-2026-04",
      createdAt: "2026-04-04T09:00:00.000Z",
      promptVersionLabel: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      evidenceBundle: [],
      fieldExplanations: []
    });

    expect(draft.tagMappings).toEqual([
      { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
    ]);
    expect(draft.openingRules).toEqual([
      { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
    ]);
    expect(draft.scheduler).toEqual({
      useSystemDefaults: false,
      officialDailyTime: "00:30",
      lookbackHours: 3
    });
    expect(draft.notificationTargets).toEqual([
      { channel: "telegram", value: "@ops-alert" },
      { channel: "email", value: "ops@example.com" }
    ]);
    expect(draft.notes).toBe("sample");
  });

  it("keeps editor defaults when backend config sections are absent", () => {
    const draft = configVersionToDraft({
      id: "cfg-18",
      versionNo: 18,
      promptText: "Prompt active có rubric risk cho khách tái khám.",
      tagMappingJson: null,
      openingRulesJson: null,
      schedulerJson: null,
      notificationTargetsJson: null,
      notes: null,
      analysisTaxonomyVersionId: "tax-2026-04",
      analysisTaxonomyVersionCode: "tax-2026-04",
      createdAt: "2026-04-04T09:00:00.000Z",
      promptVersionLabel: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      evidenceBundle: [],
      fieldExplanations: []
    });

    expect(draft.tagMappings).toEqual([
      { rawTag: "", role: "noise", canonicalValue: "", source: "system_default" }
    ]);
    expect(draft.openingRules).toEqual([
      { buttonTitle: "", signalType: "customer_journey", canonicalValue: "" }
    ]);
    expect(draft.scheduler).toEqual({
      useSystemDefaults: true,
      officialDailyTime: "00:00",
      lookbackHours: 2
    });
    expect(draft.notificationTargets).toEqual([
      { channel: "telegram", value: "" }
    ]);
  });

  it("renders prompt profile affordances for clone and compare instead of raw json textareas", () => {
    const configuration = createConfigurationState();
    const onboarding = createOnboardingState();

    const html = renderConfiguration(configuration, onboarding);

    expect(html).toContain("Clone từ version cũ");
    expect(html).toContain("Clone từ page khác");
    expect(html).toContain("So sánh 2 prompt version");
    expect(html).not.toContain("tagMappingJson");
    expect(html).not.toContain("openingRulesJson");
    expect(html).not.toContain("schedulerJson");
    expect(html).not.toContain("notificationTargetsJson");
  });

  it("renders prompt compare audit metadata instead of only showing prompt text", () => {
    const configuration = createConfigurationState();
    const onboarding = createOnboardingState();

    const html = renderConfiguration(configuration, onboarding);

    expect(html).toContain("Prompt A12");
    expect(html).toContain("sha256:prompt-a12");
    expect(html).toContain("Evidence bundle");
    expect(html).toContain("Opening block = Khách hàng tái khám");
    expect(html).toContain("Field explanations");
    expect(html).toContain("risk_level");
  });

  it("renders onboarding timezone as a select and shows a dedicated lane for normal operators", () => {
    const configuration = createConfigurationState();
    const onboarding = createOnboardingState();

    const html = renderConfiguration(configuration, onboarding);

    expect(html).toContain("<select name=\"timezone\"");
    expect(html).not.toContain("<input name=\"timezone\"");
    expect(html).toContain("Page đang vận hành");
    expect(html).toContain("Tải cấu hình page đã chọn");
  });

  it("renders prompt editor empty until a backend config is loaded", () => {
    const configuration = {
      ...createConfigurationState(),
      pageDetail: null,
      promptText: ""
    };
    const onboarding = createOnboardingState();

    const html = renderConfiguration(configuration, onboarding);

    expect(html).toContain("placeholder=\"Prompt sẽ lấy từ active config của backend sau khi tải page.\"");
    expect(html).not.toContain("Giữ distinction draft / provisional / official.");
  });
});

function createConfigurationState(): ConfigurationState {
  return {
    activeTab: "prompt-profile",
    connectedPages: [
      {
        id: "cp-101",
        pageName: "Page Da Lieu Quan 1",
        pancakePageId: "pk_101",
        businessTimezone: "Asia/Ho_Chi_Minh",
        etlEnabled: true,
        analysisEnabled: false,
        activeConfigVersionId: "cfg-18",
        updatedAt: "2026-04-04T09:00:00.000Z"
      }
    ],
    selectedPageId: "",
    pageDetail: {
      id: "cp-101",
      pageName: "Page Da Lieu Quan 1",
      pancakePageId: "pk_101",
      businessTimezone: "Asia/Ho_Chi_Minh",
      etlEnabled: true,
      analysisEnabled: false,
      activeConfigVersionId: "cfg-18",
      updatedAt: "2026-04-04T09:00:00.000Z",
      configVersions: [
        {
          id: "cfg-18",
          versionNo: 18,
          promptText: "Prompt active có rubric risk cho khách tái khám.",
          tagMappingJson: { version: 1, entries: [] },
          openingRulesJson: { version: 1, selectors: [] },
          schedulerJson: null,
          notificationTargetsJson: null,
          notes: null,
          analysisTaxonomyVersionId: "tax-2026-04",
          analysisTaxonomyVersionCode: "tax-2026-04",
          createdAt: "2026-04-04T09:00:00.000Z",
          promptVersionLabel: "Prompt A12",
          promptHash: "sha256:prompt-a12",
          evidenceBundle: [
            "Opening block = Khách hàng tái khám",
            "Khách yêu cầu dời lịch sang chiều mai"
          ],
          fieldExplanations: [
            { field: "risk_level", explanation: "Khách có nhu cầu rõ nhưng staff phản hồi chậm." }
          ]
        },
        {
          id: "cfg-17",
          versionNo: 17,
          promptText: "Prompt cũ ưu tiên outcome booked.",
          tagMappingJson: { version: 1, entries: [] },
          openingRulesJson: { version: 1, selectors: [] },
          schedulerJson: null,
          notificationTargetsJson: null,
          notes: null,
          analysisTaxonomyVersionId: "tax-2026-03",
          analysisTaxonomyVersionCode: "tax-2026-03",
          createdAt: "2026-04-03T09:00:00.000Z",
          promptVersionLabel: "Prompt A10",
          promptHash: "sha256:prompt-a10",
          evidenceBundle: [
            "Khách hỏi giá dịch vụ",
            "Staff báo giá nhưng chưa chốt lịch"
          ],
          fieldExplanations: [
            { field: "outcome", explanation: "Prompt cũ nghiêng về booked khi khách hỏi slot rõ ràng." }
          ]
        }
      ],
      activeConfigVersion: {
        id: "cfg-18",
        versionNo: 18,
        promptText: "Prompt active có rubric risk cho khách tái khám.",
        tagMappingJson: { version: 1, entries: [] },
        openingRulesJson: { version: 1, selectors: [] },
        schedulerJson: null,
        notificationTargetsJson: null,
        notes: null,
        analysisTaxonomyVersionId: "tax-2026-04",
        analysisTaxonomyVersionCode: "tax-2026-04",
        createdAt: "2026-04-04T09:00:00.000Z",
        promptVersionLabel: "Prompt A12",
        promptHash: "sha256:prompt-a12",
        evidenceBundle: [
          "Opening block = Khách hàng tái khám",
          "Khách yêu cầu dời lịch sang chiều mai"
        ],
        fieldExplanations: [
          { field: "risk_level", explanation: "Khách có nhu cầu rõ nhưng staff phản hồi chậm." }
        ]
      }
    },
    selectedConfigVersionId: "",
    promptText: "Prompt sample",
    tagMappings: [],
    openingRules: [],
    scheduler: { useSystemDefaults: true, officialDailyTime: "00:00", lookbackHours: 2 },
    notificationTargets: [],
    notes: "",
    activateAfterCreate: true,
    etlEnabled: true,
    analysisEnabled: false,
    promptPreview: null,
    promptCloneSourceVersionId: "",
    promptCloneSourcePageId: "",
    promptCompareLeftVersionId: "cfg-18",
    promptCompareRightVersionId: "cfg-17"
  };
}

function createOnboardingState(): OnboardingState {
  return {
    token: "",
    tokenPages: [],
    selectedPancakePageId: "",
    timezone: "Asia/Ho_Chi_Minh",
    etlEnabled: true,
    analysisEnabled: false
  };
}
