package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/extract"
	"chat-analyzer-v2/backend/go-worker/internal/job"
	"chat-analyzer-v2/backend/go-worker/internal/load"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
	"github.com/google/uuid"
)

func main() {
	logger := log.New(os.Stdout, "pancake-etl: ", log.LstdFlags)

	cfg, err := config.Load()
	if err != nil {
		logger.Fatal(err)
	}

	if err := applyFlags(&cfg); err != nil {
		logger.Fatal(err)
	}

	if err := cfg.Validate(); err != nil {
		logger.Fatal(err)
	}
	if cfg.RuntimeOnly {
		logger = log.New(os.Stderr, "pancake-etl: ", log.LstdFlags)
	}

	ctx := context.Background()
	client := pancake.NewClient(cfg.UserAccessToken, cfg.RequestTimeout)
	startedAt := time.Now().UTC()
	runState := load.Result{}
	if !cfg.RuntimeOnly {
		runState, err = load.StartRun(ctx, cfg)
		if err != nil {
			logger.Fatal(err)
		}
	}

	extracted, err := extract.Run(ctx, cfg, client)
	if err != nil {
		if cfg.RuntimeOnly {
			logger.Fatal(err)
		}
		failRun(logger, ctx, cfg, runState.PipelineRunID, baseMetrics(cfg, client, nil, nil, startedAt), err)
		logger.Fatal(err)
	}

	window := transform.DayWindow{
		Start:        extracted.Window.Start,
		EndExclusive: extracted.Window.EndExclusive,
	}
	tagDictionary := make(map[int64]pancake.Tag, len(extracted.Tags))
	for _, tag := range extracted.Tags {
		tagDictionary[tag.ID] = tag
	}

	conversationDays := make([]transform.ConversationDaySource, 0, len(extracted.ConversationDays))
	policies := controlplane.RuntimeConfig{
		TagMapping:   cfg.TagMapping,
		OpeningRules: cfg.OpeningRules,
	}
	for _, candidate := range extracted.ConversationDays {
		conversationDay, err := transform.BuildConversationDay(
			window,
			candidate.Conversation,
			candidate.MessageContext,
			candidate.Messages,
			candidate.MessagesSeenFromSource,
			tagDictionary,
			policies,
		)
		if err != nil {
			if cfg.RuntimeOnly {
				logger.Fatal(err)
			}
			failRun(logger, ctx, cfg, runState.PipelineRunID, baseMetrics(cfg, client, &extracted.Summary, nil, startedAt), err)
			logger.Fatal(err)
		}
		conversationDays = append(conversationDays, conversationDay)
	}
	metrics := baseMetrics(cfg, client, &extracted.Summary, map[string]any{
		"thread_days_built": len(conversationDays),
	}, startedAt)
	if cfg.RuntimeOnly {
		output := runtimePreviewOutput{
			PageID:               extracted.Summary.PageID,
			TargetDate:           cfg.BusinessDay.Format(time.DateOnly),
			BusinessTimezone:     cfg.BusinessTimezone,
			WindowStartAt:        extracted.Window.Start.Format(time.RFC3339),
			WindowEndExclusiveAt: extracted.Window.EndExclusive.Format(time.RFC3339),
			Summary:              metrics,
			PageTags:             buildRuntimePreviewTags(extracted.Tags),
			Conversations:        buildRuntimePreviewConversations(conversationDays),
		}
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(output); err != nil {
			logger.Fatal(err)
		}
		return
	}
	if err := load.SaveSuccess(ctx, cfg, runState.PipelineRunID, metrics, extracted.Tags, conversationDays); err != nil {
		failRun(logger, ctx, cfg, runState.PipelineRunID, metrics, err)
		logger.Fatal(err)
	}

	logger.Printf(
		"etl complete: pipeline_run_id=%s page_id=%s target_date=%s tags=%d conversations_scanned=%d thread_days=%d message_pages=%d messages_seen=%d messages_selected=%d",
		runState.PipelineRunID,
		extracted.Summary.PageID,
		cfg.BusinessDay.Format(time.DateOnly),
		extracted.Summary.TagsLoaded,
		extracted.Summary.ConversationsScanned,
		extracted.Summary.ConversationDaysBuilt,
		extracted.Summary.MessagePagesFetched,
		extracted.Summary.MessagesSeen,
		extracted.Summary.MessagesSelected,
	)
}

