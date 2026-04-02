package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultBusinessTimezone = "Asia/Ho_Chi_Minh"

type Config struct {
	UserAccessToken                string
	PageID                         string
	BusinessDay                    time.Time
	BusinessTimezone               string
	MaxConversations               int
	MaxMessagePagesPerConversation int
	RequestTimeout                 time.Duration
}

func Load() (Config, error) {
	if err := loadDotEnv(".env"); err != nil {
		return Config{}, err
	}

	businessTimezone := strings.TrimSpace(os.Getenv("PANCAKE_BUSINESS_TIMEZONE"))
	if businessTimezone == "" {
		businessTimezone = defaultBusinessTimezone
	}

	var businessDay time.Time
	if rawBusinessDay := strings.TrimSpace(os.Getenv("PANCAKE_BUSINESS_DAY")); rawBusinessDay != "" {
		var err error
		businessDay, err = ParseBusinessDay(rawBusinessDay, businessTimezone)
		if err != nil {
			return Config{}, err
		}
	}

	timeoutSeconds, err := intEnv("PANCAKE_REQUEST_TIMEOUT_SECONDS", 30)
	if err != nil {
		return Config{}, err
	}
	maxConversations, err := intEnv("PANCAKE_MAX_CONVERSATIONS", 0)
	if err != nil {
		return Config{}, err
	}
	maxMessagePagesPerConversation, err := intEnv("PANCAKE_MAX_MESSAGE_PAGES_PER_CONVERSATION", 0)
	if err != nil {
		return Config{}, err
	}

	return Config{
		UserAccessToken:                strings.TrimSpace(os.Getenv("PANCAKE_USER_ACCESS_TOKEN")),
		PageID:                         strings.TrimSpace(os.Getenv("PANCAKE_PAGE_ID")),
		BusinessDay:                    businessDay,
		BusinessTimezone:               businessTimezone,
		MaxConversations:               maxConversations,
		MaxMessagePagesPerConversation: maxMessagePagesPerConversation,
		RequestTimeout:                 time.Duration(timeoutSeconds) * time.Second,
	}, nil
}

func (c Config) Validate() error {
	if c.UserAccessToken == "" {
		return errors.New("PANCAKE_USER_ACCESS_TOKEN is required")
	}
	if c.BusinessDay.IsZero() {
		return errors.New("PANCAKE_BUSINESS_DAY is required")
	}
	if c.MaxConversations < 0 {
		return errors.New("PANCAKE_MAX_CONVERSATIONS must be >= 0")
	}
	if c.MaxMessagePagesPerConversation < 0 {
		return errors.New("PANCAKE_MAX_MESSAGE_PAGES_PER_CONVERSATION must be >= 0")
	}
	return nil
}

func (c Config) BusinessWindow() (time.Time, time.Time) {
	return c.BusinessDay, c.BusinessDay.AddDate(0, 0, 1)
}

func ParseBusinessDay(value, timezone string) (time.Time, error) {
	timezone = strings.TrimSpace(timezone)
	if timezone == "" {
		timezone = defaultBusinessTimezone
	}

	location, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, fmt.Errorf("PANCAKE_BUSINESS_TIMEZONE: %w", err)
	}

	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("PANCAKE_BUSINESS_DAY is required")
	}

	businessDay, err := time.ParseInLocation(time.DateOnly, value, location)
	if err != nil {
		return time.Time{}, fmt.Errorf("PANCAKE_BUSINESS_DAY must use YYYY-MM-DD: %w", err)
	}
	return businessDay, nil
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
