package transform

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func BuildConversationDay(
	window DayWindow,
	conversation pancake.Conversation,
	messageContext pancake.MessageContext,
	messages []pancake.Message,
	messagesSeen int,
	tagDictionary map[int64]pancake.Tag,
	policies controlplane.RuntimeConfig,
) (ConversationDaySource, error) {
	loc := window.Start.Location()
	dedupedMessages, insertedByID, err := sortMessages(messages, loc)
	if err != nil {
		return ConversationDaySource{}, err
	}

	threadFirstSeenAt, err := parseOptionalSourceTime(conversation.InsertedAt, loc)
	if err != nil {
		return ConversationDaySource{}, fmt.Errorf("conversation inserted_at: %w", err)
	}
	threadLastSeenAt, err := parseOptionalSourceTime(conversation.UpdatedAt, loc)
	if err != nil {
		return ConversationDaySource{}, fmt.Errorf("conversation updated_at: %w", err)
	}

	transformed := make([]MessageSource, 0, len(dedupedMessages))
	for _, message := range dedupedMessages {
		insertedAt := insertedByID[message.ID]
		transformed = append(transformed, MessageSource{
			MessageID:                 message.ID,
			ConversationID:            message.ConversationID,
			InsertedAt:                insertedAt,
			SenderSourceID:            message.From.ID,
			SenderName:                selectSenderName(message.From),
			SenderRole:                classifySenderRole(message),
			SourceMessageTypeRaw:      message.Type,
			MessageType:               normalizeMessageType(message),
			RedactedText:              renderMessageText(message),
			AttachmentsJSON:           marshalAttachments(message.Attachments),
			SourceMessageJSONRedacted: redactJSON(message.Raw),
		})
	}

	firstMeaningfulIndex := -1
	templateButtonTitles := collectTemplateButtonTitles(dedupedMessages)
	for idx := range transformed {
		if isMeaningfulHumanMessage(dedupedMessages, transformed, idx, templateButtonTitles) {
			transformed[idx].IsMeaningfulHumanMessage = true
			if firstMeaningfulIndex < 0 {
				firstMeaningfulIndex = idx
			}
		}
	}

	openingEnd, cutReason := resolveOpeningWindow(firstMeaningfulIndex, len(transformed))
	openingMessages := make([]openingBlockMessage, 0, openingEnd)
	candidateMessageIDs := make([]string, 0, openingEnd)
	for idx := 0; idx < openingEnd; idx++ {
		transformed[idx].IsOpeningBlockMessage = true
		candidateMessageIDs = append(candidateMessageIDs, transformed[idx].MessageID)
		openingMessages = append(openingMessages, openingBlockMessage{
			MessageID:    transformed[idx].MessageID,
			SenderRole:   transformed[idx].SenderRole,
			MessageType:  transformed[idx].MessageType,
			RedactedText: transformed[idx].RedactedText,
		})
	}

	observedTags := resolveObservedTags(conversation.Tags, conversation.TagHistories, tagDictionary, window)
	normalizedSignals, explicitRevisit, explicitNeed, explicitOutcome := buildNormalizedTagSignals(observedTags, policies.TagMapping)
	explicitSignals := buildOpeningSignals(openingMessages, transformed[:openingEnd], dedupedMessages[:openingEnd], policies.OpeningRules)
	if explicitRevisit == "" {
		explicitRevisit = findOpeningSignal(explicitSignals, "journey")
	}
	if explicitNeed == "" {
		explicitNeed = findOpeningSignal(explicitSignals, "need")
	}
	if explicitOutcome == "" {
		explicitOutcome = findOpeningSignal(explicitSignals, "outcome")
	}

	firstStaffResponseSeconds, avgStaffResponseSeconds := buildResponseMetrics(transformed)
	staffParticipantsJSON, staffMessageStatsJSON := buildStaffMetrics(transformed)
	phoneCandidatesJSON := buildPhoneCandidatesJSON(conversation, messageContext, dedupedMessages, insertedByID)
	firstMessageText := ""
	firstMessageSenderRole := ""
	firstMessageID := ""
	if firstMeaningfulIndex >= 0 {
		firstMessageID = transformed[firstMeaningfulIndex].MessageID
		firstMessageText = transformed[firstMeaningfulIndex].RedactedText
		firstMessageSenderRole = transformed[firstMeaningfulIndex].SenderRole
	}

	result := ConversationDaySource{
		ConversationID:             conversation.ID,
		ThreadFirstSeenAt:          threadFirstSeenAt,
		ThreadLastSeenAt:           threadLastSeenAt,
		CustomerDisplayName:        customerDisplayName(conversation, messageContext),
		CurrentPhoneCandidatesJSON: phoneCandidatesJSON,
		ObservedTagsJSON:           marshalJSON(observedTags, "[]"),
		NormalizedTagSignalsJSON:   normalizedSignals,
		OpeningBlockJSON: marshalJSON(openingBlockPayload{
			CandidateMessageIDs: candidateMessageIDs,
			Messages:            openingMessages,
			ExplicitSignals:     explicitSignals,
			CutReason:           cutReason,
		}, `{"candidate_message_ids":[],"messages":[],"explicit_signals":[],"cut_reason":"no_opening_block"}`),
		FirstMeaningfulMessageID:         firstMessageID,
		FirstMeaningfulMessageText:       firstMessageText,
		FirstMeaningfulMessageSenderRole: firstMessageSenderRole,
		MessageCount:                     messagesSeen,
		FirstStaffResponseSeconds:        firstStaffResponseSeconds,
		AvgStaffResponseSeconds:          avgStaffResponseSeconds,
		StaffParticipantsJSON:            staffParticipantsJSON,
		StaffMessageStatsJSON:            staffMessageStatsJSON,
		ExplicitRevisitSignal:            explicitRevisit,
		ExplicitNeedSignal:               explicitNeed,
		ExplicitOutcomeSignal:            explicitOutcome,
		SourceConversationJSONRedacted:   redactJSON(conversation.Raw),
		IsNewInbox:                       isNewInbox(threadFirstSeenAt, window),
		Messages:                         transformed,
	}
	if threadLastSeenAt == nil && len(transformed) > 0 {
		last := transformed[len(transformed)-1].InsertedAt
		result.ThreadLastSeenAt = &last
	}
	return result, nil
}

