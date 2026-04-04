package extract

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

const (
	conversationPageSize = 60
	messagePageSize      = 30
)

type PancakeClient interface {
	ListPages(ctx context.Context) ([]pancake.Page, error)
	GeneratePageAccessToken(ctx context.Context, pageID string) (string, error)
	ListTags(ctx context.Context, pageID, pageAccessToken string) ([]pancake.Tag, error)
	ListConversations(ctx context.Context, req pancake.ConversationsRequest) ([]pancake.Conversation, error)
	ListMessages(ctx context.Context, req pancake.MessagesRequest) (pancake.MessagesPage, error)
}

type Result struct {
	PageID           string
	BusinessTimezone string
	Window           DayWindow
	Summary          Summary
	ConversationDays []ConversationDayCandidate
	Tags             []pancake.Tag
}

type Summary struct {
	PageID                string
	BusinessDay           string
	TagsLoaded            int
	ConversationsScanned  int
	ConversationDaysBuilt int
	MessagePagesFetched   int
	MessagesSeen          int
	MessagesSelected      int
}

type ConversationDayCandidate struct {
	PageID                 string
	Conversation           pancake.Conversation
	BusinessDay            string
	MessageContext         pancake.MessageContext
	Messages               []pancake.Message
	MessagesSeenFromSource int
}

func Run(ctx context.Context, cfg config.Config, client PancakeClient) (Result, error) {
	windowStart, windowEnd := cfg.EffectiveWindow()
	window := DayWindow{
		Start:        windowStart,
		EndExclusive: windowEnd,
	}

	pageID := cfg.PageID
	if pageID == "" {
		pages, err := client.ListPages(ctx)
		if err != nil {
			return Result{}, fmt.Errorf("list pages: %w", err)
		}

		resolvedPageID, err := resolvePageID(cfg.PageID, pages)
		if err != nil {
			return Result{}, err
		}
		pageID = resolvedPageID
	}

	pageAccessToken, err := client.GeneratePageAccessToken(ctx, pageID)
	if err != nil {
		return Result{}, fmt.Errorf("generate page access token for %s: %w", pageID, err)
	}

	tags, err := client.ListTags(ctx, pageID, pageAccessToken)
	if err != nil {
		return Result{}, fmt.Errorf("list tags for %s: %w", pageID, err)
	}

	result := Result{
		PageID:           pageID,
		BusinessTimezone: cfg.BusinessTimezone,
		Window:           window,
		Summary: Summary{
			PageID:      pageID,
			BusinessDay: cfg.BusinessDay.Format(time.DateOnly),
			TagsLoaded:  len(tags),
		},
		Tags: tags,
	}

	since := windowStart.Unix()
	until := windowEnd.Unix()
	lastConversationID := ""

	for !limitReached(cfg.MaxConversations, result.Summary.ConversationsScanned) {
		conversations, err := client.ListConversations(ctx, pancake.ConversationsRequest{
			PageID:             pageID,
			PageAccessToken:    pageAccessToken,
			Since:              &since,
			Until:              &until,
			LastConversationID: lastConversationID,
		})
		if err != nil {
			return Result{}, fmt.Errorf("list conversations for %s: %w", pageID, err)
		}
		if len(conversations) == 0 {
			break
		}

		for _, conversation := range conversations {
			if limitReached(cfg.MaxConversations, result.Summary.ConversationsScanned) {
				break
			}

			result.Summary.ConversationsScanned++
			candidate, stats, err := buildConversationDay(ctx, client, cfg, pageID, pageAccessToken, conversation, window)
			if err != nil {
				return Result{}, err
			}

			result.Summary.MessagePagesFetched += stats.PagesFetched
			result.Summary.MessagesSeen += stats.MessagesSeen
			result.Summary.MessagesSelected += len(candidate.Messages)

			if len(candidate.Messages) == 0 {
				continue
			}

			result.Summary.ConversationDaysBuilt++
			result.ConversationDays = append(result.ConversationDays, candidate)
		}

		lastConversationID = conversations[len(conversations)-1].ID
		if len(conversations) < conversationPageSize {
			break
		}
	}

	return result, nil
}

type conversationDayStats struct {
	PagesFetched int
	MessagesSeen int
}

func buildConversationDay(
	ctx context.Context,
	client PancakeClient,
	cfg config.Config,
	pageID string,
	pageAccessToken string,
	conversation pancake.Conversation,
	window DayWindow,
) (ConversationDayCandidate, conversationDayStats, error) {
	candidate := ConversationDayCandidate{
		PageID:       pageID,
		Conversation: conversation,
		BusinessDay:  window.Start.Format(time.DateOnly),
	}

	stats := conversationDayStats{}
	currentCount := 0

	for pageNumber := 0; !limitReached(cfg.MaxMessagePagesPerConversation, pageNumber); pageNumber++ {
		page, err := client.ListMessages(ctx, pancake.MessagesRequest{
			PageID:          pageID,
			PageAccessToken: pageAccessToken,
			ConversationID:  conversation.ID,
			CurrentCount:    currentCount,
		})
		if err != nil {
			return ConversationDayCandidate{}, conversationDayStats{}, fmt.Errorf(
				"list messages for conversation %s page %d: %w",
				conversation.ID,
				pageNumber+1,
				err,
			)
		}

		stats.PagesFetched++
		stats.MessagesSeen += len(page.Messages)
		candidate.MessagesSeenFromSource += len(page.Messages)
		mergeMessageContext(&candidate.MessageContext, page)

		pageWindow, err := FilterMessagePage(page.Messages, window)
		if err != nil {
			return ConversationDayCandidate{}, conversationDayStats{}, fmt.Errorf(
				"filter message window for conversation %s page %d: %w",
				conversation.ID,
				pageNumber+1,
				err,
			)
		}

		candidate.Messages = append(candidate.Messages, pageWindow.Messages...)

		if len(page.Messages) < messagePageSize || pageWindow.StopPaging {
			break
		}

		currentCount += len(page.Messages)
	}

	return candidate, stats, nil
}

