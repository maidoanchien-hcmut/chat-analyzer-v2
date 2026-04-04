import { describe, expect, it } from "bun:test";
import type { ConfigurationState, OnboardingState } from "../../app/screen-state.ts";
import { renderConfiguration } from "./render.ts";
import { buildCreateConfigVersionInput } from "./state.ts";

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
        { rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ]
    });
    expect(payload.openingRulesJson).toEqual({
      version: 1,
      selectors: [
        { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
      ]
    });
    expect(payload.schedulerJson).toEqual({
      useSystemDefaults: false,
      officialDailyTime: "00:30",
      lookbackHours: 3
    });
    expect(payload.notificationTargetsJson).toEqual({
      channels: [
        { channel: "telegram", value: "@ops-alert" }
      ]
    });
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
});

function createConfigurationState(): ConfigurationState {
  return {
    activeTab: "prompt-profile",
    connectedPages: [],
    selectedPageId: "",
    pageDetail: null,
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
    promptCompareLeftVersionId: "",
    promptCompareRightVersionId: ""
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