func resolveOpeningWindow(firstMeaningfulIndex int, totalMessages int) (int, string) {
	if totalMessages == 0 {
		return 0, "no_opening_block"
	}
	if firstMeaningfulIndex >= 0 {
		return firstMeaningfulIndex, "first_meaningful_message"
	}
	return totalMessages, "max_messages_reached"
}

func parseOptionalSourceTime(value string, loc *time.Location) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := parseSourceTime(value, loc)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func sortMessages(messages []pancake.Message, loc *time.Location) ([]pancake.Message, map[string]time.Time, error) {
	type timedMessage struct {
		message    pancake.Message
		insertedAt time.Time
	}

	seen := map[string]timedMessage{}
	for idx, message := range messages {
		if strings.TrimSpace(message.ID) == "" {
			return nil, nil, fmt.Errorf("message %d: missing id", idx)
		}
		insertedAt, err := parseSourceTime(message.InsertedAt, loc)
		if err != nil {
			return nil, nil, fmt.Errorf("message %d inserted_at: %w", idx, err)
		}
		current, exists := seen[message.ID]
		if !exists || insertedAt.Before(current.insertedAt) {
			seen[message.ID] = timedMessage{message: message, insertedAt: insertedAt}
		}
	}

	sorted := make([]timedMessage, 0, len(seen))
	for _, item := range seen {
		sorted = append(sorted, item)
	}
	slices.SortFunc(sorted, func(left, right timedMessage) int {
		if left.insertedAt.Before(right.insertedAt) {
			return -1
		}
		if left.insertedAt.After(right.insertedAt) {
			return 1
		}
		return strings.Compare(left.message.ID, right.message.ID)
	})

	insertedByID := make(map[string]time.Time, len(sorted))
	ordered := make([]pancake.Message, 0, len(sorted))
	for _, item := range sorted {
		insertedByID[item.message.ID] = item.insertedAt
		ordered = append(ordered, item.message)
	}
	return ordered, insertedByID, nil
}

