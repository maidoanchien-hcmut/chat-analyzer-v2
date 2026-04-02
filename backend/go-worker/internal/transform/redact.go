package transform

import (
	"bytes"
	"encoding/json"
	"html"
	"regexp"
	"strings"
	"unicode"

	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

var (
	phonePattern      = regexp.MustCompile(`(?:(?:\+?84|0)\d{8,10})`)
	htmlTagPattern    = regexp.MustCompile(`<[^>]+>`)
	whitespacePattern = regexp.MustCompile(`\s+`)
)

func redactJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage("null")
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return append(json.RawMessage(nil), raw...)
	}

	redacted := redactValue(value)
	encoded, err := json.Marshal(redacted)
	if err != nil {
		return append(json.RawMessage(nil), raw...)
	}
	return encoded
}

func redactValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		redacted := make(map[string]any, len(typed))
		for key, child := range typed {
			redacted[key] = redactValue(child)
		}
		return redacted
	case []any:
		redacted := make([]any, 0, len(typed))
		for _, child := range typed {
			redacted = append(redacted, redactValue(child))
		}
		return redacted
	case string:
		return redactPhones(typed)
	default:
		return value
	}
}

func redactPhones(value string) string {
	if value == "" {
		return ""
	}
	return phonePattern.ReplaceAllString(value, "<redacted_phone>")
}

func renderMessageText(message pancake.Message) string {
	text := strings.TrimSpace(message.OriginalMessage)
	if text == "" {
		text = html.UnescapeString(message.Message)
		text = htmlTagPattern.ReplaceAllString(text, " ")
	}
	text = strings.TrimSpace(text)
	text = whitespacePattern.ReplaceAllString(text, " ")
	return redactPhones(text)
}

func normalizePhone(raw string) string {
	digits := strings.Builder{}
	for _, r := range raw {
		if unicode.IsDigit(r) {
			digits.WriteRune(r)
		}
	}
	value := digits.String()
	switch {
	case len(value) == 10 && strings.HasPrefix(value, "0"):
		return "+84" + value[1:]
	case len(value) == 11 && strings.HasPrefix(value, "84"):
		return "+" + value
	case len(value) == 12 && strings.HasPrefix(value, "084"):
		return "+84" + value[3:]
	case strings.HasPrefix(value, "84") && len(value) >= 10:
		return "+" + value
	default:
		return ""
	}
}

func marshalJSON(value any, fallback string) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(fallback)
	}
	return encoded
}

func compactRawItems(items []json.RawMessage) []json.RawMessage {
	compacted := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		trimmed := bytes.TrimSpace(item)
		if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
			continue
		}
		compacted = append(compacted, append(json.RawMessage(nil), trimmed...))
	}
	return compacted
}
