# Thiết kế chat-analyzer-v2

## Insights

Là một thành viên BoD và Lead sales, tôi muốn biết mỗi ngày:

- Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ khách mới quan tâm trong đoạn hội thoại? Kết quả chốt?
- Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ?
- Leader muốn thống kê hiện trạng trước => ưu tiên cải tiến các kịch bản cho các vấn đề khách hàng quan tâm nhất.

## Nguyên tắc bất biến

- Hệ thống có 2 seam-owner tách biệt:
  - Seam 1 là lưu trữ dữ liệu đã được chuẩn hoá và các chỉ số deterministic, không dùng AI.
  - Seam 2 là phân tích bằng AI trên dữ liệu đã được lưu trữ ở seam 1, ghi kết quả sang hệ thống bảng riêng.
- Seam 1 chỉ lưu các dữ liệu có thể kiểm chứng từ source hoặc tính được bằng rule cố định:
  - page, customer, conversation, participant, message, tag, attachment, thời gian phản hồi, mapping sang crm nội bộ.
- Seam 2 chỉ sinh ra dữ liệu diễn giải:
  - sentiment, topic, intent, phân loại giai đoạn khách (không phải logic khách mới/cũ, phần này được định nghĩa riêng), trạng thái chốt, đánh giá chất lượng phản hồi, risk flags, recommendation.
- Kết quả AI không được ghi đè vào dữ liệu canonical của seam 1.
- Thiết kế datawarehouse phải tận dụng hết khả năng của postgres17, số lượng bảng phải vừa đủ, không được dư thừa.
- Mọi kết quả AI phải có version của model, prompt, schema output và run id để có thể audit, so sánh và backfill.
- Báo cáo theo ngày phải đọc từ snapshot của ngày đó, không đọc từ trạng thái mới nhất của hội thoại.

## Repository structure & technical stack

Mỗi folder là một "mini-repo" của chính nó, chạy độc lập và deploy độc lập.

- `backend/`: là phần backend kết nối với database, cung cấp API, đồng thời cũng là seam-owner của `go-worker` thực hiện ETL pipeline. Techstack:
  - Bun + ElysiaJS + Typescript, Go for `go-worker`
  - Postgres + Prisma, Redis, BullMQ
  - REST for public API, gRPC for internal communication
  - Validation DTO
  - Swagger API documentation
- `frontend/`: là phần frontend hiển thị dashboard, cung cấp UI để người dùng có thể tương tác với ứng dụng. Techstack:
  - Bun + VueJS 3, Typescript
  - Có permission gate
  - Auth: JWT token, refresh token, cookie
- `service/`: là phần seam-owner của AI service. Phần này sẽ gọi API backend dể lấy data, sau đó xử lý bằng AI model, cuối cùng trả kết quả về cho backend. Techstack:
  - Python, FastAPI, Uvicorn
  - Sử dụng gemini API, google agent developer kit
  - Là nơi sẽ host nhiều dịch vụ AI hơn trong tương lai, hiện tại chỉ có chat-analyzer service
  - Chia nhỏ thành nhiều module để dễ quản lý đồng thời giữ root directory gọn gàng

## Các cơ chế hoạt động

- Access Token (JWT): Trả về trong body của login API. Frontend lưu vào bộ nhớ (Memory/Pinia) để gắn vào Header Authorization: Bearer ... cho mỗi request.
- Refresh Token: Backend đặt vào HttpOnly, Secure, SameSite=Strict Cookie. Cách này giúp chống tấn công XSS hiệu quả.
- Cơ chế xoay vòng (Silent Refresh): Backend cung cấp endpoint /refresh. Khi Access Token hết hạn, Frontend Vue (thường dùng Axios Interceptor) sẽ gọi endpoint này để lấy Access Token mới bằng Refresh Token trong Cookie.
- Xử lý real-time: SSE (Server-Sent Events) hoặc WebSocket để cập nhật dashboard ngay khi có dữ liệu mới mà không cần refresh trang.
- Phân quyền: sử dụng permission schema, vue integration (navigation guard, v-permission, ...) để ẩn/hiện UI dựa trên quyền của người dùng.
- Backend phải có cơ chế xác định trạng thái của go-worker, log-streaming để IT có thể monitor và debug khi cần thiết.

## Nguồn dữ liệu

**Pancake:**