func baseMetrics(
	cfg config.Config,
	client *pancake.Client,
	summary *extract.Summary,
	extra map[string]any,
	startedAt time.Time,
) map[string]any {
	windowStart, windowEnd := cfg.EffectiveWindow()
	metrics := map[string]any{
		"page_id":                 cfg.PageID,
		"pipeline_run_id":         cfg.PipelineRunID,
		"target_date":             cfg.BusinessDay.Format(time.DateOnly),
		"run_mode":                cfg.RunMode,
		"publish_eligibility":     cfg.PublishEligibility,
		"is_full_day":             cfg.IsFullDay,
		"started_at":              startedAt.Format(time.RFC3339Nano),
		"pancake_api":             client.Metrics(),
		"business_timezone":       cfg.BusinessTimezone,
		"window_start_at":         windowStart.Format(time.RFC3339Nano),
		"window_end_exclusive_at": windowEnd.Format(time.RFC3339Nano),
		"etl_config_version_id":   cfg.ETLConfigVersionID,
		"etl_config_hash":         cfg.ETLConfigHash,
	}
	if summary != nil {
		metrics["tags_loaded"] = summary.TagsLoaded
		metrics["conversations_scanned"] = summary.ConversationsScanned
		metrics["thread_days_built"] = summary.ConversationDaysBuilt
		metrics["message_pages_fetched"] = summary.MessagePagesFetched
		metrics["messages_seen"] = summary.MessagesSeen
		metrics["messages_selected"] = summary.MessagesSelected
		metrics["page_id"] = summary.PageID
	}
	for key, value := range extra {
		metrics[key] = value
	}
	return metrics
}

func failRun(
	logger *log.Logger,
	ctx context.Context,
	cfg config.Config,
	pipelineRunID string,
	metrics map[string]any,
	runErr error,
) {
	if err := load.SaveFailure(ctx, cfg, pipelineRunID, metrics, runErr); err != nil {
		logger.Printf("failed to persist pipeline_run failure state for %s: %v", pipelineRunID, err)
	}
}

type runtimePreviewOutput struct {
	PageID               string                       `json:"pageId"`
	TargetDate           string                       `json:"targetDate"`
	BusinessTimezone     string                       `json:"businessTimezone"`
	WindowStartAt        string                       `json:"windowStartAt"`
	WindowEndExclusiveAt string                       `json:"windowEndExclusiveAt"`
	Summary              map[string]any               `json:"summary"`
	PageTags             []runtimePreviewTag          `json:"pageTags"`
	Conversations        []runtimePreviewConversation `json:"conversations"`
}

type runtimePreviewTag struct {
	PancakeTagID string `json:"pancakeTagId"`
	Text         string `json:"text"`
	IsDeactive   bool   `json:"isDeactive"`
}

type runtimePreviewConversation struct {
	ConversationID           string          `json:"conversationId"`
	CustomerDisplayName      string          `json:"customerDisplayName"`
	FirstMeaningfulMessage   string          `json:"firstMeaningfulMessageText"`
	ObservedTagsJSON         json.RawMessage `json:"observedTagsJson"`
	NormalizedTagSignalsJSON json.RawMessage `json:"normalizedTagSignalsJson"`
	OpeningBlockJSON         json.RawMessage `json:"openingBlockJson"`
}

func buildRuntimePreviewConversations(days []transform.ConversationDaySource) []runtimePreviewConversation {
	conversations := make([]runtimePreviewConversation, 0, len(days))
	for _, day := range days {
		conversations = append(conversations, runtimePreviewConversation{
			ConversationID:           day.ConversationID,
			CustomerDisplayName:      day.CustomerDisplayName,
			FirstMeaningfulMessage:   day.FirstMeaningfulMessageText,
			ObservedTagsJSON:         day.ObservedTagsJSON,
			NormalizedTagSignalsJSON: day.NormalizedTagSignalsJSON,
			OpeningBlockJSON:         day.OpeningBlockJSON,
		})
	}
	return conversations
}

func buildRuntimePreviewTags(tags []pancake.Tag) []runtimePreviewTag {
	items := make([]runtimePreviewTag, 0, len(tags))
	for _, tag := range tags {
		items = append(items, runtimePreviewTag{
			PancakeTagID: fmt.Sprintf("%d", tag.ID),
			Text:         tag.Text,
			IsDeactive:   tag.IsDeactive,
		})
	}
	return items
}

