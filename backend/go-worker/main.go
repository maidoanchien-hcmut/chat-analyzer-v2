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

	extracted, err := extract.Run(ctx, cfg, client)
	if err != nil {
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
	for _, candidate := range extracted.ConversationDays {
		conversationDay, err := transform.BuildConversationDay(
			window,
			candidate.Conversation,
			candidate.MessageContext,
			candidate.Messages,
			candidate.MessagesSeenFromSource,
			tagDictionary,
		)
		if err != nil {
			logger.Fatal(err)
		}
		conversationDays = append(conversationDays, conversationDay)
	}

	run := transform.Run{
		PageID:                        extracted.PageID,
		TargetDate:                    cfg.BusinessDay.Format(time.DateOnly),
		BusinessTimezone:              cfg.BusinessTimezone,
		RunMode:                       cfg.RunMode,
		RunGroupID:                    cfg.RunGroupID,
		SnapshotVersion:               cfg.SnapshotVersion,
		IsPublished:                   cfg.IsPublished,
		Window:                        window,
		RequestedWindowStartAt:        cfg.RequestedWindowStartAt,
		RequestedWindowEndExclusiveAt: cfg.RequestedWindowEndExclusiveAt,
		StartedAt:                     startedAt,
		FinishedAt:                    time.Now().UTC(),
		Tags:                          extracted.Tags,
		Summary: map[string]any{
			"page_id":                 extracted.Summary.PageID,
			"target_date":             cfg.BusinessDay.Format(time.DateOnly),
			"tags_loaded":             extracted.Summary.TagsLoaded,
			"conversations_scanned":   extracted.Summary.ConversationsScanned,
			"conversation_days_built": extracted.Summary.ConversationDaysBuilt,
			"message_pages_fetched":   extracted.Summary.MessagePagesFetched,
			"messages_seen":           extracted.Summary.MessagesSeen,
			"messages_selected":       extracted.Summary.MessagesSelected,
		},
		ConversationDays:       conversationDays,
		ThreadCustomerMappings: nil,
	}

	loadResult, err := load.Save(ctx, cfg, extracted.Summary, run.Tags, run.ConversationDays, run.ThreadCustomerMappings)
	if err != nil {
		logger.Fatal(err)
	}

	logger.Printf(
		"etl complete: etl_run_id=%s page_id=%s target_date=%s tags=%d conversations_scanned=%d conversation_days=%d message_pages=%d messages_seen=%d messages_selected=%d",
		loadResult.ETLRunID,
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
