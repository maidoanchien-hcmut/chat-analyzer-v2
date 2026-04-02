# Thiết kế chat-analyzer-v2

## Insights

Là một thành viên BoD và Lead sales, tôi muốn biết mỗi ngày:

- Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ các inbox mới quan tâm trong đoạn hội thoại? Kết quả chốt?
- Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ?
- Leader muốn thống kê hiện trạng trước => ưu tiên cải tiến các kịch bản cho các vấn đề khách hàng quan tâm nhất.

## Nguyên tắc bất biến

- Hệ thống có 2 seam-owner tách biệt:
  - Seam 1 là lưu trữ dữ liệu đã được chuẩn hoá và các chỉ số deterministic, không dùng AI.
  - Seam 2 là phân tích bằng AI trên dữ liệu đã được lưu trữ ở seam 1, ghi kết quả sang hệ thống bảng riêng.
- Seam 1 chỉ lưu các dữ liệu có thể kiểm chứng từ source hoặc tính được bằng rule cố định:
  - page, customer, conversation, participant, message, tag, attachment, thời gian phản hồi, mapping sang crm nội bộ.
- Seam 2 chỉ sinh ra dữ liệu diễn giải:
  - sentiment, topic, intent, phân loại giai đoạn khách (không phải logic inbox mới/cũ, phần này được định nghĩa riêng), trạng thái chốt, đánh giá chất lượng phản hồi, risk flags, recommendation.
- Kết quả AI không được ghi đè vào dữ liệu canonical của seam 1.
- Thiết kế datawarehouse phải tận dụng hết khả năng của postgres17, số lượng bảng phải vừa đủ, không được dư thừa.
- Mọi kết quả AI phải truy vết được model, profile prompt, schema output và run id để có thể audit, so sánh và backfill.
- Báo cáo theo ngày phải đọc từ snapshot của ngày đó, không đọc từ trạng thái mới nhất của hội thoại.
- Với mỗi kỳ extract ngày `D`, seam 1 chỉ được persist:
  - các conversation thuộc ngày `D`
  - các message của các conversation đó mà timestamp cũng thuộc ngày `D`
- Nếu source API buộc phải đọc rộng hơn để tìm biên ngày `D`, dữ liệu ngoài ngày chỉ được tồn tại trong bộ nhớ xử lý tạm thời; không được lưu vào canonical seam 1 của ngày `D`.
- Trong phạm vi bài toán này, `customer` được chốt là 1 conversation thread trên nền tảng nguồn. Mapping sang CRM nội bộ là một liên kết tham chiếu bổ sung, không làm thay đổi logic snapshot mới/cũ.
- `inbox mới / inbox cũ` là trục phân loại deterministic theo thời điểm thread xuất hiện trên kênh chat.
- `tái khám` là trục phân loại nghiệp vụ theo hành trình khách hàng với phòng khám, độc lập với trục `inbox mới / inbox cũ`. Vì vậy một thread có thể vừa là `inbox mới` trên kênh chat vừa là `tái khám` nếu có evidence phù hợp từ source, chatbot, rule nghiệp vụ hoặc AI classification trên nội dung chat.

## Taxonomy Canonical

- `customer = conversation thread`
- `inbox mới`: thread có `first_seen_at` thuộc ngày hoặc kỳ đang xét trên kênh chat
- `inbox cũ`: thread đã có `first_seen_at` trước ngày hoặc trước kỳ đang xét trên kênh chat
- `khách mới / khách cũ`: chỉ là cách gọi business-facing cũ; trong tài liệu kỹ thuật này nên ưu tiên dùng `inbox mới / inbox cũ` để tránh hiểu nhầm với hồ sơ CRM
- `tái khám`: nhãn nghiệp vụ độc lập với `inbox mới / inbox cũ`, được xác định từ dữ liệu hội thoại/source như chatbot selection, rule heuristic, hoặc AI classification trên nội dung chat
- `closing_outcome`: kết quả chốt `as-of-day` trên snapshot ngày đó, không phải kết quả cuối cùng của toàn bộ vòng đời thread
- `page tag dictionary`: từ điển `tag_id -> tag text/meta` của từng page; chỉ dùng để resolve metadata cho tag thực tế xuất hiện trên conversation
- `conversation-day observed tags`: tập tag và tag history thực sự gắn với conversation trong ngày `D`; đây mới là source evidence được đưa qua Seam 2
- `page tag mapping`: cấu hình theo từng page để map tag thô sang taxonomy chuẩn nội bộ; AI chỉ suy luận cho phần còn thiếu hoặc chưa map
- `opening block`: chuỗi postback/template/opening options ở đầu conversation hoặc đầu slice ngày, có thể chứa tín hiệu giá trị như loại khách và nhu cầu; phải được lưu thành source evidence riêng
- `first_meaningful_human_message`: tin nhắn đầu tiên có ý nghĩa trong ngày `D` từ phía con người, có thể đến từ khách hoặc nhân viên, nhưng loại trừ chatbot/system
- `CRM mapping`: enrichment/joining với hệ thống nội bộ; không được dùng để xác định hoặc rewrite `inbox mới / inbox cũ / tái khám`
- `thread_customer_mapping`: mapping thread-level từ `page_id + thread_id` sang đúng 1 customer nội bộ; không được nhét ownership này vào `conversation_day`
- `dashboard official`: chỉ đọc từ `published snapshot` và `published analysis rows` của cùng một kỳ dữ liệu
- `extract boundary`: mỗi run ngày `D` chỉ được persist conversation-day và message có timestamp thuộc ngày `D`
- `target_date`: ngày local mà ETL đang build canonical slice; scope page/ngày của `conversation_day` và `message` được kế thừa qua `etl_run`
- `manual custom range`: yêu cầu vận hành có thể chỉ định khoảng thời gian bất kỳ; hệ thống phải materialize yêu cầu đó thành một hoặc nhiều `etl_run` theo từng `target_date`, và các run partial-day không được tự động trở thành dashboard official