- Là một hệ thống quản lý bán hàng đa kênh toàn diện, có thể kết nối nhiều kênh khách nhau: Facebook, Instagram, Tiktok, v.v.
- Sử dụng api của pancake có thể trích xuất được nhiều dữ liệu khác nhau.

**Tình hình hiện tại về pancake:**

- Tag trích xuất được trong một conversation có thể bao gồm: loại khách hàng, địa chỉ, độ tuổi, nhân viên phụ trách, v.v
- Mỗi trang lại có danh sách tag khác nhau, không đồng nhất.
- Doanh nghiệp không dùng tính năng assignee của pancake
- Tin nhắn trong hội thoại có bao gồm cả phần tin nhắn của chatbot trả lời tự động và lựa chọn của khách với các option mà chatbot đưa ra (vd: Bắt đầu) nên phải lọc ra cho câu hỏi này:
  - Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ khách mới quan tâm trong đoạn hội thoại? Kết quả chốt
  - Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ"
- Có thể tận dụng câu hỏi có sẵn của chatbot để phân loại khách mới và tái khám đối với những cuộc hội thoại hoàn toàn mới, vì sẽ có một câu hỏi mặc định để khách chọn trước khi liên lạc tới nhân viên.

**Mitigation:**

- Chọc api pancake để biết được hình dạng reponse và các dữ liệu trích xuất được, từ đó thiết kế schema và mô hình chuẩn hoá dữ liệu cho phù hợp.
- Lưu response sample vào `docs/pancake-api-samples/` để làm nguồn tham khảo cho việc phát triển và debug.

## ETL và phân tích dữ liệu

Hệ thống chạy theo lịch cuối ngày, nhưng dữ liệu gốc phải được ingest theo hướng incremental và append-only để tránh mất ngữ cảnh.

**Extract seam 1:**

- Gọi API Pancake để lấy dữ liệu thay đổi theo cửa sổ thời gian.
- Đơn vị ingest nhỏ nhất là message:
  - Source incremental unit là conversation.updated_at
  - Persisted fact unit là message
- Conversation là thread nguồn từ Pancake.
- Customer là thực thể kinh doanh hoặc CRM identity.
- Lưu raw payload tại landing zone để có thể debug, audit và backfill khi cần.
- Dedupe theo định danh ổn định từ source.
- Có lookback window để xử lý dữ liệu về muộn hoặc source update lại hội thoại cũ. Sử dụng cơ chế upsert để đảm bảo tính toàn vẹn của dữ liệu (update nếu đã tồn tại, insert nếu chưa có).
- Có retry mechanism với exponential backoff
- Có tự động làm mới access token nếu bị từ chối do token hết hạn.

**Transform seam 1:**

- Normalize dữ liệu về schema chuẩn chung.
- Ẩn danh hoá dữ liệu nhạy cảm:
  - Redact số điện thoại trong tin nhắn.
  - Giữ nguyên số điện thoại trong trường recent_phone_number khi pancake trả về để phục vụ cho việc mapping sử dụng AI, nhưng không lưu số điện thoại trong message text.
- Chuẩn hoá timezone, enum, participant role, message type, tag, attachment.
- Tách riêng tin nhắn chatbot, tin nhắn của khách, tin nhắn của nhân viên.
- Dedupe tin nhắn nếu có tin nhắn trùng lặp do lỗi từ source hoặc lỗi trong quá trình ingest.
- Tính các chỉ số deterministic như:
  - first response time của nhân viên
  - average response time của nhân viên
- Mapping conversation / customer sang crm nội bộ

**Load seam 1:** _This is the single source of truth for all downstream jobs_

- Lưu dữ liệu canonical vào hệ thống bảng mới trong postgres17.
- Dữ liệu canonical là nguồn sự thật duy nhất cho các job downstream.
- Có daily snapshot để khoá số liệu theo ngày.
- Tối ưu sức mạnh của postgres17 để đảm bảo hiệu suất và khả năng mở rộng, ví dụ sử dụng partitioning, indexing, materialized view, v.v...

**AI seam 2:**

- Job AI chỉ đọc dữ liệu canonical đã được chuẩn hoá từ seam 1.
- Job AI phân tích theo conversation-day hoặc conversation snapshot của ngày đó.
- Có thể chạy lại AI với model hoặc prompt mới mà không làm thay đổi dữ liệu gốc.
- Cho phép lưu snapshot phân tích AI theo prompt version để so sánh hiệu quả của các prompt khác nhau.
- Phải có cost monitoring để theo dõi chi phí vận hành AI, tránh chi phí bị đội lên ngoài kiểm soát.

