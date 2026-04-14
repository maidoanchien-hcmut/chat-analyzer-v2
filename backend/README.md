# backend

Thiết lập nhanh:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

Backend gọi `service` qua `HTTP/JSON` nội bộ với:

- `ANALYSIS_SERVICE_BASE_URL`
- `ANALYSIS_SERVICE_TIMEOUT_MS`
- `ANALYSIS_SERVICE_SHARED_SECRET`

Schema extraction hiện theo owner-clean seam:

- `connected_page`
- `page_config_version`
- `page_prompt_identity`
- `analysis_taxonomy_version`
- `pipeline_run_group`
- `pipeline_run`
- `thread`
- `thread_day`
- `message`
- `thread_customer_link`
- `analysis_run`
- `analysis_result`
- `dim_date`
- `dim_page`
- `dim_staff`
- `fact_thread_day`
- `fact_staff_thread_day`
- `active_publish_snapshot`
- `publish_history`

`chat-extractor` là owner của control-plane và manual execution. Onboarding mặc định hiện tự seed:

- `tag_mapping_json` với default `noise`
- built-in opening heuristic từ observed payload sample (`Khách hàng lần đầu`, `Khách hàng tái khám`, `Tôi muốn gọi/chat tư vấn`, `Đặt lịch hẹn`)
- `scheduler_json` snapshot theo timezone page với `officialDailyTime = 00:00`, `lookbackHours = 2`

Các endpoint local hiện có:

- `POST /chat-extractor/control-center/pages/list-from-token`
- `POST /chat-extractor/control-center/pages/register`
- `POST /chat-extractor/control-center/pages/onboarding-sample/preview`
- `GET /chat-extractor/control-center/pages`
- `GET /chat-extractor/control-center/pages/:id`
- `POST /chat-extractor/control-center/pages/:id/config-versions`
- `POST /chat-extractor/control-center/pages/:id/config-versions/:configVersionId/activate`
- `POST /chat-extractor/jobs/preview`
- `POST /chat-extractor/jobs/execute`
- `POST /chat-extractor/runs/:id/publish`
- `GET /chat-extractor/run-groups/:id`
- `GET /chat-extractor/runs/:id`
- `POST /analysis/runs/:id/execute`
- `GET /analysis/runs/:id`
- `GET /read-models/catalog`
- `POST /read-models/runs/:id/materialize`
- `GET /read-models/runs/:id/preview`
- `GET /read-models/overview`
- `GET /read-models/exploration`
- `GET /read-models/staff-performance`
- `GET /read-models/thread-history`
- `GET /read-models/page-comparison`
- `GET /read-models/health`
- `GET /read-models/export-workbook`

Run group freeze `page_config_version`, taxonomy version, và compiled prompt identity; `pipeline_run` chỉ giữ coverage/request/metrics/publish state. `go-worker` nhận manifest versioned từ backend và load ODS vào `thread/thread_day/message`.

Backend runtime hiện mount cả seam `analysis` và `read-models` mới. Sau khi `etl_and_ai` hoàn tất, backend sẽ materialize semantic mart per `pipeline_run`; dashboard/export phải resolve active snapshot qua `active_publish_snapshot`, không suy bằng `latest run`.

`read-models` hiện còn owner luôn các payload:

- thread workspace 4 tab (`thread-history`)
- health summary cho `backend/database/queue/AI service/go-worker`
- publish-facing preview/export metadata từ snapshot đã resolve

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma validate
bunx prisma migrate deploy
bunx prisma db seed
```
