# Thiết kế UI và flow hệ thống

## Mục tiêu của UI

UI của hệ thống không phải là một dashboard đẹp để xem cho vui. Nó phải phục vụ đúng 4 nhóm nhu cầu:

1. BoD xem hiện trạng hàng ngày và quyết định ưu tiên cải tiến.
2. Team vận hành và quản lý xem nguyên nhân đằng sau KPI, drill xuống thread cụ thể, xem nhân viên nào đang cần cải thiện ở điểm nào.
3. IT/dev cấu hình page, taxonomy tag, opening rule, prompt profile, scheduler và theo dõi publish run.
4. Hệ thống xuất được báo cáo `.xlsx` business-facing từ semantic mart, không xuất raw JSON hay raw code.

## Nguyên tắc thiết kế UI

- Dashboard official chỉ đọc từ dữ liệu đã publish.
- Không trộn dữ liệu canonical mới ingest dở dang với kết quả AI cũ trên cùng một KPI card.
- Khi slice phủ nhiều ngày, danh sách chính ở các màn investigation phải ở grain `thread`.
- `thread_day` chỉ dùng cho history, breakdown theo ngày và drill-down.
- Các màn dành cho BoD phải ưu tiên kết luận, xu hướng và phân phối.
- Các màn dành cho vận hành phải ưu tiên root-cause, audit evidence và actionability.
- Các màn dành cho IT/dev phải ưu tiên trạng thái job, config version, publish state và error diagnostics.
- UI wording phải là tiếng Việt business-facing. Không lộ raw code như `journey_code`, `primary_need_code` ra màn chính.

## Information Architecture

Hệ thống nên có 7 khu vực chính trong navigation:

1. `Tổng quan`
2. `Khám phá dữ liệu`
3. `Hiệu quả nhân viên`
4. `Lịch sử hội thoại`
5. `So sánh trang`
6. `Vận hành`
7. `Cấu hình`

Không nên nhét tất cả vào một màn `dashboard + settings`.

## Personas và view tương ứng

### 1. BoD

Cần:

- biết hôm qua đang xảy ra chuyện gì
- nhu cầu nào nhiều nhất
- inbox mới và tái khám đang mở đầu theo pattern nào
- nguồn khách từ ads/post nào
- kịch bản nào cần ưu tiên sửa

View chính:

- `Tổng quan`
- `So sánh trang`
- export `.xlsx`

### 2. Quản lý vận hành

Cần:

- nhìn breakdown theo nhu cầu, theme mở đầu, outcome, risk
- xem đội ngũ phản hồi đang mắc lỗi gì
- drill xuống thread cụ thể để xác thực

View chính:

- `Khám phá dữ liệu`
- `Hiệu quả nhân viên`
- `Lịch sử hội thoại`

### 3. IT/dev

Cần:

- add page
- map tag
- chỉnh opening rule
- chỉnh prompt profile
- chạy manual run
- theo dõi publish
- debug error

View chính:

- `Vận hành`
- `Cấu hình`

## Bộ lọc toàn hệ thống

Các filter này phải persist khi chuyển giữa các view business.

### Filter bắt buộc

- `Page`
  - mặc định chỉ xem 1 page
  - ngoại lệ: view `So sánh trang`
- `Slice`
  - preset: `Hôm qua`, `7 ngày`, `30 ngày`, `Quý này đến hôm qua`, `Tuỳ chọn`
  - chỉ được chọn đến hết ngày hôm qua với dashboard official
- `Publish snapshot`
  - mặc định là snapshot official mới nhất của mỗi ngày

### Dice filters business

- `Inbox mới / inbox cũ`
- `Tái khám`
- `Nhu cầu chính`
- `Chủ đề chính`
- `Mood`
- `Outcome`
- `Risk`
- `Chất lượng phản hồi`
- `Nguồn khách`
- `Chi nhánh`
- `Nhân viên`

### Rule filter quan trọng

