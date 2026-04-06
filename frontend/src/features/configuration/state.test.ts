import { describe, expect, it } from "bun:test";
import type { ConfigurationState } from "../../app/screen-state.ts";
import { renderConfiguration } from "./render.ts";
import { buildTimezoneOptions } from "./timezones.ts";
import {
  buildCreateConfigVersionInput,
  buildOnboardingSamplePreviewInput,
  buildPromptPreviewComparisonFingerprint,
  buildPromptPreviewArtifactInput,
  buildPromptWorkspaceSampleFingerprint,
  buildPromptWorkspaceSampleInput,
  configVersionToDraft,
  derivePromptPreviewFreshness,
  seedWorkspaceDraftFromOnboardingSample
} from "./state.ts";

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
      scheduler: { useSystemDefaults: false, timezone: "Asia/Saigon", officialDailyTime: "00:30", lookbackHours: 3 },
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
      timezone: "Asia/Saigon",
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
      timezone: "Asia/Ho_Chi_Minh",
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
      timezone: "Asia/Ho_Chi_Minh",
      officialDailyTime: "00:00",
      lookbackHours: 2
    });
    expect(draft.notificationTargets).toEqual([
      { channel: "telegram", value: "" }
    ]);
  });

  it("renders prompt profile affordances for clone and compare instead of raw json textareas", () => {
    const configuration = createConfigurationState();

    const html = renderConfiguration(configuration);

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

    const html = renderConfiguration(configuration);

    expect(html).toContain("Prompt A12");
    expect(html).toContain("sha256:prompt-a12");
    expect(html).toContain("Evidence bundle");
    expect(html).toContain("Opening block = Khách hàng tái khám");
    expect(html).toContain("Field explanations");
    expect(html).toContain("risk_level");
  });

  it("renders onboarding timezone as an owner-clean input and shows a dedicated lane for normal operators", () => {
    const configuration = createConfigurationState();

    const html = renderConfiguration(configuration);

    expect(html).toContain("<select name=\"businessTimezone\">");
    expect(html).toContain("<select name=\"schedulerTimezone\">");
    expect(html).toContain("Page đang vận hành");
    expect(html).toContain("Tải cấu hình page đã chọn");
  });

  it("builds one shared IANA timezone catalog and marks Asia/Saigon as a legacy alias", () => {
    const options = buildTimezoneOptions([
      "Asia/Ho_Chi_Minh",
      "Asia/Saigon",
      "America/Los_Angeles"
    ]);

    expect(options.find((option) => option.value === "Asia/Ho_Chi_Minh")).toEqual({
      value: "Asia/Ho_Chi_Minh",
      label: "GMT+07:00 - Asia/Ho_Chi_Minh"
    });
    expect(options.find((option) => option.value === "Asia/Saigon")).toEqual({
      value: "Asia/Saigon",
      label: "GMT+07:00 - Asia/Saigon (legacy alias)"
    });
    expect(options.filter((option) => option.value === "America/Los_Angeles")).toHaveLength(1);
  });

  it("builds onboarding sample preview input from the current draft without mock-only fields", () => {
    const payload = buildOnboardingSamplePreviewInput({
      pancakePageId: "pk_101",
      userAccessToken: "user-token",
      pageName: "Page Da Lieu Quan 1",
      businessTimezone: "Asia/Saigon",
      tagMappings: [
        { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ],
      openingRules: [
        { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
      ],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Bangkok", officialDailyTime: "00:00", lookbackHours: 2 },
      sampleConversationLimit: 9,
      sampleMessagePageLimit: 3
    });

    expect(payload).toMatchObject({
      pancakePageId: "pk_101",
      userAccessToken: "user-token",
      businessTimezone: "Asia/Saigon",
      sampleConversationLimit: 9,
      sampleMessagePageLimit: 3
    });
    expect(payload.schedulerJson).toMatchObject({
      timezone: "Asia/Saigon"
    });
  });

  it("builds connected-page prompt workspace sample input from the current draft", () => {
    const payload = buildPromptWorkspaceSampleInput({
      tagMappings: [
        { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ],
      openingRules: [
        { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
      ],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Bangkok", officialDailyTime: "00:00", lookbackHours: 2 },
      businessTimezone: "Asia/Saigon",
      sampleConversationLimit: 9,
      sampleMessagePageLimit: 3
    });

    expect(payload).toMatchObject({
      sampleConversationLimit: 9,
      sampleMessagePageLimit: 3
    });
    expect(payload.schedulerJson).toMatchObject({
      timezone: "Asia/Saigon"
    });
  });

  it("seeds tag and opening suggestions from onboarding sample into an empty editable draft", () => {
    const seeded = seedWorkspaceDraftFromOnboardingSample({
      tagMappings: [{ rawTag: "", role: "noise", canonicalValue: "", source: "system_default" }],
      openingRules: [{ buttonTitle: "", signalType: "customer_journey", canonicalValue: "" }],
      samplePreview: {
        pageId: "pk_101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 2,
          threadDaysBuilt: 1,
          messagesSeen: 5,
          messagesSelected: 3
        },
        pageTags: [
          { pancakeTagId: "11", text: "KH mới", isDeactive: false }
        ],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
            observedTags: [
              { sourceTagId: "11", sourceTagText: "KH mới" }
            ],
            normalizedTagSignals: [
              { role: "journey", sourceTagText: "KH mới", canonicalCode: "new_to_clinic", mappingSource: "operator" }
            ],
            openingMessages: [],
            explicitSignals: [
              { signalRole: "journey", signalCode: "revisit", rawText: "Khách hàng tái khám" }
            ],
            cutReason: "first_meaningful_message"
          }
        ]
      }
    });

    expect(seeded.tagMappings).toEqual([
      { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
    ]);
    expect(seeded.openingRules).toEqual([
      { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
    ]);
    expect(seeded.summary.tagSuggestionsApplied).toBe(1);
    expect(seeded.summary.openingSuggestionsApplied).toBe(1);
  });

  it("preserves operator overrides when a later sample suggests the same tag or opening rule", () => {
    const seeded = seedWorkspaceDraftFromOnboardingSample({
      tagMappings: [
        { rawTag: "KH mới", role: "need", canonicalValue: "consultation", source: "operator_override" }
      ],
      openingRules: [
        { buttonTitle: "Khách hàng tái khám", signalType: "need", canonicalValue: "consultation" }
      ],
      samplePreview: {
        pageId: "pk_101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 2,
          threadDaysBuilt: 1,
          messagesSeen: 5,
          messagesSelected: 3
        },
        pageTags: [],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
            observedTags: [],
            normalizedTagSignals: [
              { role: "journey", sourceTagText: "KH mới", canonicalCode: "new_to_clinic", mappingSource: "operator" }
            ],
            openingMessages: [],
            explicitSignals: [
              { signalRole: "journey", signalCode: "revisit", rawText: "Khách hàng tái khám" }
            ],
            cutReason: "first_meaningful_message"
          }
        ]
      }
    });

    expect(seeded.tagMappings).toEqual([
      { rawTag: "KH mới", role: "need", canonicalValue: "consultation", source: "operator_override" }
    ]);
    expect(seeded.openingRules).toEqual([
      { buttonTitle: "Khách hàng tái khám", signalType: "need", canonicalValue: "consultation" }
    ]);
    expect(seeded.summary.tagOverridesPreserved).toBe(1);
    expect(seeded.summary.openingOverridesPreserved).toBe(1);
  });

  it("does not damage the current draft when onboarding sample returns no suggestions", () => {
    const currentTagMappings = [
      { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" as const }
    ];
    const currentOpeningRules = [
      { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
    ];
    const seeded = seedWorkspaceDraftFromOnboardingSample({
      tagMappings: currentTagMappings,
      openingRules: currentOpeningRules,
      samplePreview: {
        pageId: "pk_101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 0,
          threadDaysBuilt: 0,
          messagesSeen: 0,
          messagesSelected: 0
        },
        pageTags: [],
        conversations: []
      }
    });

    expect(seeded.tagMappings).toEqual(currentTagMappings);
    expect(seeded.openingRules).toEqual(currentOpeningRules);
    expect(seeded.summary.tagSuggestionsApplied).toBe(0);
    expect(seeded.summary.openingSuggestionsApplied).toBe(0);
  });

  it("builds prompt preview artifact input from the selected sample conversation", () => {
    const configuration = createConfigurationState();
    const samplePreview = {
      sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
      connectedPageId: "cp-101",
      pageId: "pk-101",
      pageName: "Page Da Lieu Quan 1",
      targetDate: "2026-04-05",
      businessTimezone: "Asia/Saigon",
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
      summary: {
        conversationsScanned: 6,
        threadDaysBuilt: 4,
        messagesSeen: 22,
        messagesSelected: 11
      },
      pageTags: [],
      conversations: [
        {
          conversationId: "c-1",
          customerDisplayName: "Khách A",
          firstMeaningfulMessageId: "msg-1",
          firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
          firstMeaningfulMessageSenderRole: "customer",
          observedTagsJson: [],
          normalizedTagSignalsJson: {},
          openingBlockJson: {},
          explicitRevisitSignal: "revisit",
          explicitNeedSignal: "appointment_booking",
          explicitOutcomeSignal: null,
          sourceThreadJsonRedacted: {},
          messageCount: 2,
          firstStaffResponseSeconds: 120,
          avgStaffResponseSeconds: 120,
          staffParticipantsJson: [],
          messages: [
            {
              messageId: "msg-1",
              insertedAt: "2026-04-05T02:00:00.000Z",
              senderRole: "customer",
              senderName: null,
              messageType: "text",
              redactedText: "Em muốn tái khám chiều nay",
              isMeaningfulHumanMessage: true,
              isOpeningBlockMessage: false
            }
          ]
        }
      ]
    };

    const payload = buildPromptPreviewArtifactInput({
      promptText: configuration.workspace.promptText,
      samplePreview,
      selectedConversationId: "c-1"
    });

    expect(payload.draftPromptText).toBe("Prompt sample");
    expect(payload.sampleWorkspaceKey).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.selectedConversationId).toBe("c-1");
  });

  it("marks prompt preview freshness stale when sample-driving config changes", () => {
    const samplePreview = {
      sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
      connectedPageId: "cp-101",
      pageId: "pk-101",
      pageName: "Page Da Lieu Quan 1",
      targetDate: "2026-04-05",
      businessTimezone: "Asia/Saigon",
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
      summary: {
        conversationsScanned: 6,
        threadDaysBuilt: 4,
        messagesSeen: 22,
        messagesSelected: 11
      },
      pageTags: [],
      conversations: [
        {
          conversationId: "c-1",
          customerDisplayName: "Khách A",
          firstMeaningfulMessageId: "msg-1",
          firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
          firstMeaningfulMessageSenderRole: "customer",
          observedTagsJson: [],
          normalizedTagSignalsJson: {},
          openingBlockJson: {},
          explicitRevisitSignal: "revisit",
          explicitNeedSignal: "appointment_booking",
          explicitOutcomeSignal: null,
          sourceThreadJsonRedacted: {},
          messageCount: 2,
          firstStaffResponseSeconds: 120,
          avgStaffResponseSeconds: 120,
          staffParticipantsJson: [],
          messages: []
        }
      ]
    };

    const staleWorkspaceFingerprint = buildPromptWorkspaceSampleFingerprint({
      tagMappings: [],
      openingRules: [],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Saigon", officialDailyTime: "00:00", lookbackHours: 2 },
      businessTimezone: "Asia/Saigon",
      sampleConversationLimit: 12,
      sampleMessagePageLimit: 2
    });
    const currentWorkspaceFingerprint = buildPromptWorkspaceSampleFingerprint({
      tagMappings: [{ rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }],
      openingRules: [],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Saigon", officialDailyTime: "00:00", lookbackHours: 2 },
      businessTimezone: "Asia/Saigon",
      sampleConversationLimit: 12,
      sampleMessagePageLimit: 2
    });
    const comparisonFingerprint = buildPromptPreviewComparisonFingerprint({
      promptText: "Prompt sample",
      samplePreview,
      selectedConversationId: "c-1"
    });

    const freshness = derivePromptPreviewFreshness({
      workspaceFingerprint: staleWorkspaceFingerprint,
      comparisonFingerprint,
      currentWorkspaceFingerprint,
      currentComparisonFingerprint: comparisonFingerprint,
      hasSamplePreview: true,
      hasComparison: true
    });

    expect(freshness.workspaceStaleReason).toContain("Tải lại sample prompt");
    expect(freshness.comparisonStaleReason).toBeNull();
    expect(freshness.invalidateComparison).toBe(true);
  });

  it("marks prompt preview comparison stale when prompt draft changes", () => {
    const samplePreview = {
      sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
      connectedPageId: "cp-101",
      pageId: "pk-101",
      pageName: "Page Da Lieu Quan 1",
      targetDate: "2026-04-05",
      businessTimezone: "Asia/Saigon",
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
      summary: {
        conversationsScanned: 6,
        threadDaysBuilt: 4,
        messagesSeen: 22,
        messagesSelected: 11
      },
      pageTags: [],
      conversations: [
        {
          conversationId: "c-1",
          customerDisplayName: "Khách A",
          firstMeaningfulMessageId: "msg-1",
          firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
          firstMeaningfulMessageSenderRole: "customer",
          observedTagsJson: [],
          normalizedTagSignalsJson: {},
          openingBlockJson: {},
          explicitRevisitSignal: "revisit",
          explicitNeedSignal: "appointment_booking",
          explicitOutcomeSignal: null,
          sourceThreadJsonRedacted: {},
          messageCount: 2,
          firstStaffResponseSeconds: 120,
          avgStaffResponseSeconds: 120,
          staffParticipantsJson: [],
          messages: []
        }
      ]
    };

    const staleComparisonFingerprint = buildPromptPreviewComparisonFingerprint({
      promptText: "Prompt cũ",
      samplePreview,
      selectedConversationId: "c-1"
    });
    const currentComparisonFingerprint = buildPromptPreviewComparisonFingerprint({
      promptText: "Prompt mới",
      samplePreview,
      selectedConversationId: "c-1"
    });

    const freshness = derivePromptPreviewFreshness({
      workspaceFingerprint: buildPromptWorkspaceSampleFingerprint({
        tagMappings: [],
        openingRules: [],
        scheduler: { useSystemDefaults: true, timezone: "Asia/Saigon", officialDailyTime: "00:00", lookbackHours: 2 },
        businessTimezone: "Asia/Saigon",
        sampleConversationLimit: 12,
        sampleMessagePageLimit: 2
      }),
      comparisonFingerprint: staleComparisonFingerprint,
      currentWorkspaceFingerprint: buildPromptWorkspaceSampleFingerprint({
        tagMappings: [],
        openingRules: [],
        scheduler: { useSystemDefaults: true, timezone: "Asia/Saigon", officialDailyTime: "00:00", lookbackHours: 2 },
        businessTimezone: "Asia/Saigon",
        sampleConversationLimit: 12,
        sampleMessagePageLimit: 2
      }),
      currentComparisonFingerprint: currentComparisonFingerprint,
      hasSamplePreview: true,
      hasComparison: true
    });

    expect(freshness.workspaceStaleReason).toBeNull();
    expect(freshness.comparisonStaleReason).toContain("Chạy thử prompt lại");
    expect(freshness.invalidateComparison).toBe(true);
  });

  it("renders onboarding sample workspace from raw HTTP preview payload", () => {
    const configuration = {
      ...createConfigurationState(),
      onboardingSamplePreview: {
        pageId: "pk_101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 6,
          threadDaysBuilt: 4,
          messagesSeen: 22,
          messagesSelected: 11
        },
        pageTags: [
          { pancakeTagId: "11", text: "KH mới", isDeactive: false }
        ],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
            observedTags: [
              { sourceTagId: "11", sourceTagText: "KH mới" }
            ],
            normalizedTagSignals: [
              { role: "journey", sourceTagText: "KH mới", canonicalCode: "new_to_clinic", mappingSource: "operator" }
            ],
            openingMessages: [
              { senderRole: "customer", messageType: "text", redactedText: "Em muốn tái khám chiều nay" }
            ],
            explicitSignals: [
              { signalRole: "journey", signalCode: "revisit", rawText: "Khách hàng tái khám" }
            ],
            cutReason: "first_meaningful_message"
          }
        ]
      }
    };

    const html = renderConfiguration(configuration);

    expect(html).toContain("Sample dữ liệu thật");
    expect(html).toContain("KH mới");
    expect(html).toContain("first_meaningful_message");
    expect(html).toContain("Khách hàng tái khám");
  });

  it("renders prompt editor empty until a backend config is loaded", () => {
    const configuration = {
      ...createConfigurationState(),
      pageDetail: null,
      workspace: {
        ...createConfigurationState().workspace,
        promptText: ""
      }
    };

    const html = renderConfiguration(configuration);

    expect(html).toContain("placeholder=\"Prompt sẽ lấy từ active config của backend sau khi tải page.\"");
    expect(html).not.toContain("Giữ distinction draft / provisional / official.");
  });

  it("renders prompt workspace sample and preview artifact compare separately from saved-version compare", () => {
    const configuration = {
      ...createConfigurationState(),
      workspace: {
        ...createConfigurationState().workspace,
        selectedPromptSampleConversationId: "c-1"
      },
      promptWorkspaceSamplePreview: {
        sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
        connectedPageId: "cp-101",
        pageId: "pk-101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 6,
          threadDaysBuilt: 4,
          messagesSeen: 22,
          messagesSelected: 11
        },
        pageTags: [],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageId: "msg-1",
            firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
            firstMeaningfulMessageSenderRole: "customer",
            observedTagsJson: [],
            normalizedTagSignalsJson: {
              journey: [{ sourceTagText: "KH mới", canonicalCode: "new_to_clinic" }]
            },
            openingBlockJson: {
              explicit_signals: [
                { signal_role: "journey", signal_code: "revisit", raw_text: "Khách hàng tái khám" }
              ]
            },
            explicitRevisitSignal: "revisit",
            explicitNeedSignal: "appointment_booking",
            explicitOutcomeSignal: null,
            sourceThreadJsonRedacted: {},
            messageCount: 2,
            firstStaffResponseSeconds: 120,
            avgStaffResponseSeconds: 120,
            staffParticipantsJson: [],
            messages: [
              {
                messageId: "msg-1",
                insertedAt: "2026-04-05T02:00:00.000Z",
                senderRole: "customer",
                senderName: null,
                messageType: "text",
                redactedText: "Em muốn tái khám chiều nay",
                isMeaningfulHumanMessage: true,
                isOpeningBlockMessage: false
              }
            ]
          }
        ]
      },
      promptPreviewComparison: {
        sampleScope: {
          sampleScopeKey: "sha256:sample-scope",
          targetDate: "2026-04-05",
          businessTimezone: "Asia/Saigon",
          windowStartAt: "2026-04-04T17:00:00.000Z",
          windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
          selectedConversationId: "c-1"
        },
        activeArtifact: {
          id: "artifact-active",
          promptVersionLabel: "A12",
          promptHash: "sha256:active",
          taxonomyVersionCode: "tax-2026-04",
          sampleScopeKey: "sha256:sample-scope",
          sampleConversationId: "c-1",
          customerDisplayName: "Khách A",
          createdAt: "2026-04-05T09:00:00.000Z",
          runtimeMetadata: { model_name: "gpt-live" },
          result: { primary_need_code: "appointment_booking" },
          evidenceBundle: ["Opening block: Khách hàng tái khám"],
          fieldExplanations: [{ field: "primary_need_code", explanation: "Khách yêu cầu đặt lịch." }],
          supportingMessageIds: ["msg-1"]
        },
        draftArtifact: {
          id: "artifact-draft",
          promptVersionLabel: "B01",
          promptHash: "sha256:draft",
          taxonomyVersionCode: "tax-2026-04",
          sampleScopeKey: "sha256:sample-scope",
          sampleConversationId: "c-1",
          customerDisplayName: "Khách A",
          createdAt: "2026-04-05T09:01:00.000Z",
          runtimeMetadata: { model_name: "gpt-live" },
          result: { primary_need_code: "consultation" },
          evidenceBundle: ["Prompt draft nghiêng về tư vấn trước khi chốt lịch"],
          fieldExplanations: [{ field: "primary_need_code", explanation: "Draft rubric ưu tiên consultation." }],
          supportingMessageIds: ["msg-1"]
        }
      }
    };

    const html = renderConfiguration(configuration);

    expect(html).toContain("Preview workspace runtime thật");
    expect(html).toContain("So sánh active vs draft trên cùng sample");
    expect(html).toContain("Version prompt đã lưu");
    expect(html).toContain("Transcript sample");
    expect(html).toContain("primary_need_code");
    expect(html).toContain("sha256:sample-scope");
  });

  it("renders stale prompt preview warnings instead of treating old evidence as current", () => {
    const configuration = {
      ...createConfigurationState(),
      promptWorkspaceSamplePreview: {
        sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
        connectedPageId: "cp-101",
        pageId: "pk-101",
        pageName: "Page Da Lieu Quan 1",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T09:30:00.000Z",
        summary: {
          conversationsScanned: 6,
          threadDaysBuilt: 4,
          messagesSeen: 22,
          messagesSelected: 11
        },
        pageTags: [],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageId: "msg-1",
            firstMeaningfulMessageText: "Em muốn tái khám chiều nay",
            firstMeaningfulMessageSenderRole: "customer",
            observedTagsJson: [],
            normalizedTagSignalsJson: {},
            openingBlockJson: {},
            explicitRevisitSignal: "revisit",
            explicitNeedSignal: "appointment_booking",
            explicitOutcomeSignal: null,
            sourceThreadJsonRedacted: {},
            messageCount: 2,
            firstStaffResponseSeconds: 120,
            avgStaffResponseSeconds: 120,
            staffParticipantsJson: [],
            messages: []
          }
        ]
      },
      promptWorkspaceSampleStaleReason: "Tag mapping đã đổi, cần tải lại sample prompt.",
      promptPreviewComparison: null,
      promptPreviewComparisonStaleReason: "Prompt draft đã đổi, cần chạy thử prompt lại."
    };

    const html = renderConfiguration(configuration);

    expect(html).toContain("Sample workspace đã cũ");
    expect(html).toContain("Preview compare cần chạy lại");
    expect(html).toContain("Tag mapping đã đổi");
    expect(html).toContain("Prompt draft đã đổi");
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
    workspace: {
      token: "",
      tokenPages: [],
      selectedPancakePageId: "",
      businessTimezone: "Asia/Ho_Chi_Minh",
      selectedPageId: "",
      selectedConfigVersionId: "",
      etlEnabled: true,
      analysisEnabled: false,
      sampleConversationLimit: 12,
      sampleMessagePageLimit: 2,
      promptText: "Prompt sample",
      tagMappings: [],
      openingRules: [],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Ho_Chi_Minh", officialDailyTime: "00:00", lookbackHours: 2 },
      notificationTargets: [],
      notes: "",
      activateAfterCreate: true,
      promptCloneSourceVersionId: "",
      promptCloneSourcePageId: "",
      promptCompareLeftVersionId: "cfg-18",
      promptCompareRightVersionId: "cfg-17",
      selectedPromptSampleConversationId: ""
    },
    onboardingSamplePreview: null,
    onboardingSampleSeedSummary: null,
    promptWorkspaceSamplePreview: null,
    promptWorkspaceSampleFingerprint: null,
    promptWorkspaceSampleStaleReason: null,
    promptPreviewComparison: null,
    promptPreviewComparisonFingerprint: null,
    promptPreviewComparisonStaleReason: null
  };
}
