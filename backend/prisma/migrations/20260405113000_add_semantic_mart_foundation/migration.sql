CREATE TABLE "dim_date" (
  "date_key" INTEGER NOT NULL,
  "full_date" DATE NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "month_no" INTEGER NOT NULL,
  "year_no" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dim_date_pkey" PRIMARY KEY ("date_key")
);

CREATE TABLE "dim_page" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "page_name" TEXT NOT NULL,
  "pancake_page_id" TEXT NOT NULL,
  "business_timezone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "dim_page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dim_staff" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "staff_name" TEXT NOT NULL,
  "display_label" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "dim_staff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fact_thread_day" (
  "id" UUID NOT NULL,
  "pipeline_run_id" UUID NOT NULL,
  "analysis_run_id" UUID NOT NULL,
  "config_version_id" UUID NOT NULL,
  "taxonomy_version_id" UUID NOT NULL,
  "date_key" INTEGER NOT NULL,
  "page_key" UUID NOT NULL,
  "thread_day_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "is_new_inbox" BOOLEAN NOT NULL,
  "official_revisit_label" TEXT NOT NULL,
  "opening_theme_code" TEXT NOT NULL,
  "primary_need_code" TEXT NOT NULL,
  "primary_topic_code" TEXT NOT NULL,
  "official_closing_outcome_code" TEXT NOT NULL,
  "customer_mood_code" TEXT NOT NULL,
  "process_risk_level_code" TEXT NOT NULL,
  "entry_source_type" TEXT,
  "entry_post_id" TEXT,
  "entry_ad_id" TEXT,
  "thread_count" INTEGER NOT NULL DEFAULT 1,
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "first_staff_response_seconds" INTEGER,
  "avg_staff_response_seconds" INTEGER,
  "ai_cost_micros" BIGINT NOT NULL DEFAULT 0,
  "prompt_hash" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "model_name" TEXT NOT NULL,
  "output_schema_version" TEXT NOT NULL,
  "taxonomy_version_code" TEXT NOT NULL,
  "analysis_explanation_json" JSONB NOT NULL DEFAULT '{}',
  "first_meaningful_message_text_redacted" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fact_thread_day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fact_staff_thread_day" (
  "id" UUID NOT NULL,
  "pipeline_run_id" UUID NOT NULL,
  "analysis_run_id" UUID NOT NULL,
  "config_version_id" UUID NOT NULL,
  "taxonomy_version_id" UUID NOT NULL,
  "date_key" INTEGER NOT NULL,
  "page_key" UUID NOT NULL,
  "staff_key" UUID NOT NULL,
  "thread_day_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "primary_need_code" TEXT NOT NULL,
  "process_risk_level_code" TEXT NOT NULL,
  "response_quality_code" TEXT NOT NULL,
  "staff_message_count" INTEGER NOT NULL DEFAULT 0,
  "staff_first_response_seconds_if_owner" INTEGER,
  "ai_cost_allocated_micros" BIGINT NOT NULL DEFAULT 0,
  "response_quality_issue_text" TEXT,
  "response_quality_improvement_text" TEXT,
  "prompt_hash" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "model_name" TEXT NOT NULL,
  "output_schema_version" TEXT NOT NULL,
  "taxonomy_version_code" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fact_staff_thread_day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "active_publish_snapshot" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "page_key" UUID NOT NULL,
  "target_date_key" INTEGER NOT NULL,
  "publish_channel" TEXT NOT NULL,
  "pipeline_run_id" UUID NOT NULL,
  "config_version_id" UUID NOT NULL,
  "taxonomy_version_id" UUID NOT NULL,
  "prompt_hash" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "taxonomy_version_code" TEXT NOT NULL,
  "window_start_at" TIMESTAMPTZ(6) NOT NULL,
  "window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
  "is_full_day" BOOLEAN NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "active_publish_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publish_history" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "page_key" UUID NOT NULL,
  "target_date_key" INTEGER NOT NULL,
  "publish_channel" TEXT NOT NULL,
  "pipeline_run_id" UUID NOT NULL,
  "config_version_id" UUID NOT NULL,
  "taxonomy_version_id" UUID NOT NULL,
  "prompt_hash" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "taxonomy_version_code" TEXT NOT NULL,
  "window_start_at" TIMESTAMPTZ(6) NOT NULL,
  "window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
  "is_full_day" BOOLEAN NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL,
  "replaced_run_ids_json" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "publish_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dim_date_full_date_key" ON "dim_date"("full_date");
CREATE UNIQUE INDEX "dim_page_connected_page_id_key" ON "dim_page"("connected_page_id");
CREATE INDEX "dim_page_page_name_idx" ON "dim_page"("page_name");
CREATE UNIQUE INDEX "dim_staff_connected_page_id_staff_name_key" ON "dim_staff"("connected_page_id", "staff_name");
CREATE INDEX "dim_staff_connected_page_id_display_label_idx" ON "dim_staff"("connected_page_id", "display_label");
CREATE UNIQUE INDEX "fact_thread_day_pipeline_run_id_thread_day_id_key" ON "fact_thread_day"("pipeline_run_id", "thread_day_id");
CREATE INDEX "fact_thread_day_page_key_date_key_idx" ON "fact_thread_day"("page_key", "date_key");
CREATE INDEX "fact_thread_day_analysis_run_id_idx" ON "fact_thread_day"("analysis_run_id");
CREATE INDEX "fact_thread_day_official_revisit_label_opening_theme_code_idx" ON "fact_thread_day"("official_revisit_label", "opening_theme_code");
CREATE INDEX "fact_thread_day_primary_need_code_official_closing_outcome_code_idx" ON "fact_thread_day"("primary_need_code", "official_closing_outcome_code");
CREATE UNIQUE INDEX "fact_staff_thread_day_pipeline_run_id_thread_day_id_staff_key_key" ON "fact_staff_thread_day"("pipeline_run_id", "thread_day_id", "staff_key");
CREATE INDEX "fact_staff_thread_day_page_key_date_key_staff_key_idx" ON "fact_staff_thread_day"("page_key", "date_key", "staff_key");
CREATE INDEX "fact_staff_thread_day_response_quality_code_process_risk_level_code_idx" ON "fact_staff_thread_day"("response_quality_code", "process_risk_level_code");
CREATE UNIQUE INDEX "active_publish_snapshot_pipeline_run_id_key" ON "active_publish_snapshot"("pipeline_run_id");
CREATE UNIQUE INDEX "active_publish_snapshot_connected_page_id_target_date_key_publish_channel_key" ON "active_publish_snapshot"("connected_page_id", "target_date_key", "publish_channel");
CREATE INDEX "active_publish_snapshot_page_key_target_date_key_publish_channel_idx" ON "active_publish_snapshot"("page_key", "target_date_key", "publish_channel");
CREATE INDEX "publish_history_connected_page_id_target_date_key_publish_channel_published_at_idx" ON "publish_history"("connected_page_id", "target_date_key", "publish_channel", "published_at" DESC);
CREATE INDEX "publish_history_pipeline_run_id_published_at_idx" ON "publish_history"("pipeline_run_id", "published_at" DESC);

ALTER TABLE "dim_page"
  ADD CONSTRAINT "dim_page_connected_page_id_fkey"
  FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dim_staff"
  ADD CONSTRAINT "dim_staff_connected_page_id_fkey"
  FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_pipeline_run_id_fkey"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_config_version_id_fkey"
  FOREIGN KEY ("config_version_id") REFERENCES "page_config_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_taxonomy_version_id_fkey"
  FOREIGN KEY ("taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_date_key_fkey"
  FOREIGN KEY ("date_key") REFERENCES "dim_date"("date_key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_thread_day"
  ADD CONSTRAINT "fact_thread_day_page_key_fkey"
  FOREIGN KEY ("page_key") REFERENCES "dim_page"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_pipeline_run_id_fkey"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_config_version_id_fkey"
  FOREIGN KEY ("config_version_id") REFERENCES "page_config_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_taxonomy_version_id_fkey"
  FOREIGN KEY ("taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_date_key_fkey"
  FOREIGN KEY ("date_key") REFERENCES "dim_date"("date_key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_page_key_fkey"
  FOREIGN KEY ("page_key") REFERENCES "dim_page"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fact_staff_thread_day"
  ADD CONSTRAINT "fact_staff_thread_day_staff_key_fkey"
  FOREIGN KEY ("staff_key") REFERENCES "dim_staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_connected_page_id_fkey"
  FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_page_key_fkey"
  FOREIGN KEY ("page_key") REFERENCES "dim_page"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_target_date_key_fkey"
  FOREIGN KEY ("target_date_key") REFERENCES "dim_date"("date_key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_pipeline_run_id_fkey"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_config_version_id_fkey"
  FOREIGN KEY ("config_version_id") REFERENCES "page_config_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_publish_snapshot"
  ADD CONSTRAINT "active_publish_snapshot_taxonomy_version_id_fkey"
  FOREIGN KEY ("taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_connected_page_id_fkey"
  FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_page_key_fkey"
  FOREIGN KEY ("page_key") REFERENCES "dim_page"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_target_date_key_fkey"
  FOREIGN KEY ("target_date_key") REFERENCES "dim_date"("date_key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_pipeline_run_id_fkey"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_config_version_id_fkey"
  FOREIGN KEY ("config_version_id") REFERENCES "page_config_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_history"
  ADD CONSTRAINT "publish_history_taxonomy_version_id_fkey"
  FOREIGN KEY ("taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