## Repository structure & technical stack

Mỗi folder là một "mini-repo" của chính nó, chạy độc lập và deploy độc lập.

- `backend/`: là phần backend kết nối với database, cung cấp API, đồng thời cũng là seam-owner của `go-worker` thực hiện ETL pipeline. Techstack:
  - Bun + ElysiaJS + Typescript, Go for `go-worker`
  - Postgres + Prisma, Redis, BullMQ
  - REST for public API, gRPC for internal communication
  - Validation DTO
  - Swagger API documentation
- `frontend/`: là phần frontend standalone tối giản để thao tác ETL, chạy phân tích và xem dữ liệu. Techstack:
  - Bun + Typescript thuần + HTML + CSS
  - Không dùng framework UI ở giai đoạn này
  - Không có đăng nhập, không có refresh token, không có phân quyền
  - Ưu tiên cấu trúc file nhỏ, dễ tích hợp sang ứng dụng khác về sau
- `service/`: là phần seam-owner của AI service. Phần này nhận manifest và unit payload từ `backend/` qua gRPC, xử lý bằng AI model, rồi trả kết quả versioned về cho `backend/` để persist. Không dùng REST JSON per-thread cho bulk processing hằng ngày. Techstack:
  - Python, FastAPI, Uvicorn
  - Sử dụng Google ADK code-based runtime với Gemini model
  - Là nơi sẽ host nhiều dịch vụ AI hơn trong tương lai, hiện tại chỉ có chat-analyzer service
  - Chia nhỏ thành nhiều module để dễ quản lý đồng thời giữ root directory gọn gàng

## Các cơ chế hoạt động

- Frontend gọi trực tiếp các endpoint backend hiện có để lấy danh sách page, xem health summary, preview job và execute job.
- Frontend chỉ cần một lớp API mỏng bằng `fetch`, không cần auth store hay session lifecycle.
- Xử lý real-time: SSE (Server-Sent Events) hoặc WebSocket để cập nhật dashboard ngay khi có dữ liệu mới mà không cần refresh trang.
- UI state được quản lý cục bộ theo từng màn hình; mỗi thao tác quan trọng đều hiển thị request/response, trạng thái loading và lỗi rõ ràng để phục vụ vận hành.
- Backend phải có cơ chế xác định trạng thái của go-worker, log-streaming để IT có thể monitor và debug khi cần thiết.
- Dashboard BI chỉ được đọc từ `published snapshot` và `published analysis rows` của cùng một kỳ dữ liệu. Nếu trong ngày pipeline chưa hoàn tất, UI phải hiển thị rõ là đang xem số liệu `preliminary` hoặc fallback về kỳ `final` gần nhất; không được trộn Seam 1 real-time với Seam 2 của ngày cũ trong cùng một KPI card.

## Nguồn dữ liệu

**Pancake:**

- Là một hệ thống quản lý bán hàng đa kênh toàn diện, có thể kết nối nhiều kênh khách nhau: Facebook, Instagram, Tiktok, v.v.
- Sử dụng api của pancake có thể trích xuất được nhiều dữ liệu khác nhau.

**Tình hình hiện tại về pancake:**

- Tag trích xuất được trong một conversation có thể bao gồm: loại khách hàng, địa chỉ, độ tuổi, nhân viên phụ trách, v.v...
- Mỗi trang lại có danh sách tag khác nhau, không đồng nhất.
- Doanh nghiệp không dùng tính năng assignee của pancake.
- `GET /pages/{page_id}/tags` chỉ trả toàn bộ tag dictionary của page. Dữ liệu thực sự đi vào unit phân tích là các `tags` và `tag_histories` gắn trên từng conversation; page tag dictionary chỉ dùng để resolve `tag_id -> text/meta`.
- Để giảm chi phí và hạn chế hallucination, hệ thống phải có giao diện cho IT để phân loại tag theo từng page:
  - map tag thô sang taxonomy chuẩn nội bộ
  - gắn nhãn tag nào là `customer_type`, `need`, `branch`, `staff_label`, `noise`, v.v.
  - version theo page và có hiệu lực theo thời gian
  - với conversation còn thiếu tag hoặc tag chưa được map, AI mới phải suy luận từ context khác
- Tin nhắn trong hội thoại có bao gồm cả phần tin nhắn của chatbot trả lời tự động và lựa chọn của khách với các option mà chatbot đưa ra (vd: Bắt đầu) nên phải lọc ra cho câu hỏi này:
  - Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ các inbox mới quan tâm trong đoạn hội thoại? Kết quả chốt
  - Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ
- Có thể tận dụng câu hỏi có sẵn của chatbot để gắn cờ `tái khám` cho thread trong ngày, nhưng logic `inbox mới / inbox cũ` vẫn phải được xác định deterministic từ snapshot seam 1. Một thread có thể có tin nhắn đầu tiên tới trang nhưng vẫn có thể là `tái khám` nếu khách chưa từng nhắn tin nhưng đã từng tới phòng khám trước đó và họ chọn "tái khám" trong tin nhắn chatbot.
- Cần một bảng cấu hình `bot_signatures` theo page/channel để Go-worker có thể đối chiếu bot sender id, quick-reply marker, mẫu câu cố định, và thứ tự ưu tiên nhận diện bot/system message. Không được hard-code các mẫu này trong logic ETL.
- Các opening flow theo page có thể chứa thông tin giá trị như `khách hàng lần đầu / tái khám`, `đặt lịch hẹn / chat tư vấn / gọi tư vấn`. Vì vậy phải có giao diện cho IT để:
  - cấu hình opening signatures theo page/channel
  - map raw option/payload sang tín hiệu chuẩn hoá
  - review các opening block chưa match
  - version hoá rule theo thời gian
