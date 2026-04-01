package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	UserAccessToken                string
	PageID                         string
	Since                          *int64
	Until                          *int64
	MaxConversations               int
	MaxCustomerPages               int
	MaxMessagePagesPerConversation int
	FetchTags                      bool
	FetchPageCustomers             bool
	FetchMessages                  bool
	OutputDir                      string
	RequestTimeout                 time.Duration
}

func Load() (Config, error) {
	if err := loadDotEnv(".env"); err != nil {
		return Config{}, err
	}

	since, err := optionalTimestamp("PANCAKE_SINCE")
	if err != nil {
		return Config{}, err
	}
	until, err := optionalTimestamp("PANCAKE_UNTIL")
	if err != nil {
		return Config{}, err
	}

	timeoutSeconds, err := intEnv("PANCAKE_REQUEST_TIMEOUT_SECONDS", 30)
	if err != nil {
		return Config{}, err
	}
	maxConversations, err := intEnv("PANCAKE_MAX_CONVERSATIONS", 5)
	if err != nil {
		return Config{}, err
	}
	maxCustomerPages, err := intEnv("PANCAKE_MAX_CUSTOMER_PAGES", 1)
	if err != nil {
		return Config{}, err
	}
	maxMessagePagesPerConversation, err := intEnv("PANCAKE_MAX_MESSAGE_PAGES_PER_CONVERSATION", 2)
	if err != nil {
		return Config{}, err
	}
	fetchTags, err := boolEnv("PANCAKE_FETCH_TAGS", true)
	if err != nil {
		return Config{}, err
	}
	fetchPageCustomers, err := boolEnv("PANCAKE_FETCH_PAGE_CUSTOMERS", true)
	if err != nil {
		return Config{}, err
	}
	fetchMessages, err := boolEnv("PANCAKE_FETCH_MESSAGES", true)
	if err != nil {
		return Config{}, err
	}

	outputDir := os.Getenv("PANCAKE_OUTPUT_DIR")
	if outputDir == "" {
		outputDir = filepath.Clean(filepath.Join("..", "..", "docs", "pancake-api-samples"))
	}

	return Config{
		UserAccessToken:                strings.TrimSpace(os.Getenv("PANCAKE_USER_ACCESS_TOKEN")),
		PageID:                         strings.TrimSpace(os.Getenv("PANCAKE_PAGE_ID")),
		Since:                          since,
		Until:                          until,
		MaxConversations:               maxConversations,
		MaxCustomerPages:               maxCustomerPages,
		MaxMessagePagesPerConversation: maxMessagePagesPerConversation,
		FetchTags:                      fetchTags,
		FetchPageCustomers:             fetchPageCustomers,
		FetchMessages:                  fetchMessages,
		OutputDir:                      outputDir,
		RequestTimeout:                 time.Duration(timeoutSeconds) * time.Second,
	}, nil
}

func (c Config) Validate() error {
	if c.UserAccessToken == "" {
		return errors.New("PANCAKE_USER_ACCESS_TOKEN is required")
	}
	if c.FetchPageCustomers && (c.Since == nil || c.Until == nil) {
		return errors.New("PANCAKE_SINCE and PANCAKE_UNTIL are required when PANCAKE_FETCH_PAGE_CUSTOMERS=true")
	}
	if c.Since != nil && c.Until != nil && *c.Since > *c.Until {
		return errors.New("PANCAKE_SINCE must be <= PANCAKE_UNTIL")
	}
	return nil
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("invalid .env line: %q", line)
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			return fmt.Errorf("invalid .env key in line: %q", line)
		}
		if _, exists := os.LookupEnv(key); !exists {
			if err := os.Setenv(key, value); err != nil {
				return fmt.Errorf("set env %s: %w", key, err)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan %s: %w", path, err)
	}
	return nil
}

func optionalTimestamp(key string) (*int64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return nil, nil
	}
	parsed, err := parseTimestamp(value)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", key, err)
	}
	return &parsed, nil
}

func parseTimestamp(value string) (int64, error) {
	if unix, err := strconv.ParseInt(value, 10, 64); err == nil {
		return unix, nil
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if ts, err := time.Parse(layout, value); err == nil {
			return ts.Unix(), nil
		}
	}

	return 0, fmt.Errorf("unsupported timestamp format %q", value)
}

func intEnv(key string, defaultValue int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return parsed, nil
}

func boolEnv(key string, defaultValue bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean", key)
	}
	return parsed, nil
}
