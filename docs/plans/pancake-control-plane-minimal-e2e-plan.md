# Pancake Control Plane Minimal E2E Plan

## Mục tiêu

Thiết kế lại luồng vận hành Seam 1 theo hướng:

- không dùng JSON runtime làm source of truth
- page config phải được lưu trong DB
- frontend chỉ là HTTP client
- số bảng control-plane phải ở mức tối thiểu
- không thêm bảng chỉ để "cho đủ", chỉ thêm khi có owner rõ ràng

Phạm vi tài liệu này là end-to-end cho:

- đăng ký page Pancake
- onboarding sample đầu tiên
- fine-tune cấu hình page
- chạy thủ công `etl-only` hoặc `etl-and-ai`
- scheduler hằng ngày
- prompt riêng theo page và clone prompt từ page khác

## Quyết định Thiết Kế

### 1. Source of truth duy nhất cho page config là DB

Mọi dữ liệu vận hành thật của page phải nằm trong DB:

- `pancake_page_id`
- `user_access_token`
- `business_timezone`
- bật tắt pipeline tự động
- cấu hình fine-tune hiện hành
- prompt active của page

Frontend không giữ config như một nguồn sự thật lâu dài. Frontend chỉ gửi HTTP request và hiển thị trạng thái.

### 1a. Hard constraint về tenant model

Repo này và tính năng này chỉ phục vụ một công ty duy nhất.

Hệ quả thiết kế bắt buộc:

- không có multi-tenant
- không có `organization_id`
- không có `company_id`
- không có `workspace_id`
- không có lớp ownership riêng cho sales team hay CSKH team trong schema control-plane

Mô hình đúng là:

- một công ty duy nhất
- công ty đó có nhiều team nội bộ
- một team có thể dùng nhiều page Pancake
- page Pancake là index vận hành chính của control-plane

Mọi agent về sau phải coi đây là hard constraint. Không được tự thêm tenant/org abstraction nếu user không yêu cầu lại một cách tường minh.

### 2. Không lưu `initial_conversation_limit` trong page config

`initial_conversation_limit` chỉ thuộc về onboarding run đầu tiên.

Lý do:

- đây không phải cấu hình vận hành ổn định
- chỉ dùng để sample dữ liệu phục vụ fine-tune
- sau khi page vận hành ổn định thì field này không còn là config dài hạn

Thông số này chỉ nên được lưu trong run-level metadata để audit.

### 3. Tối thiểu số bảng control-plane

Không tách tag mapper, opening mapper, bot signatures thành nhiều bảng riêng ở phase này.

Thiết kế tối thiểu:

- `connected_page`
- `page_prompt_version`
- giữ 4 bảng Seam 1 canonical hiện có:
  - `etl_run`
  - `conversation_day`
  - `message`
  - `thread_customer_mapping`

Lý do:

- tag mapping, opening rules, bot signatures đều là page-local config
- shape của chúng còn thay đổi nhiều
- dùng `jsonb` trên `connected_page` là cách ít rủi ro hơn so với nổ thêm nhiều bảng versioning quá sớm

### 4. Prompt cần version riêng

Prompt là phần duy nhất nên có bảng riêng ngay từ đầu.

Lý do:

- người dùng muốn clone prompt từ page khác
- prompt là nội dung text dài, thay đổi độc lập
- cần giữ lịch sử version để rollback và compare

### 5. Scheduler chỉ đọc từ DB

Scheduler không đọc file.

Nó chỉ cần:

- quét `connected_page` đang active
- đọc timezone của từng page
- nếu `auto_scraper_enabled = true` thì tạo ETL run
- nếu `auto_ai_analysis_enabled = true` và có final Seam 1 snapshot thì enqueue AI run

## Trải Nghiệm UI Mục Tiêu

### Bước 1: Add page

1. IT nhập `user access token`
2. bấm `List pages`
3. UI hiển thị các page lấy từ Pancake API
4. IT chọn page
5. UI mặc định `business_timezone = Asia/Ho_Chi_Minh`
6. IT nhập `initial_conversation_limit`
7. bấm `Run onboarding sample`

Lưu ý:

- `register page` nên persist page config trước khi chạy onboarding
- token phải được backend lưu vào DB
- `initial_conversation_limit` không lưu vào `connected_page`, chỉ đi kèm onboarding run

### Bước 2: Fine-tune sau onboarding

Sau onboarding run đầu tiên, UI phải hiện:

- tag đang xuất hiện và thống kê cơ bản
- `opening_candidate_window` phổ biến nhất
- bot signature candidates
- dữ liệu phục vụ chỉnh pipeline tự động

IT được chỉnh:

- tag mapping
- opening rules
- bot signatures
- prompt riêng của page

### Bước 3: Bật vận hành

Sau khi fine-tune xong, IT có thể:

- bật `Auto Scraper`
- bật `Auto AI Analysis`
- hoặc bấm `Run now`

Khi bấm `Run now`, phải chọn:

- `etl-only`
- hoặc `etl-and-ai`

và chọn:

- full-day
- hoặc khoảng thời gian cụ thể

### Bước 4: Chỉnh lại bất kỳ lúc nào

Sau khi page hoạt động ổn định, IT vẫn phải vào chỉnh được:

- timezone
- auto flags
- tag mapping
- opening rules
- bot signatures
- prompt

Không có bước nào bị khóa vĩnh viễn sau onboarding.

## Luồng Backend End-to-End

### A. Register page

`POST /chat-extractor/pages/list-from-token`

