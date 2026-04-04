DROP TABLE IF EXISTS "analysis_result" CASCADE;
DROP TABLE IF EXISTS "analysis_run" CASCADE;
DROP TABLE IF EXISTS "thread_customer_link_decision" CASCADE;
DROP TABLE IF EXISTS "thread_customer_link" CASCADE;
DROP TABLE IF EXISTS "message" CASCADE;
DROP TABLE IF EXISTS "thread_day" CASCADE;
DROP TABLE IF EXISTS "thread" CASCADE;
DROP TABLE IF EXISTS "pipeline_run" CASCADE;
DROP TABLE IF EXISTS "pipeline_run_group" CASCADE;
DROP TABLE IF EXISTS "page_prompt_identity" CASCADE;
DROP TABLE IF EXISTS "page_config_version" CASCADE;
DROP TABLE IF EXISTS "analysis_taxonomy_version" CASCADE;
DROP TABLE IF EXISTS "connected_page" CASCADE;

-- CreateTable
CREATE TABLE "connected_page" (
    "id" UUID NOT NULL,
    "pancake_page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "pancake_user_access_token" TEXT NOT NULL,
    "business_timezone" TEXT NOT NULL,
    "etl_enabled" BOOLEAN NOT NULL DEFAULT false,
    "analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "active_config_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "connected_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_prompt_identity" (
    "id" UUID NOT NULL,
    "connected_page_id" UUID NOT NULL,
    "compiled_prompt_hash" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "compiled_prompt_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_prompt_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_taxonomy_version" (
    "id" UUID NOT NULL,
    "version_code" TEXT NOT NULL,
    "taxonomy_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_taxonomy_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_config_version" (
    "id" UUID NOT NULL,
    "connected_page_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "tag_mapping_json" JSONB NOT NULL DEFAULT '{"default_role":"noise","entries":[]}',
    "opening_rules_json" JSONB NOT NULL DEFAULT '{}',
    "scheduler_json" JSONB,
    "notification_targets_json" JSONB,
    "prompt_text" TEXT NOT NULL,
    "analysis_taxonomy_version_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_config_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_run_group" (
    "id" UUID NOT NULL,
    "run_mode" TEXT NOT NULL,
    "requested_window_start_at" TIMESTAMPTZ(6),
    "requested_window_end_exclusive_at" TIMESTAMPTZ(6),
    "requested_target_date" DATE,
    "frozen_config_version_id" UUID NOT NULL,
    "frozen_taxonomy_version_id" UUID NOT NULL,
    "frozen_compiled_prompt_hash" TEXT NOT NULL,
    "frozen_prompt_version" TEXT NOT NULL,
    "publish_intent" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "pipeline_run_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_run" (
    "id" UUID NOT NULL,
    "run_group_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "window_start_at" TIMESTAMPTZ(6) NOT NULL,
    "window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
    "requested_window_start_at" TIMESTAMPTZ(6),
    "requested_window_end_exclusive_at" TIMESTAMPTZ(6),
    "is_full_day" BOOLEAN NOT NULL,
    "run_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "publish_state" TEXT NOT NULL DEFAULT 'draft',
    "publish_eligibility" TEXT NOT NULL,
    "supersedes_run_id" UUID,
    "superseded_by_run_id" UUID,
    "request_json" JSONB NOT NULL DEFAULT '{}',
    "metrics_json" JSONB NOT NULL DEFAULT '{}',
    "reuse_summary_json" JSONB NOT NULL DEFAULT '{}',
    "error_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "pipeline_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread" (
    "id" UUID NOT NULL,
    "connected_page_id" UUID NOT NULL,
    "source_thread_id" TEXT NOT NULL,
    "thread_first_seen_at" TIMESTAMPTZ(6),
    "thread_last_seen_at" TIMESTAMPTZ(6),
    "customer_display_name" TEXT,
    "current_phone_candidates_json" JSONB NOT NULL DEFAULT '[]',
    "latest_entry_source_type" TEXT,
    "latest_entry_post_id" TEXT,
    "latest_entry_ad_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_day" (
    "id" UUID NOT NULL,
    "pipeline_run_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "is_new_inbox" BOOLEAN NOT NULL,
    "entry_source_type" TEXT,
    "entry_post_id" TEXT,
    "entry_ad_id" TEXT,
    "observed_tags_json" JSONB NOT NULL DEFAULT '[]',
    "normalized_tag_signals_json" JSONB NOT NULL DEFAULT '{}',
    "opening_block_json" JSONB NOT NULL DEFAULT '{}',
    "first_meaningful_message_id" TEXT,
    "first_meaningful_message_text_redacted" TEXT,
    "first_meaningful_message_sender_role" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "first_staff_response_seconds" INTEGER,
    "avg_staff_response_seconds" INTEGER,
    "staff_participants_json" JSONB NOT NULL DEFAULT '[]',
    "staff_message_stats_json" JSONB NOT NULL DEFAULT '[]',
    "explicit_revisit_signal" TEXT,
    "explicit_need_signal" TEXT,
    "explicit_outcome_signal" TEXT,
    "source_thread_json_redacted" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "thread_day_id" UUID NOT NULL,
    "source_message_id" TEXT NOT NULL,
    "inserted_at" TIMESTAMPTZ(6) NOT NULL,
    "sender_role" TEXT NOT NULL,
    "sender_source_id" TEXT,
    "sender_name" TEXT,
    "message_type" TEXT NOT NULL,
    "source_message_type_raw" TEXT,
    "redacted_text" TEXT,
    "attachments_json" JSONB NOT NULL DEFAULT '[]',
    "is_meaningful_human_message" BOOLEAN NOT NULL DEFAULT false,
    "is_opening_block_message" BOOLEAN NOT NULL DEFAULT false,
    "source_message_json_redacted" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_customer_link" (
    "thread_id" UUID NOT NULL,
    "customer_id" TEXT NOT NULL,
    "mapping_method" TEXT NOT NULL,
    "mapping_confidence_score" DECIMAL(5,4),
    "mapped_phone_match_key" TEXT,
    "source_decision_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "thread_customer_link_pkey" PRIMARY KEY ("thread_id")
);

-- CreateTable
CREATE TABLE "thread_customer_link_decision" (
    "id" UUID NOT NULL,
    "run_group_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "decision_source" TEXT NOT NULL,
    "selected_customer_id" TEXT,
    "confidence_score" DECIMAL(5,4),
    "decision_status" TEXT NOT NULL,
    "promotion_state" TEXT NOT NULL,
    "prompt_hash" TEXT,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "usage_json" JSONB NOT NULL DEFAULT '{}',
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "failure_info_json" JSONB,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_customer_link_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" UUID NOT NULL,
    "pipeline_run_id" UUID NOT NULL,
    "config_version_id" UUID NOT NULL,
    "taxonomy_version_id" UUID NOT NULL,
    "model_name" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "runtime_snapshot_json" JSONB NOT NULL,
    "output_schema_version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unit_count_planned" INTEGER NOT NULL DEFAULT 0,
    "unit_count_succeeded" INTEGER NOT NULL DEFAULT 0,
    "unit_count_unknown" INTEGER NOT NULL DEFAULT 0,
    "total_usage_json" JSONB NOT NULL DEFAULT '{}',
    "total_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_result" (
    "id" UUID NOT NULL,
    "analysis_run_id" UUID NOT NULL,
    "thread_day_id" UUID,
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

-- CreateIndex
CREATE UNIQUE INDEX "connected_page_pancake_page_id_key" ON "connected_page"("pancake_page_id");

-- CreateIndex
CREATE INDEX "connected_page_etl_enabled_updated_at_idx" ON "connected_page"("etl_enabled", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "connected_page_analysis_enabled_updated_at_idx" ON "connected_page"("analysis_enabled", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "connected_page_active_config_version_id_idx" ON "connected_page"("active_config_version_id");

-- CreateIndex
CREATE INDEX "page_prompt_identity_connected_page_id_created_at_idx" ON "page_prompt_identity"("connected_page_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "page_prompt_identity_connected_page_id_compiled_prompt_hash_key" ON "page_prompt_identity"("connected_page_id", "compiled_prompt_hash");

-- CreateIndex
CREATE UNIQUE INDEX "page_prompt_identity_connected_page_id_prompt_version_key" ON "page_prompt_identity"("connected_page_id", "prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_taxonomy_version_version_code_key" ON "analysis_taxonomy_version"("version_code");

-- CreateIndex
CREATE INDEX "analysis_taxonomy_version_is_active_created_at_idx" ON "analysis_taxonomy_version"("is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "page_config_version_connected_page_id_created_at_idx" ON "page_config_version"("connected_page_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "page_config_version_analysis_taxonomy_version_id_idx" ON "page_config_version"("analysis_taxonomy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_config_version_connected_page_id_version_no_key" ON "page_config_version"("connected_page_id", "version_no");

-- CreateIndex
CREATE INDEX "pipeline_run_group_frozen_config_version_id_created_at_idx" ON "pipeline_run_group"("frozen_config_version_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_group_status_created_at_idx" ON "pipeline_run_group"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_group_run_mode_created_at_idx" ON "pipeline_run_group"("run_mode", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_run_group_id_target_date_idx" ON "pipeline_run"("run_group_id", "target_date");

-- CreateIndex
CREATE INDEX "pipeline_run_status_created_at_idx" ON "pipeline_run"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_publish_state_published_at_idx" ON "pipeline_run"("publish_state", "published_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_target_date_created_at_idx" ON "pipeline_run"("target_date", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_run_supersedes_run_id_idx" ON "pipeline_run"("supersedes_run_id");

-- CreateIndex
CREATE INDEX "pipeline_run_superseded_by_run_id_idx" ON "pipeline_run"("superseded_by_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_run_run_group_id_target_date_window_start_at_windo_key" ON "pipeline_run"("run_group_id", "target_date", "window_start_at", "window_end_exclusive_at");

-- CreateIndex
CREATE INDEX "thread_connected_page_id_updated_at_idx" ON "thread"("connected_page_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "thread_thread_first_seen_at_idx" ON "thread"("thread_first_seen_at");

-- CreateIndex
CREATE INDEX "thread_thread_last_seen_at_idx" ON "thread"("thread_last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "thread_connected_page_id_source_thread_id_key" ON "thread"("connected_page_id", "source_thread_id");

-- CreateIndex
CREATE INDEX "thread_day_pipeline_run_id_is_new_inbox_idx" ON "thread_day"("pipeline_run_id", "is_new_inbox");

-- CreateIndex
CREATE INDEX "thread_day_thread_id_pipeline_run_id_idx" ON "thread_day"("thread_id", "pipeline_run_id" DESC);

-- CreateIndex
CREATE INDEX "thread_day_created_at_idx" ON "thread_day"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "thread_day_pipeline_run_id_thread_id_key" ON "thread_day"("pipeline_run_id", "thread_id");

-- CreateIndex
CREATE INDEX "message_thread_day_id_inserted_at_idx" ON "message"("thread_day_id", "inserted_at");

-- CreateIndex
CREATE INDEX "message_sender_role_inserted_at_idx" ON "message"("sender_role", "inserted_at");

-- CreateIndex
CREATE INDEX "message_created_at_idx" ON "message"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_thread_day_id_source_message_id_key" ON "message"("thread_day_id", "source_message_id");

-- CreateIndex
CREATE INDEX "thread_customer_link_customer_id_idx" ON "thread_customer_link"("customer_id");

-- CreateIndex
CREATE INDEX "thread_customer_link_mapping_method_idx" ON "thread_customer_link"("mapping_method");

-- CreateIndex
CREATE INDEX "thread_customer_link_source_decision_id_idx" ON "thread_customer_link"("source_decision_id");

-- CreateIndex
CREATE INDEX "thread_customer_link_created_at_idx" ON "thread_customer_link"("created_at");

-- CreateIndex
CREATE INDEX "thread_customer_link_updated_at_idx" ON "thread_customer_link"("updated_at");

-- CreateIndex
CREATE INDEX "thread_customer_link_decision_decision_status_promotion_sta_idx" ON "thread_customer_link_decision"("decision_status", "promotion_state", "created_at" DESC);

-- CreateIndex
CREATE INDEX "thread_customer_link_decision_thread_id_created_at_idx" ON "thread_customer_link_decision"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "thread_customer_link_decision_run_group_id_thread_id_key" ON "thread_customer_link_decision"("run_group_id", "thread_id");

-- CreateIndex
CREATE INDEX "analysis_run_pipeline_run_id_created_at_idx" ON "analysis_run"("pipeline_run_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analysis_run_status_created_at_idx" ON "analysis_run"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analysis_result_thread_day_id_idx" ON "analysis_result"("thread_day_id");

-- CreateIndex
CREATE INDEX "analysis_result_publish_state_created_at_idx" ON "analysis_result"("publish_state", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_result_analysis_run_id_thread_day_id_key" ON "analysis_result"("analysis_run_id", "thread_day_id");

-- AddForeignKey
ALTER TABLE "connected_page" ADD CONSTRAINT "connected_page_active_config_version_id_fkey" FOREIGN KEY ("active_config_version_id") REFERENCES "page_config_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_prompt_identity" ADD CONSTRAINT "page_prompt_identity_connected_page_id_fkey" FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_config_version" ADD CONSTRAINT "page_config_version_connected_page_id_fkey" FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_config_version" ADD CONSTRAINT "page_config_version_analysis_taxonomy_version_id_fkey" FOREIGN KEY ("analysis_taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run_group" ADD CONSTRAINT "pipeline_run_group_frozen_config_version_id_fkey" FOREIGN KEY ("frozen_config_version_id") REFERENCES "page_config_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run_group" ADD CONSTRAINT "pipeline_run_group_frozen_taxonomy_version_id_fkey" FOREIGN KEY ("frozen_taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_run_group_id_fkey" FOREIGN KEY ("run_group_id") REFERENCES "pipeline_run_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_supersedes_run_id_fkey" FOREIGN KEY ("supersedes_run_id") REFERENCES "pipeline_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_superseded_by_run_id_fkey" FOREIGN KEY ("superseded_by_run_id") REFERENCES "pipeline_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread" ADD CONSTRAINT "thread_connected_page_id_fkey" FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_day" ADD CONSTRAINT "thread_day_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_day" ADD CONSTRAINT "thread_day_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_thread_day_id_fkey" FOREIGN KEY ("thread_day_id") REFERENCES "thread_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_customer_link" ADD CONSTRAINT "thread_customer_link_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_customer_link" ADD CONSTRAINT "thread_customer_link_source_decision_id_fkey" FOREIGN KEY ("source_decision_id") REFERENCES "thread_customer_link_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_customer_link_decision" ADD CONSTRAINT "thread_customer_link_decision_run_group_id_fkey" FOREIGN KEY ("run_group_id") REFERENCES "pipeline_run_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_customer_link_decision" ADD CONSTRAINT "thread_customer_link_decision_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "page_config_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_taxonomy_version_id_fkey" FOREIGN KEY ("taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_thread_day_id_fkey" FOREIGN KEY ("thread_day_id") REFERENCES "thread_day"("id") ON DELETE SET NULL ON UPDATE CASCADE;

