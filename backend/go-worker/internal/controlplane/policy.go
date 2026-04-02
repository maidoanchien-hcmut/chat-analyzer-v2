package controlplane

type RuntimeConfig struct {
	TagRules          []TagRule
	OpeningRules      []OpeningRule
	CustomerDirectory []CustomerDirectoryEntry
	BotSignatures     []BotSignature
}

type TagRule struct {
	Name         string         `json:"name"`
	MatchAnyText []string       `json:"match_any_text"`
	Signals      map[string]any `json:"signals"`
	Noise        bool           `json:"noise"`
}

type OpeningRule struct {
	Name         string         `json:"name"`
	MatchAnyText []string       `json:"match_any_text"`
	Signals      map[string]any `json:"signals"`
}

type CustomerDirectoryEntry struct {
	CustomerID string `json:"customer_id"`
	PhoneE164  string `json:"phone_e164"`
}

type BotSignature struct {
	Name              string `json:"name"`
	AdminNameContains string `json:"admin_name_contains"`
	AppID             *int64 `json:"app_id"`
	FlowID            *int64 `json:"flow_id"`
}
