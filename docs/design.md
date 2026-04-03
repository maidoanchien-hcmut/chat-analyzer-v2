# Thiết kế chat-analyzer-v2

## Insights

Đây là phần quan trọng nhất, hệ thống có thể làm đủ thứ nhưng phải trả lời được các câu hỏi này một cách rõ ràng, chính xác.

Là một thành viên BoD và Lead sales, tôi muốn biết mỗi ngày:

- Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ các inbox mới quan tâm trong đoạn hội thoại? Kết quả chốt?
- Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ?
- Leader muốn thống kê hiện trạng trước => ưu tiên cải tiến các kịch bản cho các vấn đề khách hàng quan tâm nhất.

Tôi muốn AI tự động phân tích mỗi hội thoại:

- Tâm trạng khách hàng
- Nhu cầu chính, chủ đề quan tâm
- Phân loại kh mới/ tái khám
- Trạng thái chốt đơn/hẹn
- Hệ thống phát hiện rủi ro dựa trên quy trình làm việc.
- Dùng LLM để đưa ra đánh giá trực quan về chất lượng phản hồi của từng nhân viên, chỉ ra lỗi ở đâu, và gợi ý cải thiện. Không dùng để đổ trách nhiệm.

Tôi muốn thống kê hiện trạng để ưu tiên cải tiến các kịch bản và quy trình cho các vấn đề khách hàng quan tâm nhất.

Hệ thống phải xuất được file báo cáo dưới dạng .xlsx

## Nguyên tắc bất biến

- Hệ thống có 2 seam-owner tách biệt:
  - Seam 1 là pipeline ETL lưu trữ dữ liệu đã được chuẩn hoá và tính toán các chỉ số deterministic, không dùng AI.
  - Seam 2 là phân tích bằng AI trên dữ liệu đã được lưu trữ ở seam 1. Tách biệt với seam 1.
- Seam 1 chỉ lưu các dữ liệu có thể kiểm chứng từ source hoặc tính được bằng rule cố định:
  - page, customer, conversation, participant, message, tag, attachment, thời gian phản hồi, mapping sang crm nội bộ (nếu khả thi), v.v...
- Seam 2 chỉ sinh ra dữ liệu diễn giải:
  - sentiment, topic, intent, phân loại giai đoạn khách (không phải logic inbox mới/cũ, phần này được định nghĩa riêng), trạng thái chốt, đánh giá chất lượng phản hồi, risk flags, recommendation, v.v...
  - best-effort mapping thread với customer trong CRM nếu Seam 1 không resolve được do có nhiều số điện thoại.
- Kết quả AI không được ghi đè vào dữ liệu canonical của seam 1.
- Thiết kế datawarehouse phải tận dụng hết khả năng của postgres17 để đảm bảo hiệu suất và khả năng mở rộng, ví dụ sử dụng partitioning, indexing, materialized view, v.v...
- Thiết kế schema phải tối ưu số lượng bảng và số lượng cột trong bảng.
- Mọi kết quả AI phải truy vết được model, profile prompt, schema output và run id để có thể audit, so sánh và backfill.
- Báo cáo theo ngày phải đọc từ snapshot của ngày đó, không đọc từ trạng thái mới nhất của hội thoại.
- Với mỗi kỳ extract ngày `D`, seam 1 chỉ được persist:
  - các conversation thuộc ngày `D`
  - các message của các conversation đó mà timestamp cũng thuộc ngày `D`
- Nếu source API buộc phải đọc rộng hơn để tìm biên ngày `D`, dữ liệu ngoài ngày chỉ được tồn tại trong bộ nhớ xử lý tạm thời; không được lưu vào canonical seam 1 của ngày `D`.
- Trong phạm vi bài toán này, `customer` được chốt là 1 conversation thread trên nền tảng nguồn. Mapping sang CRM nội bộ là một liên kết tham chiếu bổ sung, không làm thay đổi logic snapshot mới/cũ.
- `inbox mới / inbox cũ` là trục phân loại deterministic theo thời điểm thread xuất hiện trên kênh chat.
- `tái khám` là trục phân loại nghiệp vụ theo hành trình khách hàng với phòng khám, độc lập với trục `inbox mới / inbox cũ`. Vì vậy một thread có thể vừa là `inbox mới` trên kênh chat vừa là `tái khám` nếu có evidence phù hợp từ source, chatbot hoặc AI classification trên nội dung chat.

