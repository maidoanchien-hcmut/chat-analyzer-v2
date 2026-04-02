# Seam 2 Analysis Pipeline Plan

**Goal:** Khoá thiết kế Seam 2 theo hướng lean để hệ thống tự động chạy phân tích AI mỗi ngày sau khi Seam 1 publish snapshot, đồng thời cho phép IT chạy tay theo ngày hoặc theo slice tuỳ chỉnh mà không làm bẩn số official.
**Architecture:** `backend/` là owner của orchestration, persistence, publish gate và read API; `service/` là owner của AI runtime nhưng phải đi bằng code-based Google ADK trong [docs/adk-docs](D:/Code/chat-analyzer-v2/docs/adk-docs), không đi theo kiểu tự viết model caller/framework riêng; `frontend/` là owner của UI vận hành cho IT. Phase này dùng đúng 3 bảng: `analysis_job`, `analysis_profile_version`, `analysis_slice`.

**Intent:** Giữ một bảng output duy nhất cho phân tích AI nhưng không hy sinh run control, prompt versioning, workflow criteria theo page, manual rerun và audit.
**Observable Delta:** Sau khi có Seam 1 snapshot official của ngày `D`, hệ thống tạo đúng một scheduled job cho `page_id + target_date`, compile prompt thành text thuần, chạy phân tích theo batch, chỉ publish khi coverage hoàn tất, và nếu fail thì chỉ lưu log. IT có thể chỉnh tiêu chí quy trình của từng page, xem preview prompt text, chạy manual day hoặc manual custom slice, và mọi rerun đều tạo record mới.
**Allowed Mechanism:** Postgres 17 với 3 bảng `analysis_job`, `analysis_profile_version`, `analysis_slice`; internal bulk contract giữa `backend/` và `service/`; UI versioned cho profile prompt theo page; publish/supersede semantics ở `backend/`; `service/` dùng code-based Google ADK với `LlmAgent` + `Runner`, và khi orchestration state phức tạp thì dùng `CustomAgent` hoặc thin coordinator bao quanh ADK runtime.
**Forbidden Shortcuts:** Không thêm bảng output thứ hai cho summary, không cho scheduled retry sinh scheduled job mới trong cùng ngày, không lưu prompt chỉ ở code hoặc env, không cho custom slice tự thành official, không publish partial result, không để dashboard đọc lẫn official và diagnostic, không gọi Gemini trực tiếp theo kiểu bypass ADK, và không dùng `Agent Config` YAML làm production path.
**Proof Obligations:** Chứng minh được one-scheduled-run-per-day, prompt luôn compile thành text thuần trước khi gọi model, `service/` chạy bằng Google ADK thay vì direct SDK caller, chỉ có một bảng output `analysis_slice`, scheduled failure không publish, manual rerun tạo record mới, và UI cho IT chỉnh workflow prompt theo page có preview/audit được.

**Proof Ownership:**

- Architect-owned proof: chỉ có 3 bảng và boundary rõ ràng; `analysis_slice` là output owner duy nhất; `analysis_profile_version` đủ để chứa model + prompt + rubric + schema cho một page; `service/` chỉ là ADK runtime của Seam 2 chứ không phải một framework AI tổng quát mới.
- Executor-owned proof: scheduler idempotent, retry không sinh scheduled job mới, prompt builder preview đúng text gửi model, ADK `Runner` chạy được structured analysis flow, manual run và publish/supersede đúng state machine.
- Escalation trigger: nếu cần nhiều bảng output khác nhau cho một lần inference, nếu custom slice phải trở thành official chain mặc định, hoặc nếu cần tách riêng global baseline và page workflow profile ngay phase đầu.

**Not Done Until:** IT quản lý được profile phân tích theo page, xem được compiled prompt text, scheduled daily chỉ chạy đúng một lần cho mỗi page/ngày, ngày lỗi chỉ có log chứ không có official row, manual rerun tạo row mới, và dashboard official chỉ đọc published rows.

**Solution Integrity Check:**

- Least-painful patch: chỉ có `analysis_job` và `analysis_slice`, còn prompt/model/schema/workflow criteria nằm raw trong code hoặc nhét vào `analysis_job`.
- Why rejected: không có versioned profile để audit, không có preview/publish flow cho prompt theo page, và manual rerun sẽ rất khó giải thích vì config dùng lúc chạy không có owner rõ ràng.
- Long-lived owner-clean route: 4 bảng với run owner, global prompt owner, page workflow owner và output owner tách riêng.
- Why deferred: tách owner tốt hơn nhưng quá nhiều bảng cho phase đầu, trong khi nghiệp vụ hiện tại chỉ cần một profile version hoàn chỉnh cho từng page.
- Chosen route: 3 bảng với `analysis_profile_version` là bảng gộp, chứa luôn model, prompt chung, workflow prompt theo page, output schema và batch policy.

