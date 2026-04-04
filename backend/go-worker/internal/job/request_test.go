package job

import (
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
)

func TestRequestApplyPopulatesConfig(t *testing.T) {
	windowStart := "2026-03-31T02:00:00Z"
	windowEnd := "2026-03-31T10:00:00Z"
	req := Request{
		ManifestVersion:               1,
		PipelineRunID:                 "8d9b2a33-b999-4957-a59e-7eac9d07c803",
		RunGroupID:                    "1e1f48ef-cd0f-4452-a5d6-533af1df4ef5",
		ConnectedPageID:               "connected-page-1",
		PageID:                        "page-1",
		UserAccessToken:               "user-token",
		TargetDate:                    "2026-03-31",
		BusinessTimezone:              "Asia/Ho_Chi_Minh",
		RunMode:                       "manual_range",
		ProcessingMode:                "etl_only",
		PublishEligibility:            "provisional_current_day_partial",
		RequestedWindowStartAt:        &windowStart,
		RequestedWindowEndExclusiveAt: &windowEnd,
		WindowStartAt:                 &windowStart,
		WindowEndExclusiveAt:          &windowEnd,
		IsFullDay:                     false,
		ETLConfig: struct {
			ConfigVersionID string                          `json:"config_version_id"`
			ETLConfigHash   string                          `json:"etl_config_hash"`
			TagMapping      controlplane.TagMappingConfig   `json:"tag_mapping"`
			OpeningRules    controlplane.OpeningRulesConfig `json:"opening_rules"`
			Scheduler       *controlplane.SchedulerConfig   `json:"scheduler"`
		}{
			ConfigVersionID: "cfg-v2",
			ETLConfigHash:   "hash-123",
			TagMapping: controlplane.TagMappingConfig{
				Version:     1,
				DefaultRole: "noise",
				Entries: []controlplane.TagMappingEntry{
					{
						SourceTagID:   "101",
						SourceTagText: "KH MỚI",
						Role:          "journey",
						CanonicalCode: "new_customer",
						MappingSource: "operator",
						Status:        "active",
					},
				},
			},
			OpeningRules: controlplane.OpeningRulesConfig{
				Version: 1,
				Selectors: []controlplane.OpeningSelector{
					{
						SelectorID:          "selector-booking",
						SignalRole:          "need",
						SignalCode:          "booking",
						AllowedMessageTypes: []string{"template", "text"},
						Options: []controlplane.OpeningOption{
							{
								RawText:   "Đặt lịch hẹn",
								MatchMode: "exact",
							},
						},
					},
				},
			},
			Scheduler: &controlplane.SchedulerConfig{
				Version:                  1,
				Timezone:                 "Asia/Ho_Chi_Minh",
				OfficialDailyTime:        "00:00",
				LookbackHours:            2,
				MaxConversationsPerRun:   10,
				MaxMessagePagesPerThread: 3,
			},
		},
	}

	cfg := config.Config{
		DatabaseURL:    "postgresql://example",
		RequestTimeout: 30 * time.Second,
	}
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if cfg.PipelineRunID != "8d9b2a33-b999-4957-a59e-7eac9d07c803" {
		t.Fatalf("expected pipeline run id to be copied")
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
	if cfg.PublishEligibility != "provisional_current_day_partial" {
		t.Fatalf("expected publish eligibility to be copied")
	}
	if cfg.ETLConfigVersionID != "cfg-v2" || cfg.ETLConfigHash != "hash-123" {
		t.Fatalf("expected ETL config identity to be copied")
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
	if cfg.Scheduler == nil || cfg.Scheduler.MaxConversationsPerRun != 10 {
		t.Fatalf("expected scheduler to be copied")
	}
	if cfg.MaxConversations != 10 || cfg.MaxMessagePagesPerConversation != 3 {
		t.Fatalf("expected scheduler limits to flow into config, got %d/%d", cfg.MaxConversations, cfg.MaxMessagePagesPerConversation)
	}
}

func TestRequestApplyDefaultsRunModeAndProcessingMode(t *testing.T) {
	req := Request{
		UserAccessToken: "user-token",
		PageID:          "page-1",
		TargetDate:      "2026-03-31",
		RunGroupID:      "7656cdf2-db9d-4121-aef8-54f06ae97d58",
	}

	var cfg config.Config
	if err := req.Apply(&cfg); err != nil {
		t.Fatalf("Apply returned error: %v", err)
	}

	if cfg.RunMode != "official_daily" {
		t.Fatalf("expected default run mode official_daily, got %s", cfg.RunMode)
	}
	if cfg.ProcessingMode != "etl_only" {
		t.Fatalf("expected default processing mode etl_only, got %s", cfg.ProcessingMode)
	}
	if cfg.BusinessTimezone != config.DefaultBusinessTimezone() {
		t.Fatalf("expected default timezone %s, got %s", config.DefaultBusinessTimezone(), cfg.BusinessTimezone)
	}
}
