# Seam 2 Analysis Schema Matrix

Tài liệu này mô tả schema gợi ý cho Seam 2 theo hướng lean:

- một bảng output duy nhất: `analysis_slice`
- hai support table:
  - `analysis_job`
  - `analysis_profile_version`

Mục tiêu:

- giữ đúng yêu cầu "một bảng duy nhất chứa các phân tích cho conversation_day hoặc slice tuỳ chỉnh"
- vẫn có run owner để khóa rule auto-run mỗi ngày chỉ một lần
- vẫn có config owner để IT chỉnh prompt theo từng page và audit được version
- không phải mang 4 bảng ngay ở phase đầu

Tài liệu này kế thừa các bất biến ở:

- [design.md](D:/Code/chat-analyzer-v2/docs/design.md)
- [seam1-lean-schema-matrix.md](D:/Code/chat-analyzer-v2/docs/seam1-lean-schema-matrix.md)
- [seam2-analysis-pipeline-plan.md](D:/Code/chat-analyzer-v2/docs/plans/seam2-analysis-pipeline-plan.md)

## Quy Ước Chung

- `target_date`: ngày local của page khi slice là `conversation_day`
- timestamp runtime/source: dùng `timestamptz`
- dữ liệu versioned, rubric, log, trace và payload bán cấu trúc: ưu tiên `jsonb`
- `analysis_slice` là output table business-facing duy nhất của Seam 2
- không có bảng vật lý `conversation_state_summary`; summary nằm trong `analysis_slice.state_summary_json`
- scheduled retry phải cập nhật cùng một `analysis_job`
- scheduled daily unique theo `page_id + target_date`
- row chỉ thành official khi `analysis_slice.publish_state = 'published'`

## Tại Sao Chỉ Còn 3 Bảng

### Không chọn 2 bảng

Nếu chỉ có `analysis_job` và `analysis_slice` thì:

- prompt/model/schema/workflow criteria không có owner version rõ ràng
- IT không có draft/publish/preview flow tử tế
- rất khó audit vì sao cùng một page chạy lại cho ra output khác nhau

### Không chọn 4 bảng

Nếu tách thêm:

- một bảng config chung
- một bảng workflow config theo page

thì boundary sạch hơn nhưng quá nặng cho phase đầu.

### Chọn 3 bảng

- `analysis_job`: owner của run
- `analysis_profile_version`: owner của profile phân tích theo page
- `analysis_slice`: owner của output

## Matrix: `analysis_profile_version`

Đây là bảng gộp của phase đầu, chứa cả:

- model dùng để chạy
- prompt chung
- prompt quy trình riêng của page
- output schema
- batch policy

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh một version profile phân tích | Freeze vào job lúc tạo run |
| `page_id` | `text` | Không | index, unique với `version` | Page mà profile áp dụng | Scheduled path đọc profile active theo page |
| `version` | `integer` | Không | unique với `page_id` | Version tăng dần theo page | Mỗi lần publish thay đổi đáng kể tạo row mới |
| `name` | `text` | Không |  | Tên hiển thị cho IT | Ví dụ `daily-default` |
| `description` | `text` | Có |  | Ghi chú mục đích hoặc phạm vi áp dụng |  |
| `status` | `text` | Không | index | Trạng thái version | Gợi ý: `draft`, `published`, `archived` |
| `is_active` | `boolean` | Không | index | Đây có phải profile active cho scheduled path của page không | Chỉ một row active trên mỗi page |
| `model_name` | `text` | Không | index | Model cụ thể dùng để chạy | Không lưu `provider` riêng ở phase này |
| `core_instruction_text` | `text` | Không |  | Prompt instruction chung | Dùng cho mọi slice của page |
| `workflow_prompt_text` | `text` | Không |  | Prompt quy trình và tiêu chí chất lượng riêng của page | Do IT chỉnh |
| `compiled_prompt_text` | `text` | Không |  | Bản text thuần preview/audit của profile | Artifact để IT xem trước khi publish |
| `output_schema_version` | `text` | Không | index | Version output contract |  |
| `output_schema_json` | `jsonb` | Không |  | Snapshot schema output | Dùng để validate response |
| `batch_policy_json` | `jsonb` | Không |  | Policy batching/retry/rate limit | Ví dụ `max_slices_per_request`, token budget |
| `created_by_user_id` | `integer` | Có | index | Người tạo/sửa profile | Tham chiếu logic sang auth user |
| `published_at` | `timestamptz` | Có | index | Thời điểm profile được publish | Null khi còn draft |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo row |  |
| `updated_at` | `timestamptz` | Không | index | Thời điểm cập nhật gần nhất | Sau publish nên xem row là immutable |

