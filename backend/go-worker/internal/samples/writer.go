package samples

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var unsafeNamePattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

type RunWriter struct {
	root string
}

func NewRunWriter(baseDir string) (*RunWriter, error) {
	runDir := filepath.Join(baseDir, time.Now().UTC().Format("20060102T150405Z"))
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return nil, fmt.Errorf("create sample output directory: %w", err)
	}
	return &RunWriter{root: runDir}, nil
}

func (w *RunWriter) Root() string {
	return w.root
}

func (w *RunWriter) WriteJSON(relativePath string, raw []byte) error {
	sanitized, err := sanitizeJSON(raw)
	if err != nil {
		return err
	}
	return w.write(relativePath, sanitized)
}

func (w *RunWriter) WriteStructured(relativePath string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", relativePath, err)
	}
	return w.write(relativePath, raw)
}

func (w *RunWriter) write(relativePath string, raw []byte) error {
	fullPath := filepath.Join(w.root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create directory for %s: %w", fullPath, err)
	}
	if err := os.WriteFile(fullPath, raw, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", fullPath, err)
	}
	return nil
}

func SafeName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "unknown"
	}
	return unsafeNamePattern.ReplaceAllString(value, "_")
}

func sanitizeJSON(raw []byte) ([]byte, error) {
	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, fmt.Errorf("decode json for sanitization: %w", err)
	}

	sanitized := sanitizeValue(generic)
	pretty, err := json.MarshalIndent(sanitized, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode sanitized json: %w", err)
	}
	return pretty, nil
}

func sanitizeValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			if isSecretKey(key) {
				out[key] = "***REDACTED***"
				continue
			}
			out[key] = sanitizeValue(child)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			out[i] = sanitizeValue(child)
		}
		return out
	default:
		return value
	}
}

func isSecretKey(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "access_token", "page_access_token", "token", "appsecret", "app_secret", "secret":
		return true
	default:
		return false
	}
}