- Với page mới vừa kết nối mà chưa có opening config, hệ thống vẫn phải chạy được bằng fallback mặc định:
  - dùng `first_meaningful_human_message` để cắt mốc nội dung bắt đầu có ý nghĩa
  - phần trước mốc đó được giữ thành `opening_candidate_window`
  - các block trong window này được lưu raw để IT fine-tune mapping sau, không làm nghẽn pipeline

**Mitigation:**

- Chọc api pancake để biết được hình dạng reponse và các dữ liệu trích xuất được, từ đó thiết kế schema và mô hình chuẩn hoá dữ liệu cho phù hợp.
- Lưu response sample vào `docs/pancake-api-samples/` để làm nguồn tham khảo cho việc phát triển và debug.

## ETL và phân tích dữ liệu

Hệ thống chạy theo lịch cuối ngày, nhưng dữ liệu gốc phải được ingest theo hướng incremental và append-only để tránh mất ngữ cảnh.

**Extract seam 1:**

- Gọi API Pancake để lấy dữ liệu thay đổi theo cửa sổ thời gian.
- Mỗi run seam 1 phải được neo vào một `target_date` theo timezone business của page. Window canonical là `[00:00, ngày kế tiếp 00:00)` theo timezone đó; không dùng mốc `23:59:59` để tránh rơi message ở biên thời gian.
- Với manual custom range, UI có thể nhận `requested_window_start_at` và `requested_window_end_exclusive_at` không bám mốc 0h. Orchestrator phải chia yêu cầu đó thành một hoặc nhiều run theo từng `target_date`; mỗi run giữ `window_start_at/window_end_exclusive_at` là phần giao giữa requested window và day bucket của `target_date`.
- `go-worker` là process ETL phải kết nối trực tiếp Postgres để load Seam 1; không đi vòng qua REST hoặc gRPC của backend cho hot path persistence.
- Đơn vị ingest nhỏ nhất là message:
  - Source incremental unit là conversation.updated_at
  - Persisted fact unit là message
- Vì endpoint `GET /pages/{page_id}/conversations/{conversation_id}/messages` của Pancake không có filter `since/until`, extractor phải áp dụng boundary ở phía mình:
  - Chỉ persist message có timestamp nằm trong ngày `D`
  - Dừng paging khi đã đi qua biên dưới của ngày `D`
  - Không lưu message ngoài ngày `D` vào canonical seam 1 của kỳ đó
- Gọi `GET /pages/{page_id}/tags` một lần ở đầu run để lấy page tag dictionary; khi build `conversation-day`, chỉ các tag/tag history thực sự xuất hiện trên conversation mới được carry sang downstream.
- Các opening block raw của conversation-day cũng phải được giữ lại như source evidence riêng, không bị mất đi chỉ vì chúng không được tính là `first_meaningful_human_message`.
- Conversation là thread nguồn từ Pancake.
- Customer trong hệ thống báo cáo này được đồng nhất 1:1 với conversation thread.
- CRM identity là một liên kết ngoài tuỳ chọn; có thể nhiều thread cùng map về một hồ sơ CRM, nhưng điều đó không làm thay đổi customer/thread snapshot của hệ thống này.
- Nếu cần giữ payload để debug, audit hoặc backfill thì payload message phải được redact trước khi ghi; không được persist original text dưới bất kỳ lớp lưu trữ lâu dài nào của production path.
- Dedupe theo định danh ổn định từ source.
- Có lookback window để xử lý dữ liệu về muộn hoặc source update lại hội thoại cũ. Sử dụng cơ chế upsert để đảm bảo tính toàn vẹn của dữ liệu (update nếu đã tồn tại, insert nếu chưa có).
- Có retry mechanism với exponential backoff
- Có tự động làm mới access token nếu bị từ chối do token hết hạn.
- Với page mới vừa được add, run đầu tiên chỉ là `onboarding sample extract`, không phải full publish run:
  - IT cấu hình `initial_conversation_limit`
  - worker chỉ lấy tối đa số conversation cấu hình trong ngày `D`
  - với mỗi conversation đã chọn, vẫn phải lấy toàn bộ message thuộc ngày `D`
  - output của run này chỉ phục vụ fine-tune tag/opening và pilot AI, chưa được dùng làm dashboard official
- Toàn bộ pipeline hằng ngày phải chạy theo một publish window thống nhất: extract -> snapshot seam 1 -> AI seam 2 -> publish. Điều này nhằm tránh việc BoD mở dashboard giữa ngày và nhìn thấy Seam 1 đã cập nhật nhưng Seam 2 còn trống hoặc còn số của ngày trước.
- Khi khối lượng cuối ngày lớn, không được đẩy dồn dập toàn bộ thread vào queue hoặc provider cùng lúc. Phải có cơ chế chunking, rate limit, concurrency cap theo page/provider và backpressure để tránh lỗi 429.
- Một conversation được chọn vào kỳ `D` nhưng sau khi filter không còn message nào thuộc ngày `D` thì không được tạo record conversation-day cho kỳ đó.

**Transform seam 1:**

- Normalize dữ liệu về schema chuẩn chung cho tất cả các trang nguồn.
- Ẩn danh hoá dữ liệu nhạy cảm:
  - Redact số điện thoại trong tin nhắn.
  - Giữ số điện thoại trong structured field phục vụ CRM mapping ở seam 1, nhưng phải normalize + dedupe trước khi ghi vào `conversation_day` và không lưu số điện thoại trong message text.
  - Không persist `original_text` của message; canonical seam 1 chỉ được lưu `redacted_text` và payload message đã redact.
