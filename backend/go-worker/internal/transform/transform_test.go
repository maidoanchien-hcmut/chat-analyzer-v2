package transform

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func TestFilterMessagePageKeepsBusinessDayMessagesAndStopsOnOlderPage(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	page, err := FilterMessagePage([]pancake.Message{
		mustMessage(t, "msg-1", "2026-03-31T09:10:00", "customer", "hello", nil),
		mustMessage(t, "msg-2", "2026-03-31T11:20:00", "customer", "hi", nil),
		mustMessage(t, "msg-3", "2026-03-30T23:59:59", "customer", "old", nil),
	}, window)
	if err != nil {
		t.Fatalf("FilterMessagePage returned error: %v", err)
	}

	if got := len(page.Messages); got != 2 {
		t.Fatalf("expected 2 messages in business day, got %d", got)
	}
	if !page.StopPaging {
		t.Fatalf("expected StopPaging to be true when older messages appear in the page")
	}
}

func TestBuildConversationDayRedactsPhonesAndPreservesRawPhoneCandidates(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:           "1406535699642677_26456821540601695",
		PageID:       "1406535699642677",
		InsertedAt:   "2026-03-31T14:00:18.127647",
		UpdatedAt:    "2026-03-31T14:13:38.097000",
		From:         pancake.Actor{ID: "26456821540601695", Name: "Tú Quỳnh"},
		PageCustomer: pancake.PageCustomer{Name: "Tú Quỳnh"},
		RecentPhoneNumbers: []pancake.RecentPhoneNumber{
			{PhoneNumber: "0774665884"},
		},
		Raw: json.RawMessage(`{"recent_phone_numbers":[{"phone_number":"0774665884"}]}`),
	}

	messageContext := pancake.MessageContext{
		AvailableForReportPhoneNumbers: []string{"+84774665884"},
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-03-31T14:00:10", "26456821540601695", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-2", "2026-03-31T14:00:13", "1406535699642677", "Botcake", []string{"Khách hàng lần đầu", "Khách hàng tái khám"}),
		mustMessage(t, "m-3", "2026-03-31T14:00:18", "26456821540601695", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-4", "2026-03-31T14:00:21", "1406535699642677", "Botcake", []string{"Đặt lịch hẹn"}),
		mustMessage(t, "m-5", "2026-03-31T14:00:29", "26456821540601695", "Đặt lịch hẹn", nil),
		mustMessage(t, "m-6", "2026-03-31T14:01:54", "26456821540601695", "mình muốn đặt lịch ở quận 3 ạ", nil),
		mustMessage(t, "m-7", "2026-03-31T14:03:22", "26456821540601695", "Sdt 0774665884", []pancake.RecentPhoneNumber{{PhoneNumber: "0774665884"}}),
	}

	day, err := BuildConversationDay(window, conversation, messageContext, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.FirstMeaningfulMessageID != "m-6" {
		t.Fatalf("expected first meaningful message to be m-6, got %q", day.FirstMeaningfulMessageID)
	}
	if got := day.Messages[6].RedactedText; got != "Sdt <redacted_phone>" {
		t.Fatalf("expected phone redaction, got %q", got)
	}
	if got := string(day.CurrentPhoneCandidatesJSON); !strings.Contains(got, `"phone_number":"0774665884"`) {
		t.Fatalf("expected raw phone candidate to be preserved, got %s", got)
	}
	if got := string(day.CurrentPhoneCandidatesJSON); !strings.Contains(got, `"source":"message_context_available_for_report"`) {
		t.Fatalf("expected phone candidate source to be persisted, got %s", got)
	}
}

