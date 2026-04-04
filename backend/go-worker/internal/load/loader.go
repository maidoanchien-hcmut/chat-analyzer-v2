package load

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Result struct {
	PipelineRunID string
}

type execer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type queryer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func StartRun(ctx context.Context, cfg config.Config) (Result, error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return Result{}, fmt.Errorf("connect postgres: %w", err)
	}
	defer pool.Close()

	if err := markPipelineRunStarted(ctx, pool, cfg.PipelineRunID, time.Now().UTC()); err != nil {
		return Result{}, err
	}
	return Result{PipelineRunID: cfg.PipelineRunID}, nil
}

func SaveSuccess(
	ctx context.Context,
	cfg config.Config,
	pipelineRunID string,
	metrics map[string]any,
	_ any,
	conversationDays []transform.ConversationDaySource,
) error {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect postgres: %w", err)
	}
	defer pool.Close()

	loadedThreadDays := 0
	loadedMessages := 0
	failures := make([]string, 0)

	for _, threadDay := range conversationDays {
		if err := persistThreadDay(ctx, pool, cfg, pipelineRunID, threadDay); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %s", threadDay.ConversationID, compactErrorText(err)))
			continue
		}
		loadedThreadDays++
		loadedMessages += len(threadDay.Messages)
	}

	finalMetrics := cloneMetrics(metrics)
	finalMetrics["thread_days_loaded"] = loadedThreadDays
	finalMetrics["messages_loaded"] = loadedMessages
	finalMetrics["thread_day_failures_count"] = len(failures)
	if len(failures) > 0 {
		finalMetrics["thread_day_failures"] = failures
	}

	finishedAt := time.Now().UTC()
	reuseSummary := buildReuseSummary(loadedThreadDays)
	errorText := ""
	if len(failures) > 0 {
		errorText = strings.Join(failures, "\n")
	}

	status := "loaded"
	if loadedThreadDays == 0 && len(failures) > 0 {
		status = "failed"
	}
	return updatePipelineRunCompletion(ctx, pool, pipelineRunID, status, finalMetrics, reuseSummary, errorText, finishedAt)
}

func SaveFailure(
	ctx context.Context,
	cfg config.Config,
	pipelineRunID string,
	metrics map[string]any,
	runErr error,
) error {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect postgres: %w", err)
	}
	defer pool.Close()

	finalMetrics := cloneMetrics(metrics)
	finalMetrics["thread_day_failures_count"] = finalMetrics["thread_day_failures_count"]
	return updatePipelineRunCompletion(
		ctx,
		pool,
		pipelineRunID,
		"failed",
		finalMetrics,
		buildReuseSummary(0),
		compactErrorText(runErr),
		time.Now().UTC(),
	)
}

func markPipelineRunStarted(ctx context.Context, db execer, pipelineRunID string, startedAt time.Time) error {
	commandTag, err := db.Exec(ctx, `
		UPDATE pipeline_run
		SET status = 'running',
		    error_text = NULL,
		    started_at = $2,
		    finished_at = NULL
		WHERE id = $1::uuid
	`,
		pipelineRunID,
		startedAt,
	)
	if err != nil {
		return fmt.Errorf("update pipeline_run start %s: %w", pipelineRunID, err)
	}
	if commandTag.RowsAffected() == 0 {
		return fmt.Errorf("pipeline_run %s not found", pipelineRunID)
	}
	return nil
}