func applyFlags(cfg *config.Config) error {
	databaseURL := flag.String("database-url", cfg.DatabaseURL, "PostgreSQL connection string for direct chat-extractor load")
	jobFile := flag.String("job-file", "", "Path to a JSON job payload emitted by backend orchestration")
	jobJSON := flag.String("job-json", "", "Inline JSON job payload emitted by backend orchestration")
	userAccessToken := flag.String("user-access-token", "", "Pancake user access token for local/manual runs")
	pageID := flag.String("page-id", "", "Pancake page ID to fetch")
	connectedPageID := flag.String("connected-page-id", "", "Connected page UUID for direct database loads")
	targetDate := flag.String("target-date", "", "Target date to extract in YYYY-MM-DD")
	businessDay := flag.String("business-day", "", "Deprecated alias for -target-date")
	businessTimezone := flag.String("business-timezone", cfg.BusinessTimezone, "IANA timezone used to interpret the target date")
	runMode := flag.String("run-mode", cfg.RunMode, "Run mode for pipeline_run metadata")
	runGroupID := flag.String("run-group-id", "", "Optional run group ID for direct/manual runs")
	pipelineRunID := flag.String("pipeline-run-id", "", "Pipeline run UUID for direct database loads")
	publishEligibility := flag.String("publish-eligibility", "provisional_current_day_partial", "Publish eligibility for this run")
	windowStartAt := flag.String("window-start-at", "", "Optional RFC3339 window start inside the target-date bucket")
	windowEndExclusiveAt := flag.String("window-end-exclusive-at", "", "Optional RFC3339 window end exclusive inside the target-date bucket")
	requestedWindowStartAt := flag.String("requested-window-start-at", "", "Optional RFC3339 requested window start for audit metadata")
	requestedWindowEndExclusiveAt := flag.String("requested-window-end-exclusive-at", "", "Optional RFC3339 requested window end for audit metadata")
	maxConversations := flag.Int("max-conversations", 0, "Optional conversation cap for debug or onboarding runs (0 means no limit)")
	maxMessagePages := flag.Int("max-message-pages", 0, "Optional message page cap per conversation (0 means no limit)")
	etlConfigVersionID := flag.String("etl-config-version-id", "local-config", "ETL config version identifier for direct/manual runs")
	etlConfigHash := flag.String("etl-config-hash", "local-preview", "ETL config hash for direct/manual runs")
	runtimeOnly := flag.Bool("runtime-only", false, "Run extract/transform only and print preview JSON without writing to PostgreSQL")

	flag.Parse()

	cfg.DatabaseURL = *databaseURL
	cfg.RuntimeOnly = *runtimeOnly

	if *jobFile != "" && *jobJSON != "" {
		return errors.New("use only one of -job-file or -job-json")
	}
	if *jobFile != "" || *jobJSON != "" {
		var req job.Request
		var err error
		switch {
		case *jobFile != "":
			req, err = job.LoadFile(*jobFile)
		default:
			req, err = job.ParseJSON(*jobJSON)
		}
		if err != nil {
			return err
		}
		return req.Apply(cfg)
	}

	targetDateValue := *targetDate
	if targetDateValue == "" {
		targetDateValue = *businessDay
	}
	if *userAccessToken == "" {
		return errors.New("user-access-token is required when no job payload is provided")
	}
	if *pageID == "" {
		return errors.New("page-id is required when no job payload is provided")
	}
	if targetDateValue == "" {
		return errors.New("target-date is required when no job payload is provided")
	}
	if *maxConversations < 0 {
		return errors.New("max-conversations must be >= 0")
	}
	if *maxMessagePages < 0 {
		return errors.New("max-message-pages must be >= 0")
	}

	req := job.Request{
		ManifestVersion:    1,
		PipelineRunID:      strings.TrimSpace(*pipelineRunID),
		RunGroupID:         strings.TrimSpace(*runGroupID),
		ConnectedPageID:    strings.TrimSpace(*connectedPageID),
		PageID:             *pageID,
		UserAccessToken:    *userAccessToken,
		BusinessTimezone:   *businessTimezone,
		TargetDate:         targetDateValue,
		RunMode:            *runMode,
		ProcessingMode:     "etl_only",
		PublishEligibility: strings.TrimSpace(*publishEligibility),
		IsFullDay:          *windowStartAt == "" && *windowEndExclusiveAt == "",
		ETLConfig: struct {
			ConfigVersionID string                          `json:"config_version_id"`
			ETLConfigHash   string                          `json:"etl_config_hash"`
			TagMapping      controlplane.TagMappingConfig   `json:"tag_mapping"`
			OpeningRules    controlplane.OpeningRulesConfig `json:"opening_rules"`
			Scheduler       *controlplane.SchedulerConfig   `json:"scheduler"`
		}{
			ConfigVersionID: strings.TrimSpace(*etlConfigVersionID),
			ETLConfigHash:   strings.TrimSpace(*etlConfigHash),
			Scheduler: &controlplane.SchedulerConfig{
				Version:                  1,
				Timezone:                 *businessTimezone,
				OfficialDailyTime:        "00:00",
				LookbackHours:            0,
				MaxConversationsPerRun:   *maxConversations,
				MaxMessagePagesPerThread: *maxMessagePages,
			},
		},
	}
	if req.RunGroupID == "" {
		req.RunGroupID = uuid.NewString()
	}
	if req.PipelineRunID == "" && !cfg.RuntimeOnly {
		req.PipelineRunID = uuid.NewString()
	}
	if *windowStartAt != "" {
		req.WindowStartAt = windowStartAt
	}
	if *windowEndExclusiveAt != "" {
		req.WindowEndExclusiveAt = windowEndExclusiveAt
	}
	if *requestedWindowStartAt != "" {
		req.RequestedWindowStartAt = requestedWindowStartAt
	}
	if *requestedWindowEndExclusiveAt != "" {
		req.RequestedWindowEndExclusiveAt = requestedWindowEndExclusiveAt
	}
	if err := req.Apply(cfg); err != nil {
		return fmt.Errorf("apply cli request: %w", err)
	}
	return nil
}
