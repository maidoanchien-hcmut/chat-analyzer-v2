package transform

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func buildNormalizedTagSignals(
	currentTags []map[string]any,
	tagEvents []map[string]any,
	rules []controlplane.TagRule,
) json.RawMessage {
	if len(rules) == 0 {
		return json.RawMessage("{}")
	}

	matchedSignals := map[string][]string{}
	texts := collectTagTexts(currentTags, tagEvents)
	for _, text := range texts {
		normalizedText := normalizeControlText(text)
		if normalizedText == "" {
			continue
		}
		for _, rule := range rules {
			if !matchesAnyControlText(normalizedText, rule.MatchAnyText) {
				continue
			}
			for key, value := range rule.Signals {
				stringValue := strings.TrimSpace(fmt.Sprint(value))
				if stringValue == "" {
					continue
				}
				if !slices.Contains(matchedSignals[key], stringValue) {
					matchedSignals[key] = append(matchedSignals[key], stringValue)
				}
			}
		}
	}

	for key := range matchedSignals {
		slices.Sort(matchedSignals[key])
	}
	if len(matchedSignals) == 0 {
		return json.RawMessage("{}")
	}
	return marshalJSON(matchedSignals, "{}")
}

func collectTagTexts(currentTags []map[string]any, tagEvents []map[string]any) []string {
	collected := make([]string, 0, len(currentTags)+len(tagEvents))
	for _, tag := range currentTags {
		if text, ok := tag["text"].(string); ok {
			collected = append(collected, text)
		}
	}
	for _, event := range tagEvents {
		payload, _ := event["payload"].(map[string]any)
		resolvedTag, _ := payload["resolved_tag"].(map[string]any)
		if text, ok := resolvedTag["text"].(string); ok {
			collected = append(collected, text)
		}
	}
	return collected
}

func buildOpeningBlocks(
	openingMessages []openingBlockMessage,
	rawOpeningMessages []pancake.Message,
	rules []controlplane.OpeningRule,
) openingBlocks {
	matchedRules := make([]openingRuleMatch, 0)
	unmatched := make([]string, 0)
	candidates := collectOpeningCandidateTexts(openingMessages, rawOpeningMessages)
	for _, candidate := range candidates {
		normalizedCandidate := normalizeControlText(candidate)
		if normalizedCandidate == "" {
			continue
		}
		matched := false
		for _, rule := range rules {
			if !matchesAnyControlText(normalizedCandidate, rule.MatchAnyText) {
				continue
			}
			matched = true
			if !openingRuleAlreadyMatched(matchedRules, rule.Name) {
				matchedRules = append(matchedRules, openingRuleMatch{
					Name:    rule.Name,
					Signals: cloneSignals(rule.Signals),
				})
			}
		}
		if !matched {
			unmatched = append(unmatched, candidate)
		}
	}

	return openingBlocks{
		OpeningCandidateWindow: openingMessages,
		MatchedRules:           matchedRules,
		UnmatchedCandidateText: uniqueSortedStrings(unmatched),
	}
}

func collectOpeningCandidateTexts(openingMessages []openingBlockMessage, rawOpeningMessages []pancake.Message) []string {
	collected := make([]string, 0, len(openingMessages)*2)
	for _, message := range openingMessages {
		if text := strings.TrimSpace(message.RedactedText); text != "" {
			collected = append(collected, text)
		}
	}
	for _, message := range rawOpeningMessages {
		for _, attachment := range message.Attachments {
			if !strings.EqualFold(attachment.Type, "template") || len(attachment.Payload) == 0 {
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal(attachment.Payload, &payload); err != nil {
				continue
			}
			buttons, _ := payload["buttons"].([]any)
			for _, rawButton := range buttons {
				button, _ := rawButton.(map[string]any)
				title, _ := button["title"].(string)
				if strings.TrimSpace(title) != "" {
					collected = append(collected, title)
				}
			}
		}
	}
	return uniqueSortedStrings(collected)
}

func openingRuleAlreadyMatched(matched []openingRuleMatch, name string) bool {
	for _, item := range matched {
		if item.Name == name {
			return true
		}
	}
	return false
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]struct{}{}
	collected := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		collected = append(collected, trimmed)
	}
	slices.Sort(collected)
	return collected
}

func matchesAnyControlText(candidate string, patterns []string) bool {
	for _, pattern := range patterns {
		if normalizeControlText(pattern) == candidate {
			return true
		}
	}
	return false
}

func normalizeControlText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Join(strings.Fields(value), " ")
}

func cloneSignals(signals map[string]any) map[string]any {
	if len(signals) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(signals))
	for key, value := range signals {
		cloned[key] = value
	}
	return cloned
}

func BuildThreadCustomerMappings(
	pageID string,
	conversationDays []ConversationDaySource,
	policies controlplane.RuntimeConfig,
) ([]ThreadCustomerMapping, error) {
	if pageID == "" || len(policies.CustomerDirectory) == 0 {
		return nil, nil
	}

	customerByPhone := map[string][]string{}
	for _, entry := range policies.CustomerDirectory {
		phone := strings.TrimSpace(entry.PhoneE164)
		customerID := strings.TrimSpace(entry.CustomerID)
		if phone == "" || customerID == "" {
			continue
		}
		if !slices.Contains(customerByPhone[phone], customerID) {
			customerByPhone[phone] = append(customerByPhone[phone], customerID)
		}
	}

	mappings := make([]ThreadCustomerMapping, 0)
	for _, day := range conversationDays {
		var phones []string
		if err := json.Unmarshal(day.NormalizedPhoneCandidatesJSON, &phones); err != nil {
			return nil, fmt.Errorf("decode normalized_phone_candidates for %s: %w", day.ConversationID, err)
		}
		if len(phones) != 1 {
			continue
		}
		customerIDs := customerByPhone[phones[0]]
		if len(customerIDs) != 1 {
			continue
		}
		mappings = append(mappings, ThreadCustomerMapping{
			PageID:          pageID,
			ThreadID:        day.ConversationID,
			CustomerID:      customerIDs[0],
			MappedPhoneE164: phones[0],
			MappingMethod:   "deterministic_single_phone",
		})
	}
	return mappings, nil
}
