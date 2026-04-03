# chat-analyzer-v2

Monorepo cho ứng dụng chat-analyzer:

- `backend/`: Bun + Elysia + Prisma + PostgreSQL + Redis, hiện expose các endpoint `chat-extractor` control-plane không yêu cầu đăng nhập.
- `frontend/`: frontend standalone tối giản bằng HTML/CSS/TypeScript thuần, build và serve bằng Bun; thao tác `chat-extractor` qua form HTTP trực tiếp.
- `service/`: AI service sẽ nhận phần seam2 sau này.
- `docs/`: tài liệu thiết kế và các matrix/schema liên quan.

## Yêu cầu môi trường

- Bun
- PostgreSQL
- Redis
- PowerShell nếu chạy trên Windows

Port mặc định:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Cấu trúc hiện tại

```text
backend/
  prisma/
  scripts/
  src/
frontend/
  src/
service/
docs/
```

## Backend

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
```

Tạo `.env` từ [backend/.env.example](D:/Code/chat-analyzer-v2/backend/.env.example), rồi migrate:

```powershell
cd D:\Code\chat-analyzer-v2\backend
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```

Chạy backend:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun run dev
```

Endpoint chính:

- [backend health](http://localhost:3000/health)
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

## Frontend

Frontend hiện là shell vận hành tối giản, không dùng framework và không có login. Luồng chính là: nhập token, list page, lấy runtime sample để chỉnh config, rồi mới persist page vào DB; sau đó chọn `connected_page` đã lưu để chỉnh cấu hình active và chạy custom run trực tiếp qua backend.

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun install
bun run dev
```

Các lệnh hữu ích:

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun run typecheck
bun run build
bun run dev
```

UI cho phép:

- nhập base URL của backend
- dán `Pancake user access token` để list pages
- chọn page nguồn, `business timezone`, `initial_conversation_limit`, `processing_mode`, rồi lấy `runtime sample` của ngày hiện tại
- chỉnh `tag mapping`, `opening rule`, `bot signature`, `prompt` ngay trên sample runtime mà chưa ghi DB
- bấm `Thêm trang` để mới persist `connected_page` và `page_prompt_version`
- chọn page đã chạy để chỉnh config đang active
- chạy `extract-only` hoặc `full-analysis` ngay bằng custom range hoặc trọn ngày, không cần nhập tên job
- chọn `etl_run` từ dropdown để audit nhanh

Ghi chú:

- desktop UI được giữ ở một viewport, không dùng scroll để lộ thêm nội dung
- frontend standalone không surface `scheduler preview/execute`; flow vận hành chính là `custom run`
- backend vẫn giữ các endpoint scheduler để phục vụ orchestration nội bộ nếu cần

## Lệnh thường dùng

Backend:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun run typecheck
bunx prisma generate
bunx prisma migrate deploy
bunx prisma db seed
bun run dev
```

Frontend:

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun run typecheck
bun run build
bun run dev
```

## Ghi chú

- Repo standalone hiện không có đăng nhập, refresh session, role hay permission.
- Các bảng auth cũ đã bị loại khỏi Prisma schema; dữ liệu `chat-extractor` là trọng tâm runtime hiện tại.
- `service/` chưa được nối vào frontend ở phase này; frontend mới chừa sẵn chỗ cho seam2.