func customerDisplayName(conversation pancake.Conversation, messageContext pancake.MessageContext) string {
	if name := strings.TrimSpace(conversation.PageCustomer.Name); name != "" {
		return name
	}
	for _, customer := range conversation.Customers {
		if name := strings.TrimSpace(customer.Name); name != "" {
			return name
		}
	}
	for _, customer := range messageContext.Customers {
		if name := strings.TrimSpace(customer.Name); name != "" {
			return name
		}
	}
	if name := strings.TrimSpace(conversation.From.Name); name != "" {
		return name
	}
	return ""
}

func selectSenderName(actor pancake.Actor) string {
	if name := strings.TrimSpace(actor.AdminName); name != "" {
		return name
	}
	return strings.TrimSpace(actor.Name)
}

func classifySenderRole(message pancake.Message) string {
	if message.From.ID == "" || message.PageID == "" {
		return "unclassified_page_actor"
	}
	if message.From.ID != message.PageID {
		return "customer"
	}
	if strings.TrimSpace(message.From.AdminName) != "" && message.From.AppID == nil && message.From.FlowID == nil && !message.From.AIGenerated {
		return "staff_via_pancake"
	}
	if looksLikeBotActor(strings.TrimSpace(message.From.AdminName), message.From.AppID, message.From.FlowID, message.From.AIGenerated) {
		return "third_party_bot"
	}
	if looksLikeSystemMessage(message) {
		return "page_system_auto_message"
	}
	return "unclassified_page_actor"
}

func looksLikeBotActor(adminName string, appID, flowID *int64, aiGenerated bool) bool {
	return aiGenerated || appID != nil || flowID != nil || strings.Contains(strings.ToLower(adminName), "bot")
}

func looksLikeSystemMessage(message pancake.Message) bool {
	if len(message.Attachments) > 0 {
		return false
	}
	text := strings.ToLower(renderMessageText(message))
	return text == "" || strings.Contains(text, "lưu ý:")
}

func normalizeMessageType(message pancake.Message) string {
	if len(message.Attachments) > 0 {
		if attachmentType := normalizeAttachmentType(message.Attachments[0].Type); attachmentType != "" {
			return attachmentType
		}
		return "unsupported"
	}
	if strings.TrimSpace(renderMessageText(message)) == "" {
		return "unsupported"
	}
	return "text"
}

func normalizeAttachmentType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "template":
		return "template"
	case "photo", "image":
		return "image"
	case "video":
		return "video"
	case "audio":
		return "audio"
	case "file":
		return "file"
	case "sticker":
		return "sticker"
	case "reaction":
		return "reaction"
	default:
		return ""
	}
}

func isMeaningfulHumanMessage(rawMessages []pancake.Message, messages []MessageSource, idx int, templateButtonTitles map[string]struct{}) bool {
	message := messages[idx]
	if message.SenderRole != "customer" && message.SenderRole != "staff_via_pancake" {
		return false
	}
	if isLikelyStructuredSelection(rawMessages, messages, idx, templateButtonTitles) {
		return false
	}
	text := strings.TrimSpace(message.RedactedText)
	return text != ""
}

func isLikelyStructuredSelection(rawMessages []pancake.Message, messages []MessageSource, idx int, templateButtonTitles map[string]struct{}) bool {
	text := strings.TrimSpace(messages[idx].RedactedText)
	if text == "" {
		return false
	}
	normalizedText := normalizeSelectionKey(text)
	if _, ok := templateButtonTitles[normalizedText]; ok {
		return true
	}
	for _, neighbor := range nearbyMessages(rawMessages, idx) {
		if hasMatchingTemplateButton(neighbor, normalizedText) {
			return true
		}
	}
	return false
}