## Matrix: `analysis_job`

Đây là owner của scheduled/manual run, retry, coverage, log và publish outcome.

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh duy nhất của một analysis job |  |
| `run_mode` | `text` | Không | index | Kiểu run | Gợi ý: `scheduled_daily`, `manual_day`, `manual_custom_slice`, `pilot` |
| `slice_type` | `text` | Không | index | Kiểu slice job tạo ra | `conversation_day` hoặc `custom_window` |
| `job_status` | `text` | Không | index | Trạng thái job | Gợi ý: `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `publish_outcome` | `text` | Không | index | Kết quả công bố của job | Gợi ý: `pending`, `published`, `skipped_due_to_failure`, `diagnostic_only` |
| `page_id` | `text` | Không | index | Page đang được phân tích | Scheduled job chỉ xử lý một page |
| `target_date` | `date` | Có | index | Ngày local khi `slice_type = conversation_day` | Null với custom slice |
| `requested_window_start_at` | `timestamptz` | Có |  | Mốc bắt đầu custom slice | Với daily thường null |
| `requested_window_end_exclusive_at` | `timestamptz` | Có |  | Mốc kết thúc custom slice | Với daily thường null |
| `source_manifest_json` | `jsonb` | Không |  | Manifest input từ Seam 1 | Chứa `etl_run_id`, `conversation_day_id`, counts, refs |
| `analysis_profile_version_id` | `uuid` | Không | FK, index | Profile đã freeze cho job này | Nối logic sang `analysis_profile_version.id` |
| `idempotency_key` | `text` | Không | unique | Khoá chống tạo job trùng | Scheduled daily gợi ý: `scheduled:{page_id}:{target_date}` |
| `max_attempts` | `integer` | Không |  | Retry budget tổng | Bao gồm lần đầu và retry |
| `attempt_count` | `integer` | Không |  | Số attempt đã dùng | Retry vẫn nằm trong cùng row |
| `batch_count_planned` | `integer` | Không |  | Tổng số batch dự kiến |  |
| `batch_count_completed` | `integer` | Không |  | Số batch đã hoàn tất |  |
| `slice_count_planned` | `integer` | Không |  | Tổng số slice cần phân tích | Dùng tính coverage |
| `slice_count_succeeded` | `integer` | Không |  | Số slice thành công |  |
| `slice_count_failed` | `integer` | Không |  | Số slice thất bại | Scheduled daily fail nếu còn > 0 khi hết retry budget |
| `job_metrics_json` | `jsonb` | Không |  | Metrics tổng hợp | Ví dụ token, cost, latency, batch split count |
| `log_json` | `jsonb` | Không |  | Event log rút gọn của job | Audit surface chính khi ngày bị skip |
| `last_error_text` | `text` | Có |  | Lỗi cuối cùng của job |  |
| `request_note_text` | `text` | Có |  | Ghi chú khi IT chạy manual |  |
| `created_by_user_id` | `integer` | Có | index | User tạo manual/pilot job | Null với scheduler |
| `started_at` | `timestamptz` | Có | index | Thời điểm bắt đầu chạy |  |
| `finished_at` | `timestamptz` | Có | index | Thời điểm kết thúc |  |
| `published_at` | `timestamptz` | Có | index | Thời điểm job được publish | Null nếu fail hoặc chưa publish |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo row |  |

## Matrix: `analysis_slice`

Đây là bảng output duy nhất của Seam 2.

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh một row phân tích |  |
| `analysis_job_id` | `uuid` | Không | FK, index | Job đã sinh ra row này | Nối về `analysis_job.id` |
| `analysis_profile_version_id` | `uuid` | Không | FK, index | Profile đã dùng để build prompt của row này | Thường trùng với profile của job |
| `slice_type` | `text` | Không | index | Kiểu slice của row | `conversation_day` hoặc `custom_window` |
| `run_mode` | `text` | Không | index | Kiểu run đã tạo row | Denormalize từ job để query nhanh |
| `publish_state` | `text` | Không | index | Trạng thái công bố | Gợi ý: `staged`, `published`, `superseded`, `diagnostic` |
| `page_id` | `text` | Không | index | Page của conversation | Denormalize để filter nhanh |
| `conversation_id` | `text` | Không | index | Conversation nguồn | Một conversation có thể có nhiều row qua nhiều ngày |
| `conversation_day_id` | `uuid` | Có | index | FK logic tới `conversation_day` của Seam 1 | Chỉ có khi `slice_type = conversation_day` |
| `target_date` | `date` | Có | index | Ngày local của slice daily | Null với custom window |
| `slice_window_start_at` | `timestamptz` | Không | index | Mốc bắt đầu slice thực tế |  |
| `slice_window_end_exclusive_at` | `timestamptz` | Không | index | Mốc kết thúc end-exclusive của slice |  |
| `source_manifest_json` | `jsonb` | Không |  | Snapshot reference sang input Seam 1 của row này | Chứa refs cần audit |
| `previous_published_analysis_slice_id` | `uuid` | Có | index | Row published gần nhất dùng làm context | Chỉ nối trong cùng `analysis_profile_version_id` |
| `output_schema_version` | `text` | Không | index | Version output contract của row | Freeze từ profile lúc chạy |
| `model_name` | `text` | Không | index | Model thực tế đã dùng |  |
| `input_hash` | `text` | Không | index | Hash của input liên quan tới prompt | Giúp detect rerun cùng input |
| `prompt_hash` | `text` | Không | index | Hash của prompt text đã compile | Artifact audit tối thiểu |
| `compiled_instruction_text` | `text` | Không |  | Snapshot text thuần đã gửi model | Không nhất thiết phải là full raw transcript |
| `prompt_builder_trace_json` | `jsonb` | Không |  | Trace của prompt builder | Ví dụ section order, token estimate, slice ref |
| `analysis_json` | `jsonb` | Không |  | Output phân tích chính | Ví dụ need, opening theme, outcome, risk flags |
| `state_summary_json` | `jsonb` | Không |  | Summary carry-forward của conversation | Thay cho bảng summary riêng |
| `quality_eval_json` | `jsonb` | Không |  | Đánh giá chất lượng theo quy trình/page | Gợi ý tách 2 trục workflow và sales |
| `usage_json` | `jsonb` | Không |  | Usage và cost của row hoặc phần row trong batch | Ví dụ tokens, cost, retry count, latency |
| `superseded_by_analysis_slice_id` | `uuid` | Có | index | Row mới đã supersede row này | Dùng khi manual day publish đè official cũ |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi row |  |
| `published_at` | `timestamptz` | Có | index | Thời điểm row trở thành published/diagnostic | Null khi còn staged |

## Constraint Và Index Tối Thiểu

| Đối tượng | Ràng buộc / index | Mục đích |
| --- | --- | --- |
| `analysis_profile_version` | unique (`page_id`, `version`) | Version của profile tăng dần theo page |
| `analysis_profile_version` | partial unique active trên (`page_id`) với `is_active = true` | Mỗi page chỉ có một profile active cho scheduled path |
| `analysis_job` | unique (`idempotency_key`) | Chặn mọi scheduled job duplicate |
| `analysis_job` | partial unique (`page_id`, `target_date`) với `run_mode = 'scheduled_daily'` | Mỗi page/ngày chỉ có một scheduled daily job |
| `analysis_job` | index (`page_id`, `job_status`, `created_at`) | Theo dõi vận hành theo page |
| `analysis_job` | index (`analysis_profile_version_id`) | Audit profile đã dùng cho job |
| `analysis_slice` | unique (`analysis_job_id`, `conversation_id`, `slice_window_start_at`, `slice_window_end_exclusive_at`) | Một conversation-slice chỉ có một row trong cùng job |
| `analysis_slice` | partial unique (`conversation_day_id`) với `conversation_day_id is not null` và `publish_state = 'published'` | Một daily slice official duy nhất tại một thời điểm |
| `analysis_slice` | index (`page_id`, `target_date`, `publish_state`) | Query dashboard official theo page/ngày |
| `analysis_slice` | index (`conversation_id`, `analysis_profile_version_id`, `publish_state`, `slice_window_end_exclusive_at`) | Lookup previous published summary cùng profile |
| `analysis_slice` | index (`analysis_job_id`, `publish_state`) | Promote/supersede theo job nhanh |
| `analysis_slice` | index (`superseded_by_analysis_slice_id`) | Audit supersede chain |

## Những Gì Cố Tình Không Tách Thành Bảng Riêng

| Thành phần | Lý do giữ trong JSONB hoặc cùng một row |
| --- | --- |
| `analysis_json` | Shape business còn có thể thay đổi theo profile/schema version |
| `state_summary_json` | Đây là derived state của chính row phân tích đó |
| `quality_eval_json` | Rubric theo page còn đang được IT tinh chỉnh |
| `usage_json` | Dữ liệu usage/cost mang tính vận hành và có thể thay đổi shape |
| `log_json` trên `analysis_job` | Phase đầu chỉ cần audit job fail/success và retry path |
| `source_manifest_json` | Input reference từ Seam 1 là bundle của nhiều refs/counts, chưa cần normalize thêm |

## Rule Diễn Giải Nhanh

| Chủ đề | Rule |
| --- | --- |
| Output owner | Mọi kết quả business-facing của Seam 2 phải nằm trong `analysis_slice` |
| State summary | Không có bảng `conversation_state_summary`; dùng `analysis_slice.state_summary_json` |
| Scheduled uniqueness | Mỗi `page_id + target_date` chỉ có đúng một `analysis_job` scheduled daily |
| Retry semantics | Retry chỉ tăng `analysis_job.attempt_count`; không tạo scheduled job mới |
| Scheduled failure | Nếu hết retry budget mà job fail/incomplete thì `publish_outcome = skipped_due_to_failure`; không có row official được publish |
| Manual rerun | Manual run luôn tạo `analysis_job` mới và row `analysis_slice` mới |
| Custom slice default | `manual_custom_slice` mặc định tạo row `diagnostic`, không tự vào official dashboard |
| Previous summary lookup | Chỉ được đọc row `published` gần nhất cùng `conversation_id` và cùng `analysis_profile_version_id` |
| Prompt builder | Phải compile text thuần trước khi gọi model; `compiled_instruction_text` và `prompt_hash` là artifact audit tối thiểu |
| Profile drift | Nếu đổi `analysis_profile_version_id` thì summary chain cũ không nối sang profile mới mặc định |
| Supersede | Khi manual day được publish làm official, row published cũ cùng `conversation_day_id` chuyển `superseded` |

## Rule Cho `analysis_json`, `state_summary_json`, `quality_eval_json`

### `analysis_json` gợi ý tối thiểu

- `opening_theme`
- `primary_need`
- `revisit_evidence`
- `care_stage`
- `closing_outcome_as_of_slice`
- `risk_flags`
- `recommendation`
- `confidence`
- `manual_review_required`

### `state_summary_json` gợi ý tối thiểu

- `latest_customer_goal`
- `care_stage`
- `appointment_state`
- `known_constraints`
- `open_questions`
- `unresolved_objections`
- `risk_flags_open`
- `last_known_sentiment`
- `promised_follow_up`

### `quality_eval_json` gợi ý tối thiểu

- `workflow_adherence_score`
- `workflow_adherence_reasons`
- `sales_effectiveness_score`
- `sales_effectiveness_reasons`
- `missed_steps`
- `coaching_actions`

## Read Model Hệ Quả

- Dashboard official chỉ đọc:
  - `analysis_slice.publish_state = 'published'`
  - đúng published snapshot của Seam 1 cho ngày đó
  - đúng published row hiện hành của Seam 2
- History/ops screen được phép đọc:
  - `analysis_job`
  - `analysis_slice` ở mọi `publish_state`
  - nhưng phải hiển thị rõ row nào là `diagnostic`, `staged`, `superseded`

## Chốt Cuối

- Phase đầu nên giữ đúng 3 bảng.
- `analysis_profile_version` là bảng gộp chấp nhận được để giảm complexity.
- `analysis_job` là owner của rule auto-run mỗi ngày chỉ một lần.
- `analysis_slice` là output table duy nhất.
- Thiết kế này vẫn đủ để audit, rerun, supersede, batching và chỉnh workflow prompt theo page.