## Chi tiết kỹ thuật và nghiệp vụ

## Quy ước snapshot và định nghĩa chỉ số

- Trong tài liệu này, `customer = conversation thread`.
- Đơn vị báo cáo theo ngày là conversation-day: một hội thoại có phát sinh tin nhắn trong ngày `D` thì tạo ra một bản ghi snapshot cho ngày `D`.
- Cần tách rõ các khái niệm:
  - inbox mới: conversation-day có `first_seen_at` thuộc ngày `D`
  - inbox cũ: conversation-day thuộc ngày `D` nhưng thread đã `first_seen_at` trước ngày `D`
  - tái khám: một conversation-day có tín hiệu cho thấy khách quay lại để tiếp tục hành trình chăm sóc/điều trị trong ngày `D`; tín hiệu này có thể đến từ opening block hoặc AI classification trên nội dung chat. Vì vậy `tái khám` có thể overlap với cả `inbox mới` và `inbox cũ`
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

## Nguồn dữ liệu

**Pancake:**

- Là một hệ thống quản lý bán hàng đa kênh toàn diện, có thể kết nối nhiều kênh khách nhau: Facebook, Instagram, Tiktok, v.v.
- Mỗi `kênh` là một `trang` trong Pancake
- Sử dụng api của pancake có thể trích xuất được nhiều dữ liệu khác nhau.

**Tình hình hiện tại về pancake:**

- Doanh nghiệp không dùng tính năng assignee của pancake.
- `GET /pages/{page_id}/tags` chỉ trả toàn bộ tag dictionary của page. Dữ liệu thực sự đi vào unit phân tích là các `tags` đang có trên từng conversation. Dùng các tag đang activate cho page để định nghĩa. Cụ thể như dưới đây.
- Tag trích xuất được của trang có thể bao gồm: loại khách hàng, địa chỉ, độ tuổi, nhân viên phụ trách, kết quả chốt đơn, đánh dấu spam, nhu cầu, v.v... nhưng không có cấu trúc chuẩn nào bắt buộc phải có trên mọi page.
- Tag là một phần sử dụng làm context cho AI phân tích, không hơn không kém.
- Mỗi trang lại có danh sách tag khác nhau, không đồng nhất.
- Để giảm chi phí và hạn chế hallucination, hệ thống phải có giao diện cho IT để phân loại tag theo từng page và có thể chỉnh sửa theo thời gian.
  - Phân loại tag nào là `customer_type`, `need`, `branch`, `staff_label`, `null`, v.v...
  - version theo page và có hiệu lực theo thời gian, nếu trong một đợt extract, có tag mới xuất hiện thì có cơ chế thông báo cho dev qua telegram hoặc email để IT vào phân loại bổ sung. Mặc định phân loại nó là `null` để bỏ qua nó khi build payload cho seam 2. Nếu có tag bị deactivated thì phải tự xoá nó đi.
- Tin nhắn trong hội thoại có bao gồm cả phần tin nhắn của chatbot trả lời tự động và lựa chọn của khách với các option mà chatbot đưa ra (vd: Bắt đầu) nên phải lọc ra cho câu hỏi này:
  - Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ các inbox mới quan tâm trong đoạn hội thoại?
  - Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ
- Có thể tận dụng câu hỏi có sẵn của opening block để gắn cờ `tái khám` cho thread trong ngày, nhưng logic `inbox mới / inbox cũ` vẫn phải được xác định deterministic từ snapshot seam 1. Một thread có thể có tin nhắn đầu tiên tới trang nhưng vẫn có thể là `tái khám` nếu khách chưa từng nhắn tin nhưng đã từng tới phòng khám trước đó và họ chọn "tái khám" trong tin nhắn chatbot.
- Nhận diện `third_party_bot` và `page_system_auto_message` được xử lý deterministic ngay trong transform bằng sender/app/flow markers + message structure heuristics; không lưu cấu hình `bot_signatures` ở `connected_page`.
- Các opening block theo page có thể chứa thông tin giá trị như `khách hàng lần đầu / tái khám`, `đặt lịch hẹn / chat tư vấn / gọi tư vấn`. Vì vậy phải giữ lại làm context cho AI.
- Với page mới vừa kết nối mà chưa có opening config, hệ thống vẫn phải chạy được bằng fallback mặc định:
  - dùng `first_meaningful_human_message` để cắt mốc nội dung bắt đầu có ý nghĩa
  - phần trước mốc đó được giữ thành `opening_block_candidate`
  - các block trong window này được lưu raw để IT fine-tune sau, không làm nghẽn pipeline