**Temporary Bridge Policy:**

- Allowed temporary bridges: `analysis_job.log_json` giữ event log rút gọn; manual custom slice phase đầu chỉ hỗ trợ một `conversation_id` trong một window; `analysis_profile_version` gộp cả prompt chung và workflow prompt page-specific vào cùng một row.
- Why temporary: giảm số bảng ngay phase đầu mà vẫn giữ được owner rõ ràng và audit đủ dùng.
- Removal point: khi hệ thống lớn hơn và cần tách global baseline khỏi page workflow prompt, có thể tách `analysis_profile_version` thành 2 bảng sau.
- Final acceptance rule: không còn path official nào phụ thuộc vào prompt text không versioned hoặc script chạy ad-hoc ngoài `analysis_job`.

## Bất Biến Của Seam 2

- Chỉ có một bảng output business-facing: `analysis_slice`.
- Mỗi `analysis_slice` đại diện cho đúng một conversation trong đúng một slice:
  - `conversation_day`
  - hoặc `custom_window`
- `analysis_slice` phải chứa cả:
  - kết quả phân tích của slice
  - `state_summary_json` để carry-forward
- Scheduled daily chỉ có đúng một logical job cho mỗi `page_id + target_date`.
- Retry của scheduled daily chỉ tăng attempt trong cùng `analysis_job`.
- Nếu scheduled daily fail hoặc incomplete sau retry budget:
  - không publish
  - chỉ giữ log
  - muốn chạy lại thì IT chạy manual
- Manual rerun luôn tạo `analysis_job` mới và row `analysis_slice` mới.
- Prompt builder phải compile ra text thuần trước khi gọi model.
- Previous summary chỉ được đọc từ row `published` gần nhất cùng `conversation_id` và cùng `analysis_profile_version_id`.

## Tại Sao Chốt 3 Bảng

### Phương án 2 bảng

- `analysis_job`
- `analysis_slice`

Ưu điểm:

- Ít bảng nhất.

Nhược điểm:

- Không có owner cho prompt/model/schema/rubric theo page.
- Không có draft/publish/profile preview cho IT.
- Không audit được vì sao 2 lần chạy cùng ngày cho output khác nhau.

### Phương án 4 bảng

- `analysis_job`
- một bảng config chung
- một bảng workflow config theo page
- `analysis_slice`

Ưu điểm:

- Owner boundary sạch hơn.
- Dễ mở rộng về sau.

Nhược điểm:

- Nặng quá cho phase đầu.
- Tăng số join và số state operator phải hiểu.

### Phương án chọn: 3 bảng

- `analysis_job`
- `analysis_profile_version`
- `analysis_slice`

Lý do:

- Vẫn đủ owner cho run, config và output.
- Vẫn cho IT chỉnh prompt theo page, preview text và publish version.
- Giảm số bảng mà không rơi về kiểu “prompt nằm lung tung”.

## Boundary Và Owner

### `backend/`

- owner của 3 bảng Seam 2 trong Postgres
- owner của scheduler, idempotency, publish gate, supersede flow
- owner của internal manifest đọc từ Seam 1 published snapshot
- owner của read API cho dashboard và màn vận hành

### `service/`

- owner của prompt builder text-only
- owner của ADK runtime cho Seam 2
- owner của batch planning, ADK runner execution, validation, retry nội bộ
- dùng code-based Google ADK theo local docs, không dùng direct Gemini caller làm production path
- dùng `LlmAgent` để sinh output structured
- khi orchestration state hoặc retry flow phức tạp thì dùng `CustomAgent` hoặc thin coordinator bao quanh `Runner`
- không đọc Seam 1 bằng REST per-thread
- không tự publish official row

### `frontend/`

- UI quản lý `analysis_profile_version`
- UI chạy manual analysis job
- UI xem history/log/cost/coverage

## Làm Tới Đâu Trong Phase Này

Phase này làm tới mức production path hoàn chỉnh của Seam 2, nhưng scope của `service/` bị chốt như sau:

- Có làm:
  - scheduler + manual run ở `backend/`
  - profile prompt theo page ở `backend/` + `frontend/`
  - prompt builder text-only
  - ADK-based analysis runtime trong `service/`
  - batch execution
  - structured output validation
  - publish/supersede
  - official read model
- Không làm:
  - một agent platform tổng quát cho nhiều use case AI
  - persistence business dựa vào ADK session state
  - production path dựa trên `Agent Config` YAML
  - direct Gemini SDK flow bypass ADK

Nói ngắn gọn:

- `backend/` làm hết owner của dữ liệu và vận hành.
- `service/` chỉ làm AI execution path của Seam 2 bằng ADK.
- ADK session state chỉ là runtime state, không phải source of truth lâu dài.

