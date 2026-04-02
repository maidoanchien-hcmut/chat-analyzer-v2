# Seam 2 Analysis Schema Matrix

Tài liệu này chốt schema Seam 2 theo hướng tối giản:

- chỉ có 2 bảng lưu trữ:
  - `analysis_run`
  - `analysis_result`
- prompt editor theo page không nằm trong 2 bảng này
- các cột có thể join ngược về Seam 1 thì không duplicate nếu không cần

Tài liệu này kế thừa:

- [design.md](D:/Code/chat-analyzer-v2/docs/design.md)
- [seam1-lean-schema-matrix.md](D:/Code/chat-analyzer-v2/docs/seam1-lean-schema-matrix.md)
- [seam2-analysis-pipeline-plan.md](D:/Code/chat-analyzer-v2/docs/plans/seam2-analysis-pipeline-plan.md)

## Quy Ước Chung

- scheduled official grain là `1 conversation_day = 1 analysis_result`
- batch chỉ là execution grouping
- `analysis_run` chỉ track run
- `analysis_result` là output table duy nhất của Seam 2
- `manual_slice` và `pilot` là cùng một use case
- `inbox mới / inbox cũ` là truth của Seam 1, không lưu lại ở Seam 2
- mỗi chiều BI trên một unit phải là một scalar value
- `tái khám` official phải resolve theo thứ tự:
  - Seam 1
  - `analysis_result.content_customer_type`
  - Pancake tag
  - `unknown`

## Matrix: `analysis_run`

Đây là bảng track run và snapshot runtime thực tế đã dùng.

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh duy nhất của run |  |
| `run_mode` | `text` | Không | index | Kiểu run | Gợi ý: `scheduled_daily`, `manual_day`, `manual_slice` |
| `source_etl_run_id` | `uuid` | Có | index | Tham chiếu tới `etl_run` của Seam 1 | Dùng cho scheduled daily và manual day |
| `scope_ref_json` | `jsonb` | Có |  | Scope của manual slice | Ví dụ `conversation_id`, `window_start`, `window_end` |
| `job_status` | `text` | Không | index | Trạng thái run | Gợi ý: `queued`, `running`, `completed`, `failed`, `cancelled` |
| `publish_outcome` | `text` | Không | index | Kết quả publish | Gợi ý: `pending`, `published_clean`, `published_with_unknowns`, `diagnostic_only`, `unpublished_failed` |
| `idempotency_key` | `text` | Có | unique | Khoá chống duplicate run | Scheduled daily nên set theo `source_etl_run_id` |
| `model_name` | `text` | Không | index | Model thực tế đã dùng |  |
| `prompt_version` | `text` | Có | index | Version prompt logic/page prompt | Nếu config domain có version |
| `prompt_snapshot_json` | `jsonb` | Không |  | Snapshot effective prompt đã dùng | Bao gồm prompt text/rules tối thiểu để audit |
| `output_schema_version` | `text` | Không | index | Version output contract |  |
| `attempt_count` | `integer` | Không |  | Số attempt đã dùng | Retry vẫn nằm trong cùng run |
| `max_attempts` | `integer` | Không |  | Retry budget tổng |  |
| `unit_count_planned` | `integer` | Không |  | Tổng unit cần xử lý |  |
| `unit_count_succeeded` | `integer` | Không |  | Tổng unit thành công |  |
| `unit_count_unknown` | `integer` | Không |  | Tổng unit rơi về `unknown` | Vẫn có thể publish |
| `log_json` | `jsonb` | Không |  | Log rút gọn của run | Retry, split batch, gRPC error, metrics |
| `created_by_user_id` | `integer` | Có | index | User tạo manual run | Null với scheduler |
| `started_at` | `timestamptz` | Có | index | Thời điểm bắt đầu |  |
| `finished_at` | `timestamptz` | Có | index | Thời điểm kết thúc |  |
| `published_at` | `timestamptz` | Có | index | Thời điểm publish |  |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo row |  |

## Matrix: `analysis_result`

Đây là output table duy nhất của Seam 2.

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh một kết quả phân tích |  |
| `analysis_run_id` | `uuid` | Không | FK, index | Run đã sinh ra row này | Nối về `analysis_run.id` |
| `conversation_day_id` | `uuid` | Có | index | Ref tới `conversation_day` của Seam 1 | Dùng cho scheduled daily và manual day |
| `custom_scope_json` | `jsonb` | Có |  | Ref của manual slice | Chỉ dùng khi không có `conversation_day_id` |
| `publish_state` | `text` | Không | index | Trạng thái công bố | Gợi ý: `staged`, `published`, `superseded`, `diagnostic` |
| `result_status` | `text` | Không | index | Trạng thái terminal | Gợi ý: `succeeded`, `unknown` |
| `prompt_hash` | `text` | Không | index | Hash của prompt text đã compile | Artifact audit tối thiểu |
| `opening_theme` | `text` | Không | index | Cuộc hội thoại bắt đầu bằng gì | Giá trị business-facing |
| `customer_mood` | `text` | Không | index | Tâm trạng khách hàng | Giá trị business-facing |
| `primary_need` | `text` | Không | index | Nhu cầu hoặc dịch vụ chính | Giá trị business-facing |
| `primary_topic` | `text` | Không | index | Chủ đề quan tâm chính | Giá trị business-facing |
| `content_customer_type` | `text` | Không | index | AI suy luận từ nội dung | Gợi ý: `kh_moi`, `tai_kham`, `unknown` |
| `closing_outcome_as_of_day` | `text` | Không | index | Trạng thái chốt đơn/hẹn trong ngày | Giá trị business-facing |
| `response_quality_label` | `text` | Không | index | Đánh giá chất lượng phản hồi phía nhân viên | Đây là dimension BI cấp unit |
| `response_quality_issue_text` | `text` | Có |  | Lỗi chính hoặc điểm cần cải thiện nhất | Supporting text, không phải dimension |
| `response_quality_improvement_text` | `text` | Có |  | Gợi ý cải thiện chính | Supporting text, không phải dimension |
| `failure_info_json` | `jsonb` | Có |  | Lý do fail khi unit `unknown` | Có `unknown_reason`, error class, retry summary |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi row |  |
| `published_at` | `timestamptz` | Có | index | Thời điểm row thành published/diagnostic |  |

