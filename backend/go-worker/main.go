package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/extract"
	"chat-analyzer-v2/backend/go-worker/internal/job"
	"chat-analyzer-v2/backend/go-worker/internal/load"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
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

	ctx := context.Background()
	client := pancake.NewClient(cfg.UserAccessToken, cfg.RequestTimeout)
	startedAt := time.Now().UTC()
	runState, err := load.StartRun(ctx, cfg)
	if err != nil {
		logger.Fatal(err)
	}

	extracted, err := extract.Run(ctx, cfg, client)
	if err != nil {
		failRun(logger, ctx, cfg, runState.ETLRunID, baseMetrics(cfg, client, nil, nil, startedAt), err)
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
		TagRules:          cfg.TagRules,
		OpeningRules:      cfg.OpeningRules,
		CustomerDirectory: cfg.CustomerDirectory,
		BotSignatures:     cfg.BotSignatures,
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
			failRun(logger, ctx, cfg, runState.ETLRunID, baseMetrics(cfg, client, &extracted.Summary, nil, startedAt), err)
			logger.Fatal(err)
		}
		conversationDays = append(conversationDays, conversationDay)
	}
	threadMappings, err := transform.BuildThreadCustomerMappings(extracted.PageID, conversationDays, policies)
	if err != nil {
		failRun(logger, ctx, cfg, runState.ETLRunID, baseMetrics(cfg, client, &extracted.Summary, nil, startedAt), err)
		logger.Fatal(err)
	}
	metrics := baseMetrics(cfg, client, &extracted.Summary, map[string]any{
		"thread_customer_mappings_created": len(threadMappings),
	}, startedAt)
	if err := load.SaveSuccess(ctx, cfg, runState.ETLRunID, metrics, extracted.Tags, conversationDays, threadMappings); err != nil {
		failRun(logger, ctx, cfg, runState.ETLRunID, metrics, err)
		logger.Fatal(err)
	}

	logger.Printf(
		"etl complete: etl_run_id=%s page_id=%s target_date=%s tags=%d conversations_scanned=%d conversation_days=%d message_pages=%d messages_seen=%d messages_selected=%d",
		runState.ETLRunID,
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
		"target_date":             cfg.BusinessDay.Format(time.DateOnly),
		"run_mode":                cfg.RunMode,
		"snapshot_version":        cfg.SnapshotVersion,
		"is_published":            cfg.IsPublished,
		"started_at":              startedAt.Format(time.RFC3339Nano),
		"pancake_api":             client.Metrics(),
		"business_timezone":       cfg.BusinessTimezone,
		"window_start_at":         windowStart.Format(time.RFC3339Nano),
		"window_end_exclusive_at": windowEnd.Format(time.RFC3339Nano),
	}
	if summary != nil {
		metrics["tags_loaded"] = summary.TagsLoaded
		metrics["conversations_scanned"] = summary.ConversationsScanned
		metrics["conversation_days_built"] = summary.ConversationDaysBuilt
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
	etlRunID string,
	metrics map[string]any,
	runErr error,
) {
	if err := load.SaveFailure(ctx, cfg, etlRunID, metrics, runErr); err != nil {
		logger.Printf("failed to persist etl_run failure state for %s: %v", etlRunID, err)
	}
}

func applyFlags(cfg *config.Config) error {
	databaseURL := flag.String("database-url", cfg.DatabaseURL, "PostgreSQL connection string for direct Seam 1 load")
	jobFile := flag.String("job-file", "", "Path to a JSON job payload emitted by backend orchestration")
	jobJSON := flag.String("job-json", "", "Inline JSON job payload emitted by backend orchestration")
	userAccessToken := flag.String("user-access-token", "", "Pancake user access token for local/manual runs")
	pageID := flag.String("page-id", "", "Pancake page ID to fetch")
	targetDate := flag.String("target-date", "", "Target date to extract in YYYY-MM-DD")
	businessDay := flag.String("business-day", "", "Deprecated alias for -target-date")
	businessTimezone := flag.String("business-timezone", cfg.BusinessTimezone, "IANA timezone used to interpret the target date")
	runMode := flag.String("run-mode", cfg.RunMode, "Run mode for etl_run metadata")
	runGroupID := flag.String("run-group-id", "", "Optional run group ID for manual ranges")
	snapshotVersion := flag.Int("snapshot-version", cfg.SnapshotVersion, "Snapshot version for this target date")
	isPublished := flag.Bool("publish", false, "Whether this run should be marked published")
	windowStartAt := flag.String("window-start-at", "", "Optional RFC3339 window start inside the target-date bucket")
	windowEndExclusiveAt := flag.String("window-end-exclusive-at", "", "Optional RFC3339 window end exclusive inside the target-date bucket")
	requestedWindowStartAt := flag.String("requested-window-start-at", "", "Optional RFC3339 requested window start for audit metadata")
	requestedWindowEndExclusiveAt := flag.String("requested-window-end-exclusive-at", "", "Optional RFC3339 requested window end for audit metadata")
	maxConversations := flag.Int("max-conversations", 0, "Optional conversation cap for debug or onboarding runs (0 means no limit)")
	maxMessagePages := flag.Int("max-message-pages", 0, "Optional message page cap per conversation (0 means no limit)")

	flag.Parse()

	cfg.DatabaseURL = *databaseURL

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
		UserAccessToken:                *userAccessToken,
		PageID:                         *pageID,
		TargetDate:                     targetDateValue,
		BusinessTimezone:               *businessTimezone,
		RunMode:                        *runMode,
		RunGroupID:                     *runGroupID,
		SnapshotVersion:                *snapshotVersion,
		IsPublished:                    *isPublished,
		MaxConversations:               *maxConversations,
		MaxMessagePagesPerConversation: *maxMessagePages,
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