func collectTemplateButtonTitles(messages []pancake.Message) map[string]struct{} {
	collected := map[string]struct{}{}
	for _, message := range messages {
		for _, attachment := range message.Attachments {
			if !strings.EqualFold(attachment.Type, "template") || len(attachment.Payload) == 0 {
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal(attachment.Payload, &payload); err != nil {
				continue
			}
			buttons, _ := payload["buttons"].([]any)
			for _, rawButton := range buttons {
				button, _ := rawButton.(map[string]any)
				title, _ := button["title"].(string)
				normalized := normalizeSelectionKey(title)
				if normalized != "" {
					collected[normalized] = struct{}{}
				}
			}
		}
	}
	return collected
}

func nearbyMessages(messages []pancake.Message, idx int) []pancake.Message {
	collected := make([]pancake.Message, 0, 4)
	for offset := -2; offset <= 2; offset++ {
		if offset == 0 {
			continue
		}
		position := idx + offset
		if position < 0 || position >= len(messages) {
			continue
		}
		collected = append(collected, messages[position])
	}
	return collected
}

func hasMatchingTemplateButton(message pancake.Message, normalizedText string) bool {
	for _, attachment := range message.Attachments {
		if !strings.EqualFold(attachment.Type, "template") || len(attachment.Payload) == 0 {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal(attachment.Payload, &payload); err != nil {
			continue
		}
		buttons, _ := payload["buttons"].([]any)
		for _, rawButton := range buttons {
			button, _ := rawButton.(map[string]any)
			title, _ := button["title"].(string)
			if normalizeSelectionKey(title) == normalizedText {
				return true
			}
		}
	}
	return false
}

func normalizeSelectionKey(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func buildPhoneCandidatesJSON(
	conversation pancake.Conversation,
	messageContext pancake.MessageContext,
	messages []pancake.Message,
	insertedByID map[string]time.Time,
) json.RawMessage {
	type phoneCandidate struct {
		PhoneNumber string `json:"phone_number"`
		Source      string `json:"source"`
		LastSeenAt  string `json:"last_seen_at,omitempty"`
	}

	candidates := make([]phoneCandidate, 0)
	seen := map[string]struct{}{}
	appendCandidate := func(phoneNumber, source, lastSeenAt string) {
		trimmed := strings.TrimSpace(phoneNumber)
		if trimmed == "" {
			return
		}
		key := trimmed + "|" + source
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		candidates = append(candidates, phoneCandidate{
			PhoneNumber: trimmed,
			Source:      source,
			LastSeenAt:  lastSeenAt,
		})
	}

	for _, phone := range conversation.RecentPhoneNumbers {
		appendCandidate(phone.PhoneNumber, "conversation_recent_phone_numbers", "")
		appendCandidate(phone.Captured, "conversation_recent_phone_numbers", "")
	}
	for _, phone := range messageContext.ConvPhoneNumbers {
		appendCandidate(phone, "message_context_conv_phone_numbers", "")
	}
	for _, phone := range messageContext.AvailableForReportPhoneNumbers {
		appendCandidate(phone, "message_context_available_for_report", "")
	}
	for _, phone := range messageContext.ConvRecentPhoneNumbers {
		appendCandidate(phone.PhoneNumber, "message_context_recent_phone_numbers", "")
		appendCandidate(phone.Captured, "message_context_recent_phone_numbers", "")
	}
	for _, customer := range messageContext.Customers {
		for _, phone := range customer.RecentPhoneNumbers {
			appendCandidate(phone.PhoneNumber, "customer_profile_recent_phone_numbers", "")
		}
	}
	for _, message := range messages {
		lastSeenAt := ""
		if insertedAt, ok := insertedByID[message.ID]; ok {
			lastSeenAt = insertedAt.Format(time.RFC3339)
		}
		for _, phone := range message.PhoneInfo {
			appendCandidate(phone.PhoneNumber, "message_phone_info", lastSeenAt)
			appendCandidate(phone.Captured, "message_phone_info", lastSeenAt)
		}
	}

	slices.SortFunc(candidates, func(left, right phoneCandidate) int {
		if left.PhoneNumber != right.PhoneNumber {
			return strings.Compare(left.PhoneNumber, right.PhoneNumber)
		}
		return strings.Compare(left.Source, right.Source)
	})
	return marshalJSON(candidates, "[]")
}

func resolveObservedTags(rawCurrentTags []json.RawMessage, rawEvents []json.RawMessage, tagDictionary map[int64]pancake.Tag, _ DayWindow) []map[string]any {
	seen := map[string]struct{}{}
	resolved := make([]map[string]any, 0)
	appendTag := func(rawTag json.RawMessage) {
		tag, ok := resolveTag(rawTag, tagDictionary)
		if !ok {
			return
		}
		key := tagIdentityKey(tag)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		resolved = append(resolved, tag)
	}

	for _, rawTag := range compactRawItems(rawCurrentTags) {
		appendTag(rawTag)
	}
	for _, rawEvent := range compactRawItems(rawEvents) {
		var event map[string]any
		if err := json.Unmarshal(rawEvent, &event); err != nil {
			continue
		}
		payload, _ := event["payload"].(map[string]any)
		rawTag, exists := payload["tag"]
		if !exists {
			continue
		}
		encoded, err := json.Marshal(rawTag)
		if err != nil {
			continue
		}
		appendTag(encoded)
	}
	slices.SortFunc(resolved, func(left, right map[string]any) int {
		return strings.Compare(tagIdentityKey(left), tagIdentityKey(right))
	})
	return resolved
}

func buildNormalizedTagSignals(observedTags []map[string]any, config controlplane.TagMappingConfig) (json.RawMessage, string, string, string) {
	roleBuckets := map[string][]map[string]any{
		"journey": {},
		"need":    {},
		"outcome": {},
		"branch":  {},
		"staff":   {},
		"noise":   {},
	}
	entryByID := map[string]controlplane.TagMappingEntry{}
	entryByText := map[string]controlplane.TagMappingEntry{}
	for _, entry := range config.Entries {
		if strings.TrimSpace(entry.SourceTagID) != "" {
			entryByID[strings.TrimSpace(entry.SourceTagID)] = entry
		}
		if text := normalizeSelectionKey(entry.SourceTagText); text != "" {
			entryByText[text] = entry
		}
	}

	explicitRevisit := ""
	explicitNeed := ""
	explicitOutcome := ""
	for _, tag := range observedTags {
		sourceTagID := tagIDString(tag)
		sourceTagText := strings.TrimSpace(tagText(tag))
		entry, ok := entryByID[sourceTagID]
		if !ok && sourceTagText != "" {
			entry, ok = entryByText[normalizeSelectionKey(sourceTagText)]
		}
		role := "noise"
		canonicalCode := ""
		mappingSource := "auto_default"
		if ok {
			role = strings.TrimSpace(entry.Role)
			if role == "" {
				role = "noise"
			}
			canonicalCode = strings.TrimSpace(entry.CanonicalCode)
			if sourceTagText == "" {
				sourceTagText = strings.TrimSpace(entry.SourceTagText)
			}
			if strings.TrimSpace(entry.MappingSource) != "" {
				mappingSource = strings.TrimSpace(entry.MappingSource)
			}
		}

		item := map[string]any{
			"source_tag_id":   sourceTagID,
			"source_tag_text": sourceTagText,
			"mapping_source":  mappingSource,
		}
		if role != "noise" && canonicalCode != "" {
			item["canonical_code"] = canonicalCode
		}
		roleBuckets[role] = append(roleBuckets[role], item)
		if role == "journey" && explicitRevisit == "" && canonicalCode == "revisit" {
			explicitRevisit = canonicalCode
		}
		if role == "need" && explicitNeed == "" {
			explicitNeed = canonicalCode
		}
		if role == "outcome" && explicitOutcome == "" {
			explicitOutcome = canonicalCode
		}
	}
	return marshalJSON(roleBuckets, `{"journey":[],"need":[],"outcome":[],"branch":[],"staff":[],"noise":[]}`), explicitRevisit, explicitNeed, explicitOutcome
}

func buildOpeningSignals(openingMessages []openingBlockMessage, transformed []MessageSource, rawMessages []pancake.Message, config controlplane.OpeningRulesConfig) []openingExplicitSignal {
	if len(config.Selectors) == 0 || len(openingMessages) == 0 {
		return nil
	}
	candidates := make([]openingExplicitSignal, 0)
	for idx, message := range transformed {
		if idx >= len(rawMessages) {
			break
		}
		candidateTexts := []string{}
		if text := strings.TrimSpace(message.RedactedText); text != "" {
			candidateTexts = append(candidateTexts, text)
		}
		for _, attachment := range rawMessages[idx].Attachments {
			if !strings.EqualFold(attachment.Type, "template") || len(attachment.Payload) == 0 {
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal(attachment.Payload, &payload); err != nil {
				continue
			}
			buttons, _ := payload["buttons"].([]any)
			for _, rawButton := range buttons {
				button, _ := rawButton.(map[string]any)
				title, _ := button["title"].(string)
				if strings.TrimSpace(title) != "" {
					candidateTexts = append(candidateTexts, title)
				}
			}
		}
		for _, selector := range config.Selectors {
			if !selectorAllowsMessageType(selector, message.MessageType) {
				continue
			}
			for _, option := range selector.Options {
				for _, candidateText := range candidateTexts {
					if !openingOptionMatches(option, candidateText) {
						continue
					}
					candidates = append(candidates, openingExplicitSignal{
						SignalRole: selector.SignalRole,
						SignalCode: selector.SignalCode,
						Source:     "opening_rule",
						MessageID:  message.MessageID,
						RawText:    strings.TrimSpace(candidateText),
					})
				}
			}
		}
	}
	return uniqueOpeningSignals(candidates)
}

func selectorAllowsMessageType(selector controlplane.OpeningSelector, messageType string) bool {
	if len(selector.AllowedMessageTypes) == 0 {
		return true
	}
	for _, allowed := range selector.AllowedMessageTypes {
		if normalizeSelectionKey(allowed) == normalizeSelectionKey(messageType) {
			return true
		}
	}
	return false
}

func openingOptionMatches(option controlplane.OpeningOption, value string) bool {
	left := strings.TrimSpace(option.RawText)
	right := strings.TrimSpace(value)
	switch strings.TrimSpace(option.MatchMode) {
	case "casefold_exact":
		return strings.EqualFold(left, right)
	default:
		return left == right
	}
}

func uniqueOpeningSignals(items []openingExplicitSignal) []openingExplicitSignal {
	seen := map[string]struct{}{}
	result := make([]openingExplicitSignal, 0, len(items))
	for _, item := range items {
		key := strings.Join([]string{item.SignalRole, item.SignalCode, item.MessageID, item.RawText}, "|")
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, item)
	}
	return result
}

func findOpeningSignal(items []openingExplicitSignal, signalRole string) string {
	for _, item := range items {
		if item.SignalRole == signalRole {
			return item.SignalCode
		}
	}
	return ""
}

func buildResponseMetrics(messages []MessageSource) (*int, *int) {
	customerMessages := make([]time.Time, 0)
	staffMessages := make([]time.Time, 0)
	for _, message := range messages {
		switch message.SenderRole {
		case "customer":
			customerMessages = append(customerMessages, message.InsertedAt)
		case "staff_via_pancake":
			staffMessages = append(staffMessages, message.InsertedAt)
		}
	}
	if len(customerMessages) == 0 || len(staffMessages) == 0 {
		return nil, nil
	}
	first := int(staffMessages[0].Sub(customerMessages[0]).Seconds())
	if first < 0 {
		first = 0
	}
	avg := first
	return &first, &avg
}

func buildStaffMetrics(messages []MessageSource) (json.RawMessage, json.RawMessage) {
	type participant struct {
		StaffName      string `json:"staff_name"`
		SenderSourceID string `json:"sender_source_id"`
		MessageCount   int    `json:"message_count"`
	}
	type stats struct {
		StaffName      string `json:"staff_name"`
		MessageCount   int    `json:"message_count"`
		FirstMessageAt string `json:"first_message_at"`
		LastMessageAt  string `json:"last_message_at"`
	}
	participants := map[string]*participant{}
	statsByKey := map[string]*stats{}
	for _, message := range messages {
		if message.SenderRole != "staff_via_pancake" {
			continue
		}
		key := strings.TrimSpace(message.SenderSourceID) + "|" + strings.TrimSpace(message.SenderName)
		if participants[key] == nil {
			participants[key] = &participant{
				StaffName:      message.SenderName,
				SenderSourceID: message.SenderSourceID,
			}
			statsByKey[key] = &stats{
				StaffName:      message.SenderName,
				FirstMessageAt: message.InsertedAt.Format(time.RFC3339),
				LastMessageAt:  message.InsertedAt.Format(time.RFC3339),
			}
		}
		participants[key].MessageCount++
		statsByKey[key].MessageCount++
		statsByKey[key].LastMessageAt = message.InsertedAt.Format(time.RFC3339)
	}
	participantList := make([]participant, 0, len(participants))
	statsList := make([]stats, 0, len(statsByKey))
	for _, item := range participants {
		participantList = append(participantList, *item)
	}
	for _, item := range statsByKey {
		statsList = append(statsList, *item)
	}
	slices.SortFunc(participantList, func(left, right participant) int {
		return strings.Compare(left.StaffName, right.StaffName)
	})
	slices.SortFunc(statsList, func(left, right stats) int {
		return strings.Compare(left.StaffName, right.StaffName)
	})
	return marshalJSON(participantList, "[]"), marshalJSON(statsList, "[]")
}

func isNewInbox(threadFirstSeenAt *time.Time, window DayWindow) bool {
	if threadFirstSeenAt == nil {
		return false
	}
	return threadFirstSeenAt.Format(time.DateOnly) == window.Start.Format(time.DateOnly)
}

func marshalAttachments(attachments []pancake.Attachment) json.RawMessage {
	type attachmentRecord struct {
		AttachmentType string `json:"attachment_type"`
		URL            string `json:"url,omitempty"`
		Title          string `json:"title,omitempty"`
	}
	items := make([]attachmentRecord, 0, len(attachments))
	for _, attachment := range attachments {
		items = append(items, attachmentRecord{
			AttachmentType: normalizeAttachmentType(attachment.Type),
			URL:            strings.TrimSpace(attachment.URL),
			Title:          strings.TrimSpace(attachment.Title),
		})
	}
	return marshalJSON(items, "[]")
}

func resolveTag(rawTag json.RawMessage, tagDictionary map[int64]pancake.Tag) (map[string]any, bool) {
	var tag map[string]any
	if err := json.Unmarshal(rawTag, &tag); err != nil {
		return nil, false
	}
	sourceTagText := strings.TrimSpace(tagText(tag))
	rawID, hasID := tag["id"]
	if hasID {
		if tagID, ok := asInt64(rawID); ok {
			if resolved, exists := tagDictionary[tagID]; exists && sourceTagText == "" {
				sourceTagText = resolved.Text
			}
			return map[string]any{
				"source_tag_id":   fmt.Sprintf("%d", tagID),
				"source_tag_text": sourceTagText,
			}, true
		}
	}
	if sourceTagText == "" {
		return nil, false
	}
	return map[string]any{
		"source_tag_id":   "",
		"source_tag_text": sourceTagText,
	}, true
}

func tagIdentityKey(tag map[string]any) string {
	tagID := tagIDString(tag)
	label := normalizeSelectionKey(tagText(tag))
	if tagID != "" {
		return tagID + "|" + label
	}
	return label
}

func tagIDString(tag map[string]any) string {
	if raw, ok := tag["source_tag_id"].(string); ok {
		return strings.TrimSpace(raw)
	}
	tagID, ok := asInt64(tag["id"])
	if !ok {
		return ""
	}
	return fmt.Sprintf("%d", tagID)
}

func tagText(tag map[string]any) string {
	if text, ok := tag["source_tag_text"].(string); ok {
		return text
	}
	text, _ := tag["text"].(string)
	return text
}

func asInt64(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		return int64(typed), true
	case int64:
		return typed, true
	case json.Number:
		parsed, err := typed.Int64()
		return parsed, err == nil
	default:
		return 0, false
	}
}
