CREATE TABLE "prompt_preview_artifact" (
  "id" UUID NOT NULL,
  "connected_page_id" UUID NOT NULL,
  "analysis_taxonomy_version_id" UUID NOT NULL,
  "compiled_prompt_hash" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "sample_scope_hash" TEXT NOT NULL,
  "sample_target_date" DATE NOT NULL,
  "sample_window_start_at" TIMESTAMPTZ(6) NOT NULL,
  "sample_window_end_exclusive_at" TIMESTAMPTZ(6) NOT NULL,
  "sample_conversation_id" TEXT NOT NULL,
  "customer_display_name" TEXT,
  "runtime_metadata_json" JSONB NOT NULL DEFAULT '{}',
  "preview_result_json" JSONB NOT NULL DEFAULT '{}',
  "evidence_bundle_json" JSONB NOT NULL DEFAULT '[]',
  "field_explanations_json" JSONB NOT NULL DEFAULT '[]',
  "supporting_message_ids_json" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prompt_preview_artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prompt_preview_artifact_connected_page_id_analysis_taxonomy_v_key"
ON "prompt_preview_artifact"(
  "connected_page_id",
  "analysis_taxonomy_version_id",
  "compiled_prompt_hash",
  "sample_scope_hash",
  "sample_conversation_id"
);

CREATE INDEX "prompt_preview_artifact_connected_page_id_created_at_idx"
ON "prompt_preview_artifact"("connected_page_id", "created_at" DESC);

CREATE INDEX "prompt_preview_artifact_sample_scope_hash_sample_conversation_id_idx"
ON "prompt_preview_artifact"("sample_scope_hash", "sample_conversation_id");

ALTER TABLE "prompt_preview_artifact"
ADD CONSTRAINT "prompt_preview_artifact_connected_page_id_fkey"
FOREIGN KEY ("connected_page_id") REFERENCES "connected_page"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prompt_preview_artifact"
ADD CONSTRAINT "prompt_preview_artifact_analysis_taxonomy_version_id_fkey"
FOREIGN KEY ("analysis_taxonomy_version_id") REFERENCES "analysis_taxonomy_version"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
