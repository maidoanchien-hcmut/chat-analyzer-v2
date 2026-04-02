package pancake

import "encoding/json"

type Page struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Tag struct {
	ID           string `json:"id"`
	Text         string `json:"text"`
	Color        string `json:"color"`
	LightenColor string `json:"lighten_color"`
}

type Conversation struct {
	ID string `json:"id"`
}

type listPagesResponse struct {
	Pages []Page `json:"pages"`
}

type listConversationsResponse struct {
	Conversations []Conversation `json:"conversations"`
}

type listTagsResponse struct {
	Tags []Tag `json:"tags"`
}

type listMessagesResponse struct {
	Messages []json.RawMessage `json:"messages"`
}

type ConversationsRequest struct {
	PageID             string
	PageAccessToken    string
	Since              *int64
	Until              *int64
	LastConversationID string
}

type MessagesRequest struct {
	PageID          string
	PageAccessToken string
	ConversationID  string
	CurrentCount    int
}
