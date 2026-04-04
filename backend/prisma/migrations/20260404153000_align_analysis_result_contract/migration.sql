ALTER TABLE "analysis_run"
  DROP COLUMN IF EXISTS "published_at";

ALTER TABLE "analysis_result"
  RENAME COLUMN "opening_theme" TO "opening_theme_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "customer_mood" TO "customer_mood_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "primary_need" TO "primary_need_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "primary_topic" TO "primary_topic_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "content_customer_type" TO "journey_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "closing_outcome_as_of_day" TO "closing_outcome_inference_code";

ALTER TABLE "analysis_result"
  RENAME COLUMN "process_risk_level" TO "process_risk_level_code";

ALTER TABLE "analysis_result"
  ADD COLUMN "opening_theme_reason" TEXT,
  ADD COLUMN "staff_assessments_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "evidence_used_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "field_explanations_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "supporting_message_ids_json" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "analysis_result"
SET "staff_assessments_json" = CASE
  WHEN COALESCE("response_quality_label", '') <> ''
    OR COALESCE("response_quality_issue_text", '') <> ''
    OR COALESCE("response_quality_improvement_text", '') <> ''
  THEN jsonb_build_array(
    jsonb_build_object(
      'staff_name', null,
      'response_quality_code', NULLIF("response_quality_label", ''),
      'issue_text', NULLIF("response_quality_issue_text", ''),
      'improvement_text', NULLIF("response_quality_improvement_text", '')
    )
  )
  ELSE '[]'::jsonb
END;

ALTER TABLE "analysis_result"
  DROP COLUMN IF EXISTS "publish_state",
  DROP COLUMN IF EXISTS "published_at",
  DROP COLUMN IF EXISTS "response_quality_label",
  DROP COLUMN IF EXISTS "response_quality_issue_text",
  DROP COLUMN IF EXISTS "response_quality_improvement_text";

DELETE FROM "analysis_result"
WHERE "thread_day_id" IS NULL;

ALTER TABLE "analysis_result"
  ALTER COLUMN "thread_day_id" SET NOT NULL;

DROP INDEX IF EXISTS "analysis_result_publish_state_created_at_idx";

CREATE INDEX "analysis_result_result_status_created_at_idx"
ON "analysis_result"("result_status", "created_at" DESC);