func TestBuildConversationDayAppliesTagSignalsAndOpeningSignals(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-2",
		PageID:     "page-1",
		From:       pancake.Actor{ID: "customer-1", Name: "An"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:05:00",
		Tags: []json.RawMessage{
			json.RawMessage(`{"id":101}`),
		},
	}
	tagDictionary := map[int64]pancake.Tag{
		101: {
			ID:   101,
			Text: "KH TÁI KHÁM",
		},
	}
	messages := []pancake.Message{
		mustTemplateMessage(t, "m-open", "2026-04-01T09:00:05", "page-1", "Botcake", []string{"Khách hàng tái khám"}),
		mustMessage(t, "m-real", "2026-04-01T09:01:00", "customer-1", "em muốn đặt lịch tái khám", nil),
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), tagDictionary, controlplane.RuntimeConfig{
		TagMapping: controlplane.TagMappingConfig{
			Version:     1,
			DefaultRole: "noise",
			Entries: []controlplane.TagMappingEntry{
				{
					SourceTagID:   "101",
					SourceTagText: "KH TÁI KHÁM",
					Role:          "journey",
					CanonicalCode: "revisit",
					MappingSource: "operator",
					Status:        "active",
				},
			},
		},
		OpeningRules: controlplane.OpeningRulesConfig{
			Version: 1,
			Selectors: []controlplane.OpeningSelector{
				{
					SelectorID:          "journey-revisit",
					SignalRole:          "journey",
					SignalCode:          "revisit",
					AllowedMessageTypes: []string{"template", "text"},
					Options: []controlplane.OpeningOption{
						{
							RawText:   "Khách hàng tái khám",
							MatchMode: "exact",
						},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if got := string(day.ObservedTagsJSON); !strings.Contains(got, `"source_tag_id":"101"`) {
		t.Fatalf("expected observed tags to use source_tag_id, got %s", got)
	}
	if got := string(day.NormalizedTagSignalsJSON); !strings.Contains(got, `"canonical_code":"revisit"`) {
		t.Fatalf("expected normalized tag signals to include revisit, got %s", got)
	}
	if got := string(day.OpeningBlockJSON); !strings.Contains(got, `"signal_role":"journey"`) || !strings.Contains(got, `"signal_code":"revisit"`) {
		t.Fatalf("expected opening block to include explicit journey signal, got %s", got)
	}
	if day.ExplicitRevisitSignal != "revisit" {
		t.Fatalf("expected explicit revisit signal to be revisit, got %q", day.ExplicitRevisitSignal)
	}
}

func TestBuildConversationDayTreatsBotFlowAndOptionClicksAsOpeningBlock(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-opening",
		PageID:     "1406535699642677",
		From:       pancake.Actor{ID: "customer-1", Name: "Thoa Kim"},
		InsertedAt: "2026-03-31T13:58:00",
		UpdatedAt:  "2026-03-31T14:00:00",
	}
	botText := mustMessage(
		t,
		"m-6",
		"2026-03-31T13:58:47",
		"1406535699642677",
		"Thoa Kim vui lòng báo ngày giờ và chi nhánh để đặt hẹn",
		nil,
	)
	botText.From.AdminName = "Botcake"
	botText.From.AppID = int64Ptr(556376998159104)
	botText.From.FlowID = int64Ptr(44058712)

	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-03-31T13:58:27", "customer-1", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-2", "2026-03-31T13:58:30", "1406535699642677", "Botcake", []string{"Khách hàng lần đầu", "Khách hàng tái khám"}),
		mustMessage(t, "m-3", "2026-03-31T13:58:36", "customer-1", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-4", "2026-03-31T13:58:39", "1406535699642677", "Botcake", []string{"Tôi muốn chat tư vấn", "Đặt lịch hẹn"}),
		mustMessage(t, "m-5", "2026-03-31T13:58:44", "customer-1", "Đặt lịch hẹn", nil),
		botText,
		mustMessage(t, "m-7", "2026-03-31T13:59:41", "customer-1", "13A Thống Nhất - P.Bình Thọ-Quận Thủ Đức", nil),
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}
	if day.FirstMeaningfulMessageID != "m-7" {
		t.Fatalf("expected first meaningful message m-7, got %q", day.FirstMeaningfulMessageID)
	}

	var opening struct {
		CandidateMessageIDs []string `json:"candidate_message_ids"`
	}
	if err := json.Unmarshal(day.OpeningBlockJSON, &opening); err != nil {
		t.Fatalf("unmarshal opening block: %v", err)
	}
	if len(opening.CandidateMessageIDs) != 6 {
		t.Fatalf("expected 6 opening-block messages before first meaningful message, got %d", len(opening.CandidateMessageIDs))
	}
}

func TestBuildConversationDayUsesCanonicalMessageCountAndUnknownPageActor(t *testing.T) {
	pageID := "1406535699642677"
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-count",
		PageID:     pageID,
		From:       pancake.Actor{ID: "customer-1", Name: "Khach"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:05:00",
	}
	messages := []pancake.Message{
		mustMessage(t, "m-2", "2026-04-01T09:02:00", "customer-1", "xin chao", nil),
		mustUnknownPageActorMessage(t, "m-1", "2026-04-01T09:01:00", pageID, "tin nhan page chua ro actor"),
		mustMessage(t, "m-2", "2026-04-01T09:03:00", "customer-1", "xin chao ban muon bi trung", nil),
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, 8, nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.MessageCount != 2 {
		t.Fatalf("expected canonical message count 2 after dedupe, got %d", day.MessageCount)
	}
	if got := day.Messages[0].SenderRole; got != "unknown_page_actor" {
		t.Fatalf("expected unknown_page_actor for unclassified page sender, got %q", got)
	}
}

func TestBuildConversationDayComputesResponseMetricsFromConversationTurns(t *testing.T) {
	pageID := "1406535699642677"
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-response",
		PageID:     pageID,
		From:       pancake.Actor{ID: "customer-1", Name: "Khach"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:20:00",
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-04-01T09:00:00", "customer-1", "em can tu van", nil),
		mustMessage(t, "m-2", "2026-04-01T09:02:00", "customer-1", "cho em hoi them", nil),
		mustStaffMessage(t, "m-3", "2026-04-01T09:05:00", pageID, "da nhan tin", "Lan"),
		mustStaffMessage(t, "m-4", "2026-04-01T09:06:00", pageID, "em can ho tro gi", "Lan"),
		mustMessage(t, "m-5", "2026-04-01T09:10:00", "customer-1", "chi phi bao nhieu", nil),
		mustStaffMessage(t, "m-6", "2026-04-01T09:15:00", pageID, "chi phi tu 199k", "Lan"),
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.FirstStaffResponseSeconds == nil || *day.FirstStaffResponseSeconds != 300 {
		t.Fatalf("expected first_staff_response_seconds=300, got %v", day.FirstStaffResponseSeconds)
	}
	if day.AvgStaffResponseSeconds == nil || *day.AvgStaffResponseSeconds != 300 {
		t.Fatalf("expected avg_staff_response_seconds=300, got %v", day.AvgStaffResponseSeconds)
	}
}

func TestBuildConversationDayAveragesResponseMetricsAcrossCustomerTurns(t *testing.T) {
	pageID := "1406535699642677"
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-response-avg",
		PageID:     pageID,
		From:       pancake.Actor{ID: "customer-1", Name: "Khach"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:20:00",
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-04-01T09:00:00", "customer-1", "em can tu van", nil),
		mustStaffMessage(t, "m-2", "2026-04-01T09:05:00", pageID, "da nhan tin", "Lan"),
		mustMessage(t, "m-3", "2026-04-01T09:10:00", "customer-1", "chi phi bao nhieu", nil),
		mustStaffMessage(t, "m-4", "2026-04-01T09:13:00", pageID, "chi phi tu 199k", "Lan"),
	}

	day, err := BuildConversationDay(window, conversation, pancake.MessageContext{}, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.FirstStaffResponseSeconds == nil || *day.FirstStaffResponseSeconds != 300 {
		t.Fatalf("expected first_staff_response_seconds=300, got %v", day.FirstStaffResponseSeconds)
	}
	if day.AvgStaffResponseSeconds == nil || *day.AvgStaffResponseSeconds != 240 {
		t.Fatalf("expected avg_staff_response_seconds=240, got %v", day.AvgStaffResponseSeconds)
	}
}

func TestBuildConversationDayExtractsEntrySourceFromMessageContextBeforeConversationFallback(t *testing.T) {
	pageID := "1406535699642677"
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-source",
		PageID:     pageID,
		From:       pancake.Actor{ID: "customer-1", Name: "Khach"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:20:00",
		PostID:     "fallback-post",
		AdIDs: []pancake.SourceRef{
			{
				AdID:       "fallback-ad",
				PostID:     "fallback-post",
				InsertedAt: "2026-04-01T09:00:00",
			},
		},
	}
	messageContext := pancake.MessageContext{
		Activities: []pancake.Activity{
			{
				Type:       "ad_click",
				AdID:       "activity-ad",
				InsertedAt: "2026-04-01T08:59:00",
				AdsContextData: pancake.ActivityAdsContextData{
					PostID: "activity-post",
				},
			},
		},
		AdClicks: []pancake.SourceRef{
			{
				AdID:       "clicked-ad",
				PostID:     "clicked-post",
				InsertedAt: "2026-04-01T09:01:00",
			},
		},
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-04-01T09:00:00", "customer-1", "em can tu van", nil),
	}

	day, err := BuildConversationDay(window, conversation, messageContext, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.EntrySourceType != "ad" {
		t.Fatalf("expected entry_source_type=ad, got %q", day.EntrySourceType)
	}
	if day.EntryPostID != "activity-post" {
		t.Fatalf("expected entry_post_id from message context activity, got %q", day.EntryPostID)
	}
	if day.EntryAdID != "activity-ad" {
		t.Fatalf("expected entry_ad_id from message context activity, got %q", day.EntryAdID)
	}
}

func TestBuildConversationDayUsesDeterministicEntrySourceTieBreakForAdClicks(t *testing.T) {
	pageID := "1406535699642677"
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 4, 1, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 2, 0, 0, 0, 0, location),
	}

	conversation := pancake.Conversation{
		ID:         "conv-source-tie",
		PageID:     pageID,
		From:       pancake.Actor{ID: "customer-1", Name: "Khach"},
		InsertedAt: "2026-04-01T09:00:00",
		UpdatedAt:  "2026-04-01T09:20:00",
	}
	messageContext := pancake.MessageContext{
		AdClicks: []pancake.SourceRef{
			{
				AdID:       "z-ad",
				PostID:     "z-post",
				InsertedAt: "2026-04-01T09:01:00",
			},
			{
				AdID:       "a-ad",
				PostID:     "a-post",
				InsertedAt: "2026-04-01T09:01:00",
			},
		},
	}
	messages := []pancake.Message{
		mustMessage(t, "m-1", "2026-04-01T09:00:00", "customer-1", "em can tu van", nil),
	}

	day, err := BuildConversationDay(window, conversation, messageContext, messages, len(messages), nil, controlplane.RuntimeConfig{})
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.EntrySourceType != "ad" {
		t.Fatalf("expected entry_source_type=ad, got %q", day.EntrySourceType)
	}
	if day.EntryPostID != "a-post" {
		t.Fatalf("expected deterministic entry_post_id=a-post, got %q", day.EntryPostID)
	}
	if day.EntryAdID != "a-ad" {
		t.Fatalf("expected deterministic entry_ad_id=a-ad, got %q", day.EntryAdID)
	}
}

func mustMessage(t *testing.T, id, insertedAt, fromID, originalMessage string, phoneInfo []pancake.RecentPhoneNumber) pancake.Message {
	t.Helper()

	raw, err := json.Marshal(map[string]any{
		"id":               id,
		"conversation_id":  "conv-1",
		"page_id":          "1406535699642677",
		"inserted_at":      insertedAt,
		"type":             "INBOX",
		"message":          originalMessage,
		"original_message": originalMessage,
		"from": map[string]any{
			"id":   fromID,
			"name": "sender",
		},
		"phone_info": phoneInfo,
	})
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}

	message := pancake.Message{
		ID:              id,
		ConversationID:  "conv-1",
		PageID:          "1406535699642677",
		InsertedAt:      insertedAt,
		Type:            "INBOX",
		Message:         originalMessage,
		OriginalMessage: originalMessage,
		From: pancake.Actor{
			ID: fromID,
		},
		PhoneInfo: phoneInfo,
		Raw:       raw,
	}
	if fromID == "1406535699642677" {
		message.From.AdminName = "Võ Thanh Hằng"
	}
	return message
}

func mustTemplateMessage(t *testing.T, id, insertedAt, fromID, adminName string, buttonTitles []string) pancake.Message {
	t.Helper()

	buttons := make([]map[string]string, 0, len(buttonTitles))
	for _, title := range buttonTitles {
		buttons = append(buttons, map[string]string{
			"title": title,
			"type":  "postback",
		})
	}
	payload, err := json.Marshal(map[string]any{
		"buttons": buttons,
	})
	if err != nil {
		t.Fatalf("marshal template payload: %v", err)
	}

	raw, err := json.Marshal(map[string]any{
		"id":               id,
		"conversation_id":  "conv-1",
		"page_id":          "1406535699642677",
		"inserted_at":      insertedAt,
		"type":             "INBOX",
		"message":          "",
		"original_message": "",
		"from": map[string]any{
			"id":         fromID,
			"admin_name": adminName,
			"app_id":     556376998159104,
		},
		"attachments": []map[string]any{
			{
				"type":    "template",
				"payload": json.RawMessage(payload),
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal template message: %v", err)
	}

	return pancake.Message{
		ID:              id,
		ConversationID:  "conv-1",
		PageID:          "1406535699642677",
		InsertedAt:      insertedAt,
		Type:            "INBOX",
		Message:         "",
		OriginalMessage: "",
		From: pancake.Actor{
			ID:        fromID,
			AdminName: adminName,
			AppID:     int64Ptr(556376998159104),
		},
		Attachments: []pancake.Attachment{
			{
				Type:    "template",
				Payload: payload,
			},
		},
		Raw: raw,
	}
}

func mustStaffMessage(t *testing.T, id, insertedAt, fromID, originalMessage, adminName string) pancake.Message {
	t.Helper()

	message := mustMessage(t, id, insertedAt, fromID, originalMessage, nil)
	message.From.AdminName = adminName
	return message
}

func mustUnknownPageActorMessage(t *testing.T, id, insertedAt, fromID, originalMessage string) pancake.Message {
	t.Helper()

	message := mustMessage(t, id, insertedAt, fromID, originalMessage, nil)
	message.From.AdminName = ""
	return message
}

func int64Ptr(value int64) *int64 {
	return &value
}