## Constraint Và Index Tối Thiểu

| Đối tượng | Ràng buộc / index | Mục đích |
| --- | --- | --- |
| `analysis_run` | unique (`idempotency_key`) với `idempotency_key is not null` | Chặn scheduled run duplicate |
| `analysis_run` | partial unique (`source_etl_run_id`) với `run_mode = 'scheduled_daily'` và `source_etl_run_id is not null` | Mỗi `etl_run` official chỉ có một scheduled Seam 2 run |
| `analysis_run` | index (`job_status`, `created_at`) | Theo dõi vận hành |
| `analysis_result` | unique (`analysis_run_id`, `conversation_day_id`) với `conversation_day_id is not null` | Một unit daily chỉ có một result trong cùng run |
| `analysis_result` | partial unique (`conversation_day_id`) với `conversation_day_id is not null` và `publish_state = 'published'` | Mỗi `conversation_day` chỉ có một result official tại một thời điểm |
| `analysis_result` | index (`analysis_run_id`, `publish_state`) | Promote/supersede theo run |
| `analysis_result` | index (`opening_theme`) | Query phân phối opening |
| `analysis_result` | index (`customer_mood`) | Query phân phối mood |
| `analysis_result` | index (`primary_need`) | Query phân phối nhu cầu/dịch vụ |
| `analysis_result` | index (`primary_topic`) | Query phân phối chủ đề |
| `analysis_result` | index (`content_customer_type`) | Query inference từ nội dung |
| `analysis_result` | index (`closing_outcome_as_of_day`) | Query outcome |
| `analysis_result` | index (`response_quality_label`) | Query phân phối chất lượng phản hồi |

## Rule Diễn Giải Nhanh

| Chủ đề | Rule |
| --- | --- |
| Output owner | Mọi kết quả AI business-facing của Seam 2 nằm trong `analysis_result` |
| Run owner | Mọi scheduled/manual/retry state nằm trong `analysis_run` |
| Scheduled uniqueness | Mỗi `etl_run` official chỉ có một scheduled `analysis_run` |
| Retry semantics | Retry chỉ tăng `analysis_run.attempt_count`; không tạo run mới |
| Scheduled publish gate | Publish khi mọi unit đã terminal ở `succeeded` hoặc `unknown` |
| Non-terminal failure | Nếu run chết giữa chừng và còn unit chưa terminal thì `publish_outcome = unpublished_failed` |
| Unknown fallback | Unit fail sau retry hợp lệ phải ghi `result_status = 'unknown'` và `failure_info_json` |
| Prompt tracking | Audit tối thiểu là `analysis_run.prompt_snapshot_json` và `analysis_result.prompt_hash` |
| Official inbox label | Chỉ lấy từ Seam 1 |
| BI dimensions | Mỗi unit chỉ có đúng một value cho mỗi dimension BI |
| Official revisit label | Resolve ở read model theo `Seam 1 > content_customer_type > Pancake tag > unknown` |
| Pancake tag trust | Tag vận hành không được override nội dung chat thật hoặc label Seam 1 |
| Manual slice | Mặc định tạo `diagnostic`, không tự vào official dashboard |

## Rule Cho Feedback Nhân Viên

- Feedback phải theo hướng coaching, không phải blame.
- Ở scheduled v1, quality feedback được nén thành:
  - một dimension: `response_quality_label`
  - một text ngắn: `response_quality_issue_text`
  - một text ngắn: `response_quality_improvement_text`
- Nếu một unit có nhiều nhân viên tham gia, label này phản ánh chất lượng phía nhân viên ở cấp unit, không phải scorecard tách riêng từng staff.
- Không dùng output này để suy ra disciplinary action tự động.

## Unknown Fallback Contract

- Nếu `analysis_result.result_status = 'unknown'` thì row vẫn được persist.
- Các cột first-class nên rơi về `unknown`.
- Các supporting text có thể để `null`.
- `failure_info_json` phải đủ để IT audit.

## Prompt Config Boundary

- Prompt editor theo page vẫn là requirement của hệ thống.
- Nhưng storage của prompt config không nằm trong 2 bảng này.
- Khi run bắt đầu, effective prompt phải được snapshot vào `analysis_run.prompt_snapshot_json`.

## Chốt Cuối

- Schema Seam 2 nên dừng ở 2 bảng.
- `analysis_run` chỉ track run, không duplicate dữ liệu Seam 1 nếu join được.
- `analysis_result` chỉ giữ các scalar dimension AI mà BoD đang thật sự cần, cộng thêm 2 short text cho coaching.
- Final label `tái khám` phải luôn ưu tiên Seam 1 và nội dung chat hơn Pancake tag vận hành.
