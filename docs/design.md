# Thiết kế chat-analyzer-v2

## Trạng thái tài liệu

- Đây là thiết kế đích của hệ thống, không phải lộ trình theo phase.
- Repo này là môi trường dev. Được phép đập đi xây lại, không cần backward compatibility.

## Bài toán phải giải

Hệ thống chỉ coi là đúng hướng nếu trả lời được rõ ràng các câu hỏi trong `docs/insight.md`:

- Bao nhiêu `inbox mới` mỗi ngày.
- Các `inbox mới` thường bắt đầu theo nhóm nội dung nào, tỷ lệ bao nhiêu.
- Các `inbox mới` quan tâm dịch vụ/chủ đề gì.
- Kết quả chốt theo ngày là gì.
- Bao nhiêu `inbox tái khám`.
- Các `inbox tái khám` thường bắt đầu theo nhóm nội dung nào, tỷ lệ bao nhiêu.
- Nguồn khách đến từ `post_id` nào hoặc `ad_id` nào.
- Nhân viên nào đang phản hồi tốt/chưa tốt, lỗi thường gặp là gì.
- Kịch bản nào, nhu cầu nào, risk nào cần ưu tiên cải tiến.

Ngoài ra:

- Mọi đánh giá AI phải audit được.
- Dashboard và file `.xlsx` phải đọc từ semantic layer ổn định, không đọc từ transcript raw.
- ETL và AI phải tách hẳn seam.

## Quan sát chốt từ payload Pancake

Từ sample payload trong `docs/pancake-api-samples/` có thể chốt các fact sau:

- `post_id`, `ad_id`, `activities`, `ad_click` là source fact explicit. Không cần AI để suy luận nguồn khách.
- Opening flow của bot có thể chứa tín hiệu nghiệp vụ rất mạnh như:
  - `Khách hàng lần đầu`
  - `Khách hàng tái khám`
  - `Đặt lịch hẹn`
- `tags` là page-local evidence, không phải taxonomy canonical dùng chung toàn hệ thống.
- `ĐÃ CHỐT HẸN`, `KH mới`, `KH TÁI KHÁM`, tên nhân viên, chi nhánh có thể xuất hiện ngay trong tag.
- `first_meaningful_message` không thể lấy thẳng bằng raw first message vì có:
  - postback như `Bắt đầu`
  - auto greeting
  - Botcake template
  - ad-click auto wrapper
- Một thread có thể có nhiều staff tham gia trong cùng một ngày.

Kết luận:

- source đã cho khá nhiều signal explicit
- AI không nên tái suy luận những gì source đã nói rõ
- nhưng AI là bắt buộc để gom nhóm ý nghĩa hội thoại và đánh giá chất lượng xử lý
- hệ thống phải hỗ trợ `lazy operator`: nhập access token, chọn page, activate là chạy được với default an toàn

## Design Gate

### Invariants

- `customer = thread` trong phạm vi hệ thống này.
- Grain snapshot chính là `thread_day`.
- `inbox mới / inbox cũ` là deterministic theo `thread_first_seen_at`.
- `tái khám` là nhãn nghiệp vụ độc lập với `inbox mới / inbox cũ`.
- `tái khám` có thể overlap với `inbox mới` hoặc `inbox cũ`.
- `tái khám` là `journey label`, không phải `need`.
- `primary_need` chỉ trả lời câu hỏi "khách muốn làm gì trong hội thoại này".
- AI có thể suy luận `tái khám`, nhưng output đó phải đi vào `journey_code` hoặc `official_revisit_label`, không được đi vào `primary_need_code`.
- Dashboard official chỉ đọc từ dữ liệu đã publish đồng bộ end-to-end.
- Với extract ngày `D`, canonical chỉ persist message có timestamp thuộc ngày `D`.
- Page-specific prompt không được tự ý đổi taxonomy output chuẩn của toàn hệ thống.
- tag mới chưa được operator cấu hình phải mặc định đi vào `noise`, không làm nghẽn onboarding hay daily run.
- opening rules là optional signal extractor; nếu không có rule phù hợp thì hệ thống vẫn phải chạy bằng fallback `first_meaningful_message`.

### 3 hướng khả thi

#### Hướng 1: Chỉ dùng canonical normalized tables + query động

