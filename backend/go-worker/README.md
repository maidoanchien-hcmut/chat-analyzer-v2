# go-worker

`go-worker` là ETL runtime deterministic cho extraction seam mới. Worker nhận manifest từ backend, extract dữ liệu Pancake theo coverage window, transform theo ETL config đã freeze, rồi load trực tiếp vào:

- `pipeline_run`
- `thread`
- `thread_day`
- `message`

Worker không làm AI reasoning và không còn ghi `etl_run` hay `conversation_day`.

## Run

```powershell
cd D:\Code\chat-analyzer-v2\backend\go-worker
copy .env.example .env
go run . -job-file .\json\local-run.example.json
```

Runtime local preview không ghi DB:

```powershell
go run . `
  -runtime-only `
  -user-access-token <token> `
  -page-id <page_id> `
  -target-date 2026-03-31 `
  -business-timezone Asia/Ho_Chi_Minh
```

Direct database load ngoài backend path vẫn cần thêm ít nhất:

- `-connected-page-id`
- `-pipeline-run-id`
- `-run-group-id`
- `-publish-eligibility`
- `-etl-config-version-id`
- `-etl-config-hash`

## Manifest

Manifest chuẩn từ backend gồm các trường chính:

- `manifest_version`
- `pipeline_run_id`
- `run_group_id`
- `connected_page_id`
- `page_id`
- `user_access_token`
- `business_timezone`
- `target_date`
- `run_mode`
- `processing_mode`
- `publish_eligibility`
- `requested_window_start_at`
- `requested_window_end_exclusive_at`
- `window_start_at`
- `window_end_exclusive_at`
- `is_full_day`
- `etl_config.{config_version_id, etl_config_hash, tag_mapping, opening_rules, scheduler}`

## Notes

- `DATABASE_URL` là bắt buộc cho non-preview path vì worker cập nhật `pipeline_run` và load ODS trực tiếp vào Postgres.
- `PANCAKE_PAGE_ACCESS_TOKEN` không nằm trong config; worker tự generate từ `user_access_token`.
- `window_*` cho phép partial-day run, nhưng canonical persist vẫn chỉ nằm trong window của run.
- Worker update lifecycle của `pipeline_run` theo `queued -> running -> loaded|failed`.
- `thread.current_phone_candidates_json` giữ raw source values đã dedupe; không normalize hay tự tạo CRM match key.
- `thread_day.opening_block_json` luôn dùng schema `candidate_message_ids/messages/explicit_signals/cut_reason`.
