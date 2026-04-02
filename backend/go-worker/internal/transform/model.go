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
	CustomerDisplayName            string
	ConversationInsertedAt         *time.Time
	ConversationUpdatedAt          *time.Time
	MessageCountSeenFromSource     int
	NormalizedPhoneCandidatesJSON  json.RawMessage
	CurrentTagsJSON                json.RawMessage
	ObservedTagEventsJSON          json.RawMessage
	NormalizedTagSignalsJSON       json.RawMessage
	OpeningBlocksJSON              json.RawMessage
	FirstMeaningfulHumanMessageID  string
	FirstMeaningfulHumanSenderRole string
	SourceConversationJSON         json.RawMessage
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
	MessageTagsJSON           json.RawMessage
	IsMeaningfulHumanMessage  bool
	SourceMessageJSONRedacted json.RawMessage
}

type ThreadCustomerMapping struct {
	PageID          string
	ThreadID        string
	CustomerID      string
	MappedPhoneE164 string
	MappingMethod   string
}

type openingBlocks struct {
	OpeningCandidateWindow []openingBlockMessage `json:"opening_candidate_window"`
}

type openingBlockMessage struct {
	MessageID    string `json:"message_id"`
	InsertedAt   string `json:"inserted_at"`
	SenderRole   string `json:"sender_role"`
	MessageType  string `json:"message_type"`
	RedactedText string `json:"redacted_text"`
}