**Mitigation:**

- Chọc api pancake để biết được hình dạng reponse và các dữ liệu trích xuất được, từ đó thiết kế schema và mô hình chuẩn hoá dữ liệu cho phù hợp.
- Lưu response sample vào `docs/pancake-api-samples/` để làm nguồn tham khảo cho việc phát triển và debug.

## Taxonomy Canonical

- `customer = conversation thread`
- `inbox mới`: thread có `first_seen_at` thuộc ngày hoặc kỳ đang xét trên kênh chat
- `inbox cũ`: thread đã có `first_seen_at` trước ngày hoặc trước kỳ đang xét trên kênh chat
- `khách mới / khách cũ`: chỉ là cách gọi business-facing cũ; trong tài liệu kỹ thuật này nên ưu tiên dùng `inbox mới / inbox cũ` để tránh hiểu nhầm với hồ sơ CRM
- `tái khám`: nhãn nghiệp vụ độc lập với `inbox mới / inbox cũ`, được xác định từ dữ liệu hội thoại/source như chatbot selection, rule heuristic, hoặc AI classification trên nội dung chat hoặc theo tag nếu conversation_day đó có.
- `closing_outcome`: kết quả chốt `as-of-day` trên snapshot ngày đó, không phải kết quả cuối cùng của toàn bộ vòng đời thread
- `page tag classification`: cấu hình theo từng page để map tag thô sang taxonomy chuẩn nội bộ như `customer_type`, `need`, `branch`, `outcome`, `staff_name`, v.v... AI phải hiểu được tag nào mang tín hiệu gì (ví dụ: tag `KH mới` được classification là `customer_type` thì AI hiểu được hội thoại đó là khách mới). Phải cho phép IT thêm bớt định nghĩa tuỳ theo trang.
- `conversation-day observed tags`: tập tags thực sự gắn với conversation trong ngày `D`; đây là source evidence được đưa qua Seam 2 để AI tham khảo, và làm fallback nếu AI không trích ra được tín hiệu rõ ràng từ nội dung chat.
- `opening block`: chuỗi tin nhắn tương tác giữa khách hàng và chatbot chỉ có khi khách hàng mới bắt đầu một thread mới trên trang, thường chứa thông tin giá trị như `khách hàng lần đầu / tái khám`, `đặt lịch hẹn / chat tư vấn / gọi tư vấn`. Vì vậy phải giữ lại làm context cho AI.
- `first_meaningful_human_message`: tin nhắn đầu tiên có ý nghĩa trong ngày `D` từ phía con người, có thể đến từ khách hoặc nhân viên, nhưng loại trừ chatbot/system/opening block.
- `CRM mapping`: enrichment/joining với hệ thống nội bộ; không được dùng để xác định hoặc rewrite `inbox mới / inbox cũ / tái khám`
- `thread_customer_mapping`: mapping thread-level từ `page_id + thread_id` sang đúng 1 customer nội bộ; không được nhét ownership này vào `conversation_day`
- `dashboard official`: chỉ đọc từ `published snapshot` và `published analysis rows` của cùng một kỳ dữ liệu
- `extract boundary`: mỗi run ngày `D` chỉ được persist conversation-day và message có timestamp thuộc ngày `D`
- `target_date`: ngày local mà ETL đang build canonical slice; scope page/ngày của `conversation_day` và `message` được kế thừa qua `etl_run`
- `manual custom range`: yêu cầu vận hành có thể chỉ định khoảng thời gian bất kỳ; hệ thống phải materialize yêu cầu đó thành một hoặc nhiều `etl_run` theo từng `target_date`, và các run partial-day không được tự động trở thành dashboard official

