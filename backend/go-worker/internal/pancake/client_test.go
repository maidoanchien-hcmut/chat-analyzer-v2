package pancake

import (
	"encoding/json"
	"testing"
)

func TestDecodeListPagesParsesSpecShape(t *testing.T) {
	raw := []byte(`{"pages":[{"id":"123","name":"Demo Page"}]}`)

	pages, err := decodeListPages(raw)
	if err != nil {
		t.Fatalf("decode list pages: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("expected 1 page, got %d", len(pages))
	}
	if pages[0].ID != "123" || pages[0].Name != "Demo Page" {
		t.Fatalf("unexpected page: %+v", pages[0])
	}
}

func TestDecodeListPagesParsesCategorizedActivatedShape(t *testing.T) {
	raw := []byte(`{"success":true,"categorized":{"activated":[{"id":"1406535699642677","name":"O2 SKIN - Tri Mun Chuan Y Khoa"}]}}`)

	pages, err := decodeListPages(raw)
	if err != nil {
		t.Fatalf("decode list pages: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("expected 1 page, got %d", len(pages))
	}
	if pages[0].ID != "1406535699642677" || pages[0].Name != "O2 SKIN - Tri Mun Chuan Y Khoa" {
		t.Fatalf("unexpected page: %+v", pages[0])
	}
}

func TestDecodeConversationAndMessagesPreserveSourceFacts(t *testing.T) {
	conversations, err := decodeConversations([]json.RawMessage{
		json.RawMessage(`{
			"id":"conv-1",
			"page_id":"1406535699642677",
			"inserted_at":"2026-04-01T09:00:00",
			"updated_at":"2026-04-01T09:10:00",
			"post_id":"conversation-post",
			"ad_ids":[
				{"ad_id":"conversation-ad","post_id":"conversation-post","inserted_at":"2026-04-01T08:59:00"}
			]
		}`),
	})
	if err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	if conversations[0].PostID != "conversation-post" {
		t.Fatalf("expected conversation post_id to decode, got %q", conversations[0].PostID)
	}
	if len(conversations[0].AdIDs) != 1 || conversations[0].AdIDs[0].AdID != "conversation-ad" {
		t.Fatalf("expected conversation ad_ids to decode, got %+v", conversations[0].AdIDs)
	}

	var envelope listMessagesEnvelope
	if err := json.Unmarshal([]byte(`{
		"conversation_id":"conv-1",
		"activities":[
			{
				"type":"ad_click",
				"ad_id":"activity-ad",
				"inserted_at":"2026-04-01T08:58:00",
				"ads_context_data":{"post_id":"activity-post"}
			}
		],
		"ad_clicks":{
			"customer-1":[
				{"ad_id":"clicked-ad","post_id":"clicked-post","inserted_at":"2026-04-01T08:59:00"}
			]
		},
		"customers":[
			{
				"id":"customer-1",
				"customer_id":"crm-1",
				"fb_id":"fb-1",
				"name":"Khach",
				"ad_clicks":[
					{"ad_id":"customer-ad","post_id":"customer-post","inserted_at":"2026-04-01T09:00:00"}
				]
			}
		],
		"messages":[]
	}`), &envelope); err != nil {
		t.Fatalf("decode list messages envelope: %v", err)
	}

	if len(envelope.Activities) != 1 || envelope.Activities[0].AdsContextData.PostID != "activity-post" {
		t.Fatalf("expected activities source facts to decode, got %+v", envelope.Activities)
	}
	if got := envelope.AdClicks["customer-1"][0].AdID; got != "clicked-ad" {
		t.Fatalf("expected ad_clicks source facts to decode, got %q", got)
	}
	if len(envelope.Customers) != 1 || len(envelope.Customers[0].AdClicks) != 1 || envelope.Customers[0].AdClicks[0].AdID != "customer-ad" {
		t.Fatalf("expected customer ad_clicks to decode, got %+v", envelope.Customers)
	}
}

func TestDecodeConversationAcceptsStringAdIDs(t *testing.T) {
	conversations, err := decodeConversations([]json.RawMessage{
		json.RawMessage(`{
			"id":"conv-2",
			"page_id":"1406535699642677",
			"inserted_at":"2026-04-01T09:00:00",
			"updated_at":"2026-04-01T09:10:00",
			"ad_ids":["6603811182227","6603811621627"]
		}`),
	})
	if err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	if len(conversations[0].AdIDs) != 2 {
		t.Fatalf("expected 2 string ad_ids to decode, got %+v", conversations[0].AdIDs)
	}
	if conversations[0].AdIDs[0].AdID != "6603811182227" || conversations[0].AdIDs[1].AdID != "6603811621627" {
		t.Fatalf("expected string ad_ids to map into SourceRef.AdID, got %+v", conversations[0].AdIDs)
	}
}
