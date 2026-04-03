# Seam 1 Lean Schema Matrix

Tài liệu này mô tả schema rút gọn cho Seam 1 với 3 bảng canonical và 1 bảng mapping phụ trợ:

- `etl_run`
- `conversation_day`
- `message`
- `thread_customer_mapping`

Mục tiêu là giảm số lượng bảng nhưng vẫn giữ được:

- extract window theo ngày local của page
- canonical persistence cho dashboard và downstream AI
- rerun/backfill có kiểm soát
- raw evidence đủ để audit/debug

## Quy ước chung

- `target_date`: ngày dữ liệu local của page, lưu dưới dạng `date`
- timestamp runtime/source: ưu tiên `timestamptz`
- dữ liệu bán cấu trúc hoặc page-local taxonomy: lưu `jsonb`
- mỗi lần rerun/backfill tạo một `etl_run` mới, không ghi đè lịch sử cũ
- các bảng con ưu tiên kế thừa scope `page_id` và `target_date` qua `etl_run_id`, không lặp lại nếu không thật sự cần
- không persist `original_text`; mọi payload message được lưu trữ phải ở trạng thái đã redact nội dung nhạy cảm
- scheduler mặc định chạy full-day; manual custom range được materialize thành một hoặc nhiều `etl_run` theo từng `target_date`
- `go-worker` là process ETL chịu trách nhiệm kết nối trực tiếp Postgres để load Seam 1; backend TypeScript giữ vai trò orchestration và read API

## Matrix: `etl_run`

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh duy nhất của một lần ETL run | Dùng để nối với `conversation_day` và `message` |
| `run_group_id` | `uuid` | Có | index | Nhóm các `etl_run` sinh ra từ cùng một yêu cầu manual range hoặc backfill nhiều ngày | Null với run đơn lẻ thông thường |
| `run_mode` | `text` | Không | index | Kiểu run | Gợi ý: `scheduled_daily`, `manual_range`, `backfill_day`, `onboarding_sample` |
| `page_id` | `text` | Không | index, unique với `target_date + snapshot_version` | Page Pancake mà run này xử lý | Là source scope chính của run |
| `target_date` | `date` | Không | index, unique với `page_id + snapshot_version` | Ngày local mà ETL đang build dữ liệu | Thay cho thuật ngữ `business_day` |
| `business_timezone` | `text` | Không |  | Timezone dùng để diễn giải `target_date` | Ví dụ `Asia/Ho_Chi_Minh` |
| `requested_window_start_at` | `timestamptz` | Có |  | Mốc bắt đầu mà IT hoặc hệ thống yêu cầu xử lý | Với scheduler full-day có thể null hoặc bằng `window_start_at` |
| `requested_window_end_exclusive_at` | `timestamptz` | Có |  | Mốc kết thúc end-exclusive mà IT hoặc hệ thống yêu cầu xử lý | Với scheduler full-day có thể null hoặc bằng `window_end_exclusive_at` |
| `window_start_at` | `timestamptz` | Không |  | Mốc bắt đầu window thực tế của `etl_run` này | Với manual range nhiều ngày, đây là phần giao giữa requested window và `target_date` |
| `window_end_exclusive_at` | `timestamptz` | Không |  | Mốc kết thúc end-exclusive thực tế của `etl_run` này | Với scheduler full-day thường là `ngày kế tiếp 00:00:00` |
| `status` | `text` | Không | index | Trạng thái run | Gợi ý: `running`, `loaded`, `published`, `failed` |
| `snapshot_version` | `integer` | Không | unique với `page_id + target_date` | Version snapshot của ngày đó | Mỗi rerun/backfill tăng version |
| `is_published` | `boolean` | Không | index | Run này có phải bản dashboard chính thức không | Cho phép nhiều run nhưng chỉ một bản published |
| `tag_dictionary_json` | `jsonb` | Không |  | Page tag dictionary tại thời điểm extract | Dùng để resolve metadata cho tag thực xuất hiện trong ngày |
| `metrics_json` | `jsonb` | Không |  | Metrics vận hành của run | Ví dụ số conversation scan, số message thấy, số message giữ lại |
| `error_text` | `text` | Có |  | Lỗi tổng hợp nếu run fail | Chỉ có giá trị khi `status = failed` |
| `started_at` | `timestamptz` | Không | index | Thời điểm bắt đầu run | Dùng cho vận hành và audit |
| `finished_at` | `timestamptz` | Có | index | Thời điểm kết thúc run | Có thể null khi run chưa xong |

