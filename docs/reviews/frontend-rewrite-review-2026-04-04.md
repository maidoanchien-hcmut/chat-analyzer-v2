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

### 1. [P1] Export vẫn bị gắn vào từng business view thay vì workflow riêng

- File: `frontend/src/features/overview/render.ts:78`
- File: `frontend/src/features/exploration/render.ts:25`
- File: `frontend/src/features/staff-performance/render.ts:57`
- File: `frontend/src/features/page-comparison/render.ts:13`
- File: `frontend/src/app/frontend-app.ts:138`
- Vấn đề:
  - Bốn business view đều render trực tiếp nút `Xuất .xlsx`.
  - App controller map action `export-current-view` sang `exportBusinessWorkbook(this.route.view, this.currentViewModel)`.
  - Semantics này biến export thành capability của current view model thay vì một workflow riêng có input tường minh.
- Tác động:
  - Information architecture của frontend đang nói sai bản chất tính năng.
  - Không có chỗ nào để export hoạt động độc lập với navigation state.
- Bằng chứng:
  - Các renderer đang sở hữu CTA export.
  - Controller chỉ biết export current view thay vì mở flow export riêng.

### 2. [P1] Export vẫn kế thừa filter/snapshot hiện tại, chưa có form chọn `page + khoảng ngày` tự do

- File: `frontend/src/shared/export.ts:10`
- File: `frontend/src/adapters/contracts.ts:68`
- File: `frontend/src/adapters/contracts.ts:78`
- File: `frontend/src/adapters/contracts.ts:87`
- File: `frontend/src/adapters/contracts.ts:127`
- Vấn đề:
  - `exportBusinessWorkbook()` build file trực tiếp từ payload của current view.
  - `ExportState` được nhúng vào từng view model thay vì đi qua contract export riêng.
  - Không có flow nào cho user chọn lại `page` và `khoảng ngày` tại thời điểm export.
- Tác động:
  - User không thể chọn khoảng ngày tự do như semantic mới yêu cầu.
  - Export bị chi phối bởi current slice và current publish snapshot, thay vì là một utility độc lập.

### 3. [P1] UI publish chưa khóa theo `publish eligibility`

- File: `frontend/src/features/operations/render.ts:110`
- Vấn đề:
  - Form publish luôn cho chọn cả `provisional` lẫn `official`.
  - Nút `Publish` luôn hiện, không phụ thuộc child run là `official_full_day`, `provisional_current_day_partial`, hay `not_publishable_old_partial`.
- Tác động:
  - `partial old day` vẫn có publish CTA dù plan yêu cầu không được có.
  - `partial current day` vẫn có thể bị submit như `official`, dù UI semantics phải chặn từ trước.
- Ghi chú:
  - Hiện tại chỉ có banner mô tả rule, chưa có gating thật ở UI.

### 4. [P2] `Mapping queue` vẫn là placeholder tĩnh

- File: `frontend/src/features/operations/render.ts:135`
- Vấn đề:
  - Hai dòng queue đang hard-code trực tiếp trong render.
  - Các nút `Approve`, `Reject`, `Remap` không gắn state hoặc action UI nào.
- Tác động:
  - Chưa đạt proof của Unit 4: mapping queue phải actionability ở mức UI contract, không chỉ là bảng minh họa.

### 5. [P2] `Cấu hình` vẫn lệch khỏi workflow owner-clean đã chốt

- File: `frontend/src/features/configuration/render.ts:87`
- File: `frontend/src/app/frontend-app.ts:325`
- Vấn đề:
  - `tagMappingJson`, `openingRulesJson`, `schedulerJson`, `notificationTargetsJson` vẫn được expose bằng raw JSON textarea và parse trực tiếp khi submit.
  - `Prompt profile` chưa có affordance rõ cho:
    - clone từ version cũ
    - clone từ page khác
    - compare 2 prompt version
- Tác động:
  - Drift khỏi plan, vì plan đã cấm hướng “ép config đi qua textareas JSON như runtime chính”.
  - Workflow `Prompt profile` mới chỉ dừng ở textarea + sample preview, chưa đủ semantics bắt buộc.

### 6. [P2] Metadata export thiếu `page` và `generated_at`

- File: `frontend/src/adapters/demo/business-adapter.ts:305`
- File: `frontend/src/shared/export.ts:20`
- Vấn đề:
  - Metadata export hiện chỉ có:
    - `Khoảng ngày`
    - `Prompt version`
    - `Config version`
    - `Taxonomy version`
  - Plan yêu cầu metadata còn phải có:
    - `page`
    - `generated_at`
- Tác động:
  - Các file `.xlsx` hiện tại thiếu 2 trường audit/business metadata bắt buộc.

## Residual Risk

- Test hiện tại chưa khóa các case trên, nên việc `typecheck/build/test` pass chưa chứng minh implementation đã khớp full semantics của plan và source-of-truth export mới.
- Các drift còn lại tập trung ở behavior/UI contract, không phải ở toolchain hay entrypoint rewrite.