## ETL và phân tích dữ liệu

**Extract:**

- Gọi API Pancake để lấy dữ liệu thay đổi theo cửa sổ thời gian.
- Mỗi run phải được neo vào một `target_date` theo timezone mặc định là UTC+7 không phải thời gian trên hệ thống chạy script. Window canonical là `[00:00, ngày kế tiếp 00:00)` theo timezone đó; không dùng mốc `23:59:59` để tránh rơi message ở biên thời gian.
- Với manual custom range, UI có thể nhận `requested_window_start_at` và `requested_window_end_exclusive_at` không bám mốc 0h. Orchestrator phải chia yêu cầu đó thành một hoặc nhiều run theo từng `target_date`; mỗi run giữ `window_start_at/window_end_exclusive_at` là phần giao giữa requested window và day bucket của `target_date`.
- `go-worker` là process ETL phải kết nối trực tiếp Postgres để load; không đi vòng qua REST hoặc gRPC của backend cho hot path persistence.
- Đơn vị ingest nhỏ nhất là message:
  - Source incremental unit là conversation.updated_at
  - Persisted fact unit là message
- Vì endpoint `GET /pages/{page_id}/conversations/{conversation_id}/messages` của Pancake không có filter `since/until`, extractor phải áp dụng boundary ở phía mình:
  - Chỉ persist message có timestamp nằm trong ngày `D`
  - Dừng paging khi đã đi qua biên dưới của ngày `D`
  - Không lưu message ngoài ngày `D` vào canonical seam 1 của kỳ đó
- Gọi `GET /pages/{page_id}/tags` một lần ở đầu run để lấy page tag; khi build `conversation-day`, chỉ các tags thực sự xuất hiện trên conversation mới được carry sang downstream.
- Các message trong opening block của conversation-day cũng phải được giữ lại như source evidence riêng, không bị mất đi chỉ vì chúng không được tính là `first_meaningful_human_message`.
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
- Toàn bộ pipeline hằng ngày phải chạy theo một publish window thống nhất: extract -> snapshot (seam 1) -> AI (seam 2) -> publish. Điều này nhằm tránh việc người dùng mở dashboard giữa ngày và nhìn thấy Seam 1 đã cập nhật nhưng Seam 2 còn trống hoặc còn số của ngày trước.
- Khi khối lượng cuối ngày lớn, không được đẩy dồn dập toàn bộ thread vào queue hoặc provider cùng lúc. Phải có cơ chế chunking, rate limit, concurrency cap theo page/provider và backpressure để tránh lỗi 429.
- Một conversation được chọn vào kỳ `D` nhưng sau khi filter không còn message nào thuộc ngày `D` thì không được tạo record conversation-day cho kỳ đó.

**Transform:**

- Normalize dữ liệu về schema chuẩn chung cho tất cả các trang nguồn.
- Ẩn danh hoá dữ liệu nhạy cảm:
  - Redact số điện thoại trong tin nhắn.
  - Giữ số điện thoại trong structured field phục vụ CRM mapping ở seam 1, nhưng phải normalize + dedupe trước khi ghi vào `conversation_day` và không lưu số điện thoại trong message text.
  - Không persist `original_text` của message; canonical seam 1 chỉ được lưu `redacted_text` và payload message đã redact.
- Chuẩn hoá timezone, enum, participant role, message type, tag, attachment, sender, v.v... về các trường chuẩn chung.
- Carry `customer_display_name` của thread vào `conversation_day` để làm evidence cho AI/manual customer mapping; tên này phải giữ nguyên văn như source, không normalize.
- Tạo trường deterministic `first_meaningful_human_message` bằng cách loại bỏ chatbot/system/sticker-only/opening message để phục vụ báo cáo "cuộc hội thoại trong ngày bắt đầu bằng nội dung gì". Trường này có thể đến từ khách hoặc từ nhân viên nếu nhân viên là người mở đầu slice ngày đó bằng một tin nhắn có ý nghĩa như nhắc lịch hẹn.
- Lưu thêm `first_meaningful_human_sender_role` để phân biệt tin nhắn mở đầu có ý nghĩa đến từ `customer` hay `staff`.
- Trích riêng `opening_block_candidate` và `opening_block` từ các postback/template/opening messages khi match được signature theo page/channel.
- Nếu chưa có opening signature cho page đó, vẫn phải lưu `opening_block_candidate` trước `first_meaningful_human_message` để phục vụ mapping sau.
- Áp dụng page tag classification để map tag thô sang các category có ý nghĩa hơn như `customer_type`, `need`, `branch`, `outcome`, `staff_name`, v.v... rồi carry xuống `conversation_day` làm evidence cho AI.
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