## Thiết Kế 3 Bảng

### `analysis_profile_version`

Đây là bảng gộp của phase đầu, chứa:

- `page_id`
- `name`
- `version`
- `status`
- `is_active`
- `model_name`
- `core_instruction_text`
- `workflow_prompt_text`
- `compiled_prompt_text`
- `output_schema_version`
- `output_schema_json`
- `batch_policy_json`
- audit fields

Ý nghĩa:

- một row là một “gói phân tích” hoàn chỉnh cho một page
- scheduled daily luôn dùng đúng row active của page tại thời điểm tạo job
- nếu profile đổi sau đó thì scheduled job cũ không đổi theo

### `analysis_job`

Đây là owner của:

- scheduled daily
- manual day
- manual custom slice
- retry
- coverage
- log
- publish outcome

Rule chốt:

- scheduled daily unique theo `page_id + target_date`
- retry không tạo row scheduled thứ hai
- manual run không bị ràng buộc uniqueness đó

### `analysis_slice`

Đây là bảng output duy nhất, chứa:

- scope của slice
- provenance của job/profile/model/schema
- `analysis_json`
- `state_summary_json`
- `quality_eval_json`
- `usage_json`
- publish/supersede state

Không có bảng `conversation_state_summary` riêng.

## Luồng Scheduled Daily

1. Seam 1 full-day run của `page_id`, `target_date` được publish.
2. `backend/` kiểm tra đã có scheduled `analysis_job` cho `page_id + target_date` chưa.
3. Nếu chưa có:
   - tạo `analysis_job`
   - freeze `analysis_profile_version_id` active của page vào job
4. `backend/` materialize `source_manifest_json` từ published snapshot Seam 1.
5. `service/` đọc manifest và `analysis_profile_version`.
6. Prompt builder compile text thuần cho từng batch rồi truyền text đó vào ADK runtime.
7. ADK `Runner` chạy `LlmAgent` structured-analysis theo batch policy.
8. Response hợp lệ được ghi thành `analysis_slice` với `publish_state = staged`.
9. Khi toàn bộ slice planned đều xong:
   - promote cả job sang `published`
   - promote rows của job sang `publish_state = published`
10. Nếu fail hoặc incomplete sau retry budget:
   - job = `failed`
   - `publish_outcome = skipped_due_to_failure`
   - không có row official nào được publish

## Retry, Failure Và Manual Run

### Scheduled Daily

- retry nằm trong cùng `analysis_job`
- hỗ trợ backoff, jitter, dynamic batch downshift
- không tạo scheduled job mới trong ngày

### Nếu Fail Hoặc Không Phân Tích Hết

- bỏ qua ngày đó
- chỉ giữ log và metrics
- không publish partial

### Manual Day

- tạo `analysis_job` mới với `run_mode = manual_day`
- tạo row `analysis_slice` mới
- mặc định là `diagnostic` hoặc `staged`
- nếu IT publish:
  - row official cũ của cùng `conversation_day_id` chuyển `superseded`
  - row mới thành `published`

### Manual Custom Slice

- `run_mode = manual_custom_slice`
- phase đầu chỉ hỗ trợ một `conversation_id` + một custom window
- output mặc định là `diagnostic`
- không tự nối vào official summary chain

## Prompt Builder Phải Là Text Thuần

### Input

- `analysis_profile_version.core_instruction_text`
- `analysis_profile_version.workflow_prompt_text`
- `analysis_profile_version.output_schema_json`
- previous published `state_summary_json` cùng `analysis_profile_version_id` nếu có
- evidence từ Seam 1 của slice

### Output

- `compiled_instruction_text`
- `prompt_hash`
- `prompt_builder_trace_json`

### Rule

- request cuối cùng gửi vào ADK agent phải là text thuần
- UI phải preview được đúng text đó trước khi publish profile mới
- nếu đổi profile thì hash đổi theo

## Ràng Buộc ADK Cho Service

### Chốt Công Nghệ

- `service/` phải dùng code-based Google ADK theo local docs trong [llm-agents.md](D:/Code/chat-analyzer-v2/docs/adk-docs/llm-agents.md) và [custom-agents.md](D:/Code/chat-analyzer-v2/docs/adk-docs/custom-agents.md).
- Không lấy `Agent Config` YAML làm production path vì local docs của repo đã ghi nó là experimental trong [config.md](D:/Code/chat-analyzer-v2/docs/adk-docs/config.md).

### Agent Shape Gợi Ý

- một `LlmAgent` dùng `output_schema` để sinh JSON output cho từng slice hoặc từng batch slice
- một `Runner` để chạy agent theo job/batch
- một `CustomAgent` hoặc thin coordinator nếu cần stateful orchestration như:
  - retry theo batch
  - split batch khi parse fail
  - mapping `slice_ref -> output row`
  - carry previous summary vào đúng request

