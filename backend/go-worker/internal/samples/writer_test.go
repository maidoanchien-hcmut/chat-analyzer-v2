package samples

import (
	"strings"
	"testing"
)

func TestSanitizeJSONRedactsTokenFields(t *testing.T) {
	raw := []byte(`{
		"page_access_token": "abc",
		"nested": {
			"access_token": "def"
		},
		"items": [
			{"token": "ghi"},
			{"name": "ok"}
		]
	}`)

	sanitized, err := sanitizeJSON(raw)
	if err != nil {
		t.Fatalf("sanitizeJSON returned error: %v", err)
	}

	output := string(sanitized)
	for _, secret := range []string{"abc", "def", "ghi"} {
		if strings.Contains(output, secret) {
			t.Fatalf("expected sanitized json to hide secret %q", secret)
		}
	}
	if count := strings.Count(output, "***REDACTED***"); count != 3 {
		t.Fatalf("expected 3 redactions, got %d", count)
	}
}
