package controlplane

type RuntimeConfig struct {
	TagMapping        TagMappingConfig         `json:"tag_mapping"`
	OpeningRules      OpeningRulesConfig       `json:"opening_rules"`
	CustomerDirectory []CustomerDirectoryEntry `json:"customer_directory"`
}

type TagMappingConfig struct {
	DefaultSignal string            `json:"default_signal"`
	Entries       []TagMappingEntry `json:"entries"`
}

type TagMappingEntry struct {
	PancakeTagID string `json:"pancake_tag_id"`
	RawLabel     string `json:"raw_label"`
	Signal       string `json:"signal"`
}

type OpeningRulesConfig struct {
	Boundary  OpeningBoundary   `json:"boundary"`
	Selectors []OpeningSelector `json:"selectors"`
	Fallback  OpeningFallback   `json:"fallback"`
}

type OpeningBoundary struct {
	Mode        string `json:"mode"`
	MaxMessages int    `json:"max_messages"`
}

type OpeningSelector struct {
	Signal              string          `json:"signal"`
	AllowedMessageTypes []string        `json:"allowed_message_types"`
	Options             []OpeningOption `json:"options"`
}

type OpeningOption struct {
	RawText  string `json:"raw_text"`
	Decision string `json:"decision"`
}

type OpeningFallback struct {
	StoreCandidateIfUnmatched bool `json:"store_candidate_if_unmatched"`
}

type CustomerDirectoryEntry struct {
	CustomerID string `json:"customer_id"`
	PhoneE164  string `json:"phone_e164"`
}
