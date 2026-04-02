package transform

import (
	"encoding/json"
	"fmt"
	"time"
)

type DayWindow struct {
	Start        time.Time
	EndExclusive time.Time
}

type PageWindow struct {
	Messages   []json.RawMessage
	Oldest     time.Time
	Newest     time.Time
	HasOlder   bool
	HasNewer   bool
	StopPaging bool
}

type messageEnvelope struct {
	InsertedAt string `json:"inserted_at"`
}

func FilterMessagePage(messages []json.RawMessage, window DayWindow) (PageWindow, error) {
	page := PageWindow{
		Messages: make([]json.RawMessage, 0, len(messages)),
	}
	if len(messages) == 0 {
		return page, nil
	}
	if window.Start.IsZero() || window.EndExclusive.IsZero() || !window.Start.Before(window.EndExclusive) {
		return PageWindow{}, fmt.Errorf("invalid day window")
	}

	for idx, rawMessage := range messages {
		insertedAt, err := parseInsertedAt(rawMessage, window.Start.Location())
		if err != nil {
			return PageWindow{}, fmt.Errorf("message %d: %w", idx, err)
		}

		if idx == 0 || insertedAt.Before(page.Oldest) {
			page.Oldest = insertedAt
		}
		if idx == 0 || insertedAt.After(page.Newest) {
			page.Newest = insertedAt
		}

		switch {
		case insertedAt.Before(window.Start):
			page.HasOlder = true
		case !insertedAt.Before(window.EndExclusive):
			page.HasNewer = true
		default:
			page.Messages = append(page.Messages, rawMessage)
		}
	}

	page.StopPaging = page.HasOlder
	return page, nil
}

func parseInsertedAt(rawMessage json.RawMessage, loc *time.Location) (time.Time, error) {
	if loc == nil {
		loc = time.UTC
	}

	var envelope messageEnvelope
	if err := json.Unmarshal(rawMessage, &envelope); err != nil {
		return time.Time{}, fmt.Errorf("decode message: %w", err)
	}
	if envelope.InsertedAt == "" {
		return time.Time{}, fmt.Errorf("missing inserted_at")
	}

	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04:05"} {
		var parsed time.Time
		var err error
		if layout == time.RFC3339Nano {
			parsed, err = time.Parse(layout, envelope.InsertedAt)
		} else {
			parsed, err = time.ParseInLocation(layout, envelope.InsertedAt, loc)
		}
		if err == nil {
			return parsed, nil
		}
	}

	return time.Time{}, fmt.Errorf("unsupported inserted_at %q", envelope.InsertedAt)
}
