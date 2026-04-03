type OpeningBlocks = {
  opening_candidate_window?: Array<{
    redacted_text?: string;
  }>;
  matched_selections?: Array<{
    signal?: string;
    raw_text?: string;
    decision?: string;
  }>;
  unmatched_candidate_texts?: string[];
};

type ConversationArtifactSource = {
  conversationId: string;
  observedTagsJson: unknown;
  openingBlocksJson: unknown;
};

export type OnboardingArtifacts = {
  observedTagCounts: Array<{
    text: string;
    count: number;
  }>;
  topObservedTags: Array<{
    text: string;
    count: number;
  }>;
  topOpeningCandidateWindows: Array<{
    signature: string[];
    count: number;
    exampleConversationIds: string[];
  }>;
  unmatchedOpeningTexts: Array<{
    text: string;
    count: number;
    exampleConversationIds: string[];
  }>;
  matchedOpeningSelections: Array<{
    signal: string;
    rawText: string;
    decision: string;
    count: number;
    exampleConversationIds: string[];
  }>;
};

export function buildOnboardingArtifacts(conversations: ConversationArtifactSource[]): OnboardingArtifacts {
  const tagCounts = new Map<string, number>();
  const openingWindowCounts = new Map<string, { count: number; exampleConversationIds: string[]; signature: string[] }>();
  const unmatchedCounts = new Map<string, { count: number; exampleConversationIds: string[] }>();
  const matchedSelectionCounts = new Map<string, { signal: string; rawText: string; decision: string; count: number; exampleConversationIds: string[] }>();

  for (const conversation of conversations) {
    const observedTags = asArray(conversation.observedTagsJson);
    for (const rawTag of observedTags) {
      const text = typeof rawTag?.text === "string" ? rawTag.text.trim() : "";
      if (!text) {
        continue;
      }
      tagCounts.set(text, (tagCounts.get(text) ?? 0) + 1);
    }

    const opening = (conversation.openingBlocksJson ?? {}) as OpeningBlocks;
    const signature = asArray(opening.opening_candidate_window)
      .map((item) => (typeof item?.redacted_text === "string" ? item.redacted_text.trim() : ""))
      .filter(Boolean);
    if (signature.length > 0) {
      const key = JSON.stringify(signature);
      const current = openingWindowCounts.get(key) ?? {
        count: 0,
        exampleConversationIds: [] as string[],
        signature
      };
      current.count += 1;
      if (current.exampleConversationIds.length < 5) {
        current.exampleConversationIds.push(conversation.conversationId);
      }
      openingWindowCounts.set(key, current);
    }

    for (const text of asStringArray(opening.unmatched_candidate_texts)) {
      const current = unmatchedCounts.get(text) ?? {
        count: 0,
        exampleConversationIds: [] as string[]
      };
      current.count += 1;
      if (current.exampleConversationIds.length < 5) {
        current.exampleConversationIds.push(conversation.conversationId);
      }
      unmatchedCounts.set(text, current);
    }

    for (const selection of asArray(opening.matched_selections)) {
      const signal = typeof selection?.signal === "string" ? selection.signal.trim() : "";
      const rawText = typeof selection?.raw_text === "string" ? selection.raw_text.trim() : "";
      const decision = typeof selection?.decision === "string" ? selection.decision.trim() : "";
      if (!signal || !rawText || !decision) {
        continue;
      }
      const key = JSON.stringify([signal, rawText, decision]);
      const current = matchedSelectionCounts.get(key) ?? {
        signal,
        rawText,
        decision,
        count: 0,
        exampleConversationIds: [] as string[]
      };
      current.count += 1;
      if (current.exampleConversationIds.length < 5) {
        current.exampleConversationIds.push(conversation.conversationId);
      }
      matchedSelectionCounts.set(key, current);
    }
  }

  return {
    observedTagCounts: sortCounts(tagCounts).map(([text, count]) => ({ text, count })),
    topObservedTags: sortCounts(tagCounts).slice(0, 20).map(([text, count]) => ({ text, count })),
    topOpeningCandidateWindows: [...openingWindowCounts.values()]
      .sort((left, right) => right.count - left.count || left.signature.join(" ").localeCompare(right.signature.join(" ")))
      .slice(0, 20),
    unmatchedOpeningTexts: [...unmatchedCounts.entries()]
      .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([text, value]) => ({
        text,
        count: value.count,
        exampleConversationIds: value.exampleConversationIds
      })),
    matchedOpeningSelections: [...matchedSelectionCounts.values()]
      .sort((left, right) => right.count - left.count || `${left.signal}:${left.rawText}:${left.decision}`.localeCompare(`${right.signal}:${right.rawText}:${right.decision}`))
      .slice(0, 20)
  };
}

function asArray(value: unknown): Array<any> {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function sortCounts(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}
