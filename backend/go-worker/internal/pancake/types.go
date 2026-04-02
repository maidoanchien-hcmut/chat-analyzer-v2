package pancake

import "encoding/json"

type Page struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Tag struct {
	ID           int64           `json:"id"`
	Text         string          `json:"text"`
	Color        string          `json:"color"`
	LightenColor string          `json:"lighten_color"`
	Raw          json.RawMessage `json:"-"`
}

type Actor struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	AdminID     string `json:"admin_id"`
	AdminName   string `json:"admin_name"`
	UID         string `json:"uid"`
	AIGenerated bool   `json:"ai_generated"`
	AppID       *int64 `json:"app_id"`
	FlowID      *int64 `json:"flow_id"`
}

type ConversationCustomer struct {
	ID   string `json:"id"`
	FBID string `json:"fb_id"`
	Name string `json:"name"`
}

type PageCustomer struct {
	ID         string `json:"id"`
	CustomerID string `json:"customer_id"`
	Name       string `json:"name"`
	PSID       string `json:"psid"`
	InsertedAt string `json:"inserted_at"`
	UpdatedAt  string `json:"updated_at"`
}

type RecentPhoneNumber struct {
	Captured    string `json:"captured"`
	Length      int    `json:"length"`
	MessageID   string `json:"m_id"`
	Offset      int    `json:"offset"`
	PhoneNumber string `json:"phone_number"`
	Status      int    `json:"status"`
}

type Conversation struct {
	ID                 string                 `json:"id"`
	PageID             string                 `json:"page_id"`
	CustomerID         string                 `json:"customer_id"`
	InsertedAt         string                 `json:"inserted_at"`
	UpdatedAt          string                 `json:"updated_at"`
	MessageCount       int                    `json:"message_count"`
	From               Actor                  `json:"from"`
	Customers          []ConversationCustomer `json:"customers"`
	PageCustomer       PageCustomer           `json:"page_customer"`
	RecentPhoneNumbers []RecentPhoneNumber    `json:"recent_phone_numbers"`
	Tags               []json.RawMessage      `json:"tags"`
	TagHistories       []json.RawMessage      `json:"tag_histories"`
	Raw                json.RawMessage        `json:"-"`
}

type Attachment struct {
	Type    string          `json:"type"`
	Title   string          `json:"title"`
	URL     string          `json:"url"`
	Payload json.RawMessage `json:"payload"`
}

type Message struct {
	ConversationID  string              `json:"conversation_id"`
	PageID          string              `json:"page_id"`
	ID              string              `json:"id"`
	InsertedAt      string              `json:"inserted_at"`
	Type            string              `json:"type"`
	Message         string              `json:"message"`
	OriginalMessage string              `json:"original_message"`
	From            Actor               `json:"from"`
	HasPhone        bool                `json:"has_phone"`
	PhoneInfo       []RecentPhoneNumber `json:"phone_info"`
	Attachments     []Attachment        `json:"attachments"`
	MessageTags     []json.RawMessage   `json:"message_tags"`
	Raw             json.RawMessage     `json:"-"`
}

type CustomerRecentPhone struct {
	PhoneNumber string `json:"phone_number"`
}

type CustomerProfile struct {
	ID                 string                `json:"id"`
	CustomerID         string                `json:"customer_id"`
	FBID               string                `json:"fb_id"`
	Name               string                `json:"name"`
	RecentPhoneNumbers []CustomerRecentPhone `json:"recent_phone_numbers"`
}

type MessagesPage struct {
	ConversationID                 string              `json:"conversation_id"`
	ConvPhoneNumbers               []string            `json:"conv_phone_numbers"`
	ConvRecentPhoneNumbers         []RecentPhoneNumber `json:"conv_recent_phone_numbers"`
	AvailableForReportPhoneNumbers []string            `json:"available_for_report_phone_numbers"`
	Customers                      []CustomerProfile   `json:"customers"`
	Messages                       []Message           `json:"messages"`
	Raw                            json.RawMessage     `json:"-"`
}

type MessageContext struct {
	ConvPhoneNumbers               []string
	ConvRecentPhoneNumbers         []RecentPhoneNumber
	AvailableForReportPhoneNumbers []string
	Customers                      []CustomerProfile
}

type listPagesResponse struct {
	Pages       []Page `json:"pages"`
	Categorized struct {
		Activated []Page `json:"activated"`
	} `json:"categorized"`
}

type listConversationsEnvelope struct {
	Conversations []json.RawMessage `json:"conversations"`
}

type listTagsEnvelope struct {
	Tags []json.RawMessage `json:"tags"`
}

type listMessagesEnvelope struct {
	ConversationID                 string              `json:"conversation_id"`
	ConvPhoneNumbers               []string            `json:"conv_phone_numbers"`
	ConvRecentPhoneNumbers         []RecentPhoneNumber `json:"conv_recent_phone_numbers"`
	AvailableForReportPhoneNumbers []string            `json:"available_for_report_phone_numbers"`
	Customers                      []CustomerProfile   `json:"customers"`
	Messages                       []json.RawMessage   `json:"messages"`
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
