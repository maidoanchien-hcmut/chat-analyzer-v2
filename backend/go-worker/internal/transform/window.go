package transform

import (
	"fmt"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

type DayWindow struct {
	Start        time.Time
	EndExclusive time.Time
}

type PageWindow struct {
	Messages   []pancake.Message
	Oldest     time.Time
	Newest     time.Time
	HasOlder   bool
	HasNewer   bool
	StopPaging bool
}

func FilterMessagePage(messages []pancake.Message, window DayWindow) (PageWindow, error) {
	page := PageWindow{
		Messages: make([]pancake.Message, 0, len(messages)),
	}
	if len(messages) == 0 {
		return page, nil
	}
	if window.Start.IsZero() || window.EndExclusive.IsZero() || !window.Start.Before(window.EndExclusive) {
		return PageWindow{}, fmt.Errorf("invalid day window")
	}

	for idx, message := range messages {
		insertedAt, err := parseSourceTime(message.InsertedAt, window.Start.Location())
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
			page.Messages = append(page.Messages, message)
		}
	}

	page.StopPaging = page.HasOlder
	return page, nil
}

func parseSourceTime(value string, loc *time.Location) (time.Time, error) {
	if loc == nil {
		loc = time.UTC
	}
	if value == "" {
		return time.Time{}, fmt.Errorf("missing timestamp")
	}

	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04:05"} {
		var parsed time.Time
		var err error
		if layout == time.RFC3339Nano {
			parsed, err = time.Parse(layout, value)
		} else {
			parsed, err = time.ParseInLocation(layout, value, loc)
		}
		if err == nil {
			return parsed, nil
		}
	}

	return time.Time{}, fmt.Errorf("unsupported timestamp %q", value)
}
