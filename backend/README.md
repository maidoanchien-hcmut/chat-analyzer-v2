# backend

Full project setup is documented in the root [README](D:/Code/chat-analyzer-v2/README.md).

Quick start:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

Seam 1 local control-plane now lives in [backend/json/seam1](D:/Code/chat-analyzer-v2/backend/json/seam1):

- `pages/*.json`: page connection config and scheduler flags
- `jobs/manual/*.json`: manual day/range ETL requests
- `jobs/onboarding/*.json`: onboarding sample extract requests
- `scheduler/*.json`: scheduled daily sweeps
- `tag-rules/*.json`, `opening-rules/*.json`, `customer-directory/*.json`: deterministic enrichments compiled into worker jobs

Unauthenticated local endpoints for Seam 1:

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

Bootstrap the first admin:

```powershell
bun run auth:bootstrap-admin --identifier admin --display-name "Bootstrap Admin" --password "TempAdmin!2026A"
```