func updatePipelineRunCompletion(
	ctx context.Context,
	db execer,
	pipelineRunID string,
	status string,
	metrics map[string]any,
	reuseSummary map[string]any,
	errorText string,
	finishedAt time.Time,
) error {
	metricsJSON, err := json.Marshal(metrics)
	if err != nil {
		return fmt.Errorf("marshal run metrics: %w", err)
	}
	reuseSummaryJSON, err := json.Marshal(reuseSummary)
	if err != nil {
		return fmt.Errorf("marshal reuse summary: %w", err)
	}

	commandTag, err := db.Exec(ctx, `
		UPDATE pipeline_run
		SET status = $2,
		    metrics_json = $3::jsonb,
		    reuse_summary_json = $4::jsonb,
		    error_text = NULLIF($5, ''),
		    finished_at = $6
		WHERE id = $1::uuid
	`,
		pipelineRunID,
		status,
		metricsJSON,
		reuseSummaryJSON,
		errorText,
		finishedAt,
	)
	if err != nil {
		return fmt.Errorf("update pipeline_run completion %s: %w", pipelineRunID, err)
	}
	if commandTag.RowsAffected() == 0 {
		return fmt.Errorf("pipeline_run %s not found", pipelineRunID)
	}
	return nil
}

func persistThreadDay(
	ctx context.Context,
	pool *pgxpool.Pool,
	cfg config.Config,
	pipelineRunID string,
	threadDay transform.ConversationDaySource,
) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer rollbackOnError(ctx, tx)

	threadID, err := upsertThread(ctx, tx, cfg, threadDay)
	if err != nil {
		return err
	}
	threadDayID, err := upsertThreadDay(ctx, tx, pipelineRunID, threadID, threadDay)
	if err != nil {
		return err
	}
	if err := insertMessages(ctx, tx, threadDayID, threadDay.Messages, time.Now().UTC()); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func rollbackOnError(ctx context.Context, tx pgx.Tx) {
	_ = tx.Rollback(ctx)
}

func upsertThread(
	ctx context.Context,
	db queryer,
	cfg config.Config,
	threadDay transform.ConversationDaySource,
) (string, error) {
	now := time.Now().UTC()
	threadID := ""
	if err := db.QueryRow(ctx, `
		INSERT INTO thread (
			id,
			connected_page_id,
			source_thread_id,
			thread_first_seen_at,
			thread_last_seen_at,
			customer_display_name,
			current_phone_candidates_json,
			latest_entry_source_type,
			latest_entry_post_id,
			latest_entry_ad_id,
			created_at,
			updated_at
		) VALUES (
			$1::uuid, $2::uuid, $3, $4, $5, NULLIF($6, ''), $7::jsonb, NULLIF($8, ''), NULLIF($9, ''), NULLIF($10, ''), $11, $11
		)
		ON CONFLICT (connected_page_id, source_thread_id) DO UPDATE
		SET thread_first_seen_at = CASE
			WHEN EXCLUDED.thread_first_seen_at IS NULL THEN thread.thread_first_seen_at
			WHEN thread.thread_first_seen_at IS NULL OR EXCLUDED.thread_first_seen_at < thread.thread_first_seen_at THEN EXCLUDED.thread_first_seen_at
			ELSE thread.thread_first_seen_at
		END,
		    thread_last_seen_at = CASE
			WHEN EXCLUDED.thread_last_seen_at IS NULL THEN thread.thread_last_seen_at
			WHEN thread.thread_last_seen_at IS NULL OR EXCLUDED.thread_last_seen_at > thread.thread_last_seen_at THEN EXCLUDED.thread_last_seen_at
			ELSE thread.thread_last_seen_at
		END,
		    customer_display_name = COALESCE(NULLIF(EXCLUDED.customer_display_name, ''), thread.customer_display_name),
		    current_phone_candidates_json = CASE
			WHEN EXCLUDED.current_phone_candidates_json = '[]'::jsonb THEN thread.current_phone_candidates_json
			ELSE EXCLUDED.current_phone_candidates_json
		END,
		    latest_entry_source_type = COALESCE(NULLIF(EXCLUDED.latest_entry_source_type, ''), thread.latest_entry_source_type),
		    latest_entry_post_id = COALESCE(NULLIF(EXCLUDED.latest_entry_post_id, ''), thread.latest_entry_post_id),
		    latest_entry_ad_id = COALESCE(NULLIF(EXCLUDED.latest_entry_ad_id, ''), thread.latest_entry_ad_id),
		    updated_at = EXCLUDED.updated_at
		RETURNING id
	`,
		uuid.NewString(),
		cfg.ConnectedPageID,
		threadDay.ConversationID,
		threadDay.ThreadFirstSeenAt,
		threadDay.ThreadLastSeenAt,
		threadDay.CustomerDisplayName,
		threadDay.CurrentPhoneCandidatesJSON,
		threadDay.EntrySourceType,
		threadDay.EntryPostID,
		threadDay.EntryAdID,
		now,
	).Scan(&threadID); err != nil {
		return "", fmt.Errorf("upsert thread %s: %w", threadDay.ConversationID, err)
	}
	return threadID, nil
}

