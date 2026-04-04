package controlplane

type RuntimeConfig struct {
	TagMapping   TagMappingConfig   `json:"tag_mapping"`
	OpeningRules OpeningRulesConfig `json:"opening_rules"`
}

type TagMappingConfig struct {
	Version     int               `json:"version"`
	DefaultRole string            `json:"default_role"`
	Entries     []TagMappingEntry `json:"entries"`
}

type TagMappingEntry struct {
	SourceTagID   string `json:"source_tag_id"`
	SourceTagText string `json:"source_tag_text"`
	Role          string `json:"role"`
	CanonicalCode string `json:"canonical_code"`
	MappingSource string `json:"mapping_source"`
	Status        string `json:"status"`
}

type OpeningRulesConfig struct {
	Version   int               `json:"version"`
	Selectors []OpeningSelector `json:"selectors"`
}

type OpeningSelector struct {
	SelectorID          string          `json:"selector_id"`
	SignalRole          string          `json:"signal_role"`
	SignalCode          string          `json:"signal_code"`
	AllowedMessageTypes []string        `json:"allowed_message_types"`
	Options             []OpeningOption `json:"options"`
}

type OpeningOption struct {
	RawText   string `json:"raw_text"`
	MatchMode string `json:"match_mode"`
}

type SchedulerConfig struct {
	Version                 int    `json:"version"`
	Timezone                string `json:"timezone"`
	OfficialDailyTime       string `json:"official_daily_time"`
	LookbackHours           int    `json:"lookback_hours"`
	MaxConversationsPerRun  int    `json:"max_conversations_per_run"`
	MaxMessagePagesPerThread int   `json:"max_message_pages_per_thread"`
}