## Matrix: `conversation_day`

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh của một lát `conversation` trong một ngày và một run |  |
| `etl_run_id` | `uuid` | Không | FK, unique với `conversation_id` trong cùng run | Run đã tạo ra bản ghi này | Nối về `etl_run.id` |
| `conversation_id` | `text` | Không | index | ID thread từ Pancake | Một `conversation` có thể xuất hiện ở nhiều ngày khác nhau |
| `customer_display_name` | `text` | Có | index | Tên hiển thị của khách gắn với thread ở thời điểm extract | Phải giữ nguyên văn như source, không normalize, để phục vụ AI/manual customer mapping khi phone bị ambiguous |
| `conversation_inserted_at` | `timestamptz` | Có |  | Thời điểm thread được tạo ở source | Dùng làm evidence cho inbox mới/cũ về sau |
| `conversation_updated_at` | `timestamptz` | Có |  | Thời điểm source report thread được cập nhật | Chỉ là source fact, không thay thế `target_date` |
| `message_count_seen_from_source` | `integer` | Không |  | Số message worker đã thấy khi fetch conversation đó trong run này | Khác với số message thực sự được giữ lại trong ngày |
| `normalized_phone_candidates_json` | `jsonb` | Không |  | Danh sách số điện thoại đã normalize và dedupe từ payload conversation | Là source of truth phone-level ở `conversation_day` để map customer deterministic |
| `current_tags_json` | `jsonb` | Không |  | Tag hiện tại của conversation tại thời điểm extract | Là source evidence page-local |
| `observed_tag_events_json` | `jsonb` | Không |  | Tag history/event liên quan tới conversation-day | Giữ chung trong JSON để giảm số bảng |
| `normalized_tag_signals_json` | `jsonb` | Không |  | Tín hiệu tag đã chuẩn hoá bằng rule deterministic | Ví dụ `customer_type`, `need`, `branch`, `noise_flags` |
| `opening_blocks_json` | `jsonb` | Không |  | Opening block raw hoặc parsed của slice ngày | Gom cả observation, selection, candidate window vào một cột |
| `first_meaningful_human_message_id` | `text` | Có |  | Message đầu tiên có ý nghĩa từ phía con người trong ngày | Trỏ logic sang `message.message_id`, không bắt buộc FK vật lý |
| `first_meaningful_human_sender_role` | `text` | Có |  | Vai trò của người gửi message mở đầu có ý nghĩa | Gợi ý: `customer` hoặc `staff_via_pancake` |
| `source_conversation_json` | `jsonb` | Không |  | Raw conversation head từ Pancake | Dùng để audit/debug và backfill logic transform |
| `created_at` | `timestamptz` | Không | index | Thời điểm row được ghi vào DB |  |

## Matrix: `thread_customer_mapping`

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `page_id` | `text` | Không | unique với `thread_id` | Page chứa thread được map | Giữ lại để tránh giả định `thread_id` global unique tuyệt đối |
| `thread_id` | `text` | Không | unique với `page_id` | Thread nguồn từ Pancake | Thread-level identity owner |
| `customer_id` | `text` | Không | index | Định danh khách hàng nội bộ đã được resolve | Mỗi thread chỉ map tới tối đa 1 customer |
| `mapped_phone_e164` | `text` | Có |  | Số điện thoại đã normalize dùng để tạo mapping | Có thể null với manual override không dựa trên phone |
| `mapping_method` | `text` | Không | index | Cách tạo mapping | Gợi ý: `deterministic_single_phone`, `ai_resolved`, `manual_override` |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo mapping |  |
| `updated_at` | `timestamptz` | Không | index | Thời điểm cập nhật mapping gần nhất | Thread đã map thì không auto remap chỉ vì có phone mới ở ngày sau |

## Matrix: `message`

| Cột | Kiểu gợi ý | Null | Ràng buộc / index | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh nội bộ của row message |  |
| `conversation_day_id` | `uuid` | Không | FK, index | Thuộc lát conversation-day nào | Nối về `conversation_day.id` |
| `etl_run_id` | `uuid` | Không | FK, unique với `message_id` trong cùng run | Run đã sinh ra row message này | Giúp rerun/backfill idempotent |
| `message_id` | `text` | Không | index | Định danh message từ Pancake | Dùng để dedupe trong phạm vi run |
| `conversation_id` | `text` | Không | index | Thread cha của message | Denormalize để query nhanh |
| `inserted_at` | `timestamptz` | Không | index | Timestamp source của message | Chỉ các message trong window ngày mới được persist |
| `sender_source_id` | `text` | Có |  | ID người gửi/phía gửi từ source | Có thể là page id, PSID, app id |
| `sender_name` | `text` | Có |  | Tên hiển thị của người gửi | Có thể là tên khách, tên nhân viên, tên bot |
| `sender_role` | `text` | Không | index | Vai trò chuẩn hoá của actor gửi message | Gợi ý: `customer`, `staff_via_pancake`, `third_party_bot`, `page_system_auto_message`, `unclassified_page_actor` |
| `source_message_type_raw` | `text` | Có |  | Giá trị type nguyên gốc từ Pancake nếu có | Dùng cho audit và rule refinement |
| `message_type` | `text` | Không | index | Kiểu message đã chuẩn hoá | Gợi ý: `text`, `postback`, `quick_reply_selection`, `template`, `image`, `video`, `file`, `sticker`, `reaction`, `system_notice`, `unsupported` |
| `redacted_text` | `text` | Có |  | Nội dung sau khi che dữ liệu nhạy cảm | Đây là text canonical duy nhất được phép persist cho downstream |
| `attachments_json` | `jsonb` | Không |  | Attachment và metadata liên quan | Giữ raw shape đủ để audit |
| `message_tags_json` | `jsonb` | Không |  | Tag/message markers gắn riêng trên message nếu source có | Không phải current tag state của conversation |
| `is_meaningful_human_message` | `boolean` | Không | index | Message này có được coi là một human message có ý nghĩa không | Tính deterministic từ `sender_role`, `message_type`, content, opening rules và cấu trúc template/quick-reply |
| `source_message_json_redacted` | `jsonb` | Không |  | Payload message từ Pancake sau khi đã redact text và dữ liệu nhạy cảm | Giữ đủ shape để audit/debug mà không lưu original text |
| `created_at` | `timestamptz` | Không | index | Thời điểm row được ghi vào DB |  |

