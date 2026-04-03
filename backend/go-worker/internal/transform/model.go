package transform

import (
	"encoding/json"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

type Run struct {
	PageID                        string
	TargetDate                    string
	BusinessTimezone              string
	RunMode                       string
	RunGroupID                    string
	SnapshotVersion               int
	IsPublished                   bool
	Window                        DayWindow
	RequestedWindowStartAt        *time.Time
	RequestedWindowEndExclusiveAt *time.Time
	StartedAt                     time.Time
	FinishedAt                    time.Time
	Tags                          []pancake.Tag
	Summary                       map[string]any
	ConversationDays              []ConversationDaySource
	ThreadCustomerMappings        []ThreadCustomerMapping
}

type ConversationDaySource struct {
	ConversationID                 string
	ThreadFirstSeenAt              *time.Time
	CustomerDisplayName            string
	ConversationUpdatedAt          *time.Time
	MessageCountPersisted          int
	MessageCountSeenFromSource     int
	NormalizedPhoneCandidatesJSON  json.RawMessage
	ObservedTagsJSON               json.RawMessage
	NormalizedTagSignalsJSON       json.RawMessage
	OpeningBlocksJSON              json.RawMessage
	FirstMeaningfulHumanMessageID  string
	FirstMeaningfulHumanSenderRole string
	SourceConversationJSONRedacted json.RawMessage
	Messages                       []MessageSource
}

type MessageSource struct {
	MessageID                 string
	ConversationID            string
	InsertedAt                time.Time
	SenderSourceID            string
	SenderName                string
	SenderRole                string
	SourceMessageTypeRaw      string
	MessageType               string
	RedactedText              string
	AttachmentsJSON           json.RawMessage
	IsMeaningfulHumanMessage  bool
	IsOpeningBlockMessage     bool
	SourceMessageJSONRedacted json.RawMessage
}

type ThreadCustomerMapping struct {
	ConnectedPageID string
	ThreadID        string
	CustomerID      string
	MappedPhoneE164 string
	MappingMethod   string
	ConfidenceScore *float64
}

type openingBlocks struct {
	OpeningCandidateWindow []openingBlockMessage `json:"opening_candidate_window"`
	MatchedSelections      []openingSelection    `json:"matched_selections"`
	DeterministicSignals   map[string][]string   `json:"deterministic_signals"`
	UnmatchedCandidateText []string              `json:"unmatched_candidate_texts"`
}

type openingBlockMessage struct {
	MessageID    string `json:"message_id"`
	InsertedAt   string `json:"inserted_at"`
	SenderRole   string `json:"sender_role"`
	MessageType  string `json:"message_type"`
	RedactedText string `json:"redacted_text"`
}

type openingSelection struct {
	Signal      string `json:"signal"`
	RawText     string `json:"raw_text"`
	Decision    string `json:"decision"`
	MessageID   string `json:"message_id"`
	MessageType string `json:"message_type"`
}