**Load:** _This is the single source of truth for all downstream jobs_

- Lưu dữ liệu canonical vào hệ thống bảng mới trong postgres17.
- Dữ liệu canonical là nguồn sự thật duy nhất cho các job downstream.
- Schema design cho Seam 1:
  - `page`: owner của thông tin page-level như `page_name`, `page_id`, các config theo page như tag classification, opening block signature, v.v...
  - `page_prompt_version`: owner của prompt config theo page và versioning prompt; active version được tham chiếu từ `connected_page.active_prompt_version_id`
  - `etl_run`: owner của scheduled/manual run, `target_date`, `snapshot`, `run_mode`, trạng thái run, publish state, requested window, effective window, v.v...
  - `conversation_day`: owner của conversation slice và evidence đã gom nhóm theo ngày như `customer_display_name` nguyên văn từ source, tags, normalized phone candidates
  - `message`: owner của transcript message-level, actor/message type chuẩn hoá, `redacted_text`, attachment metadata, và cờ `is_meaningful_human_message`, `is_opening_block_message`, v.v...
- Ngoài các bảng canonical trên, Seam 1 có 1 bảng phụ trợ `thread_customer_mapping` để giữ owner của mapping thread-level sang customer nội bộ.
- `thread_customer_mapping` chỉ giữ current state của mapping thread -> customer; history quyết định AI/manual không được ghi đè trực tiếp vào đây mà phải có audit owner riêng ở Seam 2.
- Các bảng không nên lặp lại dữ liệu lẫn nhau; ví dụ `conversation_day` không nên có cột `first_meaningful_human_message` nếu đã có trong bảng `message` với cờ `is_first_meaningful_human_message`.
- Semantics daily snapshot được biểu diễn bằng `etl_run.snapshot`, `etl_run.status`, và `etl_run.is_published` thay vì tách thêm bảng.
- Một manual custom range có thể tạo nhiều `etl_run` cùng `run_group_id`; các run partial-day phải mặc định `is_published = false` để không ghi đè snapshot official theo ngày.
- Các evidence page-local hoặc cấu trúc chưa ổn định nên được giữ trong `jsonb` thay vì tách nhiều bảng con.
- Tối ưu sức mạnh của postgres17 để đảm bảo hiệu suất và khả năng mở rộng, ví dụ sử dụng partitioning, indexing, materialized view, v.v...

**AI Analysis:**

- Seam 2 có 2 capability chính và cả hai đều là feature chính thức của app:
  - `conversation analysis`: phân tích insight/coaching ở grain `conversation_day`
  - `AI-assisted CRM mapping`: resolve các thread chưa map được sang customer nội bộ ở grain `thread`
- Job AI chỉ đọc dữ liệu canonical đã được publish từ Seam 1 và các payload/candidate set đã được `backend/` freeze cho run đó; `service/` không tự query dữ liệu sống ngoài contract đã nhận.
- Bulk path giữa `backend/` và `service/` phải đi qua gRPC; public API vẫn là REST.
- Scheduled automatic flow có analysis grain là đúng `1 conversation_day = 1 unit = 1 analysis_result`.
- `manual_day` là rerun theo scope `etl_run` hoặc một ngày cụ thể; `manual_slice` là diagnostic scope hẹp và mặc định không tự đi vào official chain/publish.
- AI-assisted CRM mapping có grain là đúng `1 thread = 1 mapping decision`; luồng này có thể chạy scheduled cleanup hoặc manual review batch, nhưng không được rewrite snapshot Seam 1 của ngày đã publish.
- Batch chỉ là execution grouping để tiết kiệm RPM/token; batch không phải grain lưu trữ hay grain publish.
- Schema lưu trữ business-facing của Seam 2 gồm:
  - `analysis_run`: owner của scheduled/manual conversation-analysis run, retry, coverage, prompt/model/schema snapshot và publish outcome
  - `analysis_result`: output table của conversation analysis
  - `thread_customer_mapping_run`: owner của scheduled/manual AI mapping run, retry, coverage, prompt/model/schema snapshot và review outcome
  - `thread_customer_mapping_decision`: append-only output table của AI-assisted CRM mapping