## Constraint Và Index Tối Thiểu

| Đối tượng | Ràng buộc / index | Mục đích |
| --- | --- | --- |
| `etl_run` | unique (`page_id`, `target_date`, `snapshot_version`) | Cho phép nhiều rerun nhưng không đụng version |
| `etl_run` | partial unique published trên (`page_id`, `target_date`) với `is_published = true` | Mỗi ngày chỉ có một bản chính thức |
| `etl_run` | index (`run_group_id`) | Gom các run sinh ra từ cùng một manual range |
| `conversation_day` | unique (`etl_run_id`, `conversation_id`) | Một conversation chỉ có một slice trong cùng run |
| `conversation_day` | index (`etl_run_id`) | Join và đọc theo một run cụ thể nhanh |
| `conversation_day` | index (`customer_display_name`) | Hỗ trợ tìm thread và cung cấp evidence cho AI/manual mapping |
| `message` | unique (`etl_run_id`, `message_id`) | Chống duplicate trong cùng run |
| `message` | index (`conversation_day_id`, `inserted_at`) | Đọc transcript theo thời gian |
| `message` | index (`conversation_id`, `inserted_at`) | Hỗ trợ truy vấn xuyên ngày nếu cần |
| `message` | index (`is_meaningful_human_message`) | Hỗ trợ xác định opening/message meaningful nhanh |
| `thread_customer_mapping` | unique (`page_id`, `thread_id`) | Mỗi thread chỉ có một mapping customer hiện hành |
| `thread_customer_mapping` | index (`customer_id`) | Query ngược từ customer sang thread |

## Những Gì Cố Tình Không Tách Thành Bảng Riêng

| Thành phần | Lý do giữ trong JSONB |
| --- | --- |
| `tag_dictionary` | Là page-level metadata, thay đổi ít theo run, không cần query join chi tiết ở phase này |
| `current_tags` và `observed_tag_events` | Chủ yếu là source evidence cho AI và audit, chưa cần aggregate nặng bằng SQL |
| `opening observations`, `opening selections`, `opening_candidate_window` | Cấu trúc page-specific, thay đổi nhiều, chưa ổn định để chuẩn hoá thành nhiều bảng con |
| `normalized_phone_candidates` | Giữ ở `conversation_day` để vừa audit được evidence theo ngày, vừa tránh phải tách thêm bảng phone riêng quá sớm |
| `attachments` | Shape đa dạng theo source, JSONB phù hợp hơn tách bảng ngay từ đầu |

## Rule Diễn Giải Nhanh

| Chủ đề | Rule |
| --- | --- |
| Persist boundary | Chỉ lưu message có `inserted_at` nằm trong window local của `target_date` |
| `first_meaningful_human_message_id` | Là message đầu tiên trong window thực tế của run có `is_meaningful_human_message = true`; với scheduled daily thì window đó chính là full-day slice |
| `is_meaningful_human_message` | Không phụ thuộc AI; tính bằng rule deterministic |
| Privacy message storage | Không lưu `original_text`; chỉ lưu `redacted_text` và `source_message_json_redacted` |
| Manual custom range | Một yêu cầu custom range có thể sinh nhiều `etl_run` theo từng `target_date`, dùng chung `run_group_id` và giữ lại `requested_window_*` để audit |
| Publish rule | Run partial-day hoặc manual diagnostic không được `is_published = true` mặc định; dashboard official chỉ đọc full-day run đã publish |
| Phone normalization | `conversation_day.normalized_phone_candidates_json` phải là tập phone đã normalize + dedupe ngay trong transform/load |
| Customer name evidence | `conversation_day.customer_display_name` phải được carry nguyên văn từ source conversation/customer payload, không normalize, để phục vụ AI/manual mapping |
| Deterministic customer mapping | Nếu thread chưa có mapping và tập phone hữu hiệu chỉ còn đúng 1 số map được tới đúng 1 customer nội bộ thì `go-worker` ghi thẳng vào `thread_customer_mapping` |
| Ambiguous customer mapping | Nếu không có phone, có nhiều phone, hoặc match ra nhiều customer thì không ghi `thread_customer_mapping`; chỉ chuyển case đó sang AI/manual |
| Rerun / backfill | Tạo `etl_run` mới, version mới; không overwrite lịch sử run cũ |
| Publish | Dashboard chỉ đọc run đã `is_published = true` |
