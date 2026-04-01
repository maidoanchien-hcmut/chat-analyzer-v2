package pancake

import "encoding/json"

type Page struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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

type listMessagesResponse struct {
	Messages []json.RawMessage `json:"messages"`
}

type listPageCustomersResponse struct {
	Customers []json.RawMessage `json:"customers"`
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

type PageCustomersRequest struct {
	PageID          string
	PageAccessToken string
	Since           int64
	Until           int64
	PageNumber      int
	PageSize        int
}
