ALTER TABLE "analysis_run"
  ADD COLUMN "snapshot_identity_key" TEXT NOT NULL DEFAULT '';

UPDATE "analysis_run"
SET "snapshot_identity_key" = COALESCE(NULLIF("prompt_hash", ''), "id");

ALTER TABLE "analysis_run"
  ALTER COLUMN "snapshot_identity_key" DROP DEFAULT;

CREATE UNIQUE INDEX "analysis_run_pipeline_run_id_snapshot_identity_key_key"
ON "analysis_run"("pipeline_run_id", "snapshot_identity_key");

ALTER TABLE "analysis_result"
  ADD COLUMN "evidence_hash" TEXT NOT NULL DEFAULT '';

UPDATE "analysis_result"
SET "evidence_hash" = COALESCE(NULLIF("prompt_hash", ''), "id");

ALTER TABLE "analysis_result"
  ALTER COLUMN "evidence_hash" DROP DEFAULT;

CREATE INDEX "analysis_result_analysis_run_id_evidence_hash_idx"
ON "analysis_result"("analysis_run_id", "evidence_hash");
