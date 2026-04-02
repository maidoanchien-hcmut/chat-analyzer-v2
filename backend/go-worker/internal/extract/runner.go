package extract

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
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
	ListMessages(ctx context.Context, req pancake.MessagesRequest) ([]json.RawMessage, error)
}

type Result struct {
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
	PageID         string
	ConversationID string
	BusinessDay    string
	Messages       []json.RawMessage
}

func Run(ctx context.Context, cfg config.Config, client PancakeClient) (Result, error) {
	dayStart, dayEnd := cfg.BusinessWindow()
	window := transform.DayWindow{
		Start:        dayStart,
		EndExclusive: dayEnd,
	}

	pages, err := client.ListPages(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("list pages: %w", err)
	}

	pageID, err := resolvePageID(cfg.PageID, pages)
	if err != nil {
		return Result{}, err
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
		Summary: Summary{
			PageID:      pageID,
			BusinessDay: dayStart.Format(time.DateOnly),
			TagsLoaded:  len(tags),
		},
		Tags: tags,
	}

	since := dayStart.Unix()
	until := dayEnd.Add(-time.Second).Unix()
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
			candidate, stats, err := buildConversationDay(ctx, client, cfg, pageID, pageAccessToken, conversation.ID, window)
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
			result.ConversationDays = append(result.ConversationDays, ConversationDayCandidate{
				PageID:         pageID,
				ConversationID: conversation.ID,
				BusinessDay:    dayStart.Format(time.DateOnly),
				Messages:       candidate.Messages,
			})
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
	conversationID string,
	window transform.DayWindow,
) (ConversationDayCandidate, conversationDayStats, error) {
	candidate := ConversationDayCandidate{
		PageID:         pageID,
		ConversationID: conversationID,
		BusinessDay:    window.Start.Format(time.DateOnly),
	}

	stats := conversationDayStats{}
	currentCount := 0

	for pageNumber := 0; !limitReached(cfg.MaxMessagePagesPerConversation, pageNumber); pageNumber++ {
		messages, err := client.ListMessages(ctx, pancake.MessagesRequest{
			PageID:          pageID,
			PageAccessToken: pageAccessToken,
			ConversationID:  conversationID,
			CurrentCount:    currentCount,
		})
		if err != nil {
			return ConversationDayCandidate{}, conversationDayStats{}, fmt.Errorf(
				"list messages for conversation %s page %d: %w",
				conversationID,
				pageNumber+1,
				err,
			)
		}

		stats.PagesFetched++
		stats.MessagesSeen += len(messages)

		pageWindow, err := transform.FilterMessagePage(messages, window)
		if err != nil {
			return ConversationDayCandidate{}, conversationDayStats{}, fmt.Errorf(
				"filter message window for conversation %s page %d: %w",
				conversationID,
				pageNumber+1,
				err,
			)
		}

		candidate.Messages = append(candidate.Messages, pageWindow.Messages...)

		if len(messages) < messagePageSize || pageWindow.StopPaging {
			break
		}

		currentCount += len(messages)
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

	return "", fmt.Errorf("PANCAKE_PAGE_ID is required because access token can see %d pages", len(pages))
}

func limitReached(limit, current int) bool {
	return limit > 0 && current >= limit
}
