# backend

Thiết lập nhanh:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

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

`chat-extractor` là owner của control-plane và manual execution. Các endpoint local hiện có:

- `POST /chat-extractor/control-center/pages/list-from-token`
- `POST /chat-extractor/control-center/pages/register`
- `GET /chat-extractor/control-center/pages`
- `GET /chat-extractor/control-center/pages/:id`
- `POST /chat-extractor/control-center/pages/:id/config-versions`
- `POST /chat-extractor/control-center/pages/:id/config-versions/:configVersionId/activate`
- `POST /chat-extractor/jobs/preview`
- `POST /chat-extractor/jobs/execute`
- `POST /chat-extractor/runs/:id/publish`
- `GET /chat-extractor/run-groups/:id`
- `GET /chat-extractor/runs/:id`

Run group freeze `page_config_version`, taxonomy version, và compiled prompt identity; `pipeline_run` chỉ giữ coverage/request/metrics/publish state. `go-worker` nhận manifest versioned từ backend và load ODS vào `thread/thread_day/message`.

Backend runtime hiện chỉ mount extraction control-plane và run APIs. Các route `analysis` và `read_models` cũ đã bị loại khỏi runtime path để tránh giữ seam HTTP legacy không còn khớp với schema mới.

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma validate
bunx prisma migrate deploy
bunx prisma db seed
```
