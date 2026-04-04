# Frontend Rewrite Review 2026-04-04

## Scope

Review phần hiện thực frontend hiện tại so với plan tại `docs/plans/frontend-rewrite-implementation-plan.md`, tập trung vào:

- export workflow semantics
- publish/run semantics
- configuration/onboarding semantics
- proof cho các boundary `http-first`

## Checks

Đã chạy:

- `bun run typecheck`
- `bun run build`
- `bun run test`

Kết quả: đều pass.

## Findings

### 1. [resolved] [P1] Export vẫn bị gắn vào từng business view thay vì workflow riêng

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - Export được mở từ utility panel của app shell, không còn là CTA owned bởi từng business view.
  - Luồng tải file đi qua `exportWorkflow.workbook` thay vì current view model.
- File liên quan:
  - `frontend/src/app/frontend-app.ts`
  - `frontend/src/features/export/render.ts`
  - `frontend/src/features/overview/render.ts`
  - `frontend/src/features/exploration/render.ts`
  - `frontend/src/features/staff-performance/render.ts`
  - `frontend/src/features/page-comparison/render.ts`

### 2. [resolved] [P1] Export vẫn kế thừa filter/snapshot hiện tại, chưa có form chọn `page + khoảng ngày` tự do

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - Workflow export có state riêng với input tường minh `page`, `startDate`, `endDate`.
  - Export preview/download không đọc trực tiếp business filters hoặc current publish snapshot.
- File liên quan:
  - `frontend/src/app/export-workflow.ts`
  - `frontend/src/features/export/render.ts`
  - `frontend/src/adapters/contracts.ts`
  - `frontend/src/shared/export.ts`

### 3. [resolved] [P1] UI publish chưa khóa theo `publish eligibility`

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - UI derive CTA từ `publishEligibility`.
  - `partial old day` không còn publish path hợp lệ, `partial current day` bị khóa vào `Publish tạm thời`, và button bị disable khi run không publish được.
- File liên quan:
  - `frontend/src/features/operations/state.ts`
  - `frontend/src/features/operations/render.ts`
  - `frontend/src/app/frontend-app.ts`

### 4. [resolved] [P2] `Mapping queue` vẫn là placeholder tĩnh

- Trạng thái: đã xử lý ở mức UI contract hiện tại.
- Bằng chứng:
  - Queue được owner bởi `OperationsState`.
  - Các action `approve`, `reject`, `remap` đã cập nhật state thay vì chỉ là nút trang trí.
- File liên quan:
  - `frontend/src/features/operations/state.ts`
  - `frontend/src/features/operations/render.ts`
  - `frontend/src/app/frontend-app.ts`

### 5. [resolved] [P2] `Cấu hình` vẫn lệch khỏi workflow owner-clean đã chốt

- Trạng thái: finding gốc đã được xử lý, nhưng còn follow-up mới ở finding 9 bên dưới.
- Bằng chứng:
  - Raw JSON textarea đã được thay bằng editor structured cho taxonomy, opening rules, scheduler và notification targets.
  - `Prompt profile` đã có affordance cho clone từ version cũ, clone từ page khác và compare hai version.
- File liên quan:
  - `frontend/src/features/configuration/render.ts`
  - `frontend/src/features/configuration/state.ts`
  - `frontend/src/app/frontend-app.ts`

### 6. [resolved] [P2] Metadata export thiếu `page` và `generated_at`

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - Preview export và file `.xlsx` đều đã mang `page` và `generatedAt`.
- File liên quan:
  - `frontend/src/adapters/demo/business-adapter.ts`
  - `frontend/src/features/export/render.ts`
  - `frontend/src/shared/export.ts`

### 7. [resolved] [P2] Filter persistence sang `Lịch sử hội thoại` đã đi xuống data-level

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - `buildThreadHistory()` giờ lọc thread fixtures theo `pageId`, khoảng ngày, `inboxBucket`, `revisit`, `need`, `outcome`, `risk`, `staff`.
  - Proof route-to-data đã được khóa bằng smoke test cho case đổi scope sang page khác và chỉ còn đúng thread trong filter.
- File liên quan:
  - `frontend/src/adapters/demo/business-adapter.ts`
  - `frontend/src/smoke.test.ts`

### 8. [resolved] [P1] `So sánh trang` đã có multi-page filter thực sự

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - View compare không còn đi qua filter bar business một-page.
  - `So sánh trang` render form riêng `page-comparison-filters` với control chọn nhiều `comparePageIds`, `slice`, `publish snapshot`.
  - App shell nối form này vào route/runtime path thay vì lệ thuộc query string thủ công.
- File liên quan:
  - `frontend/src/app/frontend-app.ts`
  - `frontend/src/features/page-comparison/render.ts`
  - `frontend/src/features/page-comparison/render.test.ts`

### 9. [resolved] [P1] Compare prompt version đã có metadata audit bắt buộc

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - Contract `ConnectedPageConfigVersion` giờ mang `promptVersionLabel`, `promptHash`, `evidenceBundle`, `fieldExplanations`.
  - UI compare render rõ version label business-facing, hash audit, evidence bundle và field explanations cho từng phía so sánh.
  - Test render đã khóa rằng compare không còn chỉ hiển thị prompt text.
- File liên quan:
  - `frontend/src/adapters/contracts.ts`
  - `frontend/src/adapters/http/control-plane-adapter.ts`
  - `frontend/src/features/configuration/render.ts`
  - `frontend/src/features/configuration/state.test.ts`

### 10. [resolved] [P1] Run model đã đủ dữ liệu cho confirm overwrite lịch sử

- Trạng thái: đã xử lý trong code hiện tại.
- Bằng chứng:
  - Run summary/detail giờ mang `historicalOverwrite` với snapshot bị ghi đè, prompt/config version cũ và mới, cùng impact tới export.
  - UI publish render confirm state từ metadata này và fail-closed nếu historical overwrite chưa có metadata đầy đủ.
  - Smoke/render tests đã khóa cả mapping từ HTTP adapter lẫn banner confirm trong `Vận hành`.
- File liên quan:
  - `frontend/src/adapters/contracts.ts`
  - `frontend/src/adapters/http/control-plane-adapter.ts`
  - `frontend/src/app/frontend-app.ts`
  - `frontend/src/features/operations/render.ts`
  - `frontend/src/features/operations/render.test.ts`
  - `frontend/src/smoke.test.ts`

## Residual Risk

- Frontend hiện đã có contract và proof cho 4 gap nêu trên; `bun run typecheck`, `bun run build`, `bun test` đều pass sau khi sửa.
- Với seam HTTP thật, để UI luôn render đầy đủ audit/overwrite metadata ngoài môi trường test stub thì backend cần tiếp tục trả các field mới thay vì để adapter rơi về fallback rỗng.
