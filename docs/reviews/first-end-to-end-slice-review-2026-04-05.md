# Review first end-to-end slice vs plan/design

Ngày review: `2026-04-05`

Cập nhật lần 4: đã review lại sau khi finding compare-page được claim là resolved và đối chiếu lại với code hiện tại thay vì diff cũ.

## Scope

- Review hiện thực hoá của `docs/plans/first-end-to-end-slice-plan.md`
- Đối chiếu các execution ledger:
  - `docs/plans/eu1-analysis-orchestration-execution-ledger.md`
  - `docs/plans/eu2-semantic-mart-execution-ledger.md`
  - `docs/plans/eu3-thread-investigation-execution-ledger.md`
  - `docs/plans/eu4-frontend-http-switch-execution-ledger.md`
  - `docs/plans/eu5-crm-mapping-blocker.md`
- Rà lại thêm với `docs/design.md` và `docs/ui-flows.md`
- Tính theo code hiện tại của working tree tại thời điểm review lại

## Checks

Đã chạy:

- `cd backend && bun test src/modules/analysis/analysis.service.test.ts src/modules/read_models/read_models.builder.test.ts src/modules/read_models/read_models.service.test.ts src/modules/read_models/read_models.controller.test.ts`
- `cd frontend && bun test src/smoke.test.ts`
- `cd frontend && bun run typecheck`
- `cd frontend && bun test src/features/page-comparison/state.test.ts src/features/page-comparison/render.test.ts`
- `cd service && uv run pytest`

Kết quả:

- Tất cả các command trên đều pass với working tree hiện tại.

## Open Findings

- Không còn finding mở trong scope review này.

## Resolved Findings In Current Working Tree

### [RESOLVED] Contract `staff_participants_json` giữa ETL/backend/service đã được nắn lại theo canonical shape

- `service/analysis_models.py` giờ chấp nhận `list[StaffParticipantModel | str]`.
- Executor normalize staff names từ cả object-array lẫn string-array.
- Có thêm test proof cho object-array trong `service/tests/test_executor.py`.

### [RESOLVED] `staff` filter không còn là no-op cho phần lớn business views

- `read_models.service.ts` thêm `listFilteredThreadFacts(...)`.
- Khi `staff !== "all"`, thread-level views được intersect với `fact_staff_thread_day` membership theo `threadDayId`.
- Có proof mới trong `read_models.service.test.ts`.

### [RESOLVED] `fact_staff_thread_day.staff_first_response_seconds_if_owner` không còn bị copy cho mọi staff

- Builder giờ resolve owner staff theo `first_message_at`.
- Chỉ staff sở hữu phản hồi đầu tiên mới nhận metric `staffFirstResponseSecondsIfOwner`; các staff còn lại là `null`.
- Có builder test khóa hành vi này.

### [RESOLVED] Thread investigation đã hỗ trợ audit theo từng `thread_day`

- Backend/controller nhận thêm `threadDayId`.
- Thread history view model giờ có `activeThreadDayId`.
- UI cho chọn một dòng trong timeline và mở audit theo đúng `thread_day` đó.

### [RESOLVED] Resume/retry của analysis đã xét `evidence_hash` khi quyết định skip terminal unit

- `analysis.service.ts` không còn skip mù theo `threadDayId`.
- Nếu persisted result có `evidenceHash` stale, unit sẽ được gửi lại để reprocess.
- Có test proof mới trong `analysis.service.test.ts`.

### [RESOLVED] Transcript tab đã highlight `supporting evidence` và `staff first response`

- Backend thread-history view model giờ emit cờ `isFirstMeaningful`, `isStaffFirstResponse`, `isSupportingEvidence`.
- Frontend render badge rõ trong transcript.
- Service/read-model tests và smoke test đã cover shape mới.

### [RESOLVED] `So sánh trang` không còn bị chi phối bởi hidden one-page business filters

- Frontend runtime sanitize filter trước khi gọi `getPageComparison(...)`.
- Backend service cũng sanitize lại `ReadModelFilterInput` ở owner seam trước khi resolve snapshot/query facts.
- Có proof riêng ở:
  - `frontend/src/features/page-comparison/state.test.ts`
  - `backend/src/modules/read_models/read_models.service.test.ts`

Code refs:

- `frontend/src/app/frontend-app.ts`
- `frontend/src/features/page-comparison/state.ts`
- `backend/src/modules/read_models/read_models.service.ts`

## Notes

- Không có finding mới về CRM actionability: code hiện vẫn gate đúng read-only local state theo blocker của EU5.
- Không thấy evidence cho việc dashboard/export fallback trực tiếp sang ODS ở runtime path hiện tại.
- Sau vòng rà cuối cùng, toàn bộ finding đã nêu trong review này đều đã có code proof hoặc test proof tương ứng.
