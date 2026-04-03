package controlplane

type RuntimeConfig struct {
	TagRules          []TagRule
	OpeningRules      []OpeningRule
	CustomerDirectory []CustomerDirectoryEntry
}

type TagRule struct {
	Name         string         `json:"name"`
	MatchAnyText []string       `json:"match_any_text"`
	Signals      map[string]any `json:"signals"`
	Noise        bool           `json:"noise"`
}

type OpeningRule struct {
	Name         string         `json:"name"`
	MatchAllText []string       `json:"match_all_text"`
	MatchAnyText []string       `json:"match_any_text"`
	Signals      map[string]any `json:"signals"`
}

type CustomerDirectoryEntry struct {
	CustomerID string `json:"customer_id"`
	PhoneE164  string `json:"phone_e164"`
}
