# backend

Full project setup is documented in the root [README](D:/Code/chat-analyzer-v2/README.md).

Quick start:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

Seam 1 hiện chạy bằng HTTP request trực tiếp từ frontend hoặc client bất kỳ. Backend không còn giữ control-plane JSON runtime cho page/job input.

Unauthenticated local endpoints for Seam 1:

- `POST /seam1/pages/list-from-token`
- `POST /seam1/control-center/pages/register`
- `GET /seam1/health/summary`
- `GET /seam1/runs/:id`
- `POST /seam1/jobs/preview`
- `POST /seam1/jobs/execute`

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```
