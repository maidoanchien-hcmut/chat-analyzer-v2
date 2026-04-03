package transform

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode"

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
	conversationUpdatedAt, err := parseOptionalSourceTime(conversation.UpdatedAt, loc)
	if err != nil {
		return ConversationDaySource{}, fmt.Errorf("conversation updated_at: %w", err)
	}

	transformed := make([]MessageSource, 0, len(dedupedMessages))
	for _, message := range dedupedMessages {
		insertedAt := insertedByID[message.ID]
		attachmentsJSON := marshalJSON(message.Attachments, "[]")
		sourceMessageJSONRedacted := redactJSON(message.Raw)
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
			AttachmentsJSON:           redactJSON(attachmentsJSON),
			SourceMessageJSONRedacted: sourceMessageJSONRedacted,
		})
	}

	templateButtonTitles := collectTemplateButtonTitles(dedupedMessages)
	firstMeaningfulIndex := -1
	for idx := range transformed {
		if isMeaningfulHumanMessage(dedupedMessages, transformed, idx, templateButtonTitles) {
			transformed[idx].IsMeaningfulHumanMessage = true
			if firstMeaningfulIndex < 0 {
				firstMeaningfulIndex = idx
			}
			continue
		}
		transformed[idx].IsMeaningfulHumanMessage = false
	}

	openingCandidateEnd := resolveOpeningCandidateEnd(firstMeaningfulIndex, len(transformed), policies.OpeningRules.Boundary)
	openingMessages := make([]openingBlockMessage, 0, openingCandidateEnd)
	for idx, message := range transformed[:openingCandidateEnd] {
		transformed[idx].IsOpeningBlockMessage = true
		openingMessages = append(openingMessages, openingBlockMessage{
			MessageID:    message.MessageID,
			InsertedAt:   message.InsertedAt.Format(time.RFC3339Nano),
			SenderRole:   message.SenderRole,
			MessageType:  message.MessageType,
			RedactedText: message.RedactedText,
		})
	}

	phones := collectNormalizedPhones(conversation, messageContext, dedupedMessages)
	observedTags := resolveObservedTags(conversation.Tags, conversation.TagHistories, tagDictionary, window)
	openingBlocksJSON := marshalJSON(
		buildOpeningBlocks(openingMessages, transformed[:openingCandidateEnd], dedupedMessages[:openingCandidateEnd], policies.OpeningRules),
		`{"opening_candidate_window":[],"matched_selections":[],"deterministic_signals":{},"unmatched_candidate_texts":[]}`,
	)

	conversationDay := ConversationDaySource{
		ConversationID:                 conversation.ID,
		ThreadFirstSeenAt:              threadFirstSeenAt,
		CustomerDisplayName:            customerDisplayName(conversation, messageContext),
		ConversationUpdatedAt:          conversationUpdatedAt,
		MessageCountPersisted:          len(transformed),
		MessageCountSeenFromSource:     messagesSeen,
		NormalizedPhoneCandidatesJSON:  marshalJSON(phones, "[]"),
		ObservedTagsJSON:               marshalJSON(observedTags, "[]"),
		NormalizedTagSignalsJSON:       buildNormalizedTagSignals(observedTags, policies.TagMapping),
		OpeningBlocksJSON:              openingBlocksJSON,
		SourceConversationJSONRedacted: redactJSON(conversation.Raw),
		Messages:                       transformed,
	}

	if firstMeaningfulIndex >= 0 {
		conversationDay.FirstMeaningfulHumanMessageID = transformed[firstMeaningfulIndex].MessageID
		conversationDay.FirstMeaningfulHumanSenderRole = transformed[firstMeaningfulIndex].SenderRole
	}

	return conversationDay, nil
}

func resolveOpeningCandidateEnd(firstMeaningfulIndex int, totalMessages int, boundary controlplane.OpeningBoundary) int {
	end := totalMessages
	mode := boundary.Mode
	if mode == "" {
		mode = "until_first_meaningful_human_message"
	}
	if firstMeaningfulIndex >= 0 && mode == "until_first_meaningful_human_message" {
		end = firstMeaningfulIndex
	}
	if boundary.MaxMessages > 0 && end > boundary.MaxMessages {
		end = boundary.MaxMessages
	}
	if end < 0 {
		return 0
	}
	return end
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

	adminName := strings.ToLower(strings.TrimSpace(message.From.AdminName))
	if looksLikeBotActor(adminName, message.From.AppID, message.From.FlowID, message.From.AIGenerated) {
		return "third_party_bot"
	}
	if strings.TrimSpace(message.From.AdminName) != "" {
		return "staff_via_pancake"
	}
	if looksLikeSystemMessage(message) {
		return "page_system_auto_message"
	}
	return "unclassified_page_actor"
}

