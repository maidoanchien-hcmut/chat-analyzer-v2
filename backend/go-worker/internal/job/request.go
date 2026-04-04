package job

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
)

const defaultRunMode = "official_daily"

type Request struct {
	ManifestVersion               int     `json:"manifest_version"`
	PipelineRunID                 string  `json:"pipeline_run_id"`
	RunGroupID                    string  `json:"run_group_id"`
	ConnectedPageID               string  `json:"connected_page_id"`
	PageID                        string  `json:"page_id"`
	UserAccessToken               string  `json:"user_access_token"`
	BusinessTimezone              string  `json:"business_timezone"`
	TargetDate                    string  `json:"target_date"`
	RunMode                       string  `json:"run_mode"`
	ProcessingMode                string  `json:"processing_mode"`
	PublishEligibility            string  `json:"publish_eligibility"`
	RequestedWindowStartAt        *string `json:"requested_window_start_at"`
	RequestedWindowEndExclusiveAt *string `json:"requested_window_end_exclusive_at"`
	WindowStartAt                 *string `json:"window_start_at"`
	WindowEndExclusiveAt          *string `json:"window_end_exclusive_at"`
	IsFullDay                     bool    `json:"is_full_day"`
	ETLConfig                     struct {
		ConfigVersionID string                          `json:"config_version_id"`
		ETLConfigHash   string                          `json:"etl_config_hash"`
		TagMapping      controlplane.TagMappingConfig   `json:"tag_mapping"`
		OpeningRules    controlplane.OpeningRulesConfig `json:"opening_rules"`
		Scheduler       *controlplane.SchedulerConfig   `json:"scheduler"`
	} `json:"etl_config"`
}

func LoadFile(path string) (Request, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Request{}, fmt.Errorf("read job file %s: %w", path, err)
	}
	return ParseJSON(string(raw))
}

func ParseJSON(raw string) (Request, error) {
	var req Request
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		return Request{}, fmt.Errorf("decode job json: %w", err)
	}
	if req.ManifestVersion == 0 {
		req.ManifestVersion = 1
	}
	return req, nil
}

func (r Request) Apply(cfg *config.Config) error {
	if cfg == nil {
		return fmt.Errorf("nil config")
	}

	runMode := strings.TrimSpace(r.RunMode)
	if runMode == "" {
		runMode = defaultRunMode
	}
	processingMode := strings.TrimSpace(r.ProcessingMode)
	if processingMode == "" {
		processingMode = "etl_only"
	}
	businessTimezone := strings.TrimSpace(r.BusinessTimezone)
	if businessTimezone == "" {
		businessTimezone = config.DefaultBusinessTimezone()
	}

	businessDay, err := config.ParseBusinessDay(r.TargetDate, businessTimezone)
	if err != nil {
		return err
	}
	requestedWindowStartAt, err := parseOptionalRFC3339(r.RequestedWindowStartAt, "requested_window_start_at")
	if err != nil {
		return err
	}
	requestedWindowEndExclusiveAt, err := parseOptionalRFC3339(r.RequestedWindowEndExclusiveAt, "requested_window_end_exclusive_at")
	if err != nil {
		return err
	}
	windowStartAt, err := parseOptionalRFC3339(r.WindowStartAt, "window_start_at")
	if err != nil {
		return err
	}
	windowEndExclusiveAt, err := parseOptionalRFC3339(r.WindowEndExclusiveAt, "window_end_exclusive_at")
	if err != nil {
		return err
	}

	cfg.PipelineRunID = strings.TrimSpace(r.PipelineRunID)
	cfg.ConnectedPageID = strings.TrimSpace(r.ConnectedPageID)
	cfg.UserAccessToken = strings.TrimSpace(r.UserAccessToken)
	cfg.PageID = strings.TrimSpace(r.PageID)
	cfg.BusinessDay = businessDay
	cfg.BusinessTimezone = businessTimezone
	cfg.RunMode = runMode
	cfg.ProcessingMode = processingMode
	cfg.RunGroupID = strings.TrimSpace(r.RunGroupID)
	cfg.PublishEligibility = strings.TrimSpace(r.PublishEligibility)
	cfg.IsFullDay = r.IsFullDay
	cfg.RequestedWindowStartAt = requestedWindowStartAt
	cfg.RequestedWindowEndExclusiveAt = requestedWindowEndExclusiveAt
	cfg.WindowStartAt = windowStartAt
	cfg.WindowEndExclusiveAt = windowEndExclusiveAt
	cfg.ETLConfigVersionID = strings.TrimSpace(r.ETLConfig.ConfigVersionID)
	cfg.ETLConfigHash = strings.TrimSpace(r.ETLConfig.ETLConfigHash)
	cfg.TagMapping = r.ETLConfig.TagMapping
	cfg.OpeningRules = r.ETLConfig.OpeningRules
	cfg.Scheduler = r.ETLConfig.Scheduler
	if cfg.Scheduler != nil {
		cfg.MaxConversations = cfg.Scheduler.MaxConversationsPerRun
		cfg.MaxMessagePagesPerConversation = cfg.Scheduler.MaxMessagePagesPerThread
	}
	return nil
}

func parseOptionalRFC3339(value *string, field string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}
	raw := strings.TrimSpace(*value)
	if raw == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, fmt.Errorf("%s must be RFC3339: %w", field, err)
	}
	return &parsed, nil
}