Ưu điểm:

- ít bảng vật lý nhất
- dễ bắt đầu

Nhược điểm:

- mọi dashboard query sẽ ngày càng dài và mong manh
- khó publish snapshot ổn định
- export `.xlsx` sẽ phụ thuộc vào SQL join phức tạp
- không có semantic layer đúng nghĩa cho BI

#### Hướng 2: Canonical ODS + AI inference store + semantic mart star schema

Ưu điểm:

- đúng owner boundary
- hỗ trợ BI, dashboard, export, compare page
- publish theo snapshot rõ ràng
- audit được AI
- tách được grain `thread_day` và grain `staff_thread_day`

Nhược điểm:

- nhiều lớp hơn hướng 1
- phải nghiêm túc về taxonomy canonical

#### Hướng 3: Đẩy nặng sang AI, giảm canonical

Ưu điểm:

- code ETL nhìn có vẻ mỏng

Nhược điểm:

- sai vai trò hệ thống
- chi phí cao
- khó kiểm chứng
- dễ black box
- mất khả năng BI ổn định

### Khuyến nghị

Chọn hướng 2.

### So sánh patch ít đau với route đúng đắn

Patch ít đau:

- giữ normalized schema hiện tại
- thêm vài cột
- thêm vài materialized view

Vì sao reject:

- không giải quyết tận gốc bài toán semantic layer cho BI
- không giải quyết grain nhân viên
- vẫn để dashboard phụ thuộc vào query live từ bảng vận hành
- về lâu dài sẽ làm mọi metric mới trở thành một lần vá query

Route đúng đắn:

- ODS/canonical lưu source fact và deterministic fact
- AI store lưu suy luận có audit
- semantic mart star schema phục vụ reporting và export

## Hướng đi chốt của hệ thống

Hệ thống đích có 3 lớp:

1. `Canonical ODS`
   - lưu dữ liệu source đã chuẩn hoá
   - là ground truth cho replay và audit
2. `AI inference store`
   - lưu kết quả phân tích từng unit
   - không ghi đè canonical
3. `Semantic mart`
   - là star schema để dashboard, BI, export `.xlsx` đọc

Đây là kiến trúc cuối cùng nên có.

## Grain chính của hệ thống

### Grain 1: `thread`

Dùng cho:

- định danh khách trong scope bài toán
- xác định `first_seen_at`
- gắn current CRM link

### Grain 2: `thread_day`

Đây là grain quan trọng nhất.

Một row = một thread có message trong ngày `D`.

Dùng cho:

- inbox mới / inbox cũ
- tái khám
- opening theme
- nhu cầu
- topic
- outcome
- source ads/post
- risk
- cost AI

### Grain 3: `staff_thread_day`

Một row = một staff có tham gia vào một `thread_day`.

Grain này là bắt buộc nếu muốn trả lời đúng yêu cầu:

- đánh giá trực quan về chất lượng phản hồi của từng nhân viên
- lỗi ở đâu
- gợi ý cải thiện

Nếu không có grain này, toàn bộ phần coaching staff sẽ luôn bị trộn chung ở conversation level.

## Ranh giới ETL vs AI

### ETL phải làm

- extract theo boundary ngày local
- dedupe message theo source id
- normalize actor:
  - `customer`
  - `staff_via_pancake`
  - `third_party_bot`
  - `page_system_auto_message`
  - `unknown_page_actor`
- redact số điện thoại trong tin nhắn
- lấy `conversations[].recent_phone_numbers[].phone_number` vào structured field theo raw source value và chỉ dedupe, không normalize hay sửa giá trị làm thay đổi dữ liệu gốc
- parse `post_id`, `ad_id`, `activities`, `ad_click`
- map tag thô sang signal chuẩn theo config page
- với tag chưa có mapping rõ ràng, mặc định gán `role = noise`
- xác định `thread_first_seen_at`
- xác định `is_new_inbox`
- xác định `first_meaningful_message`
- parse `opening_block` theo heuristic/fallback
- nếu `opening_rules` có match thì parse explicit opening selections như:
  - `khách hàng tái khám`
  - `đặt lịch hẹn`
