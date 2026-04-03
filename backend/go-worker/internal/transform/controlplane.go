package transform

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"chat-analyzer-v2/backend/go-worker/internal/controlplane"
)

func BuildThreadCustomerMappings(
	connectedPageID string,
	conversationDays []ConversationDaySource,
	policies controlplane.RuntimeConfig,
) ([]ThreadCustomerMapping, error) {
	if connectedPageID == "" || len(policies.CustomerDirectory) == 0 {
		return nil, nil
	}

	customerByPhone := map[string][]string{}
	for _, entry := range policies.CustomerDirectory {
		phone := strings.TrimSpace(entry.PhoneE164)
		customerID := strings.TrimSpace(entry.CustomerID)
		if phone == "" || customerID == "" {
			continue
		}
		if !slices.Contains(customerByPhone[phone], customerID) {
			customerByPhone[phone] = append(customerByPhone[phone], customerID)
		}
	}

	mappings := make([]ThreadCustomerMapping, 0)
	for _, day := range conversationDays {
		var phones []string
		if err := json.Unmarshal(day.NormalizedPhoneCandidatesJSON, &phones); err != nil {
			return nil, fmt.Errorf("decode normalized_phone_candidates for %s: %w", day.ConversationID, err)
		}
		if len(phones) != 1 {
			continue
		}
		customerIDs := customerByPhone[phones[0]]
		if len(customerIDs) != 1 {
			continue
		}
		confidenceScore := 1.0
		mappings = append(mappings, ThreadCustomerMapping{
			ConnectedPageID: connectedPageID,
			ThreadID:        day.ConversationID,
			CustomerID:      customerIDs[0],
			MappedPhoneE164: phones[0],
			MappingMethod:   "deterministic_single_phone",
			ConfidenceScore: &confidenceScore,
		})
	}
	return mappings, nil
}
