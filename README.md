# chat-analyzer-v2

Monorepo cho ứng dụng chat-analyzer:

- `backend/`: Bun + Elysia + Prisma + PostgreSQL + Redis, hiện expose các endpoint seam1/control-plane không yêu cầu đăng nhập.
- `frontend/`: frontend standalone tối giản bằng HTML/CSS/TypeScript thuần, build và serve bằng Bun; giữ preset JSON cho Seam 1 ở `frontend/json/seam1`.
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
- `POST /seam1/workspace`
- `GET /seam1/control-center/pages`
- `GET /seam1/control-center/pages/:pageSlug`
- `GET /seam1/health/summary`
- `GET /seam1/runs/:id`
- `GET /seam1/jobs/:kind/:name/preview`
- `POST /seam1/jobs/:kind/:name/execute`

## Frontend

Frontend hiện là shell vận hành tối giản, không dùng framework và không có login. Các preset JSON để chạy Seam 1 nằm trong [frontend/json/seam1](D:/Code/chat-analyzer-v2/frontend/json/seam1) và được gửi sang backend qua `POST /seam1/workspace`.

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
- nạp preset JSON từ `frontend/json/seam1`
- chỉnh trực tiếp payload JSON trong editor
- gửi `list_pages_from_token`, `register_page`, `preview_job`, `execute_job`, `get_run` qua `POST /seam1/workspace`
- xem response JSON thô ngay trên màn hình

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
- Các bảng auth cũ đã bị loại khỏi Prisma schema; dữ liệu seam1 và các JSON control-plane là trọng tâm runtime hiện tại.
- `service/` chưa được nối vào frontend ở phase này; frontend mới chừa sẵn chỗ cho seam2.