- `opening_rules` chỉ có nhiệm vụ extract signal giá trị từ opening flow; không phải điều kiện để parser chạy thành công
- tính metric deterministic:
  - `message_count`
  - `first_staff_response_seconds`
  - `avg_staff_response_seconds`
  - `staff_participants`
  - `staff_message_counts`

### AI phải làm

Ở grain `thread_day`:

- `opening_theme`
- `customer_mood`
- `primary_need`
- `primary_topic`
- `journey_inference`
- `closing_outcome_inference`
- `process_risk_level`
- `process_risk_reason_text`

Rule output bắt buộc ở grain `thread_day`:

- `journey_inference` là nơi AI suy luận `khách mới / tái khám / chưa rõ` ở góc nhìn hành trình.
- `primary_need` là nơi AI suy luận nhu cầu chính của hội thoại.
- AI không được trả `tái khám` như một giá trị của `primary_need`.
- Nếu hội thoại vừa là `tái khám` vừa có nhu cầu `đặt lịch`, output đúng là:
  - `journey_inference = revisit`
  - `primary_need = dat_lich`

Ở grain `staff_thread_day`:

- `response_quality_label`
- `response_quality_issue_text`
- `response_quality_improvement_text`

### Resolver official labels

`official_revisit_label`:

1. explicit opening selection
2. mapped tag signal
3. AI `journey_inference`
4. `unknown`

`official_closing_outcome`:

1. explicit source/tag outcome
2. AI `closing_outcome_inference`
3. `unknown`

## "Các inbox mới thường bắt đầu với nội dung gì?" phải giải như thế nào

Câu này là semantic aggregation, không phải literal aggregation.

Ví dụ:

- "em bị mụn ẩn"
- "da em nổi mụn"
- "mụn nhiều quá"
- "cho em hỏi về trị mụn"

phải có thể rơi vào cùng một nhóm business meaning.

Vì vậy:

- ETL chỉ xác định `first_meaningful_message_text_redacted`
- AI phải map opening của `thread_day` vào một taxonomy canonical tên là `opening_theme_code`

AI input cho opening theme phải không chỉ là raw first message, mà là:

- `opening_block`
- explicit selections trong opening flow
- `first_meaningful_message_text_redacted`
- các tag signal liên quan nếu có

Kết luận:

- dimension dashboard không phải raw text
- dimension dashboard là `opening_theme_code`
- raw text chỉ là drill-down evidence

## Taxonomy canonical phải là global, không phải theo page

Đây là điểm thiết kế rất quan trọng.

Nếu mỗi page được tự định nghĩa output taxonomy riêng thì:

- không thể so sánh giữa các page
- không thể làm trend dài hạn ổn định
- không thể export `.xlsx` nhất quán cho BoD

Vì vậy:

- hệ thống phải có `analysis_taxonomy_version` toàn cục
- page-specific prompt chỉ được:
  - bổ sung rubric
  - bổ sung vocabulary
  - bổ sung business nuance
- page-specific prompt không được đổi schema output chuẩn

Các field AI quan trọng phải map vào canonical global codes, ví dụ:

- `opening_theme_code`
- `primary_need_code`
- `primary_topic_code`
- `journey_code`
- `closing_outcome_code`
- `customer_mood_code`
- `risk_level_code`
- `response_quality_code`

Rule taxonomy bắt buộc:

- `journey_code` và `primary_need_code` là 2 trục khác nhau.
- `journey_code` mô tả trạng thái hành trình của khách, ví dụ `new_to_clinic`, `revisit`, `unknown`.
- `primary_need_code` mô tả điều khách muốn làm trong hội thoại, ví dụ `dat_lich`, `hoi_gia`, `tu_van_mun`.
- `revisit` không phải giá trị hợp lệ của `primary_need_code`.
- Nếu AI nhận ra khách là `tái khám`, output đó phải đi vào `journey_code`, không được đẩy sang `primary_need_code`.

## Mô hình dữ liệu đích

Nguyên tắc model:

- ưu tiên chuẩn hoá theo khoá ngoại nếu dữ liệu đã có owner table rõ ràng
- không duplicate dữ liệu chỉ để tiện query trong canonical/control-plane tables
- chỉ được phép duplicate ở:
  - semantic mart/read model phục vụ BI
  - snapshot/audit fields bắt buộc phải freeze theo run

## A. Control plane

### 1. `connected_page`

Owner của:

