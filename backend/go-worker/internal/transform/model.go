package transform

import (
	"encoding/json"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

type Run struct {
	PageID           string
	TargetDate       string
	BusinessTimezone string
	RunMode          string
	RunGroupID       string
	Window           DayWindow
	StartedAt        time.Time
	FinishedAt       time.Time
	Tags             []pancake.Tag
	Summary          map[string]any
	ConversationDays []ConversationDaySource
}

type ConversationDaySource struct {
	ConversationID                   string
	ThreadFirstSeenAt                *time.Time
	ThreadLastSeenAt                 *time.Time
	CustomerDisplayName              string
	CurrentPhoneCandidatesJSON       json.RawMessage
	EntrySourceType                  string
	EntryPostID                      string
	EntryAdID                        string
	ObservedTagsJSON                 json.RawMessage
	NormalizedTagSignalsJSON         json.RawMessage
	OpeningBlockJSON                 json.RawMessage
	FirstMeaningfulMessageID         string
	FirstMeaningfulMessageText       string
	FirstMeaningfulMessageSenderRole string
	MessageCount                     int
	FirstStaffResponseSeconds        *int
	AvgStaffResponseSeconds          *int
	StaffParticipantsJSON            json.RawMessage
	StaffMessageStatsJSON            json.RawMessage
	ExplicitRevisitSignal            string
	ExplicitNeedSignal               string
	ExplicitOutcomeSignal            string
	SourceConversationJSONRedacted   json.RawMessage
	IsNewInbox                       bool
	Messages                         []MessageSource
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

type openingBlockPayload struct {
	CandidateMessageIDs []string                `json:"candidate_message_ids"`
	Messages            []openingBlockMessage   `json:"messages"`
	ExplicitSignals     []openingExplicitSignal `json:"explicit_signals"`
	CutReason           string                  `json:"cut_reason"`
}

type openingBlockMessage struct {
	MessageID    string `json:"message_id"`
	SenderRole   string `json:"sender_role"`
	MessageType  string `json:"message_type"`
	RedactedText string `json:"redacted_text"`
}

type openingExplicitSignal struct {
	SignalRole string `json:"signal_role"`
	SignalCode string `json:"signal_code"`
	Source     string `json:"source"`
	MessageID  string `json:"message_id"`
	RawText    string `json:"raw_text"`
}
