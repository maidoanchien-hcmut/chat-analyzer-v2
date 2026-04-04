# Kế Hoạch Hoàn Thiện Toàn Bộ App Sau First Slice

**Goal:** Hoàn thiện các capability còn thiếu sau [first-end-to-end-slice-plan.md](/D:/Code/chat-analyzer-v2/docs/plans/first-end-to-end-slice-plan.md) để `chat-analyzer-v2` đạt parity thực dụng với `docs/design.md` và `docs/ui-flows.md`, thay vì chỉ dừng ở business analytics first slice.

**Dependency:** Chỉ execute plan này sau khi first slice đã xong và các seam lõi đã ổn định: analysis orchestration owner-clean, semantic mart + publish resolver, business read APIs thật, thread investigation/audit thật, frontend business không còn chạy bằng demo adapter.

**Scope Note:** Plan này chỉ mở các capability còn thiếu sau first slice. Nó không quay lại thay đổi owner boundary lõi đã chốt ở first slice trừ khi có finding mới mâu thuẫn với `docs/design.md`.

**Primary Contract:** Sau khi plan này hoàn tất, app phải hỗ trợ đầy đủ hơn các flow vận hành/cấu hình theo `docs/ui-flows.md`: scheduler runtime thật cho `official_daily`, manual run UX đầy đủ, prompt profile workspace đủ preview/compare, CRM mapping seam active khi contract CRM đã pin, và reuse/orchestration không còn phụ thuộc vào fresh end-to-end rerun cho mọi trường hợp.

**Observable Delta:** Sau khi hoàn tất, operator có thể activate page với scheduler runtime thật, chạy/quan sát/publish run qua `Vận hành` với UX đúng design, tinh chỉnh prompt qua preview workspace có compare rõ ràng, xử lý CRM mapping queue thật, và hệ thống có reuse đủ tốt để vận hành thường xuyên mà không phải rerun toàn tuyến một cách thô.

**Not Done Until For This Plan:** `official_daily` chạy thật; `Prompt profile` có preview/compare usable; `Vận hành` có manual run form + publish actions đúng loại child run; CRM mapping queue có connector/write-back thật sau khi contract CRM được pin; các tối ưu reuse tối thiểu cho vận hành định kỳ đã được pin và chứng minh.

## 1. Những Capability Còn Thiếu Sau First Slice

- Scheduler runtime thật cho `official_daily`, bao gồm queue orchestration vận hành định kỳ thay vì chỉ manual run.
- Prompt profile workspace đầy đủ theo `docs/ui-flows.md`, đặc biệt:
  - compare `before/after` giữa prompt đang sửa và prompt đang active
  - workflow preview/persist hoàn chỉnh cho sample runtime trong tab `Prompt profile`
- Các flow cấu hình/vận hành nâng cao chưa thuộc business analytics first slice, gồm:
  - activate page kèm bật scheduler runtime thật
  - manual run form đầy đủ với preview split theo ngày và action publish theo từng loại child run
  - modal overwrite lịch sử đầy đủ theo UX đã mô tả trong `docs/ui-flows.md`
- CRM connector/write-back thật và mapping queue active sau khi contract CRM được pin.
- Tối ưu reuse tinh vi theo từng unit/thread thay vì fresh end-to-end run.
- Multi-page BI nâng cao ngoài các view đã pin trong `docs/ui-flows.md`.

## 2. Design Gate Cho Full Completion

### Hướng 1: Gộp nốt mọi thứ vào first-slice execution units

Ưu điểm:

- ít tài liệu hơn
- nhìn có vẻ nhanh hơn

Nhược điểm:

- làm mờ ranh giới giữa "core data path" và "operational/product completeness"
- dễ khiến executor claim xong app khi operational UX còn thiếu
- tăng blast radius cho mỗi đợt sửa tiếp theo

### Hướng 2: Giữ owner boundary lõi, mở thêm execution units riêng cho các capability còn thiếu