- Input AI cho một `conversation_day` phải là một evidence bundle đã được freeze ở thời điểm run, tối thiểu gồm:
  - toàn bộ transcript redacted của ngày `D` với `sender_role`, `message_type`, `is_meaningful_human_message`, `is_opening_block_message`
  - `opening_blocks_json` đã được giữ lại từ Seam 1, bao gồm cả parsed opening block và opening block candidate window nếu có
  - `first_meaningful_human_message` và `first_meaningful_human_sender_role`
  - `customer_display_name` nguyên văn của thread tại thời điểm extract nếu page cần tín hiệu này
  - `normalized_tag_signals_json` cùng observed tags của thread trong ngày `D`
  - label deterministic và metric từ Seam 1 nếu có, ví dụ bot selection cho `tái khám`, normalized need/outcome signals, response-time metrics
- AI phải ưu tiên dùng structured evidence có sẵn trước khi suy luận từ transcript.
- Chỉ khi conversation thiếu tag phù hợp, thiếu opening signals, hoặc mapping page chưa đủ bao phủ thì AI mới được suy luận thêm từ context message.
- Conversation analysis phải phân tích các chiều business có scalar output trên mỗi unit:
  - `opening_theme`
  - `customer_mood`
  - `primary_need`
  - `primary_topic`
  - `content_customer_type`
  - `closing_outcome_as_of_day`
  - `response_quality_label`
  - `process_risk_level`
- Supporting text của conversation analysis phải giữ ngắn, dễ hành động và bounded:
  - `response_quality_issue_text`
  - `response_quality_improvement_text`
  - `process_risk_reason_text`
- `analysis_result` không lưu `risk_messages`, raw evidence array, hay message pointer list mở.
- `content_customer_type` chỉ là suy luận AI từ nội dung; Seam 2 không lưu final official journey label.
- `closing_outcome` phải được hiểu là kết quả chốt `as-of-day` trên snapshot ngày đó, không phải kết quả cuối cùng của toàn bộ vòng đời thread.
- `tái khám` là một nhãn nghiệp vụ hiển thị trong UI theo ngày; nó độc lập với trục `inbox mới / inbox cũ` vì "mới trên kênh chat" không đồng nghĩa với "mới với phòng khám".
- Final nhãn `tái khám` trên dashboard phải resolve theo thứ tự ưu tiên:
  - label/evidence từ Seam 1
  - `content_customer_type` do AI suy luận từ nội dung thật của `conversation_day`
  - tag vận hành của conversation-day
  - `unknown`
- Phải có Prompt builder trước khi gửi vào agent.
- Khi một run bắt đầu, effective runtime snapshot phải được freeze vào `analysis_run`, tối thiểu gồm:
  - `model_name`
  - `prompt_version`
  - `prompt_snapshot_json`
  - `output_schema_version`
  - `generation_config_json`
- `analysis_result` phải giữ `prompt_hash` để audit payload prompt thực tế đã compile ở mức unit.
- Có thể chạy lại AI với model hoặc prompt mới mà không làm thay đổi dữ liệu canonical của Seam 1.
- Phải có cost monitoring để theo dõi chi phí vận hành AI, tránh chi phí bị đội lên ngoài kiểm soát.
- Khi provider trả 429 hoặc rate-limit tương đương, AI seam phải hỗ trợ retry có jitter, phân lô lại batch, giảm concurrency động, và tôn trọng `Retry-After` nếu provider cung cấp.
- Mỗi planned unit phải đi tới một trạng thái terminal:
  - `succeeded`
  - hoặc `unknown`
