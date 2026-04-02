package extract

import (
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
		{ID: "m1", InsertedAt: "2026-03-31T09:10:00"},
		{ID: "m2", InsertedAt: "2026-03-31T11:20:00"},
		{ID: "m3", InsertedAt: "2026-03-30T23:59:59"},
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
	if !page.HasOlder {
		t.Fatalf("expected HasOlder to be true")
	}
}

func TestFilterMessagePageContinuesWhenPageOnlyContainsNewerMessages(t *testing.T) {
	location := time.FixedZone("ICT", 7*60*60)
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, location),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, location),
	}

	page, err := FilterMessagePage([]pancake.Message{
		{ID: "m1", InsertedAt: "2026-04-01T08:00:00"},
		{ID: "m2", InsertedAt: "2026-04-01T09:15:00"},
	}, window)
	if err != nil {
		t.Fatalf("FilterMessagePage returned error: %v", err)
	}

	if len(page.Messages) != 0 {
		t.Fatalf("expected no messages to be kept from a newer-only page")
	}
	if page.StopPaging {
		t.Fatalf("expected StopPaging to be false for a newer-only page")
	}
	if !page.HasNewer {
		t.Fatalf("expected HasNewer to be true")
	}
}

func TestFilterMessagePageParsesRFC3339Timestamps(t *testing.T) {
	window := DayWindow{
		Start:        time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC),
		EndExclusive: time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
	}

	page, err := FilterMessagePage([]pancake.Message{
		{ID: "m1", InsertedAt: "2026-03-31T00:15:00Z"},
	}, window)
	if err != nil {
		t.Fatalf("FilterMessagePage returned error: %v", err)
	}

	if got := len(page.Messages); got != 1 {
		t.Fatalf("expected 1 RFC3339 message in business day, got %d", got)
	}
}
