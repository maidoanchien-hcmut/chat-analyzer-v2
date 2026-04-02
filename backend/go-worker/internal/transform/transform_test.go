package transform

import (
	"encoding/json"
	"testing"
	"time"

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

func TestBuildConversationDayRedactsPhonesAndSkipsOpeningSelections(t *testing.T) {
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
		mustMessage(t, "m-1", "2026-03-31T14:00:10", "26456821540601695", "Bắt đầu", nil),
		mustTemplateMessage(t, "m-2", "2026-03-31T14:00:13", "1406535699642677", "Botcake", []string{"Khách hàng lần đầu", "Khách hàng tái khám"}),
		mustMessage(t, "m-3", "2026-03-31T14:00:18", "26456821540601695", "Khách hàng lần đầu", nil),
		mustTemplateMessage(t, "m-4", "2026-03-31T14:00:21", "1406535699642677", "Botcake", []string{"Đặt lịch hẹn"}),
		mustMessage(t, "m-5", "2026-03-31T14:00:29", "26456821540601695", "Đặt lịch hẹn", nil),
		mustMessage(t, "m-6", "2026-03-31T14:01:54", "26456821540601695", "mình muốn đặt lịch ở quận 3 ạ", nil),
		mustMessage(t, "m-7", "2026-03-31T14:03:22", "26456821540601695", "Sdt 0774665884", []pancake.RecentPhoneNumber{{PhoneNumber: "0774665884"}}),
	}

	day, err := BuildConversationDay(window, conversation, messageContext, messages, len(messages), nil)
	if err != nil {
		t.Fatalf("BuildConversationDay returned error: %v", err)
	}

	if day.FirstMeaningfulHumanMessageID != "m-6" {
		t.Fatalf("expected first meaningful message to be m-6, got %q", day.FirstMeaningfulHumanMessageID)
	}
	if got := day.Messages[6].RedactedText; got != "Sdt <redacted_phone>" {
		t.Fatalf("expected phone redaction, got %q", got)
	}
	if got := string(day.NormalizedPhoneCandidatesJSON); got != `["+84774665884"]` {
		t.Fatalf("expected normalized phone candidate, got %s", got)
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

func int64Ptr(value int64) *int64 {
	return &value
}
