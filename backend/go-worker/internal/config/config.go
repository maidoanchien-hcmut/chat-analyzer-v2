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

func DefaultBusinessTimezone() string {
	return defaultBusinessTimezone
}

type Config struct {
	UserAccessToken                string
	DatabaseURL                    string
	PageID                         string
	BusinessDay                    time.Time
	BusinessTimezone               string
	RunMode                        string
	RunGroupID                     string
	SnapshotVersion                int
	IsPublished                    bool
	RequestedWindowStartAt         *time.Time
	RequestedWindowEndExclusiveAt  *time.Time
	WindowStartAt                  *time.Time
	WindowEndExclusiveAt           *time.Time
	MaxConversations               int
	MaxMessagePagesPerConversation int
	RequestTimeout                 time.Duration
}

func Load() (Config, error) {
	if err := loadDotEnv(".env"); err != nil {
		return Config{}, err
	}

	timeoutSeconds, err := intEnvWithFallback("WORKER_REQUEST_TIMEOUT_SECONDS", []string{"PANCAKE_REQUEST_TIMEOUT_SECONDS"}, 30)
	if err != nil {
		return Config{}, err
	}

	return Config{
		DatabaseURL:      strings.TrimSpace(os.Getenv("DATABASE_URL")),
		BusinessTimezone: defaultBusinessTimezone,
		RunMode:          "scheduled_daily",
		SnapshotVersion:  1,
		RequestTimeout:   time.Duration(timeoutSeconds) * time.Second,
	}, nil
}

func (c Config) Validate() error {
	if c.UserAccessToken == "" {
		return errors.New("PANCAKE_USER_ACCESS_TOKEN is required")
	}
	if c.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	if c.BusinessDay.IsZero() {
		return errors.New("PANCAKE_BUSINESS_DAY is required")
	}
	if c.RunMode == "" {
		return errors.New("PANCAKE_RUN_MODE is required")
	}
	if c.SnapshotVersion <= 0 {
		return errors.New("PANCAKE_SNAPSHOT_VERSION must be >= 1")
	}
	if c.MaxConversations < 0 {
		return errors.New("PANCAKE_MAX_CONVERSATIONS must be >= 0")
	}
	if c.MaxMessagePagesPerConversation < 0 {
		return errors.New("PANCAKE_MAX_MESSAGE_PAGES_PER_CONVERSATION must be >= 0")
	}
	windowStart, windowEnd := c.EffectiveWindow()
	if !windowStart.Before(windowEnd) {
		return errors.New("effective window must satisfy start < end")
	}
	dayStart, dayEnd := c.BusinessWindow()
	if windowStart.Before(dayStart) || windowEnd.After(dayEnd) {
		return errors.New("effective window must stay inside the business-day bucket")
	}
	if c.RequestedWindowStartAt != nil && c.RequestedWindowEndExclusiveAt != nil && !c.RequestedWindowStartAt.Before(*c.RequestedWindowEndExclusiveAt) {
		return errors.New("requested window must satisfy start < end")
	}
	if c.IsPublished && (windowStart != dayStart || windowEnd != dayEnd) {
		return errors.New("partial-day runs cannot be published")
	}
	return nil
}

func (c Config) BusinessWindow() (time.Time, time.Time) {
	return c.BusinessDay, c.BusinessDay.AddDate(0, 0, 1)
}

func (c Config) EffectiveWindow() (time.Time, time.Time) {
	start, end := c.BusinessWindow()
	if c.WindowStartAt != nil {
		start = *c.WindowStartAt
	}
	if c.WindowEndExclusiveAt != nil {
		end = *c.WindowEndExclusiveAt
	}
	return start, end
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

func intEnvWithFallback(primary string, aliases []string, defaultValue int) (int, error) {
	keys := append([]string{primary}, aliases...)
	for _, key := range keys {
		value := strings.TrimSpace(os.Getenv(key))
		if value == "" {
			continue
		}
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", key)
		}
		return parsed, nil
	}
	return defaultValue, nil
}
