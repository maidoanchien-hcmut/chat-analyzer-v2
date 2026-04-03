package transform

import (
	"encoding/json"
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func TestBuildConversationDayAppliesTagAndOpeningRules(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-1",
		PageID:     "page-1",
		InsertedAt: "2026-03-31T08:00:00",
		UpdatedAt:  "2026-03-31T08:10:00",
		From:       pancake.Actor{ID: "customer-1", Name: "Khách A"},
		PageCustomer: pancake.PageCustomer{
			Name: "Khách A",
		},
		Tags: []json.RawMessage{
			json.RawMessage(`{"id":101}`),
		},
	}
	messages := []pancake.Message{
		mustTemplateMessage(t, "m-1", "2026-03-31T08:00:01", "page-1", "Botcake", []string{"Đặt lịch hẹn"}),
		mustMessage(t, "m-2", "2026-03-31T08:00:05", "customer-1", "Đặt lịch hẹn", nil),
		mustMessage(t, "m-3", "2026-03-31T08:01:00", "customer-1", "Em muốn đặt lịch hôm nay", nil),
	}
	tagDictionary := map[int64]pancake.Tag{
		101: {
			ID:   101,
			Text: "KH mới",
		},
	}
	policies := controlplane.RuntimeConfig{
		TagMapping: controlplane.TagMappingConfig{
			DefaultSignal: "null",
			Entries: []controlplane.TagMappingEntry{
				{
					PancakeTagID: "101",
					RawLabel:     "KH mới",
					Signal:       "customer_type",
				},
			},
		},
		OpeningRules: controlplane.OpeningRulesConfig{
			Boundary: controlplane.OpeningBoundary{
				Mode:        "until_first_meaningful_human_message",
				MaxMessages: 12,
			},
			Selectors: []controlplane.OpeningSelector{
				{
					Signal:              "need",
					AllowedMessageTypes: []string{"template", "text"},
					Options: []controlplane.OpeningOption{
						{
							RawText:  "Đặt lịch hẹn",
							Decision: "booking",
						},
					},
				},
				{
					Signal:              "entry_flow",
					AllowedMessageTypes: []string{"template", "text"},
					Options: []controlplane.OpeningOption{
						{
							RawText:  "Đặt lịch hẹn",
							Decision: "chatbot",
						},
					},
				},
			},
			Fallback: controlplane.OpeningFallback{
				StoreCandidateIfUnmatched: true,
			},
		},
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), tagDictionary, policies)
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if got := string(day.NormalizedTagSignalsJSON); got != `{"customer_type":["KH mới"]}` {
		t.Fatalf("expected normalized tag signals, got %s", got)
	}

	var opening struct {
		MatchedSelections []struct {
			Signal   string `json:"signal"`
			Decision string `json:"decision"`
		} `json:"matched_selections"`
	}
	if err := json.Unmarshal(day.OpeningBlocksJSON, &opening); err != nil {
		t.Fatalf("unmarshal opening blocks: %v", err)
	}
	if len(opening.MatchedSelections) == 0 {
		t.Fatalf("expected at least 1 matched opening selection, got 0")
	}
	if opening.MatchedSelections[0].Signal != "entry_flow" && opening.MatchedSelections[0].Signal != "need" {
		t.Fatalf("unexpected opening selection: %+v", opening.MatchedSelections[0])
	}
}

func TestBuildConversationDayMatchesOpeningRuleByBlockSignature(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-2",
		PageID:     "page-1",
		InsertedAt: "2026-03-31T08:00:00",
		UpdatedAt:  "2026-03-31T08:10:00",
		From:       pancake.Actor{ID: "customer-1", Name: "Khách A"},
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-03-31T08:00:00", "customer-1", "Bắt đầu", nil),
		mustTemplateMessage(t, "m-2", "2026-03-31T08:00:02", "page-1", "Botcake", []string{"Khách hàng lần đầu", "Khách hàng tái khám"}),
		mustMessage(t, "m-3", "2026-03-31T08:00:03", "customer-1", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-4", "2026-03-31T08:00:04", "page-1", "Botcake", []string{"Đặt lịch hẹn"}),
		mustMessage(t, "m-5", "2026-03-31T08:00:05", "customer-1", "Đặt lịch hẹn", nil),
		mustMessage(t, "m-6", "2026-03-31T08:01:00", "customer-1", "Em muốn đặt lịch", nil),
	}

	policies := controlplane.RuntimeConfig{
		OpeningRules: controlplane.OpeningRulesConfig{
			Boundary: controlplane.OpeningBoundary{
				Mode:        "until_first_meaningful_human_message",
				MaxMessages: 12,
			},
			Selectors: []controlplane.OpeningSelector{
				{
					Signal:              "opening_block_label",
					AllowedMessageTypes: []string{"template", "text"},
					Options: []controlplane.OpeningOption{
						{
							RawText:  "Khách hàng lần đầu",
							Decision: "bot-flow-booking",
						},
						{
							RawText:  "Đặt lịch hẹn",
							Decision: "bot-flow-booking",
						},
					},
				},
			},
			Fallback: controlplane.OpeningFallback{
				StoreCandidateIfUnmatched: true,
			},
		},
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), nil, policies)
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	var opening struct {
		DeterministicSignals map[string][]string `json:"deterministic_signals"`
	}
	if err := json.Unmarshal(day.OpeningBlocksJSON, &opening); err != nil {
		t.Fatalf("unmarshal opening blocks: %v", err)
	}
	if got := opening.DeterministicSignals["opening_block_label"]; len(got) == 0 || got[0] != "bot-flow-booking" {
		t.Fatalf("expected deterministic opening signals to include bot-flow-booking, got %+v", opening.DeterministicSignals)
	}
}

func TestBuildThreadCustomerMappingsUsesSingleResolvedPhoneOnly(t *testing.T) {
	conversationDays := []ConversationDaySource{
		{
			ConversationID:                "thread-1",
			NormalizedPhoneCandidatesJSON: json.RawMessage(`["+84774665884"]`),
		},
		{
			ConversationID:                "thread-2",
			NormalizedPhoneCandidatesJSON: json.RawMessage(`["+84770000000","+84999999999"]`),
		},
	}
	policies := controlplane.RuntimeConfig{
		CustomerDirectory: []controlplane.CustomerDirectoryEntry{
			{
				CustomerID: "crm-001",
				PhoneE164:  "+84774665884",
			},
			{
				CustomerID: "crm-002",
				PhoneE164:  "+84999999999",
			},
		},
	}

	mappings, err := BuildThreadCustomerMappings("page-1", conversationDays, policies)
	if err != nil {
		t.Fatalf("BuildThreadCustomerMappings returned error: %v", err)
	}

	if len(mappings) != 1 {
		t.Fatalf("expected exactly 1 deterministic mapping, got %d", len(mappings))
	}
	if mappings[0].ThreadID != "thread-1" || mappings[0].CustomerID != "crm-001" {
		t.Fatalf("unexpected mapping: %+v", mappings[0])
	}
}