- Khi slice phủ nhiều ngày, dashboard tổng hợp ở grain fact.
- Khi danh sách chính hiện thread, thread chỉ hiện 1 dòng duy nhất trong slice đã chọn.
- Khi người dùng mở thread, UI mới hiển thị history `thread_day`.

## View 1: Tổng quan

Đây là landing page chính cho BoD.

Nguồn dữ liệu:

- `fact_thread_day`
- `fact_staff_thread_day` cho một số card chất lượng phản hồi

### Mục tiêu

Trả lời nhanh:

- hôm qua có bao nhiêu inbox
- bao nhiêu inbox mới
- bao nhiêu tái khám
- nguồn khách đến từ đâu
- nhu cầu nào đang nổi bật
- rủi ro và chất lượng xử lý đang ở mức nào
- nên ưu tiên sửa kịch bản nào trước

### Bố cục đề xuất

#### Khu 1: KPI scorecards

- Tổng số inbox
- Số inbox mới
- Số inbox tái khám
- Tỷ lệ chốt hẹn/chốt đơn
- Số thread có risk cao
- Tổng chi phí AI
- Thời gian phản hồi đầu tiên trung vị

Mỗi card phải có:

- giá trị hiện tại
- delta so với kỳ trước tương đương
- tooltip giải thích cách tính

#### Khu 2: Opening overview

- Biểu đồ phân phối `inbox mới` theo `opening_theme`
- Biểu đồ phân phối `inbox tái khám` theo `opening_theme`
- Cho phép click vào từng nhóm để drill xuống danh sách thread

Điểm quan trọng:

- không hiển thị literal text làm dimension chính
- có thể hover để xem 3-5 ví dụ `first_meaningful_message_text_redacted`

#### Khu 3: Nhu cầu và outcome

- Top `primary_need`
- Top `primary_topic`
- Breakdown `official_closing_outcome`
- Funnel đơn giản:
  - tổng inbox
  - có nhu cầu đặt lịch
  - đã chốt hẹn

#### Khu 4: Nguồn khách

- Breakdown theo `entry_source_type`
- Top `post_id`
- Top `ad_id`
- bảng "Nguồn khách hiệu quả" với:
  - post/ad
  - số thread
  - tỷ lệ tái khám
  - nhu cầu top
  - outcome top

#### Khu 5: Ưu tiên cải tiến

Đây là khu quan trọng nhất của dashboard.

Hiển thị một bảng xếp hạng các cluster cần ưu tiên, ví dụ theo tổ hợp:

- `opening_theme`
- `primary_need`
- `risk_level`
- `response_quality`
- `closing_outcome`

Mỗi dòng nên có:

- tên cluster business-facing
- số lượng thread
- outcome xấu/tốt
- risk level
- nhận xét ngắn do hệ thống tổng hợp
- CTA `Xem chi tiết`

### Interaction

- Click vào card KPI sẽ chuyển sang `Khám phá dữ liệu` với filter đã apply.
- Click vào một nhóm `opening_theme` sẽ mở danh sách thread tương ứng.
- Click vào `Nguồn khách` sẽ đi sang view attribution đã lọc sẵn.

## View 2: Khám phá dữ liệu

Đây là view self-service BI cho quản lý vận hành.

Nguồn dữ liệu:

- `fact_thread_day`

### Mục tiêu

Cho người dùng tự xoay:

- breakdown
- drill-down
- pivot
- so sánh phân phối
- tìm cụm vấn đề

### Bố cục

#### Khu 1: Builder

Người dùng chọn:

- `Metric`
  - số thread
  - số inbox mới
  - số tái khám
  - tỷ lệ chốt
  - chi phí AI
  - thời gian phản hồi
- `Breakdown by`
  - ngày
  - opening theme
  - nhu cầu
  - topic
  - outcome
  - mood
  - risk
  - nguồn khách
- `Compare by`
  - page
  - inbox mới/cũ
  - tái khám hay không

#### Khu 2: Visualization

- bar chart
- stacked bar
- line chart
- pivot table

#### Khu 3: Detail table

Bảng chi tiết có:

