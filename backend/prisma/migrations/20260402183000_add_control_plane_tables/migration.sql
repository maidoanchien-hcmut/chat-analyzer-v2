CREATE TABLE "connected_page" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pancake_page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "pancake_user_access_token" TEXT NOT NULL,
    "business_timezone" TEXT NOT NULL,
    "auto_scraper_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_ai_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "active_prompt_version_id" UUID,
    "active_tag_mapping_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "active_opening_rules_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "active_bot_signatures_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "onboarding_state_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connected_page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_prompt_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connected_page_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_prompt_version_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "etl_run"
    ADD COLUMN "connected_page_id" UUID,
    ADD COLUMN "processing_mode" TEXT NOT NULL DEFAULT 'etl_only',
    ADD COLUMN "run_params_json" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX "connected_page_pancake_page_id_key"
    ON "connected_page"("pancake_page_id");

CREATE INDEX "connected_page_page_name_idx" ON "connected_page"("page_name");
CREATE INDEX "connected_page_auto_scraper_enabled_idx" ON "connected_page"("auto_scraper_enabled");
CREATE INDEX "connected_page_auto_ai_analysis_enabled_idx" ON "connected_page"("auto_ai_analysis_enabled");
CREATE INDEX "connected_page_is_active_idx" ON "connected_page"("is_active");
CREATE INDEX "connected_page_created_at_idx" ON "connected_page"("created_at");
CREATE INDEX "connected_page_updated_at_idx" ON "connected_page"("updated_at");

CREATE UNIQUE INDEX "page_prompt_version_connected_page_id_version_no_key"
    ON "page_prompt_version"("connected_page_id", "version_no");

CREATE INDEX "page_prompt_version_connected_page_id_created_at_idx"
    ON "page_prompt_version"("connected_page_id", "created_at" DESC);

CREATE INDEX "etl_run_connected_page_id_idx" ON "etl_run"("connected_page_id");
CREATE INDEX "etl_run_processing_mode_idx" ON "etl_run"("processing_mode");

ALTER TABLE "page_prompt_version"
    ADD CONSTRAINT "page_prompt_version_connected_page_id_fkey"
    FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connected_page"
    ADD CONSTRAINT "connected_page_active_prompt_version_id_fkey"
    FOREIGN KEY ("active_prompt_version_id") REFERENCES "page_prompt_version"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "etl_run"
    ADD CONSTRAINT "etl_run_connected_page_id_fkey"
    FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