- input: `user_access_token`
- output: danh sách page thật từ Pancake

`POST /chat-extractor/control-center/pages/register`

- input:
  - `pancake_page_id`
  - `page_name`
  - `user_access_token`
  - `business_timezone`
  - auto flags mặc định `false`
- backend tạo hoặc update `connected_page`

### B. Onboarding sample

`POST /chat-extractor/control-center/pages/:id/onboarding/preview`

- input:
  - `target_date`
  - `initial_conversation_limit`
  - `processing_mode = etl_only | etl_and_ai`

`POST /chat-extractor/control-center/pages/:id/onboarding/execute`

- backend tạo `etl_run` với:
  - `run_mode = onboarding_sample`
  - `processing_mode`
  - `run_params_json.initial_conversation_limit`
- chỉ chọn tối đa số conversation đã yêu cầu
- với mỗi conversation được chọn vẫn lấy toàn bộ message của ngày đó
- run này không được publish official

### C. Fine-tune config

`PATCH /chat-extractor/control-center/pages/:id`

Cho phép update:

- `business_timezone`
- `auto_scraper_enabled`
- `auto_ai_analysis_enabled`
- `active_tag_mapping_json`
- `active_opening_rules_json`
- `active_bot_signatures_json`

Artifacts onboarding gần nhất được lưu ngay trên `connected_page.onboarding_state_json`.

### D. Prompt management

`GET /chat-extractor/control-center/pages/:id/prompts`

`POST /chat-extractor/control-center/pages/:id/prompts`

- tạo draft version mới

`POST /chat-extractor/control-center/pages/:id/prompts/clone`

- lấy active prompt của page khác
- tạo version mới cho page hiện tại

`POST /chat-extractor/control-center/pages/:id/prompts/:promptVersionId/activate`

- set prompt version active cho page

### E. Manual run

`POST /chat-extractor/jobs/preview`

`POST /chat-extractor/jobs/execute`

Input phải chọn rõ:

- page đã lưu trong DB
- `processing_mode = etl_only | etl_and_ai`
- `target_date` hoặc `requested_window_*`
- `run_mode = backfill_day | manual_range | scheduled_daily | onboarding_sample`

Backend tự đọc config hiện hành của page từ DB.

Frontend không phải gửi lại full page config hay token mỗi lần chạy, trừ bước register ban đầu.

### F. Scheduler daily

Scheduler nền:

1. đọc `connected_page` active
2. với page có `auto_scraper_enabled = true`, tạo ETL run full-day theo timezone của page
3. nếu ETL thành công và `auto_ai_analysis_enabled = true`, enqueue AI run tương ứng

## Tối Giản Schema Nhưng Không Làm Ẩu

### Những gì cố tình không tách bảng riêng

Giữ ở `connected_page` dưới dạng `jsonb`:

- tag mapping
- opening rules
- bot signatures
- onboarding artifacts / candidates gần nhất

Lý do:

- đủ để vận hành ngay
- ít migration hơn
- chưa bị khóa vào một data model versioning quá sớm

### Những gì bắt buộc phải có bảng riêng

`page_prompt_version`

Lý do:

- clone prompt từ page khác là yêu cầu thật
- cần lịch sử prompt
- prompt là asset có đời sống riêng, không nên nhét vào JSONB versionless

## Thay Đổi Tối Thiểu Trên Schema Hiện Có

### Giữ nguyên 4 bảng canonical

- `etl_run`
- `conversation_day`
- `message`
- `thread_customer_mapping`

### Chỉ thêm tối thiểu

1. thêm `connected_page`
2. thêm `page_prompt_version`
3. chỉnh `etl_run` để gắn với `connected_page`

Khuyến nghị:

- thêm `connected_page_id`
- thêm `processing_mode`
- thêm `run_params_json`

Không thêm hàng loạt bảng mới cho mapper/version/history ở phase này.

## Các Phase Implementation

### Phase 1: DB control-plane tối thiểu

- thêm `connected_page`
- thêm `page_prompt_version`
- cập nhật `etl_run`
- chưa đụng schema canonical còn lại

### Phase 2: Backend control-plane thật

- list pages từ token
- register page vào DB
- get/list/update page config
- prompt CRUD + clone + activate
- preview/execute lấy config từ DB

### Phase 3: Frontend flow thật

- list pages
- chọn page
- register
- onboarding sample
- fine-tune config
- manual run
- run dashboard

### Phase 4: Scheduler integration

- job quét `connected_page`
- tạo ETL run hằng ngày
- chỉ enqueue AI khi đã có Seam 1 final snapshot

## Out of Scope Cố Ý

- permission/auth chi tiết
- encryption key management hoàn chỉnh
- version riêng cho tag/opening/bot config
- prompt sandbox compare nhiều version
- schema riêng cho health metrics AI

Những phần này có thể thêm sau khi control-plane tối thiểu chạy ổn.

## Kết Luận

Thiết kế tối thiểu, sạch và ít bảng nhất cho phase hiện tại là:

- `connected_page` làm source of truth cho config page
- `page_prompt_version` làm nơi quản lý prompt theo page
- `etl_run` làm audit owner cho onboarding/manual/scheduler
- `conversation_day`, `message`, `thread_customer_mapping` giữ nguyên vai trò canonical Seam 1

Đây là điểm cân bằng tốt nhất giữa:

- đủ cho vận hành thật
- không lạm phát schema
- không nhét mọi thứ vào memory/frontend
- không mở quá nhiều bảng control-plane khi dữ liệu thật còn chưa chạy ổn định
