package pancake

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

const (
	userAPIBase  = "https://pages.fm/api/v1"
	publicV1Base = "https://pages.fm/api/public_api/v1"
	publicV2Base = "https://pages.fm/api/public_api/v2"
	defaultUA    = "chat-analyzer-v2-pancake-extractor/0.1"
)

type Client struct {
	userAccessToken string
	httpClient      *http.Client
}

func NewClient(userAccessToken string, timeout time.Duration) *Client {
	return &Client{
		userAccessToken: userAccessToken,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) ListPages(ctx context.Context) ([]Page, error) {
	query := url.Values{}
	query.Set("access_token", c.userAccessToken)

	raw, err := c.do(ctx, http.MethodGet, userAPIBase, "/pages", query)
	if err != nil {
		return nil, err
	}

	var response listPagesResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("decode list pages response: %w", err)
	}
	return response.Pages, nil
}

func (c *Client) GeneratePageAccessToken(ctx context.Context, pageID string) (string, error) {
	query := url.Values{}
	query.Set("page_id", pageID)
	query.Set("access_token", c.userAccessToken)

	raw, err := c.do(ctx, http.MethodPost, userAPIBase, "/pages/"+pageID+"/generate_page_access_token", query)
	if err != nil {
		return "", err
	}

	token, err := extractToken(raw)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (c *Client) ListConversations(ctx context.Context, req ConversationsRequest) ([]Conversation, error) {
	query := url.Values{}
	query.Set("page_access_token", req.PageAccessToken)
	if req.LastConversationID != "" {
		query.Set("last_conversation_id", req.LastConversationID)
	}
	if req.Since != nil {
		query.Set("since", strconv.FormatInt(*req.Since, 10))
	}
	if req.Until != nil {
		query.Set("until", strconv.FormatInt(*req.Until, 10))
	}

	raw, err := c.do(ctx, http.MethodGet, publicV2Base, "/pages/"+req.PageID+"/conversations", query)
	if err != nil {
		return nil, err
	}

	var response listConversationsResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("decode conversations response: %w", err)
	}
	return response.Conversations, nil
}

func (c *Client) ListMessages(ctx context.Context, req MessagesRequest) ([]json.RawMessage, error) {
	query := url.Values{}
	query.Set("page_access_token", req.PageAccessToken)
	if req.CurrentCount > 0 {
		query.Set("current_count", strconv.Itoa(req.CurrentCount))
	}

	raw, err := c.do(ctx, http.MethodGet, publicV1Base, "/pages/"+req.PageID+"/conversations/"+req.ConversationID+"/messages", query)
	if err != nil {
		return nil, err
	}

	var response listMessagesResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("decode messages response: %w", err)
	}
	return response.Messages, nil
}

func (c *Client) ListTags(ctx context.Context, pageID, pageAccessToken string) ([]Tag, error) {
	query := url.Values{}
	query.Set("page_access_token", pageAccessToken)

	raw, err := c.do(ctx, http.MethodGet, publicV1Base, "/pages/"+pageID+"/tags", query)
	if err != nil {
		return nil, err
	}

	var response listTagsResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("decode tags response: %w", err)
	}
	return response.Tags, nil
}

func (c *Client) do(ctx context.Context, method, baseURL, rawPath string, query url.Values) ([]byte, error) {
	endpoint, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	endpoint.Path = path.Clean(strings.TrimRight(endpoint.Path, "/") + rawPath)
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build request %s %s: %w", method, endpoint.String(), err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", defaultUA)

	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request %s %s: %w", method, endpoint.String(), err)
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body %s %s: %w", method, endpoint.String(), err)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("request %s %s failed with %d: %s", method, endpoint.String(), res.StatusCode, string(body))
	}

	return body, nil
}

func extractToken(raw []byte) (string, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return "", fmt.Errorf("generate page access token response was empty")
	}

	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}

	for _, key := range []string{"page_access_token", "access_token", "token"} {
		if token, ok := findStringField(generic, key); ok && token != "" {
			return token, nil
		}
	}

	return "", fmt.Errorf("could not find page access token in generate_page_access_token response")
}

func findStringField(value any, target string) (string, bool) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if strings.EqualFold(key, target) {
				if token, ok := child.(string); ok {
					return token, true
				}
			}
			if token, ok := findStringField(child, target); ok {
				return token, true
			}
		}
	case []any:
		for _, child := range typed {
			if token, ok := findStringField(child, target); ok {
				return token, true
			}
		}
	}
	return "", false
}
