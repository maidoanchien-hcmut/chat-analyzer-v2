# chat-analyzer-v2

Monorepo cho ứng dụng `chat-analyzer` trong dev environment:

- `backend/`: owner của extraction control-plane, Prisma schema, manifest generation, publish semantics, và ODS persistence.
- `frontend/`: shell vận hành tối giản bằng HTML/CSS/TypeScript thuần, chỉ bám contract extraction mới của backend.
- `service/`: AI service gRPC bằng Python; hiện contract nội bộ đã đổi sang `pipeline_run/thread_day`.
- `docs/`: source-of-truth thiết kế và implementation plan.

## Yêu cầu môi trường

- Bun
- Python 3.12 qua `uv`
- PostgreSQL
- Redis

Port mặc định:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

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

Extraction endpoints hiện hành:

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

Schema extraction seam hiện dùng:

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

## Frontend

Frontend hiện chỉ giữ shell vận hành cho contract mới:

- list page từ token Pancake
- register `connected_page`
- xem chi tiết page/config versions
- tạo config version mới và activate
- preview manual run
- execute manual run
- inspect `run_group` / `run`
- publish run

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun install
bun run dev
```

Lệnh hữu ích:

```powershell
cd D:\Code\chat-analyzer-v2\frontend
bun run typecheck
bun run build
```

## Service

AI service giữ gRPC contract nội bộ ở [proto/conversation_analysis.proto](D:/Code/chat-analyzer-v2/proto/conversation_analysis.proto). Contract tracked trong repo không còn dùng `etl_run` hay `conversation_day`; unit hiện theo `thread_day` và `pipeline_run`.

Chạy service:

```powershell
cd D:\Code\chat-analyzer-v2\service
uv run python main.py
```

## Ghi chú

- Backend runtime hiện chỉ giữ extraction control-plane; các route `analysis` và `read_models` legacy đã bị gỡ khỏi runtime path.
- Repo này là dev environment; backward compatibility dữ liệu cũ không phải mục tiêu.
