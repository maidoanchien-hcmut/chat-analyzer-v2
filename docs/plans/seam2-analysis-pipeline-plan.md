# Seam 2 Analysis Pipeline Plan

> Note: Tài liệu này có một số chỗ hard-pin ADK từ draft cũ. Quyết định framework hiện tại phải theo [AI Runtime Selection Design Gate](./ai-runtime-selection-design-gate.md) và [design.md](../design.md).

**Goal:** Khoá Seam 2 theo hướng insight-first để trả lời đúng nhu cầu của BoD: inbox mới bắt đầu bằng gì, inbox tái khám bắt đầu bằng gì, khách đang quan tâm gì, tâm trạng ra sao, kết quả chốt theo ngày, và feedback coaching cho phản hồi của nhân viên.
**Architecture:** `backend/` là owner của orchestration, persistence, publish gate và read API; `service/` là owner của AI runtime và phải dùng code-based Google ADK qua gRPC; `frontend/` là owner của UI vận hành và màn đọc kết quả.
**Storage Scope:** Conversation-analysis path của Seam 2 giữ 2 bảng lưu trữ business-facing là `analysis_run` và `analysis_result`.

**Intent:** Không biến conversation-analysis path thành generic AI platform. Scheduled official flow chỉ phân tích đúng một `conversation_day` tại một thời điểm và chỉ sinh ra các chiều business đang cần cho dashboard và coaching, với đúng một giá trị cho mỗi chiều trên mỗi unit.
**Observable Delta:** Sau khi Seam 1 publish snapshot ngày `D`, hệ thống tạo đúng một scheduled `analysis_run` cho `etl_run` đó, lấy mọi `conversation_day` của ngày làm unit, gọi AI service qua gRPC theo batch, ghi một `analysis_result` cho mỗi unit, và publish cả ngày khi mọi unit đã terminal ở `succeeded` hoặc `unknown`.
**Allowed Mechanism:** Postgres 17 với `analysis_run` + `analysis_result`; gRPC nội bộ giữa `backend/` và `service/`; code-based Google ADK trong `service/`; prompt editor theo page nằm ở config domain khác, còn `analysis_run` chỉ snapshot prompt thực tế đã dùng để audit.
**Forbidden Shortcuts:** Không thêm bảng output thứ ba cho summary/profile; không cho AI override label official của Seam 1; không coi Pancake tag là truth; không nhầm batch với analysis grain; không để ADK session thành business persistence; không dùng `Agent Config` YAML làm production path; không piggyback AI CRM mapping vào `analysis_result`.

## Bất Biến Cốt Lõi

- Scheduled official flow có analysis grain là đúng `1 conversation_day = 1 unit`.
- Mỗi unit phải bao gồm toàn bộ message thuộc `conversation_day` đó.
- `inbox mới / inbox cũ` là truth của Seam 1, AI không được override.
- `tái khám` trên dashboard phải resolve theo thứ tự ưu tiên:
  - label/evidence từ Seam 1
  - suy luận từ nội dung thật của `conversation_day`
  - tag vận hành từ Pancake
  - `unknown`
- Tag Pancake kiểu `KH mới`, `KH tái khám` chỉ là tín hiệu vận hành có độ tin cậy thấp.
- Scheduled Seam 2 không lưu final official journey label; nó chỉ lưu `content_customer_type` do AI suy luận từ nội dung.
- Mọi chiều BI của một unit phải là scalar dimension, không phải array.
- Batch chỉ là execution grouping để tiết kiệm RPM/token.
- Unit fail phải bị terminalize thành `unknown`; không được treo vô hạn.
- Ngày vẫn được publish nếu mọi unit đều đã terminal, kể cả có unit `unknown`.
- `pilot` và `manual_slice` là một; run mode chỉ cần `manual_slice`.

## Seam 2 Thực Sự Phân Tích Gì

Conversation-analysis path phân tích các chiều sau cho mỗi `conversation_day`, và mỗi chiều chỉ có đúng một giá trị:

- `opening_theme`
  - cuộc hội thoại ngày đó thực chất bắt đầu bằng nội dung gì
- `customer_mood`
  - tâm trạng khách trong ngày
