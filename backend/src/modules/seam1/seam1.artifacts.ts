type OpeningBlocks = {
  opening_candidate_window?: Array<{
    redacted_text?: string;
  }>;
  matched_rules?: Array<{
    name?: string;
  }>;
  unmatched_candidate_texts?: string[];
};

type ConversationArtifactSource = {
  conversationId: string;
  currentTagsJson: unknown;
  openingBlocksJson: unknown;
};

export type OnboardingArtifacts = {
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
  }>;
  matchedOpeningRules: Array<{
    name: string;
    count: number;
  }>;
};

export function buildOnboardingArtifacts(conversations: ConversationArtifactSource[]): OnboardingArtifacts {
  const tagCounts = new Map<string, number>();
  const openingWindowCounts = new Map<string, { count: number; exampleConversationIds: string[]; signature: string[] }>();
  const unmatchedCounts = new Map<string, number>();
  const matchedRuleCounts = new Map<string, number>();

  for (const conversation of conversations) {
    const currentTags = asArray(conversation.currentTagsJson);
    for (const rawTag of currentTags) {
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
      unmatchedCounts.set(text, (unmatchedCounts.get(text) ?? 0) + 1);
    }

    for (const rule of asArray(opening.matched_rules)) {
      const name = typeof rule?.name === "string" ? rule.name.trim() : "";
      if (!name) {
        continue;
      }
      matchedRuleCounts.set(name, (matchedRuleCounts.get(name) ?? 0) + 1);
    }
  }

  return {
    topObservedTags: sortCounts(tagCounts).slice(0, 20).map(([text, count]) => ({ text, count })),
    topOpeningCandidateWindows: [...openingWindowCounts.values()]
      .sort((left, right) => right.count - left.count || left.signature.join(" ").localeCompare(right.signature.join(" ")))
      .slice(0, 20),
    unmatchedOpeningTexts: sortCounts(unmatchedCounts).slice(0, 20).map(([text, count]) => ({ text, count })),
    matchedOpeningRules: sortCounts(matchedRuleCounts).slice(0, 20).map(([name, count]) => ({ name, count }))
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