- Chuẩn hoá timezone, enum, participant role, message type, tag, attachment.
- Tách riêng tin nhắn chatbot, tin nhắn của khách, tin nhắn của nhân viên.
- Carry `customer_display_name` của thread vào `conversation_day` để làm evidence cho AI/manual customer mapping; tên này phải giữ nguyên văn như source, không normalize.
- Tạo trường deterministic `first_meaningful_human_message` bằng cách loại bỏ chatbot/system/quick-reply chọn sẵn/sticker-only message để phục vụ báo cáo "cuộc hội thoại trong ngày bắt đầu bằng nội dung gì". Trường này có thể đến từ khách hoặc từ nhân viên nếu nhân viên là người mở đầu slice ngày đó bằng một tin nhắn có ý nghĩa như nhắc lịch hẹn.
- Lưu thêm `first_meaningful_human_sender_role` để phân biệt tin nhắn mở đầu có ý nghĩa đến từ `customer` hay `staff`.
- Trích riêng `opening_block_observation` và `opening_block_selection` từ các postback/template/opening messages khi match được signature theo page/channel.
- Nếu chưa có opening signature cho page đó, vẫn phải lưu `opening_candidate_window` và các opening raw messages trước `first_meaningful_human_message` để phục vụ mapping sau.
- Áp dụng `page tag mapping` để sinh ra các trường chuẩn hoá deterministic từ tag thô nếu đã có cấu hình; ví dụ:
  - `normalized_customer_type_from_tag`
  - `normalized_need_from_tag`
  - `normalized_branch_from_tag`
  - `noise_tag_flags`
- Normalize + dedupe các số điện thoại của thread vào `conversation_day.normalized_phone_candidates`.
- Dedupe tin nhắn nếu có tin nhắn trùng lặp do lỗi từ source hoặc lỗi trong quá trình ingest.
- Tính các chỉ số deterministic như:
  - first response time của nhân viên
  - average response time của nhân viên
- Tính các cờ deterministic khi có đủ source evidence:
  - bot/self-service selection cho `tái khám`
  - bot/self-service selection cho các loại nhu cầu chuẩn hoá nếu source cung cấp
- Mapping conversation / customer sang CRM nội bộ theo fast-path deterministic:
  - nếu thread chưa có mapping và tập `normalized_phone_candidates` hữu hiệu chỉ còn đúng 1 số map được tới đúng 1 customer nội bộ, `go-worker` ghi thẳng vào `thread_customer_mapping`
  - nếu thread có nhiều số điện thoại hoặc mapping nhập nhằng thì không tự chọn; chỉ ghi evidence ở `conversation_day` như `customer_display_name` nguyên văn từ source và `normalized_phone_candidates`, rồi defer case đó sang AI/manual

**Load seam 1:** _This is the single source of truth for all downstream jobs_

- Lưu dữ liệu canonical vào hệ thống bảng mới trong postgres17.
- Dữ liệu canonical là nguồn sự thật duy nhất cho các job downstream.
- Canonical seam 1 ở phase hiện tại được rút gọn về 3 bảng:
  - `etl_run`: owner của `page_id`, `target_date`, `business_timezone`, `snapshot_version`, `run_mode`, trạng thái run, publish state, requested window và effective window
  - `conversation_day`: owner của conversation slice và evidence đã gom nhóm theo ngày như `customer_display_name` nguyên văn từ source, tag state, tag events, opening blocks, normalized tag signals, normalized phone candidates
  - `message`: owner của transcript message-level, actor/message type chuẩn hoá, `redacted_text`, attachment metadata, và cờ `is_meaningful_human_message`
- Ngoài 3 bảng canonical trên, Seam 1 có 1 bảng phụ trợ `thread_customer_mapping` để giữ owner của mapping thread-level sang customer nội bộ.
- `conversation_day` và `message` không lặp lại `page_id` hoặc `target_date` nếu không thật sự cần; scope page/ngày được suy ra qua `etl_run_id` để giảm dư thừa schema.
- Semantics daily snapshot được biểu diễn bằng `etl_run.snapshot_version`, `etl_run.status`, và `etl_run.is_published` thay vì tách thêm bảng snapshot riêng trong phase này.
- Một manual custom range có thể tạo nhiều `etl_run` cùng `run_group_id`; các run partial-day phải mặc định `is_published = false` để không ghi đè snapshot official theo ngày.
- Các evidence page-local hoặc cấu trúc chưa ổn định như tag dictionary, observed tag events, opening blocks, normalized phone candidates nên được giữ trong `jsonb` thay vì tách nhiều bảng con quá sớm.
- Matrix chi tiết của 3 bảng canonical nằm ở [seam1-lean-schema-matrix.md](D:/Code/chat-analyzer-v2/docs/seam1-lean-schema-matrix.md).
- Tối ưu sức mạnh của postgres17 để đảm bảo hiệu suất và khả năng mở rộng, ví dụ sử dụng partitioning, indexing, materialized view, v.v...

**AI seam 2:**

- Job AI chỉ đọc dữ liệu canonical đã được chuẩn hoá từ seam 1.
- Bulk path giữa `backend/` và `service/` phải đi qua gRPC; public API vẫn là REST.
- Scheduled automatic flow có analysis grain là đúng một `conversation_day`, bao gồm toàn bộ message thuộc `conversation_day` đó.
- Manual path có thể chạy theo `custom_window`, nhưng mặc định chỉ là diagnostic và không tự đi vào official chain.
- Batch chỉ là execution grouping để tiết kiệm RPM/token; batch không phải grain lưu trữ hay grain publish.
- Physical schema lean của Seam 2 ở phase đầu chỉ có 2 bảng:
  - `analysis_run`: owner của scheduled/manual run, retry, coverage, publish outcome
  - `analysis_result`: output table duy nhất của Seam 2
- Input của AI cho một `conversation-day` phải bao gồm:
  - khối message của ngày `D`
  - `customer_display_name` nguyên văn của thread tại thời điểm extract
  - các observed tag/tag event của conversation-day đó
  - metadata tag đã resolve từ page tag dictionary
  - normalized tag mapping đã được IT cấu hình cho page đó, nếu có
  - opening block observations và opening selections đã parse được, nếu có
  - label deterministic từ Seam 1 nếu có
