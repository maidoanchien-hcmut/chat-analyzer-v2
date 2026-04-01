package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/samples"
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

	outputDir, err := filepath.Abs(cfg.OutputDir)
	if err != nil {
		logger.Fatal(err)
	}

	writer, err := samples.NewRunWriter(outputDir)
	if err != nil {
		logger.Fatal(err)
	}

	client := pancake.NewClient(cfg.UserAccessToken, cfg.RequestTimeout)
	ctx := context.Background()

	pagesRaw, pages, err := client.ListPages(ctx)
	if err != nil {
		logger.Fatal(err)
	}
	if err := writer.WriteJSON("pages/list_pages.json", pagesRaw); err != nil {
		logger.Fatal(err)
	}

	pageID, err := resolvePageID(cfg.PageID, pages)
	if err != nil {
		logger.Fatal(err)
	}

	pageTokenRaw, pageAccessToken, err := client.GeneratePageAccessToken(ctx, pageID)
	if err != nil {
		logger.Fatal(err)
	}
	if err := writer.WriteJSON("pages/generate_page_access_token.json", pageTokenRaw); err != nil {
		logger.Fatal(err)
	}

	logger.Printf("using page_id=%s", pageID)

	if cfg.FetchTags {
		tagsRaw, err := client.ListTags(ctx, pageID, pageAccessToken)
		if err != nil {
			logger.Fatal(err)
		}
		if err := writer.WriteJSON("pages/tags.json", tagsRaw); err != nil {
			logger.Fatal(err)
		}
	}

	if cfg.FetchPageCustomers {
		for pageNumber := range cfg.MaxCustomerPages {
			raw, count, err := client.ListPageCustomers(ctx, pancake.PageCustomersRequest{
				PageID:          pageID,
				PageAccessToken: pageAccessToken,
				Since:           *cfg.Since,
				Until:           *cfg.Until,
				PageNumber:      pageNumber + 1,
				PageSize:        100,
			})
			if err != nil {
				logger.Fatal(err)
			}
			path := fmt.Sprintf("pages/page_customers/page_%03d.json", pageNumber+1)
			if err := writer.WriteJSON(path, raw); err != nil {
				logger.Fatal(err)
			}
			if count == 0 || count < 100 {
				break
			}
		}
	}

	var (
		lastConversationID string
		conversationCount  int
		messagePageCount   int
		messageCount       int
	)

	for conversationCount < cfg.MaxConversations {
		raw, conversations, err := client.ListConversations(ctx, pancake.ConversationsRequest{
			PageID:             pageID,
			PageAccessToken:    pageAccessToken,
			Since:              cfg.Since,
			Until:              cfg.Until,
			LastConversationID: lastConversationID,
		})
		if err != nil {
			logger.Fatal(err)
		}

		pageIndex := (conversationCount / 60) + 1
		path := fmt.Sprintf("conversations/list_conversations_page_%03d.json", pageIndex)
		if err := writer.WriteJSON(path, raw); err != nil {
			logger.Fatal(err)
		}

		if len(conversations) == 0 {
			break
		}

		for _, conversation := range conversations {
			if conversationCount >= cfg.MaxConversations {
				break
			}

			conversationCount++
			if !cfg.FetchMessages {
				continue
			}

			currentCount := 0
			pageNumber := 1
			for {
				if pageNumber > cfg.MaxMessagePagesPerConversation {
					break
				}

				raw, messages, err := client.ListMessages(ctx, pancake.MessagesRequest{
					PageID:          pageID,
					PageAccessToken: pageAccessToken,
					ConversationID:  conversation.ID,
					CurrentCount:    currentCount,
				})
				if err != nil {
					logger.Fatal(err)
				}

				path := fmt.Sprintf(
					"messages/%s/page_%03d.json",
					samples.SafeName(conversation.ID),
					pageNumber,
				)
				if err := writer.WriteJSON(path, raw); err != nil {
					logger.Fatal(err)
				}

				messagePageCount++
				messageCount += len(messages)
				if len(messages) < 30 {
					break
				}
				currentCount += len(messages)
				pageNumber++
			}
		}

		lastConversationID = conversations[len(conversations)-1].ID
		if len(conversations) < 60 {
			break
		}
	}

	summary := map[string]any{
		"page_id":             pageID,
		"conversations_saved": conversationCount,
		"message_pages_saved": messagePageCount,
		"messages_saved":      messageCount,
		"output_dir":          writer.Root(),
	}
	if err := writer.WriteStructured("run_summary.json", summary); err != nil {
		logger.Fatal(err)
	}

	logger.Printf("sample extraction complete: output=%s conversations=%d message_pages=%d messages=%d", writer.Root(), conversationCount, messagePageCount, messageCount)
}

func applyFlags(cfg *config.Config) error {
	pageID := flag.String("page-id", cfg.PageID, "Pancake page ID to fetch")
	maxConversations := flag.Int("max-conversations", cfg.MaxConversations, "Maximum number of conversations to fetch")
	maxCustomerPages := flag.Int("max-customer-pages", cfg.MaxCustomerPages, "Maximum number of page_customer pages to fetch")
	maxMessagePages := flag.Int("max-message-pages", cfg.MaxMessagePagesPerConversation, "Maximum message pages to fetch per conversation")
	outputDir := flag.String("out", cfg.OutputDir, "Directory to write raw API samples to")
	fetchMessages := flag.Bool("fetch-messages", cfg.FetchMessages, "Fetch conversation messages")
	fetchTags := flag.Bool("fetch-tags", cfg.FetchTags, "Fetch page tags")
	fetchPageCustomers := flag.Bool("fetch-page-customers", cfg.FetchPageCustomers, "Fetch page customers")

	flag.Parse()

	if *maxConversations < 1 {
		return errors.New("max-conversations must be >= 1")
	}
	if *maxCustomerPages < 1 {
		return errors.New("max-customer-pages must be >= 1")
	}
	if *maxMessagePages < 1 {
		return errors.New("max-message-pages must be >= 1")
	}

	cfg.PageID = *pageID
	cfg.MaxConversations = *maxConversations
	cfg.MaxCustomerPages = *maxCustomerPages
	cfg.MaxMessagePagesPerConversation = *maxMessagePages
	cfg.OutputDir = *outputDir
	cfg.FetchMessages = *fetchMessages
	cfg.FetchTags = *fetchTags
	cfg.FetchPageCustomers = *fetchPageCustomers
	return nil
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