- `pancake_page_id`
- `page_name`
- `business_timezone`
- token và trạng thái kết nối
- cờ bật/tắt ETL, AI
- active config version

### 2. `page_config_version`

Một row = một snapshot config theo page.

Chứa:

- `tag_mapping_json`
- `opening_rules_json`
- `prompt_text`
- `notification_targets_json`
- `scheduler_json`
- tham chiếu tới `analysis_taxonomy_version`

Rule config:

- `tag_mapping_json` phải support default `noise` cho tag chưa được operator cấu hình.
- `role` của tag mapping là enum cố định, không dùng `null`.
- tag mới từ source phải được normalize reliably về một `canonical_role`; nếu chưa có cấu hình tay thì mặc định là `noise`.
- tag mapping nên lưu thêm nguồn gốc quyết định như `system_default` hoặc `operator_override` để audit được vì sao tag đang là `noise`.
- `opening_rules_json` là best-effort, có thể để trống.
- `prompt_text` là một khối text mà operator nhập trực tiếp; không bắt operator nhập JSON.
- `scheduler_json` và `notification_targets_json` có thể kế thừa default toàn hệ thống nếu operator không chỉnh.
- scheduler default toàn hệ thống phải là:
  - `official_daily_time = 00:00`
  - `lookback_hours = 2`
- `lookback_hours` chỉ là overlap vận hành cho source discovery/recovery, không làm thay đổi canonical window của ngày.

Impact class của config phải được hiểu rõ:

- `scheduler_json` và `notification_targets_json` là operational config, không làm invalid ODS hay AI result đã có.
- `tag_mapping_json` và `opening_rules_json` là ETL-transform config; đổi các config này có thể làm thay đổi canonical derived fields trong `thread_day`.
- `prompt_text` là AI-analysis config; đổi config này không đổi raw source fact, nhưng có thể làm invalid kết quả AI đã có.
- `analysis_taxonomy_version` là semantic contract config; đổi taxonomy có thể làm invalid cả output AI lẫn semantic mart rows dù raw source fact không đổi.

### 3. `analysis_taxonomy_version`

Một row = một version taxonomy canonical dùng chung toàn hệ thống.

Chứa:

- allowed codes cho từng output field
- nhãn tiếng Việt business-facing
- sort order
- grouping rules cho BI/export

## B. Canonical ODS

### 4. `pipeline_run`

Một row = một run kỹ thuật cho `page + target_date + mode`.

Chứa:

- `run_group_id`
- `run_mode`
- `target_date`
- `window_start_at`
- `window_end_exclusive_at`
- `is_full_day`
- `status`
- `publish_state`
- `publish_eligibility`
- `metrics_json`
- `reuse_summary_json`
- `error_text`

Rule:

- `pipeline_run` phải nối về `pipeline_run_group` bằng khoá ngoại để lấy `page`, `frozen_config_version`, `frozen_taxonomy_version`
- không duplicate `connected_page_id` hay config pointer xuống `pipeline_run` nếu đã lấy được qua `run_group`

### 5. `thread`

Owner của thread-level state ổn định:

- `connected_page_id`
- `thread_id`
- `thread_first_seen_at`
- `customer_display_name`
- `current_phone_candidates_json`
- source entry info gần nhất

### 6. `thread_day`

Một row = một thread có message trong ngày `D`.

Chứa canonical fact theo ngày:

- `pipeline_run_id`
- `thread_id`
- `is_new_inbox`
- `entry_source_type`
- `entry_post_id`
- `entry_ad_id`
- `observed_tags_json`
- `normalized_tag_signals_json`
- `opening_block_json`
- `first_meaningful_message_id`
- `first_meaningful_message_text_redacted`
- `first_meaningful_message_sender_role`
- `message_count`
- `first_staff_response_seconds`
- `avg_staff_response_seconds`
- `staff_participants_json`
- `staff_message_stats_json`
- `explicit_revisit_signal`
- `explicit_need_signal`
- `explicit_outcome_signal`
- `source_thread_json_redacted`

Rule:

- `thread_day` lấy `target_date` và page context qua `pipeline_run_id`, không duplicate xuống row này
- `connected_page_id` không nên nằm trong `thread_day` nếu đã lấy được từ `thread` hoặc `pipeline_run`