- `primary_need`
  - nhu cầu hoặc dịch vụ chính khách đang quan tâm
- `primary_topic`
  - chủ đề quan tâm chính của khách trong ngày
- `content_customer_type`
  - AI suy luận từ nội dung xem đây giống `kh_moi`, `tai_kham`, hay `unknown`
- `closing_outcome_as_of_day`
  - trạng thái chốt đơn / chốt hẹn tính tới hết ngày đó
- `response_quality_label`
  - đánh giá tổng quan về chất lượng phản hồi phía nhân viên trong unit
  - đây là một dimension BI, không phải scorecard kỷ luật
- `process_risk_level`
  - mức rủi ro quy trình nổi bật nhất của unit, dạng scalar để BI đọc được

Phần coaching không phải dimension, chỉ là supporting text đi kèm:

- `response_quality_issue_text`
  - lỗi chính hoặc điểm cần cải thiện nổi bật nhất
- `response_quality_improvement_text`
  - gợi ý cải thiện ngắn, dễ hành động
- `process_risk_reason_text`
  - mô tả ngắn vì sao unit bị gắn mức rủi ro đó

## Tại Sao Chốt 2 Bảng

### Không chọn 3 bảng trở lên

- Tách thêm profile/config tables làm Seam 2 drift sang hướng generic platform.
- Nhu cầu hiện tại chưa cần owner riêng cho summary/profile/output.
- Phần prompt editor vẫn cần, nhưng không nhất thiết phải nằm trong 2 bảng run/result của analysis path này.

### Phương án chọn

- `analysis_run`
  - chỉ track run
  - snapshot prompt/model/schema đã dùng
- `analysis_result`
  - một row cho một unit phân tích
  - chỉ giữ output AI thật sự cần cho dashboard và coaching

## Boundary Và Owner

### `backend/`

- owner của `analysis_run` và `analysis_result`
- owner của scheduler, idempotency, publish gate và read API
- owner của read model join với Seam 1 để ra dashboard official
- owner của final precedence rule cho `tái khám`
- owner của gRPC client gọi `service/`

### `service/`

- owner của prompt builder text-only
- owner của ADK runtime
- owner của batch planning, retry, validation
- không own business persistence
- nhận payload qua gRPC và trả per-unit result qua gRPC
- production path dùng structured-output per unit; không dựa vào tool calling hay multi-agent delegation trong cùng request phân tích

### `frontend/`

- UI xem lịch sử run
- UI manual rerun
- UI đọc kết quả và feedback coaching
- UI chỉnh prompt theo page ở config domain khác; khi chạy, effective prompt phải được snapshot vào `analysis_run`

## Thiết Kế 2 Bảng

### `analysis_run`

Đây là bảng track run, không duplicate những cột có thể join từ Seam 1.

Nó chỉ nên giữ:

- loại run
- reference tới scope Seam 1 hoặc manual scope
- status / publish outcome
- model / prompt / schema snapshot
- retry / coverage / log
- audit fields

### `analysis_result`

Đây là output table duy nhất của conversation-analysis path.

Mỗi row tương ứng:

- một `conversation_day`
- hoặc một `manual_slice`

Nó chỉ nên giữ:

- reference tới unit nguồn
- trạng thái publish / terminal
- các scalar dimension cho BI
- supporting text bounded cho coaching và process risk
- failure info khi unit rơi về `unknown`

## Luồng Scheduled Daily

1. Seam 1 publish một `etl_run` official cho ngày `D`.
2. `backend/` kiểm tra đã có scheduled `analysis_run` cho `etl_run` đó chưa.
3. Nếu chưa có:
   - tạo `analysis_run`
   - snapshot `model_name`, prompt, output schema đang active
4. `backend/` lấy toàn bộ `conversation_day` thuộc `etl_run` và gọi `service/` qua gRPC.
5. `service/` chia unit thành execution batches.
6. Prompt builder compile text thuần cho từng unit hoặc batch unit.
7. ADK `Runner` chạy `LlmAgent` structured-output.
8. `service/` trả per-unit result cho `backend/`.
9. `backend/` ghi một `analysis_result` cho mỗi unit với:
   - `result_status = succeeded`
   - hoặc `result_status = unknown`