- Có thể chạy lại AI với model hoặc prompt mới mà không làm thay đổi dữ liệu gốc.
- Seam 2 scheduled v1 chỉ phân tích các chiều business mà BoD đang cần, và mỗi chiều chỉ có đúng một giá trị trên mỗi `conversation_day`:
  - `opening_theme`
  - `customer_mood`
  - `primary_need`
  - `primary_topic`
  - `content_customer_type`
  - `closing_outcome_as_of_day`
  - `response_quality_label`
- `analysis_result` chỉ cần giữ:
  - một số cột first-class cho dashboard:
  - `opening_theme`
  - `customer_mood`
  - `primary_need`
  - `primary_topic`
  - `content_customer_type`
  - `closing_outcome_as_of_day`
  - `response_quality_label`
- Phần coaching không đi dưới dạng array hay multi-label ở scheduled v1; chỉ giữ 2 supporting text ngắn:
  - `response_quality_issue_text`
  - `response_quality_improvement_text`
- `service/` phải dùng code-based Google ADK:
  - `LlmAgent` cho structured output
  - `Runner` để chạy unit hoặc batch
  - `CustomAgent` hoặc thin coordinator nếu cần orchestration stateful như retry, split batch, mapping output
- Không dùng `Agent Config` YAML làm production path.
- ADK session state chỉ là runtime scratchpad; business source of truth vẫn là Postgres do `backend/` sở hữu.
- Prompt builder phải compile thành text thuần trước khi gửi vào agent.
- Prompt editor theo page vẫn là requirement, nhưng storage của prompt config không nằm trong 2 bảng Seam 2 này.
- Khi một run bắt đầu, effective prompt phải được snapshot vào `analysis_run`.
- Prompt tracking tối thiểu chỉ cần:
  - `analysis_run.model_name`
  - `analysis_run.prompt_snapshot_json`
  - `analysis_run.output_schema_version`
  - `analysis_result.prompt_hash`
- Có 1 luồng AI mapping riêng ở seam 2 chỉ để xử lý các thread chưa resolve được ở Seam 1:
  - deterministic fast-path với đúng 1 số điện thoại hữu hiệu phải được xử lý trước ở Seam 1 và ghi vào `thread_customer_mapping`
  - nếu thread có nhiều số điện thoại hoặc dữ liệu nhập nhằng thì gọi CRM để lấy candidate set và dùng AI để mapping dựa trên tên khách hàng trong thread và tên khách hàng trong CRM
  - kết quả mapping phải có confidence score, evidence và cờ manual-review khi độ tin cậy thấp
- Luồng CRM mapping chỉ phục vụ enrichment/joining với hệ thống nội bộ; không được dùng như tín hiệu để xác định hoặc rewrite nhãn `tái khám`.
- `closing_outcome` phải được hiểu là kết quả chốt `as-of-day` trên snapshot ngày đó, không phải kết quả cuối cùng của toàn bộ vòng đời thread.
- `tái khám` là một nhãn nghiệp vụ hiển thị trong UI theo ngày; nó độc lập với trục `inbox mới / inbox cũ` vì "mới trên kênh chat" không đồng nghĩa với "mới với phòng khám".
- Final nhãn `tái khám` trên dashboard phải resolve theo thứ tự ưu tiên:
  - label/evidence từ Seam 1
  - `content_customer_type` do AI suy luận từ nội dung thật của `conversation_day`
  - tag vận hành từ Pancake
  - `unknown`
- Tag Pancake kiểu `KH mới`, `KH tái khám` chỉ là operational hint có độ tin cậy thấp; không được override label Seam 1 hoặc nội dung chat thật.
- Phải có cost monitoring để theo dõi chi phí vận hành AI, tránh chi phí bị đội lên ngoài kiểm soát.
- AI phải ưu tiên dùng structured evidence có sẵn trước khi suy luận:
  - opening block mapping theo page
  - normalized tag mapping theo page
  - label/evidence deterministic từ Seam 1
- Chỉ khi conversation thiếu tag phù hợp, thiếu opening signals, hoặc mapping page chưa đủ bao phủ thì AI mới được suy luận thêm từ context message.
- Khi provider trả 429 hoặc rate-limit tương đương, AI seam phải hỗ trợ retry có jitter, phân lô lại batch, giảm concurrency động, và tôn trọng `Retry-After` nếu provider cung cấp.
- Mỗi planned unit phải đi tới một trạng thái terminal:
  - `succeeded`
  - hoặc `unknown`
- Nếu một unit không phân tích được sau retry/split hợp lệ thì unit đó phải được terminalize về `unknown`, lưu `failure_info_json`, và ngày vẫn được phép publish nếu mọi unit khác đã terminal.
- Scheduled daily chỉ bị chặn publish nếu còn unit chưa terminal hoặc job chết giữa chừng mà không recover được.
- Khi thay đổi prompt/model/schema, hệ thống phải có policy chống lệch pha báo cáo dài hạn:
  - báo cáo chính thức nên pin vào cùng prompt/model snapshot của `analysis_run`
  - nếu muốn so sánh trend dài hạn dưới prompt mới, phải backfill lại kỳ cũ rồi publish lại
  - nếu chưa backfill, UI phải hiển thị ranh giới version và cảnh báo không so sánh trực tiếp các đoạn trend khác snapshot
- Matrix chi tiết của Seam 2 nằm ở [seam2-analysis-schema-matrix.md](D:/Code/chat-analyzer-v2/docs/seam2-analysis-schema-matrix.md).

## Hợp đồng vận hành của AI seam

