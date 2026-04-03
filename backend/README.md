# backend

Full project setup is documented in the root [README](D:/Code/chat-analyzer-v2/README.md).

Quick start:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

`chat-extractor` hiện chạy bằng HTTP request trực tiếp từ frontend hoặc client bất kỳ. Backend không còn giữ control-plane JSON runtime cho page/job input.

Frontend standalone hiện dùng backend theo flow gọn sau:

- `POST /chat-extractor/pages/list-from-token` để list page từ user token
- `POST /chat-extractor/control-center/setup/sample` để lấy runtime sample cho ngày hiện tại mà chưa persist DB
- `POST /chat-extractor/control-center/setup/commit` để persist page config và prompt sau khi đã chỉnh xong
- `PATCH /chat-extractor/control-center/pages/:id` để lưu config page đang chạy
- `POST /chat-extractor/jobs/execute` để chạy custom run ngay, không yêu cầu nhập tay tên job

Frontend standalone không surface `scheduler preview/execute`; các endpoint đó vẫn tồn tại cho orchestration và test nội bộ.

Unauthenticated local endpoints for `chat-extractor`:

- `POST /chat-extractor/pages/list-from-token`
- `GET /chat-extractor/control-center/pages`
- `GET /chat-extractor/control-center/pages/:id`
- `POST /chat-extractor/control-center/pages/register`
- `PATCH /chat-extractor/control-center/pages/:id`
- `POST /chat-extractor/control-center/pages/:id/onboarding/preview`
- `POST /chat-extractor/control-center/pages/:id/onboarding/execute`
- `GET /chat-extractor/control-center/pages/:id/prompts`
- `POST /chat-extractor/control-center/pages/:id/prompts`
- `POST /chat-extractor/control-center/pages/:id/prompts/clone`
- `POST /chat-extractor/control-center/pages/:id/prompts/:promptVersionId/activate`
- `GET /chat-extractor/health/summary`
- `GET /chat-extractor/runs/:id`
- `POST /chat-extractor/jobs/preview`
- `POST /chat-extractor/jobs/execute`
- `POST /chat-extractor/jobs/scheduler/preview`
- `POST /chat-extractor/jobs/scheduler/execute`

Control-plane source of truth:

- `connected_page` giữ config page vận hành.
- `page_prompt_version` giữ version prompt theo page.
- `etl_run` nhận thêm `connected_page_id`, `processing_mode`, `run_params_json` để audit onboarding/manual/scheduler từ DB-backed control-plane.

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```
