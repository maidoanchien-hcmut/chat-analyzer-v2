# chat-analyzer-v2

This repository is a monorepo for the chat-analyzer application:

- `backend/`: Bun + Elysia + Prisma + PostgreSQL + Redis
- `frontend/`: Bun + Vue 3 + Pinia + Vue Router
- `service/`: AI service, currently out of scope for the auth bootstrap slice

## Requirements

- Bun
- PostgreSQL
- Redis
- PowerShell if you are running on Windows

Default local ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Current Structure

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

## Backend Setup

1. Go to [backend](D:/Code/chat-analyzer-v2/backend)
2. Create `.env` from [backend/.env.example](D:/Code/chat-analyzer-v2/backend/.env.example)
3. Install dependencies:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
```

### Important Prisma CLI Note

If your PostgreSQL password contains reserved characters such as `#`, `@`, or `%`, you must percent-encode them in `DATABASE_URL` when running Prisma CLI commands.

Example:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:o2skin%232026@localhost:5432/chat_analyzer_v2?schema=public'
```

In this example, `#` becomes `%23`.

### Migrate and Seed

```powershell
cd D:\Code\chat-analyzer-v2\backend
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```

Notes:

- Your local database user may not have permission to create a shadow database, so `bunx prisma migrate dev` may fail with `P3014`.
- `bunx prisma migrate deploy` is the verified flow for the current local setup.

### Bootstrap the First Admin

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun run auth:bootstrap-admin --identifier admin --display-name "Bootstrap Admin" --password "TempAdmin!2026A"
```

This command is idempotent for the same bootstrap admin. If the bootstrap admin already exists, it will not create a duplicate.

### Run the Backend

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun run dev
```

Health endpoint:

- [backend health](http://localhost:3000/health)

## Frontend Setup

1. Go to [frontend](D:/Code/chat-analyzer-v2/frontend)
2. Create `.env` from [frontend/.env.example](D:/Code/chat-analyzer-v2/frontend/.env.example)
3. Make sure `VITE_BACKEND_API_BASE_URL="http://localhost:3000"`
4. Install dependencies and run:

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun install
bun run dev
```

## Local Login

After bootstrapping the admin:

- `identifier`: `admin`
- `password`: `TempAdmin!2026A`

Current auth model:

- Access token is stored in frontend memory
- Refresh token is stored in an `HttpOnly` cookie
- Silent refresh is done through `POST /auth/refresh`

## Common Commands

### Backend

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun run typecheck
bunx prisma generate
bunx prisma migrate deploy
bunx prisma db seed
bun run auth:bootstrap-admin --identifier admin --display-name "Bootstrap Admin" --password "TempAdmin!2026A"
bun run dev
```

### Frontend

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun run typecheck
bun run build
bun run dev
```

## Current Auth/API Scope

Public auth endpoints:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/change-password`
- `GET /auth/me`

Admin endpoints:

- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`
- `POST /admin/users/:id/reset-password`
- `PUT /admin/users/:id/roles`
- `GET /admin/roles`
- `GET /admin/permissions`

## Verified Locally

The following checks have already been run locally:

- backend `bun run typecheck`
- frontend `bun run typecheck`
- frontend `bun run build`
- backend migration and seed
- bootstrap admin idempotency
- smoke flow for login, refresh, auth me, change password, create user, disable user, and refresh-session revoke

## Developer Notes

- There is no public signup flow.
- The auth boundary is fully owned by `backend/`.
- `service/` and `backend/go-worker/` do not own auth.
- For v1, create additional users from the admin UI or the admin API after logging in as admin.