func resolvePageID(pageID string, pages []pancake.Page) (string, error) {
	if pageID != "" {
		return pageID, nil
	}
	if len(pages) == 1 {
		return pages[0].ID, nil
	}
	if len(pages) == 0 {
		return "", errors.New("no Pancake pages were returned for this access token")
	}

	return "", fmt.Errorf("page_id is required because access token can see %d pages", len(pages))
}

func limitReached(limit, current int) bool {
	return limit > 0 && current >= limit
}

func mergeMessageContext(target *pancake.MessageContext, page pancake.MessagesPage) {
	if target == nil {
		return
	}

	target.Activities = appendUniqueActivities(target.Activities, page.Activities...)
	target.AdClicks = appendUniqueSourceRefs(target.AdClicks, flattenAdClicks(page.AdClicks)...)
	target.ConvPhoneNumbers = appendUniqueStrings(target.ConvPhoneNumbers, page.ConvPhoneNumbers...)
	target.AvailableForReportPhoneNumbers = appendUniqueStrings(
		target.AvailableForReportPhoneNumbers,
		page.AvailableForReportPhoneNumbers...,
	)
	target.ConvRecentPhoneNumbers = appendUniqueRecentPhones(target.ConvRecentPhoneNumbers, page.ConvRecentPhoneNumbers...)
	target.Customers = appendUniqueCustomers(target.Customers, page.Customers...)
}

func appendUniqueStrings(existing []string, values ...string) []string {
	seen := make(map[string]struct{}, len(existing))
	for _, value := range existing {
		seen[value] = struct{}{}
	}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		existing = append(existing, value)
	}
	return existing
}

func appendUniqueRecentPhones(existing []pancake.RecentPhoneNumber, values ...pancake.RecentPhoneNumber) []pancake.RecentPhoneNumber {
	seen := make(map[string]struct{}, len(existing))
	for _, value := range existing {
		seen[value.PhoneNumber] = struct{}{}
	}
	for _, value := range values {
		if value.PhoneNumber == "" {
			continue
		}
		if _, ok := seen[value.PhoneNumber]; ok {
			continue
		}
		seen[value.PhoneNumber] = struct{}{}
		existing = append(existing, value)
	}
	return existing
}

func appendUniqueCustomers(existing []pancake.CustomerProfile, values ...pancake.CustomerProfile) []pancake.CustomerProfile {
	seen := make(map[string]struct{}, len(existing))
	for _, value := range existing {
		seen[value.ID] = struct{}{}
	}
	for _, value := range values {
		if value.ID == "" {
			continue
		}
		if _, ok := seen[value.ID]; ok {
			continue
		}
		seen[value.ID] = struct{}{}
		existing = append(existing, value)
	}
	return existing
}

func appendUniqueActivities(existing []pancake.Activity, values ...pancake.Activity) []pancake.Activity {
	seen := make(map[string]struct{}, len(existing))
	for _, value := range existing {
		seen[sourceActivityKey(value)] = struct{}{}
	}
	for _, value := range values {
		key := sourceActivityKey(value)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		existing = append(existing, value)
	}
	return existing
}

func appendUniqueSourceRefs(existing []pancake.SourceRef, values ...pancake.SourceRef) []pancake.SourceRef {
	seen := make(map[string]struct{}, len(existing))
	for _, value := range existing {
		seen[sourceRefKey(value)] = struct{}{}
	}
	for _, value := range values {
		key := sourceRefKey(value)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		existing = append(existing, value)
	}
	return existing
}

func flattenAdClicks(values map[string][]pancake.SourceRef) []pancake.SourceRef {
	if len(values) == 0 {
		return nil
	}

	flattened := make([]pancake.SourceRef, 0)
	for _, items := range values {
		flattened = append(flattened, items...)
	}
	slices.SortFunc(flattened, func(left, right pancake.SourceRef) int {
		if left.InsertedAt != right.InsertedAt {
			if left.InsertedAt < right.InsertedAt {
				return -1
			}
			return 1
		}
		if left.PostID != right.PostID {
			if left.PostID < right.PostID {
				return -1
			}
			return 1
		}
		if left.AdID != right.AdID {
			if left.AdID < right.AdID {
				return -1
			}
			return 1
		}
		return 0
	})
	return flattened
}

func sourceActivityKey(value pancake.Activity) string {
	postID := value.PostID
	if postID == "" {
		postID = value.AdsContextData.PostID
	}
	return value.Type + "|" + value.AdID + "|" + postID + "|" + value.InsertedAt
}

func sourceRefKey(value pancake.SourceRef) string {
	return value.AdID + "|" + value.PostID + "|" + value.InsertedAt
}
