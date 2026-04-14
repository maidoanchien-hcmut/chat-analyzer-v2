# chat-analyzer-v2

Monorepo cho ứng dụng `chat-analyzer` trong dev environment:

- `backend/`: owner của extraction control-plane, analysis orchestration, semantic mart/publish semantics, read APIs, và ODS persistence.
- `frontend/`: shell vận hành tối giản bằng HTML/CSS/TypeScript thuần, chỉ bám contract extraction mới của backend.
- `service/`: AI service nội bộ bằng Python; hiện contract nội bộ đã đổi sang `pipeline_run/thread_day` và giao tiếp với `backend` qua `HTTP/JSON` theo batch.
- `docs/`: source-of-truth thiết kế và implementation plan.

## Yêu cầu môi trường

- Bun
- Python 3.12 qua `uv`
- PostgreSQL
- Redis

Port mặc định:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Service: `http://localhost:8000`
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

Biến môi trường nội bộ cho analysis service:

- `ANALYSIS_SERVICE_BASE_URL`
- `ANALYSIS_SERVICE_TIMEOUT_MS`
- `ANALYSIS_SERVICE_SHARED_SECRET`

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
- `analysis_run`
- `analysis_result`
- `dim_date`
- `dim_page`
- `dim_staff`
- `fact_thread_day`
- `fact_staff_thread_day`
- `active_publish_snapshot`
- `publish_history`

## Frontend

Frontend đã được rewrite thành app TypeScript thuần owner-clean theo `docs/ui-flows.md`:

- đúng 7 view: `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại`, `So sánh trang`, `Vận hành`, `Cấu hình`
- app shell + query-state + filter bar mới; business filters persist giữa các view business
- export `.xlsx` theo source-of-truth mới đã được chốt là workflow riêng
- adapter matrix rõ ràng:
  - business views dùng `http-first`
  - `Vận hành`, `Cấu hình`, onboarding dùng `http-first`
  - sample `prompt preview` vẫn là fallback cục bộ, không phải business runtime path
- contract legacy `main.ts/render.ts/api.ts/types.ts/utils.ts` cũ không còn là runtime path
- smoke tests khóa các flow pinned:
  - `list-from-token -> register`
  - `create config version -> activate`
  - `preview -> execute -> get run detail -> publish`
  - `catalog/overview/thread-history/export` qua `/read-models/*`

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
bun run test
bun run walkthrough:http
```

## Service

AI service hiện dùng contract nội bộ `HTTP/JSON` theo batch giữa `backend` và `service`. Contract tracked trong repo không còn dùng `etl_run` hay `conversation_day`; unit hiện theo `thread_day` và `pipeline_run`.

Chạy service:

```powershell
cd D:\Code\chat-analyzer-v2\service
uv sync
uv run python main.py
```

## Ghi chú

- Backend runtime hiện có seam `analysis` + `read-models` owner-clean; business dashboard/export không còn được phép đọc trực tiếp ODS/raw tables.
- Frontend business runtime mặc định đọc cùng source publish thật qua backend HTTP; `demo/business-adapter.ts` chỉ còn cho test/offline helper.
- Repo này là dev environment; backward compatibility dữ liệu cũ không phải mục tiêu.
