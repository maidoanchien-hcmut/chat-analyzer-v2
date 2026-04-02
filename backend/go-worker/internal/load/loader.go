package load

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/extract"
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Result struct {
	ETLRunID string
}

func Save(
	ctx context.Context,
	cfg config.Config,
	summary extract.Summary,
	tags []pancake.Tag,
	conversationDays []transform.ConversationDaySource,
	threadMappings []transform.ThreadCustomerMapping,
) (Result, error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return Result{}, fmt.Errorf("connect postgres: %w", err)
	}
	defer pool.Close()

	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Result{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer rollbackOnError(ctx, tx)

	startedAt := time.Now().UTC()
	etlRunID, err := insertETLRun(ctx, tx, cfg, summary, tags, startedAt)
	if err != nil {
		return Result{}, err
	}

	for _, conversationDay := range conversationDays {
		conversationDayID, err := insertConversationDay(ctx, tx, etlRunID, conversationDay, startedAt)
		if err != nil {
			return Result{}, err
		}
		if err := insertMessages(ctx, tx, etlRunID, conversationDayID, conversationDay.Messages, startedAt); err != nil {
			return Result{}, err
		}
	}

	for _, mapping := range threadMappings {
		if err := insertThreadCustomerMapping(ctx, tx, mapping, startedAt); err != nil {
			return Result{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Result{}, fmt.Errorf("commit transaction: %w", err)
	}

	return Result{ETLRunID: etlRunID}, nil
}

func rollbackOnError(ctx context.Context, tx pgx.Tx) {
	_ = tx.Rollback(ctx)
}

func insertETLRun(
	ctx context.Context,
	tx pgx.Tx,
	cfg config.Config,
	summary extract.Summary,
	tags []pancake.Tag,
	startedAt time.Time,
) (string, error) {
	targetDate, _ := cfg.BusinessWindow()
	windowStartAt, windowEndAt := cfg.EffectiveWindow()
	metricsJSON, err := json.Marshal(summary)
	if err != nil {
		return "", fmt.Errorf("marshal run metrics: %w", err)
	}
	tagDictionaryJSON, err := json.Marshal(tags)
	if err != nil {
		return "", fmt.Errorf("marshal tag dictionary: %w", err)
	}

	status := "loaded"
	if cfg.IsPublished {
		status = "published"
	}

	etlRunID := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO etl_run (
			id,
			run_group_id,
			run_mode,
			page_id,
			target_date,
			business_timezone,
			requested_window_start_at,
			requested_window_end_exclusive_at,
			window_start_at,
			window_end_exclusive_at,
			status,
			snapshot_version,
			is_published,
			tag_dictionary_json,
			metrics_json,
			started_at,
			finished_at
		) VALUES (
			$1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17
		)
	`,
		etlRunID,
		cfg.RunGroupID,
		cfg.RunMode,
		summary.PageID,
		targetDate.Format(time.DateOnly),
		cfg.BusinessTimezone,
		cfg.RequestedWindowStartAt,
		cfg.RequestedWindowEndExclusiveAt,
		windowStartAt,
		windowEndAt,
		status,
		cfg.SnapshotVersion,
		cfg.IsPublished,
		tagDictionaryJSON,
		metricsJSON,
		startedAt,
		time.Now().UTC(),
	)
	if err != nil {
		return "", fmt.Errorf("insert etl_run: %w", err)
	}

	return etlRunID, nil
}

func insertConversationDay(
	ctx context.Context,
	tx pgx.Tx,
	etlRunID string,
	conversationDay transform.ConversationDaySource,
	createdAt time.Time,
) (string, error) {
	conversationDayID := uuid.NewString()
	_, err := tx.Exec(ctx, `
		INSERT INTO conversation_day (
			id,
			etl_run_id,
			conversation_id,
			customer_display_name,
			conversation_inserted_at,
			conversation_updated_at,
			message_count_seen_from_source,
			normalized_phone_candidates_json,
			current_tags_json,
			observed_tag_events_json,
			normalized_tag_signals_json,
			opening_blocks_json,
			first_meaningful_human_message_id,
			first_meaningful_human_sender_role,
			source_conversation_json,
			created_at
		) VALUES (
			$1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, NULLIF($13, ''), NULLIF($14, ''), $15::jsonb, $16
		)
	`,
		conversationDayID,
		etlRunID,
		conversationDay.ConversationID,
		conversationDay.CustomerDisplayName,
		conversationDay.ConversationInsertedAt,
		conversationDay.ConversationUpdatedAt,
		conversationDay.MessageCountSeenFromSource,
		conversationDay.NormalizedPhoneCandidatesJSON,
		conversationDay.CurrentTagsJSON,
		conversationDay.ObservedTagEventsJSON,
		conversationDay.NormalizedTagSignalsJSON,
		conversationDay.OpeningBlocksJSON,
		conversationDay.FirstMeaningfulHumanMessageID,
		conversationDay.FirstMeaningfulHumanSenderRole,
		conversationDay.SourceConversationJSON,
		createdAt,
	)
	if err != nil {
		return "", fmt.Errorf("insert conversation_day %s: %w", conversationDay.ConversationID, err)
	}
	return conversationDayID, nil
}

func insertMessages(
	ctx context.Context,
	tx pgx.Tx,
	etlRunID string,
	conversationDayID string,
	messages []transform.MessageSource,
	createdAt time.Time,
) error {
	for _, message := range messages {
		_, err := tx.Exec(ctx, `
			INSERT INTO message (
				id,
				conversation_day_id,
				etl_run_id,
				message_id,
				conversation_id,
				inserted_at,
				sender_source_id,
				sender_name,
				sender_role,
				source_message_type_raw,
				message_type,
				redacted_text,
				attachments_json,
				message_tags_json,
				is_meaningful_human_message,
				source_message_json_redacted,
				created_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), $11, NULLIF($12, ''), $13::jsonb, $14::jsonb, $15, $16::jsonb, $17
			)
		`,
			uuid.NewString(),
			conversationDayID,
			etlRunID,
			message.MessageID,
			message.ConversationID,
			message.InsertedAt,
			message.SenderSourceID,
			message.SenderName,
			message.SenderRole,
			message.SourceMessageTypeRaw,
			message.MessageType,
			message.RedactedText,
			message.AttachmentsJSON,
			message.MessageTagsJSON,
			message.IsMeaningfulHumanMessage,
			message.SourceMessageJSONRedacted,
			createdAt,
		)
		if err != nil {
			return fmt.Errorf("insert message %s: %w", message.MessageID, err)
		}
	}
	return nil
}

func insertThreadCustomerMapping(
	ctx context.Context,
	tx pgx.Tx,
	mapping transform.ThreadCustomerMapping,
	timestamp time.Time,
) error {
	if mapping.PageID == "" || mapping.ThreadID == "" || mapping.CustomerID == "" || mapping.MappingMethod == "" {
		return nil
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO thread_customer_mapping (
			page_id,
			thread_id,
			customer_id,
			mapped_phone_e164,
			mapping_method,
			created_at,
			updated_at
		) VALUES (
			$1, $2, $3, NULLIF($4, ''), $5, $6, $6
		)
		ON CONFLICT (page_id, thread_id) DO UPDATE
		SET customer_id = EXCLUDED.customer_id,
		    mapped_phone_e164 = EXCLUDED.mapped_phone_e164,
		    mapping_method = EXCLUDED.mapping_method,
		    updated_at = EXCLUDED.updated_at
	`,
		mapping.PageID,
		mapping.ThreadID,
		mapping.CustomerID,
		mapping.MappedPhoneE164,
		mapping.MappingMethod,
		timestamp,
	)
	if err != nil {
		return fmt.Errorf("upsert thread_customer_mapping %s/%s: %w", mapping.PageID, mapping.ThreadID, err)
	}
	return nil
}