func upsertThreadDay(
	ctx context.Context,
	db queryer,
	pipelineRunID string,
	threadID string,
	threadDay transform.ConversationDaySource,
) (string, error) {
	now := time.Now().UTC()
	threadDayID := ""
	if err := db.QueryRow(ctx, `
		INSERT INTO thread_day (
			id,
			pipeline_run_id,
			thread_id,
			is_new_inbox,
			entry_source_type,
			entry_post_id,
			entry_ad_id,
			observed_tags_json,
			normalized_tag_signals_json,
			opening_block_json,
			first_meaningful_message_id,
			first_meaningful_message_text_redacted,
			first_meaningful_message_sender_role,
			message_count,
			first_staff_response_seconds,
			avg_staff_response_seconds,
			staff_participants_json,
			staff_message_stats_json,
			explicit_revisit_signal,
			explicit_need_signal,
			explicit_outcome_signal,
			source_thread_json_redacted,
			created_at
		) VALUES (
			$1::uuid, $2::uuid, $3::uuid, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8::jsonb, $9::jsonb, $10::jsonb,
			NULLIF($11, ''), NULLIF($12, ''), NULLIF($13, ''), $14, $15, $16, $17::jsonb, $18::jsonb,
			NULLIF($19, ''), NULLIF($20, ''), NULLIF($21, ''), $22::jsonb, $23
		)
		ON CONFLICT (pipeline_run_id, thread_id) DO UPDATE
		SET is_new_inbox = EXCLUDED.is_new_inbox,
		    entry_source_type = EXCLUDED.entry_source_type,
		    entry_post_id = EXCLUDED.entry_post_id,
		    entry_ad_id = EXCLUDED.entry_ad_id,
		    observed_tags_json = EXCLUDED.observed_tags_json,
		    normalized_tag_signals_json = EXCLUDED.normalized_tag_signals_json,
		    opening_block_json = EXCLUDED.opening_block_json,
		    first_meaningful_message_id = EXCLUDED.first_meaningful_message_id,
		    first_meaningful_message_text_redacted = EXCLUDED.first_meaningful_message_text_redacted,
		    first_meaningful_message_sender_role = EXCLUDED.first_meaningful_message_sender_role,
		    message_count = EXCLUDED.message_count,
		    first_staff_response_seconds = EXCLUDED.first_staff_response_seconds,
		    avg_staff_response_seconds = EXCLUDED.avg_staff_response_seconds,
		    staff_participants_json = EXCLUDED.staff_participants_json,
		    staff_message_stats_json = EXCLUDED.staff_message_stats_json,
		    explicit_revisit_signal = EXCLUDED.explicit_revisit_signal,
		    explicit_need_signal = EXCLUDED.explicit_need_signal,
		    explicit_outcome_signal = EXCLUDED.explicit_outcome_signal,
		    source_thread_json_redacted = EXCLUDED.source_thread_json_redacted
		RETURNING id
	`,
		uuid.NewString(),
		pipelineRunID,
		threadID,
		threadDay.IsNewInbox,
		threadDay.EntrySourceType,
		threadDay.EntryPostID,
		threadDay.EntryAdID,
		threadDay.ObservedTagsJSON,
		threadDay.NormalizedTagSignalsJSON,
		threadDay.OpeningBlockJSON,
		threadDay.FirstMeaningfulMessageID,
		threadDay.FirstMeaningfulMessageText,
		threadDay.FirstMeaningfulMessageSenderRole,
		threadDay.MessageCount,
		threadDay.FirstStaffResponseSeconds,
		threadDay.AvgStaffResponseSeconds,
		threadDay.StaffParticipantsJSON,
		threadDay.StaffMessageStatsJSON,
		threadDay.ExplicitRevisitSignal,
		threadDay.ExplicitNeedSignal,
		threadDay.ExplicitOutcomeSignal,
		threadDay.SourceConversationJSONRedacted,
		now,
	).Scan(&threadDayID); err != nil {
		return "", fmt.Errorf("upsert thread_day %s: %w", threadDay.ConversationID, err)
	}
	return threadDayID, nil
}