- các dimension đang chọn
- metric
- tỷ lệ
- nút `Drill xuống thread`

### Filter nâng cao

- số tin nhắn > `n`
- có/không có risk
- cost AI > `n`
- thời gian phản hồi > `n`
- có tag signal nào đó
- có source post/ad nào đó

## View 3: Hiệu quả nhân viên

Flow cũ chưa đủ rõ cho bài toán này. View này phải là view riêng.

Nguồn dữ liệu:

- `fact_staff_thread_day`
- drill-through sang `fact_thread_day`

### Mục tiêu

Trả lời:

- nhân viên nào đang phản hồi tốt
- nhân viên nào cần cải thiện
- lỗi thường gặp là gì
- các lỗi đang xuất hiện nhiều ở nhu cầu/chủ đề nào

### Bố cục

#### Khu 1: Scorecards

- Số staff active trong slice
- Tỷ lệ thread có chất lượng phản hồi tốt
- Tỷ lệ thread có issue cần cải thiện
- Median first response time

#### Khu 2: Bảng xếp hạng nhân viên

Mỗi dòng:

- tên nhân viên
- số thread tham gia
- response quality distribution
- median first response
- top issue pattern
- top improvement suggestion

#### Khu 3: Issue matrix

Matrix theo:

- staff
- response_quality_code
- primary_need

để thấy staff nào yếu ở loại nhu cầu nào.

#### Khu 4: Coaching inbox

Danh sách các `staff_thread_day` cần xem ngay:

- quality thấp
- issue lặp lại nhiều
- risk cao
- thread volume đủ lớn

Mỗi dòng có:

- nhân viên
- thread
- issue text
- improvement text
- CTA `Mở thread`

### Rule hiển thị

- Đây là công cụ cải thiện chất lượng xử lý, không phải công cụ đổ lỗi.
- UI wording phải trung tính, không dùng ngôn ngữ phán xét.

## View 4: Lịch sử hội thoại

Đây là màn investigation theo thread.

Nguồn dữ liệu:

- `thread`
- `thread_day`
- `message`
- `analysis_result`

### Mục tiêu

Cho phép người dùng:

- tìm thread
- xem transcript
- xem từng ngày AI đã kết luận gì
- kiểm tra evidence và audit

### Layout

#### Cột trái: Danh sách thread

Mỗi item hiển thị:

- tên khách
- snippet mới nhất
- thời gian gần nhất
- icon source
- badge inbox mới / tái khám / risk

Filter trong cột trái:

- từ khoá
- tên khách
- source post/ad
- need
- outcome
- staff

#### Pane phải: Thread workspace

Có 4 tab:

1. `Hội thoại`
2. `Lịch sử phân tích`
3. `Audit AI`
4. `Liên kết CRM`

### Tab `Hội thoại`

- Hiển thị full transcript theo thời gian
- Message từ staff phải hiện tên người gửi
- Opening block có thể collapse/expand
- Highlight:
  - first meaningful message
  - staff first response
  - message được AI dùng làm supporting evidence

### Tab `Lịch sử phân tích`

Một timeline theo `thread_day`:

- ngày
- opening theme
- need
- journey
- outcome
- mood
- risk
- quality summary
- cost AI

### Tab `Audit AI`

Phải xem được:

- model
- prompt hash
- taxonomy version
- evidence used
- field explanations
- supporting message ids

Mục tiêu là giải đáp câu hỏi "AI dựa trên cái gì để đánh giá".

### Tab `Liên kết CRM`

- current linked customer
- method `deterministic / ai / manual`
- confidence
- lịch sử decision nếu có
- action chạy remap/manual link

## View 5: So sánh trang

Đây là view duy nhất cho phép multi-page trong cùng một màn.

Nguồn dữ liệu:

- `fact_thread_day`
- `fact_staff_thread_day`

### Mục tiêu

Cho BoD so sánh:

- inbox volume
- source mix
- need mix
- outcome mix
- revisit mix
- quality/risk mix

### Visuals

