# Review Codebase vs Design

Ngày review: `2026-04-06`

## Scope

- Review toàn bộ codebase hiện tại so với `docs/design.md`
- Đối chiếu UI/flow với `docs/ui-flows.md`
- Tập trung trước vào 2 vấn đề chặn luồng đã nêu:
  - UI vận hành/cấu hình chưa tối ưu viewport, còn nhiều khoảng trắng
  - không nhập được token ở onboarding
- Mở rộng để tìm thêm các lệch thiết kế khác ở frontend, control-plane, ETL/AI seam, và read-model

## Checks

Đã chạy:

- `cd frontend && bun test`
- `cd backend && bun test`

Kết quả:

- Cả hai suite đều pass trên working tree hiện tại.
- Tuy nhiên proof hiện tại chủ yếu khóa implementation đang có; chưa bắt được lỗi UX do re-render DOM khi nhập liệu và cũng chưa falsify đầy đủ các lệch lớn so với design.

## Findings

### 1. [P1] Onboarding token input bị phá UX vì app re-render toàn bộ DOM ở mỗi lần gõ

- `FrontendApp` gắn listener `input` ở root, rồi gọi `syncConfigurationDraftFromForm(...)` và `this.render()` cho mọi thay đổi trong form cấu hình.
- Vì toàn bộ `innerHTML` bị dựng lại mỗi lần gõ, textarea token và các input lớn trong config workspace bị thay node liên tục. Đây là nguyên nhân trực tiếp phù hợp với lỗi thực tế là không nhập được token để đi tiếp.
- Lỗi này không chỉ ảnh hưởng token mà còn ảnh hưởng prompt text, tag mapping, opening rules và các field khác trong workspace.

Code refs:

- `frontend/src/app/frontend-app.ts:116`
- `frontend/src/app/frontend-app.ts:371`
- `frontend/src/app/frontend-app.ts:385`
- `frontend/src/features/configuration/render.ts:50`

### 2. [P1] Màn `Cấu hình` không thực sự có 5 tab như design, nên không tận dụng được viewport

- Design yêu cầu `Cấu hình` có 5 tab tách lane rõ ràng: `Thông tin page`, `Tag taxonomy`, `Opening rules`, `Prompt profile`, `Scheduler và thông báo`.
- Implementation hiện tại chỉ đổi `tab-active` và `panel-focus`; toàn bộ editor taxonomy/opening/prompt/scheduler vẫn render cùng lúc trong một form dài.
- Kết quả là màn hình desktop vừa tốn khoảng trắng ở shell ngoài, vừa ép phần form chính thành một cột rất dài và hẹp, trái với mục tiêu “fit một viewport” cho flow cấu hình/vận hành.

Code refs:

- `frontend/src/features/configuration/render.ts:34`
- `frontend/src/features/configuration/render.ts:116`
- `frontend/src/styles/layout.css:37`

### 3. [P1] Shell/layout của `Cấu hình` và `Vận hành` bị nhảy khác hẳn các view business, tạo cảm giác sidebar đổi kích thước và tab/button bị phình

- App shell bỏ hẳn global filter bar cho `operations`, `configuration`, và `page-comparison`, nên chiều cao/nhịp của main area đổi đột ngột khi chuyển view.
- Đồng thời shell vẫn giữ hai cột cố định `228px + content`, còn riêng `configuration` lại chèn thêm cột phụ `296px`, khiến phần nội dung chính còn lại rất chật so với desktop viewport.
- Đây là gốc của hiện tượng người dùng thấy sidebar/khung nội dung “bỗng dưng thay đổi”, khoảng trắng nhiều hơn chữ và nhịp layout không ổn định giữa các view.

Code refs:

- `frontend/src/app/frontend-app.ts:989`
- `frontend/src/app/frontend-app.ts:1001`
- `frontend/src/styles/layout.css:1`
- `frontend/src/styles/layout.css:37`

### 4. [P1] CSS dùng chung làm tab, button row, label và checkbox lệch nhịp trên các màn `Cấu hình`/`Vận hành`

- `.button-row` và `.tab-row` đều bị áp `justify-content: space-between` và `flex-wrap`, nên khi ít nội dung hoặc width hẹp thì các nút bị đẩy xa nhau, nhìn rời rạc hơn là thành cụm thao tác.
- `label` bị áp `display: grid` toàn cục, kể cả với `.inline-check`, nên checkbox và text label không được căn như inline control bình thường.
- Vì cùng một bộ style này được dùng cho các tab đầu trang, các action row, và checkbox row, nên UI xuất hiện đồng thời các lỗi bạn mô tả: tab phình to, nút rời rạc, label và checkbox lệch nhau.

Code refs:

- `frontend/src/styles/components.css:26`
- `frontend/src/styles/components.css:58`
- `frontend/src/styles/components.css:98`
- `frontend/src/features/configuration/render.ts:59`
- `frontend/src/features/configuration/render.ts:343`
- `frontend/src/features/operations/render.ts:22`
- `frontend/src/features/operations/render.ts:122`

### 5. [P1] Global taxonomy canonical vẫn là placeholder rỗng, chưa đúng owner boundary của design