### 7. `message`

Một row = một message đã normalize.

Chứa:

- `thread_day_id`
- `message_id`
- `inserted_at`
- `sender_role`
- `sender_name`
- `message_type`
- `redacted_text`
- `attachments_json`
- `is_meaningful_human_message`
- `is_opening_block_message`
- `source_message_json_redacted`

### 8. `thread_customer_link`

Current-state link từ `thread` sang customer nội bộ.

Fast-path deterministic:

- nếu có đúng 1 phone map chắc chắn thì ETL promote luôn

Nếu nhập nhằng:

- defer sang AI/manual mapping flow

Rule quan trọng:

- `thread_customer_link` nên tham chiếu trực tiếp bằng `thread_id` của bảng `thread`, không duplicate `connected_page_id`
- bảng này chỉ lưu `current resolved link`, không phải nơi chuẩn hóa hay lưu master phone của CRM
- không được giả định phone của CRM luôn theo chuẩn `E.164`
- evidence phone trong link nên là một giá trị trung tính như `mapped_phone_match_key`, vì CRM có thể chứa số rất bẩn hoặc không đồng nhất độ dài
- nếu link không đến từ phone match mà đến từ AI/manual review thì evidence phone có thể `null`
- extractor không được tự ý tạo `match_key` từ `recent_phone_numbers`; nếu cần matching key cho CRM thì đó là lớp dẫn xuất riêng của flow mapping, không phải raw canonical extract

## C. AI inference store

### 9. `analysis_run`

Một row = một lần chạy AI cho một `pipeline_run`.

Chứa:

- `pipeline_run_id`
- `config_version_id`
- `taxonomy_version_id`
- `model_name`
- `prompt_hash`
- `runtime_snapshot_json`
- `output_schema_version`
- `status`
- `unit_count_planned`
- `unit_count_succeeded`
- `unit_count_unknown`
- `total_cost_micros`

### 10. `analysis_result`

Một row = một `thread_day`.

Chứa:

- `analysis_run_id`
- `thread_day_id`
- `result_status`
- conversation-level output:
  - `opening_theme_code`
  - `opening_theme_reason`
  - `customer_mood_code`
  - `primary_need_code`
  - `primary_topic_code`
  - `journey_code`
  - `closing_outcome_inference_code`
  - `process_risk_level_code`
  - `process_risk_reason_text`
- staff-level output trong `staff_assessments_json`
  - mỗi item ứng với một staff tham gia trong ngày
  - gồm `staff_name`, `response_quality_code`, `issue_text`, `improvement_text`
- audit:
  - `evidence_used_json`
  - `field_explanations_json`
  - `supporting_message_ids_json`
  - `usage_json`
  - `cost_micros`
  - `failure_info_json`

### 11. `thread_customer_link_decision`

Append-only audit cho AI/manual customer mapping khi fast-path deterministic không đủ.

## D. Semantic mart

Semantic mart là star schema chính thức để dashboard, BI và export `.xlsx` đọc.

### Conformed dimensions

### 12. `dim_date`

### 13. `dim_page`

### 14. `dim_staff`

### Degenerate dimensions trong fact

Các code dưới đây không cần tách thành bảng dimension riêng, vì:

- cardinality thấp
- không cần nhiều thuộc tính mô tả ngoài `code + label`
- taxonomy đã được governance bởi `analysis_taxonomy_version`

Bao gồm:

- `opening_theme_code`
- `primary_need_code`
- `primary_topic_code`
- `journey_code`
- `closing_outcome_code`
- `customer_mood_code`
- `risk_level_code`
- `response_quality_code`
- `entry_source_type`
- `entry_post_id`
- `entry_ad_id`

### 15. `fact_thread_day`

Một row = một `thread_day` đã publish.

Đây là fact chính để trả lời insight cấp BoD.

Chứa:

- foreign keys:
  - `date_key`
  - `page_key`
- degenerate dimensions:
  - `thread_id`
  - `is_new_inbox`
  - `official_revisit_label`
  - `opening_theme_code`
  - `primary_need_code`
  - `primary_topic_code`
  - `official_closing_outcome_code`
  - `customer_mood_code`
  - `process_risk_level_code`
  - `entry_source_type`
  - `entry_post_id`
  - `entry_ad_id`
