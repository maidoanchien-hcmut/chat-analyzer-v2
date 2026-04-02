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

const defaultRunMode = "scheduled_daily"

type TagRule = controlplane.TagRule
type OpeningRule = controlplane.OpeningRule
type CustomerDirectoryEntry = controlplane.CustomerDirectoryEntry
type BotSignature = controlplane.BotSignature

type Request struct {
	ConnectedPageID                string                   `json:"connected_page_id"`
	ProcessingMode                 string                   `json:"processing_mode"`
	RunParamsJSON                  json.RawMessage          `json:"run_params_json"`
	UserAccessToken                string                   `json:"user_access_token"`
	PageID                         string                   `json:"page_id"`
	TargetDate                     string                   `json:"target_date"`
	BusinessTimezone               string                   `json:"business_timezone"`
	RunMode                        string                   `json:"run_mode"`
	RunGroupID                     string                   `json:"run_group_id"`
	SnapshotVersion                int                      `json:"snapshot_version"`
	IsPublished                    bool                     `json:"is_published"`
	RequestedWindowStartAt         *string                  `json:"requested_window_start_at"`
	RequestedWindowEndExclusiveAt  *string                  `json:"requested_window_end_exclusive_at"`
	WindowStartAt                  *string                  `json:"window_start_at"`
	WindowEndExclusiveAt           *string                  `json:"window_end_exclusive_at"`
	MaxConversations               int                      `json:"max_conversations"`
	MaxMessagePagesPerConversation int                      `json:"max_message_pages_per_conversation"`
	TagRules                       []TagRule                `json:"tag_rules"`
	OpeningRules                   []OpeningRule            `json:"opening_rules"`
	CustomerDirectory              []CustomerDirectoryEntry `json:"customer_directory"`
	BotSignatures                  []BotSignature           `json:"bot_signatures"`
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
	snapshotVersion := r.SnapshotVersion
	if snapshotVersion == 0 {
		snapshotVersion = 1
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

	cfg.ConnectedPageID = strings.TrimSpace(r.ConnectedPageID)
	cfg.UserAccessToken = strings.TrimSpace(r.UserAccessToken)
	cfg.PageID = strings.TrimSpace(r.PageID)
	cfg.BusinessDay = businessDay
	cfg.BusinessTimezone = businessTimezone
	cfg.RunMode = runMode
	cfg.ProcessingMode = processingMode
	cfg.RunGroupID = strings.TrimSpace(r.RunGroupID)
	cfg.SnapshotVersion = snapshotVersion
	cfg.IsPublished = r.IsPublished
	cfg.RunParamsJSON = append(json.RawMessage(nil), r.RunParamsJSON...)
	cfg.RequestedWindowStartAt = requestedWindowStartAt
	cfg.RequestedWindowEndExclusiveAt = requestedWindowEndExclusiveAt
	cfg.WindowStartAt = windowStartAt
	cfg.WindowEndExclusiveAt = windowEndExclusiveAt
	cfg.MaxConversations = r.MaxConversations
	cfg.MaxMessagePagesPerConversation = r.MaxMessagePagesPerConversation
	cfg.TagRules = append([]controlplane.TagRule(nil), r.TagRules...)
	cfg.OpeningRules = append([]controlplane.OpeningRule(nil), r.OpeningRules...)
	cfg.CustomerDirectory = append([]controlplane.CustomerDirectoryEntry(nil), r.CustomerDirectory...)
	cfg.BotSignatures = append([]controlplane.BotSignature(nil), r.BotSignatures...)
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