- trend line theo ngày cho từng page
- stacked bars theo need/outcome/source
- scatter plot:
  - volume
  - conversion
  - AI cost

### Rule

- Không cho drill trực tiếp xuống message từ đây.
- View này chỉ để compare, sau đó click vào page để chuyển sang `Tổng quan` hoặc `Khám phá dữ liệu`.

## View 6: Vận hành

Đây là màn dành cho IT/dev và operator.

Nguồn dữ liệu:

- `pipeline_run`
- `analysis_run`
- publish state của semantic mart

### Mục tiêu

- theo dõi health
- theo dõi official run
- chạy manual run
- xem publish nào đang active
- debug lỗi

### Bố cục

#### Khu 1: Health summary

- backend
- go-worker
- AI service
- database
- queue

#### Khu 2: Run monitor

Danh sách `run_group` gần đây:

- loại run
- page
- requested window
- child run count
- status
- publish result
- cost
- started_at / finished_at

#### Khu 3: Run detail

Khi mở một `run_group`:

- timeline các child run theo ngày
- ETL metrics
- AI metrics
- publish status
- error logs
- thread coverage

Rule:

- nếu group có nhiều child run, danh sách thread trong run detail vẫn ở grain `thread`
- bấm vào thread thì mới xem history theo `thread_day`

#### Khu 4: Manual run form

Operator chọn:

- page
- window start
- window end
- mode:
  - `diagnostic`
  - `manual republish`
- có chạy AI hay không
- có cho phép publish full-day child runs hay không

UI phải preview trước:

- run sẽ split thành những `target_date` nào
- child nào là full-day
- child nào chỉ là partial-day diagnostic

#### Khu 5: Mapping queue

Các thread cần review CRM mapping:

- thread
- candidate customer
- confidence
- evidence
- action approve/reject/remap

## View 7: Cấu hình

Flow cũ gom tất cả config vào một chỗ chung chung. Không hợp lý.

Màn `Cấu hình` nên có 5 tab:

1. `Thông tin page`
2. `Tag taxonomy`
3. `Opening rules`
4. `Prompt profile`
5. `Scheduler và thông báo`

### Tab `Thông tin page`

- page name
- pancake page id
- business timezone
- bật/tắt ETL
- bật/tắt AI
- token status

### Tab `Tag taxonomy`

Mục tiêu:

- map tag thô thành signal chuẩn

UI nên có:

- danh sách tag từ Pancake
- cột `loại signal`
- cột `giá trị canonical`
- cột `trạng thái`

Ví dụ loại signal:

- customer_journey
- need
- outcome
- branch
- staff
- noise

Validation:

- một tag chỉ map vào một role chính
- role và canonical value phải thuộc taxonomy chuẩn
- tag deactivated phải hiện rõ
- tag mới chưa map phải hiện badge cảnh báo

### Tab `Opening rules`

Mục tiêu:

- dạy ETL hiểu opening flow của page

UI nên cho cấu hình:

- bot markers
- flow markers
- button title mapping
- explicit revisit/need selections
- preview opening block từ sample runtime

### Tab `Prompt profile`

Mục tiêu:

- chỉnh rubric đánh giá cho page

UI phải tách rõ:

- taxonomy output chuẩn của hệ thống là cố định
- page prompt chỉ sửa business rubric

Các phần nên chỉnh được:

- định nghĩa outcome theo page
- tín hiệu risk đặc thù
- tiêu chí đánh giá chất lượng phản hồi
- vocabulary đặc thù

Phải có:

- clone từ version cũ
- clone từ page khác
- test với sample runtime
- xem structured output
- so sánh output giữa 2 prompt version

### Tab `Scheduler và thông báo`

- giờ chạy official daily
- concurrency cap
- retry policy
- telegram/email notify
- recipients

## Flow thêm trang

Flow cũ đúng tinh thần nhưng cần owner boundary rõ hơn.

### Bước 1: Kết nối token

1. Nhập user access token.
2. Hệ thống validate token.
3. Nếu hợp lệ, cho phép list pages.