- measures:
  - `thread_count = 1`
  - `message_count`
  - `first_staff_response_seconds`
  - `avg_staff_response_seconds`
  - `ai_cost_micros`
- audit columns:
  - `analysis_run_id`
  - `prompt_hash`
  - `model_name`
  - `output_schema_version`
  - `analysis_explanation_json`
  - `first_meaningful_message_text_redacted`

### 16. `fact_staff_thread_day`

Một row = một staff trong một `thread_day` đã publish.

Đây là fact để trả lời insight cấp coaching/vận hành nhân sự.

Chứa:

- foreign keys:
  - `date_key`
  - `page_key`
  - `staff_key`
- degenerate dimensions:
  - `thread_id`
  - `response_quality_code`
- measures:
  - `staff_message_count`
  - `staff_first_response_seconds_if_owner`
  - `ai_cost_allocated_micros`
- explanation fields:
  - `response_quality_issue_text`
  - `response_quality_improvement_text`

## Vì sao star schema là bắt buộc

Thiết kế đích phải có semantic mart star schema, vì insight yêu cầu:

- daily KPI ổn định
- compare page
- dice/filter trên nhiều chiều phân tích
- export `.xlsx`
- mở rộng self-service BI

Nếu không có semantic mart:

- dashboard sẽ phụ thuộc vào query vận hành
- metric sẽ dễ drift theo từng lần sửa logic
- export sẽ không có source dữ liệu business-facing ổn định

## Scheduler và publish model

### Loại job

- `official_daily`
- `manual`

### Luật chạy

- mỗi page chỉ có tối đa 1 `official_daily` active
- `manual` có thể chạy song song nhưng không được phá publish pointer của official
- custom range phải split theo `target_date`
- child run nào phủ full-day thì có thể publish `official`
- child run partial-day của ngày hiện tại có thể publish `provisional`
- child run partial-day của ngày cũ chỉ được dùng để xem kết quả run, không được publish dashboard
- mặc định `official_daily` cho ngày `D` bắt đầu lúc `00:00` của ngày `D + 1`
- canonical window của official run ngày `D` luôn là `[00:00 ngày D, 00:00 ngày D + 1)`
- `lookback_hours` chỉ mở rộng phạm vi source discovery/recovery quanh biên cuối ngày để tránh miss các cập nhật phút cuối; nó không làm nở canonical window

### Chuỗi publish chính thức

1. extract
2. normalize vào ODS
3. chạy AI
4. build semantic mart rows
5. atomically publish

Dashboard chỉ đọc fact rows đã publish.

### Run output và publish không phải là một

Mọi run, kể cả `manual` partial-day, đều phải materialize semantic mart rows ở phạm vi run đó.

Điều này nhằm đảm bảo:

- chạy thủ công luôn xem được kết quả
- operator có thể review trước khi publish
- manual run không trở thành thao tác "chạy xong nhưng không nhìn thấy gì"
- việc tinh chỉnh config/prompt có một `preview workspace` riêng, không bắt buộc phải publish ra dashboard mới xem được kết quả

Vì vậy hệ thống phải có 3 trạng thái hiển thị/publish:

1. `draft`
   - run đã xong và xem được trong `run result view` hoặc `config preview workspace`
   - chưa tác động đến dashboard publish của page
2. `published_provisional`
   - run đã được người dùng promote lên dashboard
   - chỉ được phép với same-day early snapshot của ngày hiện tại
   - phải hiện rõ coverage window và badge `tạm thời`
3. `published_official`
   - chỉ áp dụng cho full-day snapshot
   - là snapshot mặc định cho dashboard lịch sử

### Luật publish sửa lại

- `manual` run phải cho phép:
  - xem kết quả ở phạm vi run
  - publish ngay
  - hoặc xem trước rồi mới publish
- child run partial-day của ngày hiện tại được phép promote thành `published_provisional`
- child run partial-day của ngày cũ tuyệt đối không được publish dashboard
- child run full-day được phép promote thành `published_official`
- child run full-day của ngày cũ khi publish phải đi qua xác nhận mạnh vì đây là historical overwrite
- `official_daily` full-day cuối ngày sẽ supersede snapshot `published_provisional` của cùng `page + target_date`
- manual full-day republish cho ngày cũ được phép supersede `published_official` cũ nếu user xác nhận publish
- snapshot config có hiệu lực ngay cho run mới được tạo sau thời điểm đổi config
- `official_daily` dùng snapshot config đang active tại thời điểm run đó bắt đầu
- run cũ đã publish không tự động đổi theo config mới

