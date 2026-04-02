# backend

Full project setup is documented in the root [README](D:/Code/chat-analyzer-v2/README.md).

Quick start:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

Seam 1 input JSON hiện được frontend giữ ở [frontend/json/seam1](D:/Code/chat-analyzer-v2/frontend/json/seam1) và gửi sang backend như body của HTTP request.

Unauthenticated local endpoints for Seam 1:

- `POST /seam1/workspace`
- `GET /seam1/control-center/pages`
- `GET /seam1/control-center/pages/:pageSlug`
- `GET /seam1/health/summary`
- `GET /seam1/runs/:id`
- `GET /seam1/jobs/:kind/:name/preview`
- `POST /seam1/jobs/:kind/:name/execute`

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```