### Bước 2: Chọn page

1. Hiển thị danh sách page.
2. Chọn page.
3. Chọn `initial_conversation_limit`.

### Bước 3: Lấy sample onboarding

1. Chạy sample extract cho ngày hiện tại trong khoảng `[0:00 - now)`.
2. Chỉ lấy tối đa `N` conversation.
3. Không persist vào official mart.
4. Runtime sample chỉ phục vụ cấu hình.

### Bước 4: Cấu hình page

Operator/dev phải cấu hình tối thiểu:

- tag taxonomy
- opening rules
- prompt profile
- scheduler
- notification target

### Bước 5: Test với sample

UI phải cho:

- preview opening parse
- preview normalized tag signals
- chạy AI test trên sample
- xem structured output
- xem evidence và explanation

### Bước 6: Activate page

1. Tạo `connected_page`
2. Tạo `page_config_version`
3. Bật scheduler
4. Hiển thị trạng thái `sẵn sàng vận hành`

## Export flow

Hệ thống phải có export `.xlsx` business-facing.

### Nơi export

- `Tổng quan`
- `Khám phá dữ liệu`
- `Hiệu quả nhân viên`
- `So sánh trang`

### Nguyên tắc export

- đọc từ semantic mart
- sheet title phải là tiếng Việt business-facing
- code nội bộ phải được render thành nhãn hiển thị
- có metadata sheet:
  - page
  - slice
  - publish snapshot
  - generated_at

### Loại export

- `Tóm tắt điều hành`
- `Chi tiết thread`
- `Chi tiết nhân viên`
- `Nguồn khách`

## Trạng thái rỗng và lỗi

### Empty states

- chưa có page kết nối
- page chưa có publish official
- filter không có dữ liệu
- chưa map xong tag taxonomy

### Error states

- token hết hạn
- ETL failure
- AI failure
- partial publish
- taxonomy mismatch

UI phải chỉ rõ:

- lỗi đang nằm ở seam nào
- hành động tiếp theo là gì

## Flow tổng thể của người dùng

### Flow A: BoD xem tình hình hôm qua

1. Vào `Tổng quan`
2. Xem KPI chính
3. Xem opening theme của inbox mới và tái khám
4. Xem source ads/post
5. Mở bảng `Ưu tiên cải tiến`
6. Nếu cần, drill xuống `Khám phá dữ liệu`

### Flow B: Quản lý tìm nguyên nhân

1. Vào `Khám phá dữ liệu`
2. Lọc `opening_theme = ...`, `primary_need = ...`, `risk = high`
3. Drill xuống danh sách thread
4. Mở `Lịch sử hội thoại`
5. Xem transcript và `Audit AI`

### Flow C: Quản lý coaching staff

1. Vào `Hiệu quả nhân viên`
2. Xem bảng xếp hạng staff
3. Mở `Coaching inbox`
4. Chọn thread cụ thể
5. Xem issue text và improvement text

### Flow D: IT chạy rerun

1. Vào `Vận hành`
2. Chọn `Manual run`
3. Chọn custom range
4. Xem preview split theo ngày
5. Execute
6. Theo dõi run group
7. Nếu child run full-day hoàn tất, hệ thống publish

### Flow E: IT thêm page mới

1. Vào `Cấu hình`
2. Chọn `Thêm page`
3. Chạy onboarding sample
4. Map tag
5. Dạy opening rules
6. Chỉnh prompt profile
7. Test sample
8. Activate

## Kết luận

UI hợp lý cho hệ thống này không phải là một dashboard duy nhất cộng thêm một màn settings.

UI đúng phải phản ánh đúng 3 lớp dữ liệu và 2 grain phân tích chính:

- `fact_thread_day` cho BoD, BI, source attribution, need/outcome/risk
- `fact_staff_thread_day` cho coaching staff
- `thread + thread_day + message + analysis_result` cho investigation và audit

Từ đó mới trả lời được trọn bộ insight mà không biến UI thành nơi ghép tạm dữ liệu từ code cũ.