### Luật dashboard

- dashboard lịch sử mặc định đọc `published_official`
- dashboard cho ngày hiện tại hoặc snapshot đang chạy tay có thể đọc `published_provisional`
- khi một ngày đang hiển thị từ `published_provisional`, UI phải hiện:
  - badge `Tạm thời`
  - coverage window, ví dụ `00:00-10:00`
  - config/prompt snapshot đang dùng
- partial-day của ngày cũ chỉ được xem trong `run result view`, không được hiện trên dashboard

### Luật export

- export `.xlsx` là workflow riêng, không phải capability gắn vào từng dashboard view
- request export phải chọn tường minh `page` và `khoảng ngày`; không được ngầm kế thừa view hoặc filter đang xem
- builder export đọc semantic mart và chỉ lấy các ngày trong khoảng chọn đã có `published_official`
- ngày chỉ có `published_provisional` hoặc chưa có snapshot thì không sinh row export
- nếu khoảng chọn có cả ngày có dữ liệu lẫn ngày không có dữ liệu, file chỉ chứa row cho các ngày thực sự có snapshot `published_official`
- nếu khoảng chọn không có ngày nào có `published_official` thì phải chặn export và báo rõ lý do

### Luật reuse để tiết kiệm chi phí

- reuse phải xét theo từng tầng, không được coi `config` là một khối duy nhất
- raw/source reuse:
  - nếu manual run đã lấy `00:00-10:00` của ngày `D`, official full-day cuối ngày phải tận dụng phần raw/source coverage đã có và chỉ fetch phần thiếu hoặc phần source đã đổi
  - với official full-day cho ngày `D`, source discovery mặc định có overlap `lookback_hours = 2` trước mốc `00:00 ngày D + 1` để giảm nguy cơ miss thread cập nhật ở phút cuối
  - dù source discovery có overlap, canonical persistence vẫn chỉ nhận message có timestamp thuộc `[00:00 ngày D, 00:00 ngày D + 1)`
- ODS reuse:
  - ODS chỉ được reuse nguyên trạng nếu ETL-transform config hash không đổi
  - nếu `tag_mapping_json` hoặc `opening_rules_json` đổi, hệ thống được phép reuse raw/source nhưng phải recompute canonical derived fields của `thread_day`
- AI reuse:
  - AI result chỉ được reuse nếu:
    - evidence hash không đổi
    - AI-analysis config hash không đổi
    - taxonomy version không đổi
  - nếu `prompt_text` đổi thì raw/ODS có thể reuse nhưng AI phải rerun cho các unit bị ảnh hưởng
  - nếu ETL-transform config đổi thì evidence bundle có thể đổi, khi đó AI result cũ không còn mặc định hợp lệ
- với các `thread_day` đã được phân tích trước đó, chỉ các unit bị ảnh hưởng bởi:
  - message/source fact mới
  - ETL-transform config mới
  - AI-analysis config mới
  - taxonomy version mới
  mới cần rebuild/rerun

### UI/UX warnings bắt buộc

- nếu view đang đọc `published_provisional`, phải hiện cảnh báo đây là snapshot tạm thời
- nếu slice nhiều ngày đang trộn nhiều prompt/config/taxonomy versions, phải hiện warning rõ ràng
- warning này phải nói rõ:
  - factual metrics vẫn đọc được bình thường
  - các AI-derived dimensions có thể không so sánh tuyệt đối 1:1 giữa các đoạn version khác nhau
- user phải xem được version boundary theo từng ngày
- nếu một ngày đã qua chỉ có partial run thì dashboard lịch sử phải coi như ngày đó chưa có snapshot publish được

## Hợp đồng với AI

AI unit ở grain `thread_day` phải nhận:

- transcript redacted
- `opening_block`
- explicit opening selections
- `first_meaningful_message_text_redacted`
- observed tag signals
- response metrics
- page prompt text
- taxonomy canonical đã pin