- AI seam không chạy ad-hoc trực tiếp trên dữ liệu sống, mà chạy thông qua job definition.
- `backend/` là owner của scheduler, prompt snapshot freeze, gRPC client, persistence, publish/supersede và read API.
- `service/` là owner của prompt builder và ADK runtime; `service/` không phải owner của business persistence.
- `analysis_run` giữ owner của run:
  - `run_mode`
  - `source_etl_run_id` hoặc `scope_ref_json`
  - `model_name`
  - `prompt_snapshot_json`
  - `output_schema_version`
  - retry/coverage/log
  - `publish_outcome`
- `analysis_result` là output table duy nhất:
  - mỗi row tương ứng đúng một `conversation_day` hoặc một `custom_window`
  - chứa `opening_theme`, `customer_mood`, `primary_need`, `primary_topic`, `content_customer_type`, `closing_outcome_as_of_day`, `response_quality_label`
  - và 2 supporting text: `response_quality_issue_text`, `response_quality_improvement_text`
- Scheduled daily unique theo `source_etl_run_id`; retry chỉ nằm trong cùng `analysis_run`.
- Scheduled daily được publish khi mọi unit đã terminal ở `succeeded` hoặc `unknown`.
- Nếu job chết giữa chừng và còn unit chưa terminal thì không publish ngày đó; chỉ giữ log để recovery hoặc manual rerun.
- Manual day luôn tạo run mới và row mới; khi IT publish thì row official cũ của cùng `conversation_day_id` bị `superseded`.
- Manual custom slice mặc định là `diagnostic`, không tự nối vào official summary chain.
- `manual_slice` và `pilot` là cùng một use case vận hành.
- Thiết kế này cho phép chạy thử, chạy lại, backfill hoặc replay bằng prompt mới mà không làm thay đổi dữ liệu canonical.
- Internal data path giữa `backend` và `service` phải tối ưu cho bulk processing:
  - public API vẫn là REST
  - bulk daily processing không dùng REST JSON gọi qua lại cho từng thread
  - `backend` gửi batch/unit payload sang `service` qua gRPC và nhận kết quả per-unit qua gRPC response hoặc stream

## Trình bày dữ liệu

Frontend standalone chỉ cần một app shell đơn giản và dày thông tin trong một màn hình desktop, không làm theo kiểu sidebar nhiều mục như trước. Thay vào đó:

- phía trên là thanh điều khiển nhanh để nhập backend endpoint và refresh dữ liệu
- ngay dưới là dải thông số tóm tắt cho các nhóm chức năng cũ như `dashboard`, `page config`, `message view`, `extract jobs`, `AI analysis`, `system`
- vùng làm việc chính chia thành cụm điều khiển nhỏ ở bên trái và các ô dữ liệu/payload có scroll riêng ở bên phải
- người vận hành phải nhìn được gần như toàn bộ trạng thái chính trong 1 viewport desktop, không cần chuyển tab

Thiết kế UI ưu tiên:

- 1 viewport desktop rõ ràng, thao tác nhanh cho IT và người vận hành
- chữ nhỏ, mật độ thông tin cao nhưng vẫn dễ đọc
- responsive theo chiều rộng cho mobile, nhưng desktop vẫn là target chính
- form và bảng đơn giản, không phụ thuộc component library
- mọi hành động chạy job phải có khu vực hiển thị input, output, trạng thái và lỗi để debug nhanh

## Cho BoD và Lead sales (Business Intelligence)

**Executive summary:**

- Thiết kế 1 dashboard báo cáo thống kê chỉ số trực quan để BoD và Lead sales dễ dàng theo dõi các chỉ số quan trọng
- Cho phép chọn view nhanh theo hàng ngày, hàng tuần, hàng tháng, hoặc custom theo nhu cầu.
- Sidebar của dashboard business phải có source selector theo từng page nguồn để đổi scope xem số liệu.
- Header period selector quyết định scope KPI chính thức của trang.
- Search theo tên khách hàng và các bộ lọc AI phải nằm dưới cụm KPI; các control này chỉ tác động đến danh sách hội thoại và cụm biểu đồ phân phối, không được làm sai scope KPI chính.
- Donut/pie distribution phải luôn tính lại trên tập hội thoại sau search + filter. Nếu người dùng đã lọc theo một chiều như `inbox mới`, biểu đồ chỉ được phân phối theo các chiều còn lại nhưng vẫn trong tập `inbox mới` đó.
- Hệ thống KPI metric:
  - Tổng số thread trong ngày
  - Inbox mới trong ngày
  - Inbox cũ trong ngày
  - Tái khám trong ngày
  - Tỷ lệ chốt theo ngày (AI-inferred closing outcome as-of-day)
  - Tỷ lệ hài lòng trung bình (average sentiment score)
  - Chi phí AI trung bình
- UI phải hiển thị đồng thời `inbox mới`, `inbox cũ`, `tái khám`. `Tái khám` là chỉ số nghiệp vụ độc lập để vận hành và có thể overlap với cả `inbox mới` lẫn `inbox cũ`.

**Trang xem chi tiết tất cả tin nhắn:**

- Mô phỏng 1 UI như 1 trang nhắn tin cơ bản, có 2 phía, có timestamp, có tên người gửi, tên khách, v.v...
- Một hội thoại sẽ xem được tất cả tin nhắn trong khoảng thời gian lọc hoặc mặc định là toàn bộ vòng đời thread, không chỉ tin nhắn của ngày `D`.
- Có highlight và đánh giá rủi ro cho những đoạn chat có risk flags, có tab tóm tắt các risk flags đã được AI nhận diện trong hội thoại đó.
- Có filter lọc theo các thông số đã phân tích và đánh giá
- Có filter lọc theo ngày, theo page, v.v...

**Chi tiết theo từng trang nguồn:**

