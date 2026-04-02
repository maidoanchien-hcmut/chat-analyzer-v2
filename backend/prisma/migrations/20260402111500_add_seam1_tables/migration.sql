CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "etl_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_group_id" UUID,
    "run_mode" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "target_date" DATE NOT NULL,
    "business_timezone" TEXT NOT NULL,
    "requested_window_start_at" TIMESTAMPTZ(6),
    "requested_window_end_exclusive_at" TIMESTAMPTZ(6),
    "window_start_at" TIMESTAMPTZ(6) NOT NULL,
    "window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "snapshot_version" INTEGER NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "tag_dictionary_json" JSONB NOT NULL,
    "metrics_json" JSONB NOT NULL,
    "error_text" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "etl_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_day" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "etl_run_id" UUID NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "customer_display_name" TEXT,
    "conversation_inserted_at" TIMESTAMPTZ(6),
    "conversation_updated_at" TIMESTAMPTZ(6),
    "message_count_seen_from_source" INTEGER NOT NULL,
    "normalized_phone_candidates_json" JSONB NOT NULL,
    "current_tags_json" JSONB NOT NULL,
    "observed_tag_events_json" JSONB NOT NULL,
    "normalized_tag_signals_json" JSONB NOT NULL,
    "opening_blocks_json" JSONB NOT NULL,
    "first_meaningful_human_message_id" TEXT,
    "first_meaningful_human_sender_role" TEXT,
    "source_conversation_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_day_id" UUID NOT NULL,
    "etl_run_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "inserted_at" TIMESTAMPTZ(6) NOT NULL,
    "sender_source_id" TEXT,
    "sender_name" TEXT,
    "sender_role" TEXT NOT NULL,
    "source_message_type_raw" TEXT,
    "message_type" TEXT NOT NULL,
    "redacted_text" TEXT,
    "attachments_json" JSONB NOT NULL,
    "message_tags_json" JSONB NOT NULL,
    "is_meaningful_human_message" BOOLEAN NOT NULL,
    "source_message_json_redacted" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thread_customer_mapping" (
    "page_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "mapped_phone_e164" TEXT,
    "mapping_method" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_customer_mapping_pkey" PRIMARY KEY ("page_id", "thread_id")
);

CREATE UNIQUE INDEX "etl_run_page_id_target_date_snapshot_version_key"
    ON "etl_run"("page_id", "target_date", "snapshot_version");

CREATE UNIQUE INDEX "etl_run_published_once_per_page_day_idx"
    ON "etl_run"("page_id", "target_date")
    WHERE "is_published" = true;

CREATE INDEX "etl_run_run_group_id_idx" ON "etl_run"("run_group_id");
CREATE INDEX "etl_run_page_id_idx" ON "etl_run"("page_id");
CREATE INDEX "etl_run_target_date_idx" ON "etl_run"("target_date");
CREATE INDEX "etl_run_status_idx" ON "etl_run"("status");
CREATE INDEX "etl_run_is_published_idx" ON "etl_run"("is_published");
CREATE INDEX "etl_run_started_at_idx" ON "etl_run"("started_at");
CREATE INDEX "etl_run_finished_at_idx" ON "etl_run"("finished_at");

CREATE UNIQUE INDEX "conversation_day_etl_run_id_conversation_id_key"
    ON "conversation_day"("etl_run_id", "conversation_id");

CREATE INDEX "conversation_day_etl_run_id_idx" ON "conversation_day"("etl_run_id");
CREATE INDEX "conversation_day_conversation_id_idx" ON "conversation_day"("conversation_id");
CREATE INDEX "conversation_day_customer_display_name_idx" ON "conversation_day"("customer_display_name");
CREATE INDEX "conversation_day_created_at_idx" ON "conversation_day"("created_at");

CREATE UNIQUE INDEX "message_etl_run_id_message_id_key"
    ON "message"("etl_run_id", "message_id");

CREATE INDEX "message_conversation_day_id_inserted_at_idx"
    ON "message"("conversation_day_id", "inserted_at");

CREATE INDEX "message_conversation_id_inserted_at_idx"
    ON "message"("conversation_id", "inserted_at");

CREATE INDEX "message_is_meaningful_human_message_idx"
    ON "message"("is_meaningful_human_message");

CREATE INDEX "thread_customer_mapping_customer_id_idx"
    ON "thread_customer_mapping"("customer_id");

CREATE INDEX "thread_customer_mapping_mapping_method_idx"
    ON "thread_customer_mapping"("mapping_method");

CREATE INDEX "thread_customer_mapping_created_at_idx"
    ON "thread_customer_mapping"("created_at");

CREATE INDEX "thread_customer_mapping_updated_at_idx"
    ON "thread_customer_mapping"("updated_at");

ALTER TABLE "conversation_day"
    ADD CONSTRAINT "conversation_day_etl_run_id_fkey"
    FOREIGN KEY ("etl_run_id") REFERENCES "etl_run"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message"
    ADD CONSTRAINT "message_conversation_day_id_fkey"
    FOREIGN KEY ("conversation_day_id") REFERENCES "conversation_day"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message"
    ADD CONSTRAINT "message_etl_run_id_fkey"
    FOREIGN KEY ("etl_run_id") REFERENCES "etl_run"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