Bundle này là hậu quả của snapshot ETL-transform đã freeze cho run đó, không chỉ là hậu quả của prompt.

AI phải:

- ưu tiên source evidence explicit
- chỉ suy luận phần semantic mà ETL không xác định được
- trả structured output theo taxonomy canonical

AI không được:

- quyết định `is_new_inbox`
- rewrite source fact
- tự query dữ liệu sống ngoài request bundle

## Prompt engineering chốt

Vai trò chính của AI là:

- phân tích và đánh giá hội thoại

Operator chỉ cần nhập một khối `prompt_text` cho từng page.

Runtime sẽ tự compile:

- global system prompt cố định
- taxonomy/output contract cố định
- page `prompt_text`

Hệ thống phải quản lý 2 khái niệm khác nhau:

- `prompt_hash`: định danh kỹ thuật của compiled prompt
- `prompt_version`: nhãn dễ đọc cho con người

Rule của `prompt_version`:

- version được gắn theo nội dung prompt đã compile, không gắn theo số lần bấm lưu
- nếu ngày 1 dùng prompt A, ngày 2 sửa thành prompt B, ngày 3 sửa lại đúng nội dung A thì `prompt_version` của ngày 3 phải quay về `A`
- `prompt_hash` có thể dùng để nhận diện prompt content identity, nhưng UI/export nên hiển thị `prompt_version` trước vì dễ đọc hơn
- `analysis_run` và export metadata phải lưu được cả `prompt_version` lẫn `prompt_hash`

Prompt theo page chỉ được dùng để:

- mô tả quy trình của page
- mô tả cách hiểu outcome/risk/chất lượng xử lý
- thêm business vocabulary đặc thù

Prompt theo page không được dùng để:

- đổi taxonomy output toàn hệ thống
- thay thế parser rule cho source
- định nghĩa lại logic snapshot

Điều này có nghĩa là:

- UX của prompt là plain text
- audit runtime lưu `compiled_prompt_text` và `prompt_hash`
- operator không phải nhập JSON để cấu hình prompt

## Không black box

Mỗi kết quả AI phải trả lời được:

- đã phân tích thread_day nào
- đã dùng những evidence nào
- field nào dựa trên source explicit
- field nào là suy luận
- model/prompt/schema nào đã sinh ra kết quả đó

UI drill-down của một `thread_day` phải xem được:

- canonical evidence
- transcript redacted
- opening block
- tags/signals
- output AI
- explanation/audit

## Cách semantic mart trả lời các insight

Bao nhiêu inbox mới:

- `sum(thread_count)` trên `fact_thread_day` với `is_new_inbox = true`

Inbox mới thường bắt đầu với nội dung gì:

- group by `opening_theme_code` trên tập `is_new_inbox = true`

Tỷ lệ các nội dung:

- phân phối của `opening_theme_code`

Dịch vụ các inbox mới quan tâm:

- group by `primary_need_code` trên tập `is_new_inbox = true`

Kết quả chốt:

- group by `official_closing_outcome_code`

Bao nhiêu inbox tái khám:

- `sum(thread_count)` trên tập `official_revisit_label = 'revisit'`

Inbox tái khám thường bắt đầu với nội dung gì:

- group by `opening_theme_code` trên tập `official_revisit_label = 'revisit'`

Nguồn khách:

- group by `entry_source_type`, `entry_post_id`, `entry_ad_id`

Nhân viên nào đang phản hồi chưa tốt:

- đọc từ `fact_staff_thread_day`

Nên ưu tiên cải tiến kịch bản nào:

- rank theo tổ hợp:
  - volume `thread_count`
  - `opening_theme_code`
  - `primary_need_code`
  - `process_risk_level_code`
  - `official_closing_outcome_code`
  - `response_quality_code`

## Kết luận

Hướng đi đúng đắn cho hệ thống này là:

- ODS normalized để giữ source fact và deterministic fact
- AI inference store để giữ semantic judgment có audit
- semantic mart star schema để trả lời dashboard/BI/export

Trong đó:

- `thread_day` là grain kinh doanh chính
- `staff_thread_day` là grain bắt buộc cho bài toán coaching nhân viên
- `opening_theme_code` là semantic dimension do AI tạo từ opening evidence, không phải raw string
- taxonomy output phải là global canonical, page prompt chỉ là local rubric