- Hiển thị thông số trực quan theo từng trang nguồn (pancake page id) để có thể so sánh hiệu quả giữa các trang với nhau, và nhận biết được trang nào đang hoạt động tốt, trang nào cần cải thiện.
- Thống kê xu hướng chất lượng theo thời gian.
- Treemap/Sunburst Chart: Hiển thị các chủ đề khách quan tâm (Ví dụ: 40% hỏi Giá, 30% hỏi Địa chỉ, 20% Khiếu nại).
- Sentiment heatmap: Hiển thị mức độ hài lòng của khách hàng theo thời gian hoặc theo chủ đề.

**Risk alerts:**

- Tóm tắt ngắn các đoạn chat có "Red Flags" (Ví dụ: Nhân viên thái độ lồi lõm, khách dọa báo công an, hoặc sai kiến thức chuyên môn).
- Tính năng Drill-down: Click vào lỗi sẽ mở ngay cửa sổ Chat Log (nguồn thô) và phần đánh giá của AI nằm kế bên để đối chiếu.

**Quản lý và xuất bản:**

- Có tính năng cho phép người dùng kết nối thêm trang pancake mới
- Cho phép xuất file dưới dạng .xlsx thành một file excel có các sheet chủ yếu phục vụ cho BoD và Lead sales để có thể dễ dàng đọc và phân tích, không trích dữ liệu thô mà đã được phân tích và trình bày một cách trực quan, dễ hiểu:
  - Summary: biểu đồ tổng hợp dùng Excel Charts
  - Customer Insights: bảng phân tích chi tiết về hành vi và nhu cầu của khách hàng
  - Ecetera ...

**Example flow:**
Khi Sales Lead thấy một nhân viên bị AI chấm điểm thấp (ví dụ 3/10):

- Họ click vào điểm số đó trên Dashboard.
- Hệ thống hiển thị đoạn chat thô (Raw) bên trái, bên phải là các dòng AI chỉ ra: "Phút thứ 5, nhân viên trả lời sai giá niêm yết".

## Cho IT

**Health monitoring:**

- Có trang theo dõi vận hành dành cho IT để có thể theo dõi được tình trạng vận hành của hệ thống ETL và LLM service, bao gồm các lỗi phát sinh, thời gian chạy, v.v... để có thể kịp thời xử lý và đảm bảo hệ thống hoạt động ổn định.
- Báo cáo LLM service metric: tỉ lệ lỗi, rate limit, timeout.
- Hiển thị chi tiết các bản ghi lỗi kèm theo payload để IT có thể debug nhanh chóng. Payload phải được làm gọn lại, chỉ giữ những trường cần thiết.

**Control center:**

- Một trang hiển thị các cấu hình của các page đang kết nối, cho phép chọn 1 page để xem dữ liệu và cấu hình tương ứng.
- Cho phép thêm trang mới như sau:
  - IT chọn thêm trang mới.
  - IT không cần biết trước opening block hay tag mapping để add page.
  - IT chọn `organization` sở hữu page này.
  - IT dán `Pancake user access token`.
  - Hệ thống gọi `list pages`, cho IT chọn đúng `page`.
  - IT chọn `business timezone`.
  - IT chọn `initial_conversation_limit` cho run đầu.
  - IT bấm chạy lần đầu để hệ thống tạo `onboarding sample extract` cho ngày `D`:
    - chỉ lấy tối đa số conversation theo `initial_conversation_limit`
    - với từng conversation được chọn thì vẫn lấy toàn bộ message thuộc ngày `D`
    - run này chỉ phục vụ mapping và pilot, chưa được publish lên dashboard official
  - Sau run đầu tiên, UI phải sinh ra các dữ liệu để IT fine-tune:
    - tag dictionary và tag đang xuất hiện trên conversation
    - `opening_candidate_window` phổ biến nhất
  - Sau khi fine-tune, IT mới được chọn bước tiếp theo:
    - `Run Pilot AI` trên sample nhỏ
    - bật `Auto Scraper`
    - bật `Auto AI Analysis`
  - Mặc định page mới phải khởi tạo với cả `Auto Scraper = OFF` và `Auto AI Analysis = OFF` cho tới khi IT chủ động bật.
- Cho phép chạy thủ công để populate dữ liệu khi cần thiết, ví dụ khi có sự cố hoặc khi muốn backfill dữ liệu cũ. Cho phép chọn khoảng thời gian cụ thể để chạy lại ETL, AI, hoặc cả hai.
  - Nếu khoảng thời gian không bám mốc 0h-24h, hệ thống phải tự chia thành các `etl_run` theo từng `target_date`.
  - Mỗi `etl_run` phải giữ lại `requested_window_*` để audit và `window_*` thực tế để biết slice nào đã được xử lý.
  - Run partial-day chỉ phục vụ vận hành, debug, recovery, hoặc pilot; không được auto publish làm dashboard official.
- Scheduler control:
  - `Auto Scraper`: bật/tắt scheduler extract hằng ngày theo từng page.
  - `Auto AI Analysis`: bật/tắt scheduler AI theo từng page.
  - `Auto AI Analysis` chỉ được enqueue khi đã có `final seam 1 snapshot` tương ứng.
  - Tắt `Auto AI Analysis` không ảnh hưởng `Auto Scraper`; tắt `Auto Scraper` thì scheduler AI của ngày mới không có đầu vào để chạy.
- Tag Taxonomy Mapper:
  - Có giao diện trực quan để IT map tag thô của từng page sang taxonomy chuẩn nội bộ.
  - Hỗ trợ preview conversation/tag thật, version hoá mapping, `effective_from/effective_to`, và gắn nhãn `noise` để giảm số lần AI phải suy luận.