Ưu điểm:

- rõ dependency sau first slice
- giảm nguy cơ phá vỡ seam data path đã ổn định
- dễ đo trạng thái "first slice xong" và "full app parity xong"

Nhược điểm:

- cần thêm một plan riêng
- có nhiều mốc hoàn tất hơn

### Recommendation

Chọn `Hướng 2`.

## 3. Execution Unit A: Scheduler Runtime Và Official Daily Orchestration

**Target Outcome:** `official_daily` không còn chỉ là planning semantics; app có scheduler runtime thật để tạo, queue, chạy, theo dõi, và recover run định kỳ theo đúng contract trong `docs/design.md`.

**Boundary Contract:**

- Scheduler dùng active config snapshot tại thời điểm run bắt đầu.
- Mỗi page chỉ có tối đa 1 `official_daily` active.
- Scheduler/runtime không được phá publish pointer của manual run ngoài semantics đã pin.
- Failure/retry của scheduler không được tạo duplicate child runs cho cùng `page + target_date + mode` nếu contract idempotency nói không được.

**Implementation Shape:**

- Job runner/queue orchestration cho `official_daily`
- planner -> enqueue -> execute -> publish pipeline rõ ràng
- health/diagnostics cho scheduler trong `Vận hành`
- activate page có thể bật scheduler runtime thật thay vì chỉ lưu config

**Proof To Create Or Reuse:**

- official daily tạo đúng child runs cho ngày mục tiêu
- cùng một lịch không enqueue duplicate work sai contract
- failure giữa chừng recover được mà không làm lệch publish state

## 4. Execution Unit B: Vận Hành Full UX Cho Manual Run Và Publish

**Target Outcome:** Màn `Vận hành` đạt UX tối thiểu đúng như `docs/ui-flows.md` thay vì chỉ có run monitor/read detail.

**Boundary Contract:**

- Manual run form phải preview được split theo ngày trước khi execute.
- Child run actions phải phụ thuộc đúng loại run:
  - partial same-day -> có thể `Publish tạm thời`
  - partial old-day -> chỉ `Xem kết quả run`
  - full-day -> có thể `Publish chính thức`
- Historical overwrite phải đi qua xác nhận mạnh với version diff rõ ràng.

**Implementation Shape:**

- manual run form đầy đủ
- preview split + publish eligibility preview
- publish action panel theo child run type
- overwrite confirmation modal với prompt/config/taxonomy diff

**Proof To Create Or Reuse:**

- form preview đúng child run classification
- action set trên UI đúng theo từng loại child run
- historical overwrite modal hiển thị đúng snapshot/version cũ và mới

## 5. Execution Unit C: Prompt Profile Workspace Đầy Đủ

**Target Outcome:** Tab `Prompt profile` hỗ trợ workflow tinh chỉnh prompt usable cho operator, không chỉ lưu text và xem metadata.

**Boundary Contract:**

- Prompt UI vẫn là plain text business-facing, không biến thành JSON schema editor.
- Preview run/inference không được tự động đẩy lên dashboard publish path.
- `prompt_version` phải reuse theo content identity, không theo số lần save.
- Compare `before/after` phải dựa trên output thật của cùng sample scope.

**Implementation Shape:**

- sample preview workspace trong tab `Prompt profile`
- chạy thử trên sample thread/unit
- xem structured output, evidence, field explanations
- compare `before/after` giữa prompt draft và prompt active
- flow persist/activate tách khỏi preview run

**Proof To Create Or Reuse:**

- preview không làm đổi active publish pointer
- compare cùng sample cho diff có thể audit
- prompt text quay lại nội dung cũ thì reuse `prompt_version` cũ

## 6. Execution Unit D: CRM Mapping Active Seam

**Target Outcome:** Tab `Liên kết CRM` và mapping queue chuyển từ read-only/local state sang seam vận hành thật sau khi contract CRM được pin.

