DROP TABLE IF EXISTS "analysis_result" CASCADE;
DROP TABLE IF EXISTS "analysis_run" CASCADE;
DROP TABLE IF EXISTS "thread_customer_mapping_decision" CASCADE;
DROP TABLE IF EXISTS "message" CASCADE;
DROP TABLE IF EXISTS "conversation_day" CASCADE;
DROP TABLE IF EXISTS "thread_customer_mapping" CASCADE;
DROP TABLE IF EXISTS "etl_run" CASCADE;
DROP TABLE IF EXISTS "page_ai_profile_version" CASCADE;
DROP TABLE IF EXISTS "page_prompt_version" CASCADE;
DROP TABLE IF EXISTS "connected_page" CASCADE;

CREATE TABLE "connected_page" (
  "id" UUID NOT NULL,
  "pancake_page_id" TEXT NOT NULL,
  "page_name" TEXT NOT NULL,
  "pancake_user_access_token" TEXT NOT NULL,
  "business_timezone" TEXT NOT NULL,
  "etl_enabled" BOOLEAN NOT NULL DEFAULT false,
  "analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
  "active_ai_profiles_json" JSONB NOT NULL DEFAULT '{}',
  "active_tag_mapping_json" JSONB NOT NULL DEFAULT '{}',
  "active_opening_rules_json" JSONB NOT NULL DEFAULT '{}',
  "notification_targets_json" JSONB NOT NULL DEFAULT '{}',
  "onboarding_state_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "connected_page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_ai_profile_version" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "capability_key" TEXT NOT NULL,
  "version_no" INTEGER NOT NULL,
  "profile_json" JSONB NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "page_ai_profile_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "etl_run" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "run_group_id" UUID NOT NULL,
  "run_mode" TEXT NOT NULL,
  "processing_mode" TEXT NOT NULL,
  "target_date" DATE NOT NULL,
  "business_timezone" TEXT NOT NULL,
  "requested_window_start_at" TIMESTAMPTZ(6),
  "requested_window_end_exclusive_at" TIMESTAMPTZ(6),
  "window_start_at" TIMESTAMPTZ(6) NOT NULL,
  "window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
  "snapshot_version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "run_params_json" JSONB NOT NULL DEFAULT '{}',
  "tag_dictionary_json" JSONB NOT NULL DEFAULT '[]',
  "metrics_json" JSONB NOT NULL DEFAULT '{}',
  "error_text" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "etl_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_day" (
  "id" UUID NOT NULL,
  "etl_run_id" UUID NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "thread_first_seen_at" TIMESTAMPTZ(6),
  "conversation_updated_at" TIMESTAMPTZ(6),
  "customer_display_name" TEXT,
  "message_count_persisted" INTEGER NOT NULL,
  "message_count_seen_from_source" INTEGER NOT NULL,
  "normalized_phone_candidates_json" JSONB NOT NULL DEFAULT '[]',
  "observed_tags_json" JSONB NOT NULL DEFAULT '[]',
  "normalized_tag_signals_json" JSONB NOT NULL DEFAULT '{}',
  "opening_blocks_json" JSONB NOT NULL DEFAULT '{}',
  "first_meaningful_human_message_id" TEXT,
  "first_meaningful_human_sender_role" TEXT,
  "source_conversation_json_redacted" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message" (
  "id" UUID NOT NULL,
  "conversation_day_id" UUID NOT NULL,
  "message_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "inserted_at" TIMESTAMPTZ(6) NOT NULL,
  "sender_source_id" TEXT,
  "sender_name" TEXT,
  "sender_role" TEXT NOT NULL,
  "source_message_type_raw" TEXT,
  "message_type" TEXT NOT NULL,
  "redacted_text" TEXT,
  "attachments_json" JSONB NOT NULL DEFAULT '[]',
  "is_meaningful_human_message" BOOLEAN NOT NULL DEFAULT false,
  "is_opening_block_message" BOOLEAN NOT NULL DEFAULT false,
  "source_message_json_redacted" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analysis_run" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "run_group_id" UUID NOT NULL,
  "run_mode" TEXT NOT NULL,
  "source_etl_run_id" UUID,
  "scope_ref_json" JSONB,
  "job_status" TEXT NOT NULL,
  "run_outcome" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "ai_profile_version_id" UUID NOT NULL,
  "model_name" TEXT NOT NULL,
  "output_schema_version" TEXT NOT NULL,
  "runtime_snapshot_json" JSONB NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "unit_count_planned" INTEGER NOT NULL DEFAULT 0,
  "unit_count_succeeded" INTEGER NOT NULL DEFAULT 0,
  "unit_count_unknown" INTEGER NOT NULL DEFAULT 0,
  "unit_count_review_queue" INTEGER NOT NULL DEFAULT 0,
  "total_usage_json" JSONB NOT NULL DEFAULT '{}',
  "total_cost_micros" BIGINT NOT NULL DEFAULT 0,
  "created_by_user_id" INTEGER,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analysis_result" (
  "id" UUID NOT NULL,
  "analysis_run_id" UUID NOT NULL,
  "conversation_day_id" UUID,
  "custom_scope_json" JSONB,
  "publish_state" TEXT NOT NULL,
  "result_status" TEXT NOT NULL,
  "prompt_hash" TEXT NOT NULL,
  "opening_theme" TEXT NOT NULL,
  "customer_mood" TEXT NOT NULL,
  "primary_need" TEXT NOT NULL,
  "primary_topic" TEXT NOT NULL,
  "content_customer_type" TEXT NOT NULL,
  "closing_outcome_as_of_day" TEXT NOT NULL,
  "response_quality_label" TEXT NOT NULL,
  "process_risk_level" TEXT NOT NULL,
  "response_quality_issue_text" TEXT,
  "response_quality_improvement_text" TEXT,
  "process_risk_reason_text" TEXT,
  "usage_json" JSONB NOT NULL DEFAULT '{}',
  "cost_micros" BIGINT NOT NULL DEFAULT 0,
  "failure_info_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),

  CONSTRAINT "analysis_result_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thread_customer_mapping_decision" (
  "id" UUID NOT NULL,
  "run_group_id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "run_mode" TEXT NOT NULL,
  "source_etl_run_id" UUID,
  "scope_ref_json" JSONB,
  "idempotency_key" TEXT,
  "ai_profile_version_id" UUID NOT NULL,
  "model_name" TEXT NOT NULL,
  "output_schema_version" TEXT NOT NULL,
  "runtime_snapshot_json" JSONB NOT NULL,
  "thread_id" TEXT NOT NULL,
  "decision_source" TEXT NOT NULL,
  "selected_customer_id" TEXT,
  "confidence_score" DECIMAL(5,4),
  "decision_status" TEXT NOT NULL,
  "promotion_state" TEXT NOT NULL,
  "prompt_hash" TEXT NOT NULL,
  "evidence_json" JSONB NOT NULL DEFAULT '{}',
  "usage_json" JSONB NOT NULL DEFAULT '{}',
  "cost_micros" BIGINT NOT NULL DEFAULT 0,
  "failure_info_json" JSONB,
  "created_by_user_id" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "thread_customer_mapping_decision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thread_customer_mapping" (
  "connected_page_id" UUID NOT NULL,
  "thread_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "mapping_method" TEXT NOT NULL,
  "mapping_confidence_score" DECIMAL(5,4),
  "mapped_phone_e164" TEXT,
  "source_decision_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "thread_customer_mapping_pkey" PRIMARY KEY ("connected_page_id", "thread_id")
);

CREATE UNIQUE INDEX "connected_page_pancake_page_id_key" ON "connected_page"("pancake_page_id");
CREATE INDEX "connected_page_page_name_idx" ON "connected_page"("page_name");
CREATE INDEX "connected_page_etl_enabled_idx" ON "connected_page"("etl_enabled");
CREATE INDEX "connected_page_analysis_enabled_idx" ON "connected_page"("analysis_enabled");
CREATE INDEX "connected_page_created_at_idx" ON "connected_page"("created_at");
CREATE INDEX "connected_page_updated_at_idx" ON "connected_page"("updated_at");

CREATE UNIQUE INDEX "page_ai_profile_version_connected_page_id_capability_key_version_no_key" ON "page_ai_profile_version"("connected_page_id", "capability_key", "version_no");
CREATE INDEX "page_ai_profile_version_connected_page_id_idx" ON "page_ai_profile_version"("connected_page_id");
CREATE INDEX "page_ai_profile_version_capability_key_idx" ON "page_ai_profile_version"("capability_key");
CREATE INDEX "page_ai_profile_version_created_at_idx" ON "page_ai_profile_version"("created_at");

CREATE UNIQUE INDEX "etl_run_connected_page_id_target_date_snapshot_version_key" ON "etl_run"("connected_page_id", "target_date", "snapshot_version");
CREATE INDEX "etl_run_connected_page_id_idx" ON "etl_run"("connected_page_id");
CREATE INDEX "etl_run_run_group_id_idx" ON "etl_run"("run_group_id");
CREATE INDEX "etl_run_run_mode_idx" ON "etl_run"("run_mode");
CREATE INDEX "etl_run_processing_mode_idx" ON "etl_run"("processing_mode");
CREATE INDEX "etl_run_target_date_idx" ON "etl_run"("target_date");
CREATE INDEX "etl_run_status_created_at_idx" ON "etl_run"("status", "created_at");
CREATE INDEX "etl_run_started_at_idx" ON "etl_run"("started_at");
CREATE INDEX "etl_run_finished_at_idx" ON "etl_run"("finished_at");
CREATE UNIQUE INDEX "etl_run_one_published_per_day_key" ON "etl_run"("connected_page_id", "target_date") WHERE "is_published" = true;

CREATE UNIQUE INDEX "conversation_day_etl_run_id_conversation_id_key" ON "conversation_day"("etl_run_id", "conversation_id");
CREATE INDEX "conversation_day_etl_run_id_idx" ON "conversation_day"("etl_run_id");
CREATE INDEX "conversation_day_conversation_id_idx" ON "conversation_day"("conversation_id");
CREATE INDEX "conversation_day_thread_first_seen_at_idx" ON "conversation_day"("thread_first_seen_at");
CREATE INDEX "conversation_day_customer_display_name_idx" ON "conversation_day"("customer_display_name");
CREATE INDEX "conversation_day_created_at_idx" ON "conversation_day"("created_at");

CREATE UNIQUE INDEX "message_conversation_day_id_message_id_key" ON "message"("conversation_day_id", "message_id");
CREATE INDEX "message_conversation_day_id_inserted_at_idx" ON "message"("conversation_day_id", "inserted_at");
CREATE INDEX "message_conversation_id_inserted_at_idx" ON "message"("conversation_id", "inserted_at");
CREATE INDEX "message_sender_role_idx" ON "message"("sender_role");
CREATE INDEX "message_message_type_idx" ON "message"("message_type");
CREATE INDEX "message_is_meaningful_human_message_idx" ON "message"("is_meaningful_human_message");
CREATE INDEX "message_is_opening_block_message_idx" ON "message"("is_opening_block_message");
CREATE INDEX "message_created_at_idx" ON "message"("created_at");

CREATE UNIQUE INDEX "analysis_run_idempotency_key_key" ON "analysis_run"("idempotency_key");
CREATE INDEX "analysis_run_connected_page_id_created_at_idx" ON "analysis_run"("connected_page_id", "created_at" DESC);
CREATE INDEX "analysis_run_run_group_id_idx" ON "analysis_run"("run_group_id");
CREATE INDEX "analysis_run_run_mode_idx" ON "analysis_run"("run_mode");
CREATE INDEX "analysis_run_source_etl_run_id_idx" ON "analysis_run"("source_etl_run_id");
CREATE INDEX "analysis_run_job_status_idx" ON "analysis_run"("job_status");
CREATE INDEX "analysis_run_run_outcome_idx" ON "analysis_run"("run_outcome");
CREATE INDEX "analysis_run_ai_profile_version_id_idx" ON "analysis_run"("ai_profile_version_id");
CREATE INDEX "analysis_run_model_name_idx" ON "analysis_run"("model_name");
CREATE INDEX "analysis_run_output_schema_version_idx" ON "analysis_run"("output_schema_version");
CREATE INDEX "analysis_run_total_cost_micros_idx" ON "analysis_run"("total_cost_micros");
CREATE INDEX "analysis_run_created_by_user_id_idx" ON "analysis_run"("created_by_user_id");
CREATE INDEX "analysis_run_started_at_idx" ON "analysis_run"("started_at");
CREATE INDEX "analysis_run_finished_at_idx" ON "analysis_run"("finished_at");
CREATE INDEX "analysis_run_published_at_idx" ON "analysis_run"("published_at");
CREATE UNIQUE INDEX "analysis_run_scheduled_daily_source_etl_run_id_key" ON "analysis_run"("source_etl_run_id") WHERE "run_mode" = 'scheduled_daily' AND "source_etl_run_id" IS NOT NULL;

CREATE UNIQUE INDEX "analysis_result_analysis_run_id_conversation_day_id_key" ON "analysis_result"("analysis_run_id", "conversation_day_id");
CREATE INDEX "analysis_result_analysis_run_id_publish_state_idx" ON "analysis_result"("analysis_run_id", "publish_state");
CREATE INDEX "analysis_result_conversation_day_id_idx" ON "analysis_result"("conversation_day_id");
CREATE INDEX "analysis_result_publish_state_idx" ON "analysis_result"("publish_state");
CREATE INDEX "analysis_result_result_status_idx" ON "analysis_result"("result_status");
CREATE INDEX "analysis_result_prompt_hash_idx" ON "analysis_result"("prompt_hash");
CREATE INDEX "analysis_result_opening_theme_idx" ON "analysis_result"("opening_theme");
CREATE INDEX "analysis_result_customer_mood_idx" ON "analysis_result"("customer_mood");
CREATE INDEX "analysis_result_primary_need_idx" ON "analysis_result"("primary_need");
CREATE INDEX "analysis_result_primary_topic_idx" ON "analysis_result"("primary_topic");
CREATE INDEX "analysis_result_content_customer_type_idx" ON "analysis_result"("content_customer_type");
CREATE INDEX "analysis_result_closing_outcome_as_of_day_idx" ON "analysis_result"("closing_outcome_as_of_day");
CREATE INDEX "analysis_result_response_quality_label_idx" ON "analysis_result"("response_quality_label");
CREATE INDEX "analysis_result_process_risk_level_idx" ON "analysis_result"("process_risk_level");
CREATE INDEX "analysis_result_cost_micros_idx" ON "analysis_result"("cost_micros");
CREATE INDEX "analysis_result_created_at_idx" ON "analysis_result"("created_at");
CREATE INDEX "analysis_result_published_at_idx" ON "analysis_result"("published_at");
CREATE UNIQUE INDEX "analysis_result_one_published_per_conversation_day_key" ON "analysis_result"("conversation_day_id") WHERE "conversation_day_id" IS NOT NULL AND "publish_state" = 'published';

CREATE UNIQUE INDEX "thread_customer_mapping_decision_run_group_id_thread_id_key" ON "thread_customer_mapping_decision"("run_group_id", "thread_id");
CREATE INDEX "thread_customer_mapping_decision_run_group_id_idx" ON "thread_customer_mapping_decision"("run_group_id");
CREATE INDEX "thread_customer_mapping_decision_connected_page_id_created_at_idx" ON "thread_customer_mapping_decision"("connected_page_id", "created_at" DESC);
CREATE INDEX "thread_customer_mapping_decision_run_mode_idx" ON "thread_customer_mapping_decision"("run_mode");
CREATE INDEX "thread_customer_mapping_decision_source_etl_run_id_idx" ON "thread_customer_mapping_decision"("source_etl_run_id");
CREATE INDEX "thread_customer_mapping_decision_idempotency_key_idx" ON "thread_customer_mapping_decision"("idempotency_key");
CREATE INDEX "thread_customer_mapping_decision_ai_profile_version_id_idx" ON "thread_customer_mapping_decision"("ai_profile_version_id");
CREATE INDEX "thread_customer_mapping_decision_model_name_idx" ON "thread_customer_mapping_decision"("model_name");
CREATE INDEX "thread_customer_mapping_decision_output_schema_version_idx" ON "thread_customer_mapping_decision"("output_schema_version");
CREATE INDEX "thread_customer_mapping_decision_thread_id_idx" ON "thread_customer_mapping_decision"("thread_id");
CREATE INDEX "thread_customer_mapping_decision_decision_source_idx" ON "thread_customer_mapping_decision"("decision_source");
CREATE INDEX "thread_customer_mapping_decision_selected_customer_id_idx" ON "thread_customer_mapping_decision"("selected_customer_id");
CREATE INDEX "thread_customer_mapping_decision_decision_status_promotion_state_created_at_idx" ON "thread_customer_mapping_decision"("decision_status", "promotion_state", "created_at");
CREATE INDEX "thread_customer_mapping_decision_prompt_hash_idx" ON "thread_customer_mapping_decision"("prompt_hash");
CREATE INDEX "thread_customer_mapping_decision_cost_micros_idx" ON "thread_customer_mapping_decision"("cost_micros");
CREATE INDEX "thread_customer_mapping_decision_created_by_user_id_idx" ON "thread_customer_mapping_decision"("created_by_user_id");

CREATE INDEX "thread_customer_mapping_customer_id_idx" ON "thread_customer_mapping"("customer_id");
CREATE INDEX "thread_customer_mapping_mapping_method_idx" ON "thread_customer_mapping"("mapping_method");
CREATE INDEX "thread_customer_mapping_source_decision_id_idx" ON "thread_customer_mapping"("source_decision_id");
CREATE INDEX "thread_customer_mapping_created_at_idx" ON "thread_customer_mapping"("created_at");
CREATE INDEX "thread_customer_mapping_updated_at_idx" ON "thread_customer_mapping"("updated_at");

ALTER TABLE "page_ai_profile_version"
ADD CONSTRAINT "page_ai_profile_version_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "etl_run"
ADD CONSTRAINT "etl_run_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_day"
ADD CONSTRAINT "conversation_day_etl_run_id_fkey"
FOREIGN KEY ("etl_run_id") REFERENCES "etl_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message"
ADD CONSTRAINT "message_conversation_day_id_fkey"
FOREIGN KEY ("conversation_day_id") REFERENCES "conversation_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_run"
ADD CONSTRAINT "analysis_run_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_run"
ADD CONSTRAINT "analysis_run_source_etl_run_id_fkey"
FOREIGN KEY ("source_etl_run_id") REFERENCES "etl_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "analysis_run"
ADD CONSTRAINT "analysis_run_ai_profile_version_id_fkey"
FOREIGN KEY ("ai_profile_version_id") REFERENCES "page_ai_profile_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analysis_result"
ADD CONSTRAINT "analysis_result_analysis_run_id_fkey"
FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_result"
ADD CONSTRAINT "analysis_result_conversation_day_id_fkey"
FOREIGN KEY ("conversation_day_id") REFERENCES "conversation_day"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "thread_customer_mapping_decision"
ADD CONSTRAINT "thread_customer_mapping_decision_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "thread_customer_mapping_decision"
ADD CONSTRAINT "thread_customer_mapping_decision_source_etl_run_id_fkey"
FOREIGN KEY ("source_etl_run_id") REFERENCES "etl_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "thread_customer_mapping_decision"
ADD CONSTRAINT "thread_customer_mapping_decision_ai_profile_version_id_fkey"
FOREIGN KEY ("ai_profile_version_id") REFERENCES "page_ai_profile_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "thread_customer_mapping"
ADD CONSTRAINT "thread_customer_mapping_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "thread_customer_mapping"
ADD CONSTRAINT "thread_customer_mapping_source_decision_id_fkey"
FOREIGN KEY ("source_decision_id") REFERENCES "thread_customer_mapping_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
