package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"os"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/extract"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func main() {
	logger := log.New(os.Stdout, "pancake-extract: ", log.LstdFlags)

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

	client := pancake.NewClient(cfg.UserAccessToken, cfg.RequestTimeout)
	result, err := extract.Run(context.Background(), cfg, client)
	if err != nil {
		logger.Fatal(err)
	}

	logger.Printf(
		"extract complete: page_id=%s business_day=%s tags=%d conversations_scanned=%d conversation_days=%d message_pages=%d messages_seen=%d messages_selected=%d",
		result.Summary.PageID,
		result.Summary.BusinessDay,
		result.Summary.TagsLoaded,
		result.Summary.ConversationsScanned,
		result.Summary.ConversationDaysBuilt,
		result.Summary.MessagePagesFetched,
		result.Summary.MessagesSeen,
		result.Summary.MessagesSelected,
	)
}

func applyFlags(cfg *config.Config) error {
	defaultBusinessDay := ""
	if !cfg.BusinessDay.IsZero() {
		defaultBusinessDay = cfg.BusinessDay.Format(time.DateOnly)
	}

	pageID := flag.String("page-id", cfg.PageID, "Pancake page ID to fetch")
	businessDay := flag.String("business-day", defaultBusinessDay, "Business day to extract in YYYY-MM-DD")
	businessTimezone := flag.String("business-timezone", cfg.BusinessTimezone, "IANA timezone used to interpret the business day")
	maxConversations := flag.Int("max-conversations", cfg.MaxConversations, "Optional conversation cap for debug runs (0 means no limit)")
	maxMessagePages := flag.Int("max-message-pages", cfg.MaxMessagePagesPerConversation, "Optional message page cap per conversation (0 means no limit)")

	flag.Parse()

	if *maxConversations < 0 {
		return errors.New("max-conversations must be >= 0")
	}
	if *maxMessagePages < 0 {
		return errors.New("max-message-pages must be >= 0")
	}

	parsedBusinessDay, err := config.ParseBusinessDay(*businessDay, *businessTimezone)
	if err != nil {
		return err
	}

	cfg.PageID = *pageID
	cfg.BusinessTimezone = *businessTimezone
	cfg.BusinessDay = parsedBusinessDay
	cfg.MaxConversations = *maxConversations
	cfg.MaxMessagePagesPerConversation = *maxMessagePages
	return nil
}