## Hợp đồng vận hành của AI seam

- AI seam không chạy ad-hoc trực tiếp trên dữ liệu sống, mà chạy thông qua job definition.
- `ai_result` dùng để lưu kết quả phân tích trên từng conversation-day hoặc snapshot unit.
- `ai_usage_log` dùng để lưu chi phí AI theo provider, model, token, cost để phục vụ dashboard và kiểm soát vận hành.
- Thiết kế này cho phép chạy thử, chạy lại, backfill hoặc replay bằng prompt mới mà không làm thay đổi dữ liệu canonical.

## Trình bày dữ liệu

## Cho BoD và Lead sales (Business Intelligence)

**Executive summary:**

- Thiết kế 1 dashboard báo cáo thống kê chỉ số trực quan để BoD và Lead sales dễ dàng theo dõi các chỉ số quan trọng
- Cho phép chọn view nhanh theo hàng ngày, hàng tuần, hàng tháng, hoặc custom theo nhu cầu.
- Hệ thống KPI metric:
  - Tổng số inbox trong ngày, khách mới/cũ
  - Tỷ lệ chốt đơn thành công (AI-inferred closing outcome)
  - Tỷ lệ hài lòng trung bình (average sentiment score)
  - Chi phí AI trung bình

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

- Cho phép chạy thủ công để populate dữ liệu khi cần thiết, ví dụ khi có sự cố hoặc khi muốn backfill dữ liệu cũ. Cho phép chọn khoảng thời gian cụ thể để chạy lại ETL, AI, hoặc cả hai.
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

- Đơn vị báo cáo theo ngày là conversation-day: một hội thoại có phát sinh tin nhắn trong ngày `D` thì tạo ra một bản ghi snapshot cho ngày `D`.
- Cần tách rõ 3 khái niệm:
  - khách mới: customer có first_seen_at thuộc ngày `D`
  - inbox mới: conversation có first_message_at thuộc ngày `D`
  - inbox khách cũ trong ngày (chưa chắc đã là tái khám): conversation-day thuộc ngày `D` nhưng customer đã first_seen trước ngày `D`
- Một customer có thể là mới ở ngày hôm qua nhưng trở thành cũ ở ngày hôm nay.
- Điều này không được phép làm thay đổi snapshot của ngày hôm qua.
- Vì vậy:
  - snapshot ngày 1 giữ nguyên kết quả ngày 1
  - snapshot ngày 2 phản ánh đúng trạng thái nhìn từ ngày 2
- Khi xem báo cáo, phải có 2 kiểu:
  - Báo cáo theo ngày, ngày nào biết ngày đó
  - Báo cáo theo giai đoạn: áp dụng logic cộng dưới đây.

**Bài toán snapshot ví dụ**

- Mỗi khách là một thread trên nền tảng, vì 01 người dùng 01 tài khoản.
- Trong hôm qua, tức 0h-23h59 ngày hôm qua, tổng cộng có 100 dữ liệu hội thoại, tức là có 100 cuộc hội thoại có tin nhắn trong khoảng thời gian đó. Phân tích cho thấy có 50 hội thoại là khách mới 50 là khách cũ.
- Trong ngày hôm nay 40 trong số đó tiếp tục nhắn tin, ngoài ra tổng cộng hôm nay có 130 dữ liệu hội thoại. Tức là trong này sẽ có 40 khách là khách mới của hôm qua. Nếu chạy xong phân tích của ngày hôm nay thì 40 khách đó sẽ bị đánh dấu là khách cũ.
- Thống kê kết quả sẽ phải tuân theo luật sau:
  - Unique customer xuất hiện sau 2 ngày là 190 khách
  - Khách hàng mới trong kỳ 2-day period là 80 khách: ngày 1 có 50 khách mới, ngày 2 có thêm 30 khách mới (không tính 40 khách cũ của ngày 1)
  - Khách hàng cũ trong kỳ 2-day period là những người xuất hiện trước khi kỳ báo cáo bắt đầu là 110 khách: ngày 1 có 50 khách cũ, ngày 2 có 60 khách cũ (là 60 người khách ngoài 40 khách của ngày 1)