- Nếu một unit không phân tích được sau retry/split hợp lệ thì unit đó phải được terminalize về `unknown`, lưu `failure_info_json`, và ngày vẫn được phép publish nếu mọi unit khác đã terminal.
- Scheduled daily chỉ bị chặn publish nếu còn unit chưa terminal hoặc job chết giữa chừng mà không recover được.
- Khi thay đổi prompt/model/schema, hệ thống phải có policy chống lệch pha báo cáo dài hạn:
  - báo cáo chính thức nên pin vào cùng prompt/model/schema snapshot của `analysis_run`
  - nếu muốn so sánh trend dài hạn dưới prompt mới, phải backfill lại kỳ cũ rồi publish lại
  - nếu chưa backfill, UI phải hiển thị ranh giới version và cảnh báo không so sánh trực tiếp các đoạn trend khác snapshot
- AI-assisted CRM mapping phải được thiết kế đầy đủ như một flow riêng:
  - deterministic fast-path với đúng 1 số điện thoại hữu hiệu vẫn được xử lý ở Seam 1 và ghi vào `thread_customer_mapping`
  - chỉ các thread nhập nhằng mới đi vào AI mapping flow
  - `backend/` là owner của CRM candidate retrieval từ app nội bộ; `service/` chỉ nhận candidate set đã freeze cùng evidence bundle của thread
  - input của một mapping unit tối thiểu gồm `page_id`, `thread_id`, `customer_display_name`, `normalized_phone_candidates`, opening/tag evidence, transcript evidence đã redact, existing mapping state nếu có, và candidate set từ CRM nội bộ
  - `thread_customer_mapping_run` phải snapshot `model_name`, `prompt_version`, `prompt_snapshot_json`, `output_schema_version`, `generation_config_json`, retry state và coverage giống logic audit của `analysis_run`
  - `thread_customer_mapping_decision` phải là append-only, mỗi row tương ứng một thread trong một run, và tối thiểu giữ:
    - `selected_customer_id` hoặc `unknown`
    - `confidence_score`
    - `decision_status`
    - `manual_review_required`
    - `evidence_json`
    - `prompt_hash`
    - `failure_info_json`
  - `thread_customer_mapping` chỉ được promote/update khi:
    - deterministic fast-path thành công
    - hoặc AI decision vượt ngưỡng confidence do backend policy quy định
    - hoặc operator manual override
  - decision confidence thấp vẫn phải được persist để vào review queue, nhưng không được tự ghi đè current mapping
  - AI-assisted CRM mapping chỉ phục vụ enrichment/joining với hệ thống nội bộ; không được dùng để xác định hoặc rewrite `inbox mới / inbox cũ / tái khám`

## Hợp đồng vận hành của AI seam

- AI seam không chạy ad-hoc trực tiếp trên dữ liệu sống, mà chạy thông qua job definition.
- `backend/` là owner của scheduler, prompt snapshot freeze, CRM candidate retrieval, gRPC client, persistence, publish/supersede, review queue và read API.
- `service/` là owner của prompt builder, validation, batch planning và code-based Google ADK runtime; `service/` không phải owner của business persistence hay CRM source integration.
- `frontend/` là owner của UI vận hành, manual rerun, màn đọc kết quả phân tích, review queue của CRM mapping, và prompt editor theo page ở config domain riêng.
- `analysis_run` là owner của run-level state cho conversation analysis.
- `analysis_result` là output table của conversation analysis:
  - mỗi row tương ứng đúng một `conversation_day` hoặc một `manual_slice`
  - chỉ chứa scalar dimensions, supporting text bounded, `prompt_hash`, `failure_info_json` và publish state