### Hệ Quả Thiết Kế

- agent structured-output không kiêm tool-calling trong cùng bước phân tích chính
- manifest, transcript, previous summary và profile prompt phải được chuẩn bị ngoài agent rồi mới đưa vào prompt text
- ADK session state chỉ dùng cho runtime coordination; source of truth chính thức vẫn là Postgres qua `analysis_job` và `analysis_slice`
- phase đầu nên chốt `model_name` là Gemini-family model id để khớp hướng ADK/Gemini của repo

## UI Cho IT

### Màn `Analysis Profile`

- tạo draft profile cho từng page
- chọn `model_name`
- chỉnh prompt chung + workflow prompt của page
- chỉnh output schema
- chỉnh batch policy
- preview compiled prompt text
- publish/archive profile

### Màn `Analysis History`

- danh sách `analysis_job`
- filter theo page, ngày, run mode, status
- xem coverage, attempts, cost, error summary
- mở log để audit ngày fail
- chạy manual day hoặc manual custom slice

### Màn `Prompt Sandbox`

- chọn sample published conversation-day từ Seam 1
- render preview prompt text theo profile đang chọn
- giúp IT chỉnh tiêu chí đánh giá chất lượng trước khi publish

## Batch Strategy

- group batch theo:
  - `page_id`
  - `analysis_profile_version_id`
  - `run_mode`
  - `model_name`
- batch size bị chặn bởi:
  - `max_slices_per_request`
  - `max_input_tokens`
  - `max_output_tokens`
- khi response invalid:
  - retry
  - giảm batch size
  - isolate slice lỗi
- scheduled daily không được publish partial

## Policy Chống Drift

- Trend official dài hạn chỉ nên so trong cùng `analysis_profile_version_id`.
- Nếu đổi profile active cho page:
  - chain summary cũ không nối sang profile mới
  - muốn trend sạch thì phải backfill hoặc chấp nhận có mốc cutover
- Dashboard official phải hiển thị rõ nếu có đổi profile làm ranh giới so sánh.

## Output Shape Gợi Ý Trong `analysis_slice`

### `analysis_json`

- `opening_theme`
- `primary_need`
- `revisit_evidence`
- `care_stage`
- `closing_outcome_as_of_slice`
- `risk_flags`
- `recommendation`
- `confidence`
- `manual_review_required`

### `state_summary_json`

- `latest_customer_goal`
- `care_stage`
- `appointment_state`
- `known_constraints`
- `open_questions`
- `unresolved_objections`
- `risk_flags_open`
- `last_known_sentiment`
- `promised_follow_up`

### `quality_eval_json`

- `workflow_adherence_score`
- `workflow_adherence_reasons`
- `sales_effectiveness_score`
- `sales_effectiveness_reasons`
- `missed_steps`
- `coaching_actions`

## Gợi Ý Thêm Từ Insight

- Tách chất lượng thành 2 trục:
  - `workflow_adherence`
  - `sales_effectiveness`
- Giữ `manual_review_required` để filter case confidence thấp.
- Màn history nên có:
  - cost theo ngày
  - tỷ lệ fail
  - latency
  - coverage
- Nên có read model riêng cho dashboard official để hard-code rule chỉ đọc `published`.

## Kế Hoạch Triển Khai

### Task 1: Chốt schema 3 bảng

- `analysis_job`
- `analysis_profile_version`
- `analysis_slice`

### Task 2: Chốt internal contract `backend` <-> `service`

- manifest read
- staged write
- job status update
- contract này phải phản ánh rõ `service/` là ADK runtime, không phải raw model proxy

### Task 3: Xây prompt builder text-only + preview flow

- compile deterministic
- preview đúng text thật

### Task 4: Xây ADK runtime + batch runner + retry policy

- `LlmAgent`
- `Runner`
- nếu cần thì `CustomAgent` hoặc thin coordinator
- rate limit
- batch downshift
- isolate lỗi

### Task 5: Xây scheduler + publish/supersede flow

- one scheduled run per day
- no partial publish
- manual rerun tạo row mới

### Task 6: Xây UI cho IT

- profile editor
- prompt preview
- history
- manual run

### Task 7: Xây official read model

- chỉ đọc `published`
- không trộn diagnostic
- không trộn ngày fail

## Chốt Cuối

- Phase đầu nên dùng đúng 3 bảng.
- `analysis_profile_version` là bảng gộp hợp lý cho hiện tại.
- `analysis_slice` là output table duy nhất.
- Scheduled daily chỉ chạy đúng một lần mỗi ngày cho mỗi page; retry vẫn nằm trong cùng job.
- Nếu fail thì bỏ qua ngày đó, chỉ giữ log.
- Manual rerun luôn tạo record mới.