10. Khi mọi unit đã terminal:
   - nếu không có unknown thì `publish_outcome = published_clean`
   - nếu có unknown thì `publish_outcome = published_with_unknowns`
   - promote kết quả của run sang `publish_state = published`
11. Chỉ khi còn unit chưa terminal thì ngày đó mới không publish.

## Retry, Failure Và Manual Run

### Scheduled Daily

- retry nằm trong cùng `analysis_run`
- có backoff, jitter, batch downshift
- không tạo scheduled run thứ hai cho cùng `etl_run`

### Nếu Unit Fail

- row của unit đó vẫn được ghi
- các chiều chính rơi về `unknown`
- `failure_info_json` giữ lý do fail
- ngày vẫn được publish nếu mọi unit khác đã terminal

### `manual_day`

- chạy lại cho một `etl_run` hoặc một ngày cụ thể
- tạo `analysis_run` mới và `analysis_result` mới
- có thể publish để supersede official cũ

### `manual_slice`

- chính là use case pilot/debug hiện tại
- mặc định là `diagnostic`
- không tự đi vào official dashboard

## Prompt Và Tracking

- Prompt editor theo page vẫn cần, nhưng không tính là một trong 2 bảng lưu trữ của analysis path này.
- Khi run bắt đầu, `backend/` phải snapshot effective prompt vào `analysis_run`.
- Prompt gửi model luôn phải là text thuần.
- Audit tối thiểu ở mức run/result:
  - `analysis_run.model_name`
  - `analysis_run.prompt_version`
  - `analysis_run.prompt_snapshot_json`
  - `analysis_run.output_schema_version`
  - `analysis_run.generation_config_json`
  - `analysis_result.prompt_hash`
- Raw prompt đầy đủ chỉ giữ khi debug, sampled audit hoặc unit fail.

## Rule Ưu Tiên Dữ Liệu

### `inbox mới / inbox cũ`

- chỉ lấy từ Seam 1
- không lưu lại ở `analysis_result`

### `tái khám`

- dashboard official resolve theo precedence:
  - Seam 1
  - `analysis_result.content_customer_type`
  - Pancake operational tag
  - `unknown`

### Tag Pancake

- là hint có độ tin cậy thấp
- không được override nội dung chat thật khi 2 nguồn mâu thuẫn

## Output Shape Gợi Ý

### Cột first-class trong `analysis_result`

- `opening_theme`
- `customer_mood`
- `primary_need`
- `primary_topic`
- `content_customer_type`
- `closing_outcome_as_of_day`
- `response_quality_label`
- `process_risk_level`

### Supporting text trong `analysis_result`

- `response_quality_issue_text`
- `response_quality_improvement_text`
- `process_risk_reason_text`

## Boundary Với CRM Mapping

- AI-assisted CRM mapping là feature chính thức của app nhưng không thuộc phạm vi của tài liệu analysis-path này.
- Deterministic fast-path vẫn xử lý ở Seam 1 và ghi vào `thread_customer_mapping`.
- Contract đầy đủ của mapping flow phải đọc theo `docs/design.md`, không nhét vào `analysis_result`.

## Kế Hoạch Triển Khai

### Task 1

- chốt gRPC contract `backend` <-> `service`

### Task 2

- chốt schema 2 bảng `analysis_run` và `analysis_result` cho conversation-analysis path

### Task 3

- build prompt builder text-only + snapshot policy

### Task 4

- build ADK runtime + batch runner + retry policy

### Task 5

- build scheduler + publish/supersede flow

### Task 6

- build read model join Seam 1 + Seam 2 theo precedence rule

## Chốt Cuối

- Conversation-analysis path không phải generic AI analysis.
- Nó chỉ phân tích những gì BoD đang cần để đọc hiện trạng và coaching.
- `analysis_run` chỉ track run.
- `analysis_result` là output table duy nhất của analysis path.
- `manual_slice` và `pilot` là một.
- `tái khám` phải luôn ưu tiên Seam 1 và nội dung chat thật hơn Pancake tag vận hành.