func looksLikeBotActor(adminName string, appID, flowID *int64, aiGenerated bool) bool {
	if aiGenerated || appID != nil || flowID != nil {
		return true
	}
	return strings.Contains(adminName, "bot")
}

func looksLikeSystemMessage(message pancake.Message) bool {
	if len(message.Attachments) > 0 {
		return true
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

	text := strings.TrimSpace(renderMessageText(message))
	if text == "" {
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

func isMeaningfulHumanMessage(
	rawMessages []pancake.Message,
	messages []MessageSource,
	idx int,
	templateButtonTitles map[string]struct{},
) bool {
	message := messages[idx]
	if message.SenderRole != "customer" && message.SenderRole != "staff_via_pancake" {
		return false
	}
	if isLikelyStructuredSelection(rawMessages, messages, idx, templateButtonTitles) {
		return false
	}

	text := strings.TrimSpace(message.RedactedText)
	if text == "" {
		return false
	}
	if message.MessageType == "sticker" || message.MessageType == "reaction" {
		return false
	}
	return !looksLikeOnlyEmojiOrPunctuation(text)
}

func isLikelyStructuredSelection(
	rawMessages []pancake.Message,
	messages []MessageSource,
	idx int,
	templateButtonTitles map[string]struct{},
) bool {
	text := strings.TrimSpace(messages[idx].RedactedText)
	if text == "" {
		return false
	}
	if wordCount(text) > 6 || len([]rune(text)) > 80 {
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

	if idx == 0 && hasNearbyTemplate(rawMessages, idx) && len([]rune(text)) <= 30 {
		return true
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

func hasNearbyTemplate(messages []pancake.Message, idx int) bool {
	for _, message := range nearbyMessages(messages, idx) {
		for _, attachment := range message.Attachments {
			if strings.EqualFold(attachment.Type, "template") {
				return true
			}
		}
	}
	return false
}

func hasMatchingTemplateButton(message pancake.Message, normalizedText string) bool {
	for _, attachment := range message.Attachments {
		if !strings.EqualFold(attachment.Type, "template") {
			continue
		}
		if len(attachment.Payload) == 0 {
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
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Join(strings.Fields(value), " ")
}

func wordCount(value string) int {
	return len(strings.Fields(value))
}

func looksLikeOnlyEmojiOrPunctuation(value string) bool {
	hasLetterOrDigit := false
	for _, r := range value {
		if unicodeClassifiedAsMeaningful(r) {
			hasLetterOrDigit = true
			break
		}
	}
	return !hasLetterOrDigit
}

func unicodeClassifiedAsMeaningful(r rune) bool {
	return ('0' <= r && r <= '9') || ('a' <= unicode.ToLower(r) && unicode.ToLower(r) <= 'z') || unicode.IsLetter(r)
}

func collectNormalizedPhones(
	conversation pancake.Conversation,
	messageContext pancake.MessageContext,
	messages []pancake.Message,
) []string {
	seen := map[string]struct{}{}
	collected := make([]string, 0)

	appendPhone := func(value string) {
		normalized := normalizePhone(value)
		if normalized == "" {
			return
		}
		if _, exists := seen[normalized]; exists {
			return
		}
		seen[normalized] = struct{}{}
		collected = append(collected, normalized)
	}

	for _, phone := range conversation.RecentPhoneNumbers {
		appendPhone(phone.PhoneNumber)
		appendPhone(phone.Captured)
	}
	for _, phone := range messageContext.ConvPhoneNumbers {
		appendPhone(phone)
	}
	for _, phone := range messageContext.AvailableForReportPhoneNumbers {
		appendPhone(phone)
	}
	for _, phone := range messageContext.ConvRecentPhoneNumbers {
		appendPhone(phone.PhoneNumber)
		appendPhone(phone.Captured)
	}
	for _, customer := range messageContext.Customers {
		for _, phone := range customer.RecentPhoneNumbers {
			appendPhone(phone.PhoneNumber)
		}
	}
	for _, message := range messages {
		for _, phone := range message.PhoneInfo {
			appendPhone(phone.PhoneNumber)
			appendPhone(phone.Captured)
		}
	}

	slices.Sort(collected)
	return collected
}

func resolveObservedTags(
	rawCurrentTags []json.RawMessage,
	rawEvents []json.RawMessage,
	tagDictionary map[int64]pancake.Tag,
	window DayWindow,
) []map[string]any {
	seen := map[string]struct{}{}
	resolved := make([]map[string]any, 0, len(rawCurrentTags))

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
		if insertedAt, ok := event["inserted_at"].(string); ok {
			parsed, err := parseSourceTime(insertedAt, window.Start.Location())
			if err == nil && (parsed.Before(window.Start) || !parsed.Before(window.EndExclusive)) {
				continue
			}
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

func buildNormalizedTagSignals(
	observedTags []map[string]any,
	config controlplane.TagMappingConfig,
) json.RawMessage {
	entryByID := map[string]controlplane.TagMappingEntry{}
	entryByLabel := map[string]controlplane.TagMappingEntry{}
	for _, entry := range config.Entries {
		if entry.PancakeTagID != "" {
			entryByID[entry.PancakeTagID] = entry
		}
		if normalizedLabel := normalizeControlText(entry.RawLabel); normalizedLabel != "" {
			entryByLabel[normalizedLabel] = entry
		}
	}

	matchedSignals := map[string][]string{}
	for _, tag := range observedTags {
		entry, ok := resolveTagMappingEntry(tag, entryByID, entryByLabel)
		if !ok {
			continue
		}
		signal := strings.TrimSpace(entry.Signal)
		if signal == "" || signal == strings.TrimSpace(config.DefaultSignal) || signal == "null" {
			continue
		}
		rawLabel := strings.TrimSpace(tagText(tag))
		if rawLabel == "" {
			rawLabel = strings.TrimSpace(entry.RawLabel)
		}
		if rawLabel == "" {
			continue
		}
		if !slices.Contains(matchedSignals[signal], rawLabel) {
			matchedSignals[signal] = append(matchedSignals[signal], rawLabel)
		}
	}

	for key := range matchedSignals {
		slices.Sort(matchedSignals[key])
	}
	if len(matchedSignals) == 0 {
		return json.RawMessage("{}")
	}
	return marshalJSON(matchedSignals, "{}")
}

func resolveTagMappingEntry(
	tag map[string]any,
	entryByID map[string]controlplane.TagMappingEntry,
	entryByLabel map[string]controlplane.TagMappingEntry,
) (controlplane.TagMappingEntry, bool) {
	if tagID := tagIDString(tag); tagID != "" {
		if entry, ok := entryByID[tagID]; ok {
			return entry, true
		}
	}
	if label := normalizeControlText(tagText(tag)); label != "" {
		if entry, ok := entryByLabel[label]; ok {
			return entry, true
		}
	}
	return controlplane.TagMappingEntry{}, false
}

func buildOpeningBlocks(
	openingMessages []openingBlockMessage,
	transformedOpeningMessages []MessageSource,
	rawOpeningMessages []pancake.Message,
	config controlplane.OpeningRulesConfig,
) openingBlocks {
	candidates := collectOpeningCandidates(transformedOpeningMessages, rawOpeningMessages)
	matchedSelections, deterministicSignals := matchOpeningCandidates(candidates, config.Selectors)
	unmatchedTexts := []string{}
	if len(matchedSelections) == 0 && config.Fallback.StoreCandidateIfUnmatched {
		unmatchedTexts = collectOpeningCandidateTexts(candidates)
	}

	return openingBlocks{
		OpeningCandidateWindow: openingMessages,
		MatchedSelections:      matchedSelections,
		DeterministicSignals:   deterministicSignals,
		UnmatchedCandidateText: unmatchedTexts,
	}
}

type openingCandidate struct {
	MessageID   string
	MessageType string
	RawText     string
}

func collectOpeningCandidates(
	transformedOpeningMessages []MessageSource,
	rawOpeningMessages []pancake.Message,
) []openingCandidate {
	collected := make([]openingCandidate, 0, len(transformedOpeningMessages)*2)
	for idx, message := range transformedOpeningMessages {
		if text := strings.TrimSpace(message.RedactedText); text != "" {
			collected = append(collected, openingCandidate{
				MessageID:   message.MessageID,
				MessageType: message.MessageType,
				RawText:     text,
			})
		}
		if idx >= len(rawOpeningMessages) {
			continue
		}
		for _, attachment := range rawOpeningMessages[idx].Attachments {
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
				if strings.TrimSpace(title) == "" {
					continue
				}
				collected = append(collected, openingCandidate{
					MessageID:   message.MessageID,
					MessageType: "template",
					RawText:     title,
				})
			}
		}
	}
	return collected
}

func matchOpeningCandidates(
	candidates []openingCandidate,
	selectors []controlplane.OpeningSelector,
) ([]openingSelection, map[string][]string) {
	matchedSelections := make([]openingSelection, 0)
	deterministicSignals := map[string][]string{}
	seenSelections := map[string]struct{}{}

	for _, candidate := range candidates {
		normalizedText := normalizeControlText(candidate.RawText)
		if normalizedText == "" {
			continue
		}
		for _, selector := range selectors {
			if !selectorAllowsMessageType(selector, candidate.MessageType) {
				continue
			}
			for _, option := range selector.Options {
				if normalizeControlText(option.RawText) != normalizedText {
					continue
				}
				selection := openingSelection{
					Signal:      selector.Signal,
					RawText:     strings.TrimSpace(candidate.RawText),
					Decision:    option.Decision,
					MessageID:   candidate.MessageID,
					MessageType: candidate.MessageType,
				}
				key := strings.Join([]string{selection.Signal, selection.Decision, selection.RawText, selection.MessageID, selection.MessageType}, "|")
				if _, exists := seenSelections[key]; !exists {
					seenSelections[key] = struct{}{}
					matchedSelections = append(matchedSelections, selection)
				}
				decision := strings.TrimSpace(option.Decision)
				if decision != "" && !slices.Contains(deterministicSignals[selector.Signal], decision) {
					deterministicSignals[selector.Signal] = append(deterministicSignals[selector.Signal], decision)
				}
			}
		}
	}

	for key := range deterministicSignals {
		slices.Sort(deterministicSignals[key])
	}
	return matchedSelections, deterministicSignals
}

func selectorAllowsMessageType(selector controlplane.OpeningSelector, messageType string) bool {
	if len(selector.AllowedMessageTypes) == 0 {
		return true
	}
	for _, allowed := range selector.AllowedMessageTypes {
		if normalizeControlText(allowed) == normalizeControlText(messageType) {
			return true
		}
	}
	return false
}

func collectOpeningCandidateTexts(candidates []openingCandidate) []string {
	collected := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if text := strings.TrimSpace(candidate.RawText); text != "" {
			collected = append(collected, text)
		}
	}
	return uniqueSortedStrings(collected)
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]struct{}{}
	collected := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		collected = append(collected, trimmed)
	}
	slices.Sort(collected)
	return collected
}

func resolveTag(rawTag json.RawMessage, tagDictionary map[int64]pancake.Tag) (map[string]any, bool) {
	var tag map[string]any
	if err := json.Unmarshal(rawTag, &tag); err != nil {
		return nil, false
	}
	rawID, ok := tag["id"]
	if !ok {
		return tag, true
	}
	tagID, ok := asInt64(rawID)
	if !ok {
		return tag, true
	}
	if resolved, exists := tagDictionary[tagID]; exists {
		if _, ok := tag["text"]; !ok || tag["text"] == "" {
			tag["text"] = resolved.Text
		}
		if _, ok := tag["color"]; !ok || tag["color"] == "" {
			tag["color"] = resolved.Color
		}
		if _, ok := tag["lighten_color"]; !ok || tag["lighten_color"] == "" {
			tag["lighten_color"] = resolved.LightenColor
		}
	}
	return tag, true
}

func tagIdentityKey(tag map[string]any) string {
	tagID := tagIDString(tag)
	label := normalizeControlText(tagText(tag))
	if tagID != "" {
		return fmt.Sprintf("%s|%s", tagID, label)
	}
	return label
}

func tagIDString(tag map[string]any) string {
	tagID, ok := asInt64(tag["id"])
	if !ok {
		return ""
	}
	return fmt.Sprintf("%d", tagID)
}

func tagText(tag map[string]any) string {
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

func normalizeControlText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Join(strings.Fields(value), " ")
}
