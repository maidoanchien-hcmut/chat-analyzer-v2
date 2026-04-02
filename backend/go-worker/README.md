# go-worker

`go-worker` owns seam 1 extract/ETL work.

Current worker path follows the production extract shape from [pancake-seam1-extract-transform-audit.md](D:/Code/chat-analyzer-v2/docs/plans/pancake-seam1-extract-transform-audit.md):

- loads only process-level config from `.env`
- accepts per-run input from a backend job payload or local CLI flags
- resolves the target page from the Pancake user access token
- generates a page access token at runtime
- fetches the page tag dictionary once per run
- selects conversations in the requested `business_day` window
- pages conversation messages and keeps only the `message-day` slice for that business day
- stops paging a conversation as soon as a message page contains records older than the day window
- transforms the filtered slice into canonical `conversation_day` and `message` rows
- applies optional deterministic control-plane rules from the job JSON:
  - `tag_rules`
  - `opening_rules`
  - `customer_directory`
  - `bot_signatures`
- loads Seam 1 directly into Postgres via `etl_run`, `conversation_day`, `message`, and `thread_customer_mapping`
- persists `etl_run` lifecycle as `running -> loaded/published` or `running -> failed`

## Run

```powershell
cd D:\Code\chat-analyzer-v2\backend\go-worker
copy .env.example .env
go run . -job-file .\json\local-run.example.json
```

Manual local run:

```powershell
go run . `
  -user-access-token <token> `
  -page-id <page_id> `
  -target-date 2026-03-31 `
  -business-timezone Asia/Ho_Chi_Minh
```

Job payload sample:

```json
{
  "user_access_token": "token",
  "page_id": "1406535699642677",
  "target_date": "2026-03-31",
  "business_timezone": "Asia/Ho_Chi_Minh",
  "run_mode": "scheduled_daily",
  "run_group_id": null,
  "snapshot_version": 1,
  "is_published": false,
  "requested_window_start_at": null,
  "requested_window_end_exclusive_at": null,
  "window_start_at": null,
  "window_end_exclusive_at": null,
  "max_conversations": 0,
  "max_message_pages_per_conversation": 0,
  "tag_rules": [],
  "opening_rules": [],
  "customer_directory": [],
  "bot_signatures": []
}
```

File mẫu nằm ở [local-run.example.json](D:/Code/chat-analyzer-v2/backend/go-worker/json/local-run.example.json).

## Notes

- `DATABASE_URL` is required because `go-worker` loads Seam 1 directly into Postgres.
- `WORKER_REQUEST_TIMEOUT_SECONDS` is process-level. Per-run ETL scope belongs in the job payload.
- `PANCAKE_PAGE_ACCESS_TOKEN` is intentionally not part of any config surface. The worker obtains it from Pancake.
- `window_*` allow a partial-day operational run inside the selected `target_date`.
- `is_published = true` is only valid for a full-day bucket.
- `metrics_json` on `etl_run` now includes compact Pancake API health counters such as failed requests, rate limits, and timeouts.
- `target_date` is the design-aligned term. `-business-day` remains only as a CLI compatibility alias.
- `docs/pancake-api-samples/` stays as a static audit artifact only. The worker no longer writes sample payloads there.
