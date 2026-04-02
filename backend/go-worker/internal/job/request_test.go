package job

import (
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
)

func TestRequestApplyPopulatesConfig(t *testing.T) {
	req := Request{
		UserAccessToken:                "user-token",
		PageID:                         "page-1",
		TargetDate:                     "2026-03-31",
		BusinessTimezone:               "Asia/Ho_Chi_Minh",
		RunMode:                        "manual_range",
		RunGroupID:                     "group-1",
		SnapshotVersion:                2,
		IsPublished:                    false,
		MaxConversations:               10,
		MaxMessagePagesPerConversation: 3,
	}
	windowStart := "2026-03-31T02:00:00Z"
	windowEnd := "2026-03-31T10:00:00Z"
	req.WindowStartAt = &windowStart
	req.WindowEndExclusiveAt = &windowEnd

	cfg := config.Config{
		DatabaseURL:    "postgresql://example",
		RequestTimeout: 30 * time.Second,
	}
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if cfg.UserAccessToken != "user-token" {
		t.Fatalf("expected user token to be copied")
	}
	if cfg.PageID != "page-1" {
		t.Fatalf("expected page ID to be copied")
	}
	if cfg.RunMode != "manual_range" {
		t.Fatalf("expected run mode to be copied")
	}
	if cfg.SnapshotVersion != 2 {
		t.Fatalf("expected snapshot version 2, got %d", cfg.SnapshotVersion)
	}
	if cfg.WindowStartAt == nil || cfg.WindowEndExclusiveAt == nil {
		t.Fatalf("expected window bounds to be parsed")
	}
	if got := cfg.BusinessDay.Format(time.DateOnly); got != "2026-03-31" {
		t.Fatalf("expected business day 2026-03-31, got %s", got)
	}
}

func TestRequestApplyDefaultsRunModeAndSnapshotVersion(t *testing.T) {
	req := Request{
		UserAccessToken:  "user-token",
		PageID:           "page-1",
		TargetDate:       "2026-03-31",
		BusinessTimezone: "",
	}

	var cfg config.Config
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if cfg.RunMode != "scheduled_daily" {
		t.Fatalf("expected default run mode scheduled_daily, got %s", cfg.RunMode)
	}
	if cfg.SnapshotVersion != 1 {
		t.Fatalf("expected default snapshot version 1, got %d", cfg.SnapshotVersion)
	}
	if cfg.BusinessTimezone != config.DefaultBusinessTimezone() {
		t.Fatalf("expected default timezone %s, got %s", config.DefaultBusinessTimezone(), cfg.BusinessTimezone)
	}
}
