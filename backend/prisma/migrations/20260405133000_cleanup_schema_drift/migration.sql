DROP TABLE IF EXISTS "thread_customer_mapping";

DROP TABLE IF EXISTS "thread_customer_mapping_decision";

DROP TABLE IF EXISTS "conversation_day";

DROP TABLE IF EXISTS "page_ai_profile_version";

DROP TABLE IF EXISTS "etl_run";

ALTER TABLE "analysis_result"
  DROP CONSTRAINT IF EXISTS "analysis_result_thread_day_id_fkey";

ALTER TABLE "analysis_result"
  ADD CONSTRAINT "analysis_result_thread_day_id_fkey"
  FOREIGN KEY ("thread_day_id") REFERENCES "thread_day"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "dim_date_full_date_idx"
ON "dim_date"("full_date");