- Design yêu cầu `analysis_taxonomy_version` toàn cục là semantic contract chuẩn của hệ thống.
- Repo hiện seed `default.v1` với `categories: {}` và phần read-model fallback sang map label hardcode/humanize khi render.
- Điều này có nghĩa là taxonomy chưa thực sự govern được allowed codes, business labels, grouping rules và so sánh cross-page/version như thiết kế yêu cầu.

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.artifacts.ts:17`
- `backend/src/modules/chat_extractor/chat_extractor.repository.ts:219`
- `backend/src/modules/read_models/read_models.labels.ts:6`

### 6. [P1] Tag taxonomy editor làm mất `pancake_tag_id` thật và thay bằng ID giả theo thứ tự dòng

- Frontend serialize tag mapping bằng `sourceTagId: tag-${index + 1}` thay vì giữ định danh Pancake tag thật.
- Worker có fallback match theo text, nhưng như vậy config không còn normalize “reliably” theo source tag như design yêu cầu.
- Chỉ cần tag đổi text, trùng text, hoặc operator reorder dòng là mapping có thể drift và audit mapping theo source không còn sạch.

Code refs:

- `frontend/src/features/configuration/state.ts:73`
- `backend/go-worker/internal/transform/build.go:615`
- `backend/go-worker/internal/transform/build.go:632`

### 7. [P2] `Tổng quan` chưa có delta kỳ trước cho KPI dù design coi đó là bắt buộc

- Design yêu cầu scorecard phải có giá trị hiện tại và delta so với kỳ trước tương đương.
- Service hiện hardcode toàn bộ helper metric với `delta: "-"`, nên dashboard không trả lời được xu hướng tốt hơn/xấu đi theo kỳ.

Code refs:

- `backend/src/modules/read_models/read_models.service.ts:520`
- `backend/src/modules/read_models/read_models.service.ts:529`
- `frontend/src/features/overview/render.ts:20`

### 8. [P2] `Khám phá dữ liệu` mới là placeholder, chưa phải self-service BI như design

- Design yêu cầu builder cho metric, breakdown, compare, visualization và drill-down thread.
- Implementation hiện chỉ render summary text cố định cho `Metric`, `Breakdown`, `Compare`, rồi một bảng chi tiết mỏng.
- Không có builder runtime thực sự, không có visualization state thật, và drill route cũng chưa carry filter context đầy đủ.

Code refs:

- `frontend/src/features/exploration/render.ts:8`
- `backend/src/modules/read_models/read_models.service.ts:153`
- `backend/src/modules/read_models/read_models.service.ts:169`

### 9. [P2] Drill-down route giữa các view business chưa persist filter context như design yêu cầu

- Design nói rõ filter business phải persist khi chuyển giữa các view.
- Các CTA drill hiện chủ yếu dùng route rút gọn như `?view=thread-history`, hoặc `?view=thread-history&thread=...`, không mang theo page/slice/filter hiện tại.
- Điều này tạo risk người dùng click từ `Tổng quan` hoặc `Khám phá dữ liệu` sang `Lịch sử hội thoại` nhưng mất ngữ cảnh slice vừa phân tích.

Code refs:

- `backend/src/modules/read_models/read_models.service.ts:169`
- `backend/src/modules/read_models/read_models.service.ts:225`
- `backend/src/modules/read_models/read_models.service.ts:596`
- `frontend/src/features/thread-history/render.ts:11`

### 10. [P2] `Lịch sử hội thoại` chưa render đủ workspace audit/evidence theo design

- Design yêu cầu drill-down của `thread_day` phải xem được canonical evidence, transcript redacted, opening block, tags/signals, output AI và explanation/audit.
- UI hiện có transcript, timeline và audit metadata cơ bản, nhưng chưa render opening block, normalized tag signals, explicit signals, hay structured AI output đầy đủ ở workspace.
- Repository cũng chưa load đủ các field đó vào thread workspace read-model để frontend có thể hiện owner-clean.

Code refs:

- `frontend/src/features/thread-history/render.ts:35`
- `frontend/src/features/thread-history/render.ts:59`
- `backend/src/modules/read_models/read_models.thread_history.ts:22`
- `backend/src/modules/read_models/read_models.repository.ts:585`

### 11. [P2] `Vận hành` vẫn thiếu một phần quan trọng của design và còn lộ rõ placeholder

- Design yêu cầu run detail có thread coverage theo grain `thread` và mapping queue có action approve/reject/remap.
- Màn hiện tại mới có health, manual run, run group/detail diagnostics; còn CRM mapping vẫn chỉ có banner “bị gate”, không có queue/action thật.
- Điều này làm view `Vận hành` chưa đáp ứng đủ lane IT/dev như spec.

Code refs:

- `frontend/src/features/operations/render.ts:158`
- `frontend/src/features/operations/render.ts:200`
- `frontend/src/app/screen-state.ts:109`

### 12. [P2] `connected_page` chưa trả token status/connection status đúng như design `Thông tin page`

- Design cho tab `Thông tin page` có `token status`.
- Model/backend hiện lưu trực tiếp `pancake_user_access_token` nhưng payload serialize ra frontend không có field trạng thái token, hết hạn, sắp hết hạn, hay lần validate gần nhất.
- Kết quả là UI không thể nói seam lỗi đang nằm ở token hay ở bước khác của control-plane.

Code refs:

- `backend/prisma/schema.prisma:14`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts:1357`
- `frontend/src/features/configuration/render.ts:100`

## Notes

- Hai vấn đề bạn nêu ban đầu đều có cơ sở rõ trong code hiện tại:
  - vấn đề nhập token là bug UX do render loop
  - vấn đề tối ưu không gian là mismatch cấu trúc shell/tab/layout, không chỉ là tinh chỉnh CSS nhỏ
- Các suite test hiện tại chưa cover được các lỗi cảm nhận trực tiếp trên DOM/layout như token input bị phá khi gõ, shell nhảy giữa view, hay checkbox/tab/button lệch nhịp.