**Prerequisite:** Contract CRM thật phải được pin trong repo trước khi execute unit này.

**Boundary Contract:**

- deterministic fast-path chỉ promote khi evidence chắc chắn
- ambiguous cases vào queue/audit
- write-back và decision history phải nhất quán
- AI-assisted mapping, nếu có, chỉ là implementation detail riêng, không trộn vào main conversation analysis runtime

**Implementation Shape:**

- CRM connector boundary
- lookup/update/write-back semantics
- mapping queue APIs + UI actions
- approve/reject/remap audit path

**Proof To Create Or Reuse:**

- deterministic auto-link đúng
- ambiguous queue xử lý đúng history/current link
- write-back failure không làm corrupt current state

## 7. Execution Unit E: Reuse Optimization Cho Vận Hành Định Kỳ

**Target Outcome:** Hệ thống không còn phải fresh rerun toàn tuyến cho mọi tình huống thường gặp; reuse hoạt động theo các tầng đã pin trong `docs/design.md`.

**Boundary Contract:**

- raw/source reuse, ODS reuse, AI reuse phải tách riêng
- đổi `tag_mapping_json` hoặc `opening_rules_json` có thể reuse raw nhưng phải recompute derived ODS
- đổi `prompt_text` có thể reuse raw/ODS nhưng AI phải rerun cho unit bị ảnh hưởng
- đổi taxonomy version có thể invalidate AI + mart

**Implementation Shape:**

- execution ledger/reuse planner theo tầng
- invalidation logic rõ theo config class
- selective rerun/rebuild thay vì rerun toàn bộ mù quáng

**Proof To Create Or Reuse:**

- prompt-only change không làm rerun extract/ODS ngoài phạm vi cần thiết
- ETL-transform change invalidate đúng derived ODS và downstream AI/mart
- taxonomy change fail-closed cho reused outputs không còn hợp lệ

## 8. Execution Unit F: Multi-Page BI Nâng Cao

**Target Outcome:** Mở rộng BI multi-page beyond các view đã pin trong first slice mà không làm drift khỏi source-of-truth đã có.

**Boundary Contract:**

- vẫn đọc qua publish resolver chung
- không mở đường query bypass mart
- không kéo message-level drill-down vào compare views

**Implementation Shape:**

- mở rộng compare/pivot/reporting multi-page
- additional filters/visuals nếu cần
- giữ business wording tiếng Việt, không lộ raw code

**Proof To Create Or Reuse:**

- metric multi-page khớp với single-page views cho cùng snapshot
- không có query path bypass mart/publish resolver

## 9. Thứ Tự Thực Thi Khuyến Nghị

1. `Execution Unit A`
   - Vì đây là khoảng trống lớn nhất giữa first slice và vận hành thật hằng ngày.
2. `Execution Unit B`
   - Vì `Vận hành` phải thành seam usable chứ không chỉ read-only monitor.
3. `Execution Unit C`
   - Vì prompt tuning là flow cấu hình cốt lõi trong `ui-flows.md`.
4. `Execution Unit D`
   - Chỉ mở sau khi contract CRM được pin.
5. `Execution Unit E`
   - Khi correctness và operator flow đã ổn định thì mới tối ưu reuse sâu.
6. `Execution Unit F`
   - Cuối cùng, vì đây không chặn vận hành lõi của app.

## 10. Acceptance Bar

Plan này chỉ được coi là hoàn tất khi:

- `official_daily` chạy được bằng scheduler runtime thật
- `Vận hành` hỗ trợ manual run/publish flow đúng UX chính
- `Prompt profile` có preview/compare usable
- CRM mapping active seam chạy thật nếu CRM contract đã pin
- reuse không còn dừng ở fresh end-to-end rerun cho các thay đổi phổ biến
- app có thể được mô tả là gần đạt full design parity thực dụng, không chỉ là first slice