- `thread_customer_mapping_run` là owner của run-level state cho AI-assisted CRM mapping.
- `thread_customer_mapping_decision` là output/audit table của AI-assisted CRM mapping.
- `thread_customer_mapping` vẫn là current-state table được downstream join trực tiếp; nó không thay thế decision history.
- Production path trong `service/` phải dùng Python ADK code-based runtime; không dùng `Agent Config` YAML làm production path.
- Conversation analyzer trong `service/` phải dùng structured output cho từng unit và không phụ thuộc vào tool calling hoặc multi-agent delegation trong cùng request phân tích, vì output contract phải ổn định và dễ audit.
- AI mapping agent cũng phải trả structured output theo mapping schema đã pin; nếu cần orchestration nhiều bước thì orchestration đó vẫn phải nằm sau cùng một external contract ổn định.
- Batch planning, concurrency cap, retry với jitter, rate-limit handling, validation và terminalization phải nằm ở lớp orchestration của `service/`, không nhét vào business persistence và không dựa vào ADK session để làm source of truth.
- ADK session/state chỉ là runtime scratchpad tạm thời cho một invocation; mỗi unit phân tích phải được coi là ephemeral và không được dùng thay cho `analysis_run` hoặc `analysis_result`.
- Nếu sau này cần orchestration phức tạp hơn trong `service/`, có thể dùng custom ADK `BaseAgent`, nhưng external contract vẫn phải giữ nguyên `backend` owns persistence và output chính thức chỉ đi vào các bảng owner đã chốt của Seam 2.
- Scheduled daily unique theo `source_etl_run_id`; retry chỉ nằm trong cùng `analysis_run`.
- Scheduled daily được publish khi mọi unit đã terminal ở `succeeded` hoặc `unknown`.
- `manual_slice` mặc định là `diagnostic`, không tự đi vào official dashboard.
- `manual_day` có thể tạo `analysis_run` mới và publish để supersede official cũ nếu operator chủ động chọn.
- AI mapping run có thể có queue riêng cho `manual_review_required`; publish của dashboard conversation analysis không được block bởi queue này.
- Thiết kế này cho phép chạy thử, chạy lại, backfill hoặc replay bằng prompt mới mà không làm thay đổi dữ liệu canonical của Seam 1.
- Internal data path giữa `backend` và `service` phải tối ưu cho bulk processing:
  - public API vẫn là REST
  - bulk daily processing không dùng REST JSON gọi qua lại cho từng thread
  - `backend` gửi batch/unit payload sang `service` qua gRPC và nhận kết quả per-unit qua gRPC response hoặc stream

## Yêu cầu kỹ thuật

- Thiết kế datawarehouse vận dụng hết khả năng của postgres17, có thể sử dụng các tính năng mới nhất của postgres17 để tối ưu hiệu suất và khả năng mở rộng.
- Tách biệt 2 seam rõ ràng là lưu trữ dữ liệu đã được chuẩn hoá và phân tích dữ liệu bằng AI, để có thể tối ưu hiệu suất và khả năng mở rộng của từng phần, đồng thời đảm bảo tính linh hoạt trong việc thay đổi hoặc nâng cấp từng phần mà không ảnh hưởng đến phần còn lại.
- Không nhúng AI vào seam lưu trữ dữ liệu.
- Liên kết được dữ liệu hội thoại sau transform với khách trong hệ thống app crm nội bộ.
- Có khả năng linh hoạt trong những tình huống hệ thống mất ổn định và service chết, có thể đảm bảo tính toàn vẹn của dữ liệu và khả năng khôi phục nhanh chóng.
- Có snapshot theo ngày để có thể dễ dàng theo dõi và phân tích dữ liệu theo thời gian, đồng thời có thể khôi phục dữ liệu về một thời điểm cụ thể nếu cần thiết.

## Các cơ chế giao tiếp

- Frontend gọi trực tiếp các endpoint backend hiện có để lấy danh sách page, xem health summary, preview job và execute job.
- Frontend chỉ cần một lớp API mỏng bằng `fetch`, không cần auth store hay session lifecycle.
- Xử lý real-time: SSE (Server-Sent Events) hoặc WebSocket để cập nhật dashboard ngay khi có dữ liệu mới mà không cần refresh trang.
- UI state được quản lý cục bộ theo từng màn hình; mỗi thao tác quan trọng đều hiển thị request/response, trạng thái loading và lỗi rõ ràng để phục vụ vận hành.
- Backend phải có cơ chế xác định trạng thái của go-worker, logging để IT có thể monitor và debug khi cần thiết.
- Dashboard BI chỉ được đọc từ `published snapshot` và `published analysis rows` của cùng một kỳ dữ liệu. Nếu trong ngày pipeline chưa hoàn tất, UI không được trộn Seam 1 real-time với Seam 2 của ngày cũ trong cùng một KPI card.
