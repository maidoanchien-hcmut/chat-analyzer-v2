package job

import (
	"encoding/json"
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
)

func TestRequestApplyPopulatesConfig(t *testing.T) {
	req := Request{
		ConnectedPageID:                "connected-page-1",
		UserAccessToken:                "user-token",
		PageID:                         "page-1",
		TargetDate:                     "2026-03-31",
		BusinessTimezone:               "Asia/Ho_Chi_Minh",
		RunMode:                        "manual_range",
		ProcessingMode:                 "etl_only",
		RunGroupID:                     "1e1f48ef-cd0f-4452-a5d6-533af1df4ef5",
		SnapshotVersion:                2,
		IsPublished:                    false,
		RunParamsJSON:                  json.RawMessage(`{"max_conversations":10}`),
		MaxConversations:               10,
		MaxMessagePagesPerConversation: 3,
		TagMapping: controlplane.TagMappingConfig{
			DefaultSignal: "null",
			Entries: []controlplane.TagMappingEntry{
				{
					PancakeTagID: "101",
					RawLabel:     "KH MỚI",
					Signal:       "customer_type",
				},
			},
		},
		CustomerDirectory: []CustomerDirectoryEntry{
			{
				CustomerID: "customer-1",
				PhoneE164:  "+84774665884",
			},
		},
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
	if cfg.ConnectedPageID != "connected-page-1" {
		t.Fatalf("expected connected page ID to be copied")
	}
	if cfg.RunMode != "manual_range" {
		t.Fatalf("expected run mode to be copied")
	}
	if cfg.ProcessingMode != "etl_only" {
		t.Fatalf("expected processing mode to be copied")
	}
	if cfg.SnapshotVersion != 2 {
		t.Fatalf("expected snapshot version 2, got %d", cfg.SnapshotVersion)
	}
	if got := string(cfg.RunParamsJSON); got != `{"max_conversations":10}` {
		t.Fatalf("expected run params json to be copied, got %s", got)
	}
	if cfg.WindowStartAt == nil || cfg.WindowEndExclusiveAt == nil {
		t.Fatalf("expected window bounds to be parsed")
	}
	if got := cfg.BusinessDay.Format(time.DateOnly); got != "2026-03-31" {
		t.Fatalf("expected business day 2026-03-31, got %s", got)
	}
	if len(cfg.TagMapping.Entries) != 1 {
		t.Fatalf("expected tag mappings to be copied")
	}
	if len(cfg.CustomerDirectory) != 1 {
		t.Fatalf("expected customer directory to be copied")
	}
}

func TestRequestApplyDefaultsRunModeAndSnapshotVersion(t *testing.T) {
	req := Request{
		UserAccessToken:  "user-token",
		PageID:           "page-1",
		TargetDate:       "2026-03-31",
		BusinessTimezone: "",
		RunGroupID:       "7656cdf2-db9d-4121-aef8-54f06ae97d58",
	}

	var cfg config.Config
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if cfg.RunMode != "scheduled_daily" {
		t.Fatalf("expected default run mode scheduled_daily, got %s", cfg.RunMode)
	}
	if cfg.ProcessingMode != "etl_only" {
		t.Fatalf("expected default processing mode etl_only, got %s", cfg.ProcessingMode)
	}
	if cfg.SnapshotVersion != 1 {
		t.Fatalf("expected default snapshot version 1, got %d", cfg.SnapshotVersion)
	}
	if cfg.BusinessTimezone != config.DefaultBusinessTimezone() {
		t.Fatalf("expected default timezone %s, got %s", config.DefaultBusinessTimezone(), cfg.BusinessTimezone)
	}
}

func TestRequestApplyPopulatesControlPlaneRules(t *testing.T) {
	req := Request{
		UserAccessToken:  "user-token",
		PageID:           "page-1",
		TargetDate:       "2026-03-31",
		BusinessTimezone: "Asia/Ho_Chi_Minh",
		RunGroupID:       "332f3ffc-cfd5-4fd3-abcf-3f4c3642d2a4",
		TagMapping: controlplane.TagMappingConfig{
			DefaultSignal: "null",
			Entries: []controlplane.TagMappingEntry{
				{
					PancakeTagID: "101",
					RawLabel:     "KH mới",
					Signal:       "customer_type",
				},
			},
		},
		OpeningRules: controlplane.OpeningRulesConfig{
			Boundary: controlplane.OpeningBoundary{
				Mode:        "until_first_meaningful_human_message",
				MaxMessages: 12,
			},
			Selectors: []controlplane.OpeningSelector{
				{
					Signal:              "need",
					AllowedMessageTypes: []string{"template", "text"},
					Options: []controlplane.OpeningOption{
						{
							RawText:  "Đặt lịch hẹn",
							Decision: "booking",
						},
					},
				},
			},
			Fallback: controlplane.OpeningFallback{
				StoreCandidateIfUnmatched: true,
			},
		},
		CustomerDirectory: []CustomerDirectoryEntry{
			{
				CustomerID: "crm-001",
				PhoneE164:  "+84774665884",
			},
		},
	}

	var cfg config.Config
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if got := len(cfg.TagMapping.Entries); got != 1 {
		t.Fatalf("expected 1 tag mapping entry, got %d", got)
	}
	if got := len(cfg.OpeningRules.Selectors); got != 1 {
		t.Fatalf("expected 1 opening selector, got %d", got)
	}
	if got := len(cfg.CustomerDirectory); got != 1 {
		t.Fatalf("expected 1 customer directory entry, got %d", got)
	}
	if cfg.CustomerDirectory[0].CustomerID != "crm-001" {
		t.Fatalf("expected customer directory entry to be copied")
	}
}