- Opening Flow Mapper:
  - Có giao diện để IT cấu hình opening block signatures theo page/channel.
  - Cho phép map postback/template/button payload sang các trường chuẩn hoá như `customer_type`, `need`, `entry_flow`.
  - Có danh sách các opening block chưa match để IT review.
  - Với page mới chưa có config, UI phải hiển thị các `opening_candidate_window` phổ biến nhất để IT fine-tune dần, không yêu cầu cấu hình trước mới ingest được.
  - Opening block phải được làm sạch chứ không hiển thị full json raw để dễ nhìn.
- Prompt Sandbox (Rất quan trọng):
  - Cho phép IT dán một Prompt mới, chọn 10 hội thoại mẫu để "Run thử".
  - So sánh kết quả giữa Prompt cũ và Prompt mới trước khi áp dụng cho toàn bộ Seam 2.
- Granular Reprocessing: Cho phép chọn chỉ chạy lại phần "Sentiment" mà không chạy lại "Classification" để tiết kiệm chi phí token.
- Data lifecycle management: Cho phép IT thiết lập chính sách lưu trữ và xoá dữ liệu cũ để tối ưu chi phí lưu trữ, đồng thời đảm bảo tuân thủ các quy định về bảo mật dữ liệu.
- Schema evolution tracker: theo dõi sự thay đổi của cấu trúc API pancake để cảnh báo sửa code extract kịp thời.

## Yêu cầu kỹ thuật

- Thiết kế datawarehouse vận dụng hết khả năng của postgres17, có thể sử dụng các tính năng mới nhất của postgres17 để tối ưu hiệu suất và khả năng mở rộng.
- Tách biệt 2 seam rõ ràng là lưu trữ dữ liệu đã được chuẩn hoá và phân tích dữ liệu bằng AI, để có thể tối ưu hiệu suất và khả năng mở rộng của từng phần, đồng thời đảm bảo tính linh hoạt trong việc thay đổi hoặc nâng cấp từng phần mà không ảnh hưởng đến phần còn lại.
- Không nhúng AI vào seam lưu trữ dữ liệu.
- Liên kết được dữ liệu hội thoại sau transform với khách trong hệ thống app crm nội bộ.
- Có khả năng linh hoạt trong những tình huống hệ thống mất ổn định và service chết, có thể đảm bảo tính toàn vẹn của dữ liệu và khả năng khôi phục nhanh chóng.
- Có snapshot theo ngày để có thể dễ dàng theo dõi và phân tích dữ liệu theo thời gian, đồng thời có thể khôi phục dữ liệu về một thời điểm cụ thể nếu cần thiết.

## Quy ước snapshot và định nghĩa chỉ số

- Trong tài liệu này, `customer = conversation thread`.
- Đơn vị báo cáo theo ngày là conversation-day: một hội thoại có phát sinh tin nhắn trong ngày `D` thì tạo ra một bản ghi snapshot cho ngày `D`.
- Cần tách rõ 4 khái niệm:
  - inbox mới: conversation-day có `first_seen_at` thuộc ngày `D`
  - inbox cũ: conversation-day thuộc ngày `D` nhưng thread đã `first_seen_at` trước ngày `D`
  - tái khám: một conversation-day có tín hiệu cho thấy khách quay lại để tiếp tục hành trình chăm sóc/điều trị trong ngày `D`; tín hiệu này có thể đến từ câu hỏi chatbot, rule heuristic hoặc AI classification trên nội dung chat. Vì vậy `tái khám` có thể overlap với cả `inbox mới` và `inbox cũ`
- Một thread có thể là inbox mới ở ngày hôm qua nhưng trở thành inbox cũ ở ngày hôm nay.
- Điều này không được phép làm thay đổi snapshot của ngày hôm qua.
- Vì vậy:
  - snapshot ngày 1 giữ nguyên kết quả ngày 1
  - snapshot ngày 2 phản ánh đúng trạng thái nhìn từ ngày 2
- Khi xem báo cáo, phải có 2 kiểu:
  - Báo cáo theo ngày, ngày nào biết ngày đó
  - Báo cáo theo giai đoạn: áp dụng logic cộng dưới đây.
- Rule UI:
  - `inbox mới + inbox cũ = tổng thread trong ngày`
  - `tái khám` là một trục cắt ngang, không tham gia vào phép cộng để ra tổng thread
  - Dashboard phải cho người dùng hiểu rõ `tái khám` có thể overlap với `inbox mới` hoặc `inbox cũ`

**Bài toán snapshot ví dụ**

- Trong ví dụ này, mỗi `customer` được hiểu là đúng bằng 1 conversation thread để thống nhất với mô hình báo cáo đã chốt của hệ thống.
- Trong hôm qua, tức 0h-23h59 ngày hôm qua, tổng cộng có 100 dữ liệu hội thoại, tức là có 100 cuộc hội thoại có tin nhắn trong khoảng thời gian đó. Phân tích cho thấy có 50 hội thoại là inbox mới và 50 là inbox cũ.
- Trong ngày hôm nay 40 trong số đó tiếp tục nhắn tin, ngoài ra tổng cộng hôm nay có 130 dữ liệu hội thoại. Tức là trong này sẽ có 40 thread là inbox mới của hôm qua. Nếu chạy xong phân tích của ngày hôm nay thì 40 thread đó sẽ được tính là inbox cũ của ngày hôm nay.
- Thống kê kết quả sẽ phải tuân theo luật sau:
  - Unique thread xuất hiện sau 2 ngày là 190 thread
  - Inbox mới trong kỳ 2-day period là 80 thread: ngày 1 có 50 inbox mới, ngày 2 có thêm 30 inbox mới
  - Inbox cũ trong kỳ 2-day period là 110 thread: ngày 1 có 50 inbox cũ, ngày 2 có 60 inbox cũ
  - Chỉ số `tái khám` không suy ra từ phép cộng inbox mới/cũ ở ví dụ này; nó phải được tính riêng trên từng snapshot ngày từ evidence nghiệp vụ của ngày đó và có thể overlap với bất kỳ nhóm nào trong hai nhóm kia