func insertMessages(
	ctx context.Context,
	db execer,
	threadDayID string,
	messages []transform.MessageSource,
	createdAt time.Time,
) error {
	for _, message := range messages {
		_, err := db.Exec(ctx, `
			INSERT INTO message (
				id,
				thread_day_id,
				source_message_id,
				inserted_at,
				sender_role,
				sender_source_id,
				sender_name,
				message_type,
				source_message_type_raw,
				redacted_text,
				attachments_json,
				is_meaningful_human_message,
				is_opening_block_message,
				source_message_json_redacted,
				created_at
			) VALUES (
				$1::uuid, $2::uuid, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, NULLIF($9, ''), NULLIF($10, ''),
				$11::jsonb, $12, $13, $14::jsonb, $15
			)
			ON CONFLICT (thread_day_id, source_message_id) DO UPDATE
			SET inserted_at = EXCLUDED.inserted_at,
			    sender_role = EXCLUDED.sender_role,
			    sender_source_id = EXCLUDED.sender_source_id,
			    sender_name = EXCLUDED.sender_name,
			    message_type = EXCLUDED.message_type,
			    source_message_type_raw = EXCLUDED.source_message_type_raw,
			    redacted_text = EXCLUDED.redacted_text,
			    attachments_json = EXCLUDED.attachments_json,
			    is_meaningful_human_message = EXCLUDED.is_meaningful_human_message,
			    is_opening_block_message = EXCLUDED.is_opening_block_message,
			    source_message_json_redacted = EXCLUDED.source_message_json_redacted
		`,
			uuid.NewString(),
			threadDayID,
			message.MessageID,
			message.InsertedAt,
			message.SenderRole,
			message.SenderSourceID,
			message.SenderName,
			message.MessageType,
			message.SourceMessageTypeRaw,
			message.RedactedText,
			message.AttachmentsJSON,
			message.IsMeaningfulHumanMessage,
			message.IsOpeningBlockMessage,
			message.SourceMessageJSONRedacted,
			createdAt,
		)
		if err != nil {
			return fmt.Errorf("insert message %s: %w", message.MessageID, err)
		}
	}
	return nil
}

func buildReuseSummary(threadCount int) map[string]any {
	return map[string]any{
		"raw_reused_thread_count":    0,
		"raw_refetched_thread_count": threadCount,
		"ods_reused_thread_count":    0,
		"ods_rebuilt_thread_count":   threadCount,
		"reuse_reason":               "fresh_run",
	}
}

func cloneMetrics(metrics map[string]any) map[string]any {
	cloned := make(map[string]any, len(metrics))
	for key, value := range metrics {
		cloned[key] = value
	}
	return cloned
}

func compactErrorText(runErr error) string {
	if runErr == nil {
		return ""
	}
	text := strings.TrimSpace(runErr.Error())
	if len(text) <= 4000 {
		return text
	}
	return text[:4000]
}
