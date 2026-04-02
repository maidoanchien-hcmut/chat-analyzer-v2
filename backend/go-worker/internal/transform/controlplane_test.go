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
		TagRules: []controlplane.TagRule{
			{
				Name:         "kh-moi",
				MatchAnyText: []string{"KH mới"},
				Signals: map[string]any{
					"customer_type": "new",
				},
			},
		},
		OpeningRules: []controlplane.OpeningRule{
			{
				Name:         "dat-lich",
				MatchAnyText: []string{"Đặt lịch hẹn"},
				Signals: map[string]any{
					"need":       "booking",
					"entry_flow": "chatbot",
				},
			},
		},
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), tagDictionary, policies)
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if got := string(day.NormalizedTagSignalsJSON); got != `{"customer_type":["new"]}` {
		t.Fatalf("expected normalized tag signals, got %s", got)
	}

	var opening struct {
		MatchedRules []struct {
			Name    string         `json:"name"`
			Signals map[string]any `json:"signals"`
		} `json:"matched_rules"`
	}
	if err := json.Unmarshal(day.OpeningBlocksJSON, &opening); err != nil {
		t.Fatalf("unmarshal opening blocks: %v", err)
	}
	if len(opening.MatchedRules) != 1 {
		t.Fatalf("expected 1 matched opening rule, got %d", len(opening.MatchedRules))
	}
	if opening.MatchedRules[0].Name != "dat-lich" {
		t.Fatalf("expected opening rule dat-lich, got %q", opening.MatchedRules[0].Name)
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
