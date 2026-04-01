# Pancake Seam 1 Extract/Transform Audit

## Mục tiêu

Khoá lại thiết kế extract và transform của Seam 1 dựa trên:

- thiết kế hiện tại ở [design.md](D:/Code/chat-analyzer-v2/docs/design.md)
- payload sample thật trong [pancake-api-samples](D:/Code/chat-analyzer-v2/docs/pancake-api-samples)
- giới hạn thực tế của Pancake API trong [official-pancake-api.yaml](D:/Code/chat-analyzer-v2/docs/official-pancake-api.yaml)

Tài liệu này chỉ mô tả luồng production path. Không mô tả script discovery/debug nữa.

## Provenance Của Sample

### Tại sao có 2 đợt scrape

- Có 2 thư mục run:
  - [20260401T041740Z](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T041740Z)
  - [20260401T042009Z](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z)
- Run đầu là run dở dang do chạm phải 429:
  - không có `run_summary.json`
  - chỉ dừng ở một phần conversation/message pages
- Run sau là run hoàn chỉnh:
  - có [run_summary.json](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/run_summary.json)
  - ghi rõ `conversations_saved = 5`, `message_pages_saved = 9`, `messages_saved = 217`
- Nguyên nhân vận hành cần rút ra là: extractor kiểu cũ có thể bị ngắt giữa chừng khi paging message quá sâu. Luồng production không được phụ thuộc vào kiểu scrape thăm dò như vậy nữa.

### Những sample này có phải raw payload không

- Có, về bản chất đây là raw response page từ Pancake.
- Hai thay đổi duy nhất trước khi ghi ra thư mục sample:
  - pretty-print JSON
  - redact các key dạng token/secret
- Không có bước normalize hay remap schema trước khi ghi sample.

Hệ quả:

- sample phù hợp để audit shape dữ liệu source
- sample không được coi là canonical persistence format của hệ thống

## Source Facts Rút Ra Từ Payload

### Conversation list

Từ [list_conversations_page_001.json](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/conversations/list_conversations_page_001.json):

- `conversation` payload đã có đủ nhiều source fact:
  - `id`
  - `page_id`
  - `customer_id`
  - `inserted_at`
  - `updated_at`
  - `message_count`
  - `recent_phone_numbers`
  - `tags`
  - `tag_histories`
  - `page_customer`
- `assignee_*` có tồn tại trong source, nhưng doanh nghiệp không dùng tính năng assignee.
- `tags` là page-local taxonomy, khác nhau giữa các page.

### Message pages

Từ [page_001.json](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json):

- endpoint `messages` không chỉ trả `messages[]`, mà còn lặp lại:
  - `activities`
  - `customers`
  - `conv_recent_phone_numbers`
  - nhiều metadata conversation/customer khác
- `messages` page là raw source page, không phải persisted fact unit.
- fact unit thực sự của Seam 1 vẫn là `message`.

### Page customers

Từ [page_001.json](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/pages/page_customers/page_001.json):

- có record có `thread_id = null`
- có `phone_numbers`, `psid`, `inserted_at`, `updated_at`
- dữ liệu này phù hợp làm enrichment side table
- không phù hợp làm trục chính cho daily extract

### Tags

Từ [tags.json](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/pages/tags.json):

- có thể xuất hiện tag như:
  - `KH mới`
  - `KH TÁI KHÁM`
  - `ĐÃ CHỐT HẸN`
  - khu vực
  - độ tuổi/nhóm đối tượng
  - tên nhân viên phụ trách
- vì mỗi page dùng tag khác nhau nên tag phải được coi là `source evidence`, không phải taxonomy canonical.
- `GET /pages/{page_id}/tags` chỉ là page-level dictionary để resolve `tag_id -> text/meta`.
- dữ liệu thực sự đi vào unit phân tích là:
  - `tags` hiện có trên conversation
  - `tag_histories` của conversation
- Để giảm AI cost và hạn chế hallucination, cần một lớp `page tag mapping` do IT cấu hình:
  - map tag thô của từng page sang taxonomy chuẩn nội bộ
  - gắn role cho tag như `customer_type`, `need`, `branch`, `staff_label`, `noise`
  - chỉ khi conversation thiếu tag phù hợp hoặc tag chưa được map thì AI mới cần suy luận bổ sung

## Bất Biến Của Luồng Production

- Với mỗi run ngày `D`, canonical Seam 1 chỉ được persist:
  - `conversation-day` của ngày `D`
  - `message` có `inserted_at` thuộc ngày `D`
  - `observed tags/tag events` gắn với conversation-day của ngày `D`
- `customer = conversation thread`
- `inbox mới / inbox cũ` vẫn là deterministic theo lịch sử thread trên kênh chat
- `tái khám` là trục nghiệp vụ độc lập, và tags chỉ là một trong các evidence source
- `page_customer` không thuộc critical path của daily extract
- `assignee` không tham gia vào logic chuẩn hoá nghiệp vụ hiện tại

## Thiết Kế Extract Production

### Input của job

- `page_id`
- `business_day`
- `request_timeout`
- optional debug limits qua CLI flag hoặc job option, không phải production env bắt buộc

### Bước 1: lấy page token

- dùng `user_access_token`
- gọi API generate page access token

### Bước 2: lấy dictionary tag của page

- gọi `GET /pages/{page_id}/tags` một lần ở đầu run
- mục đích:
  - map `tag_id -> text/color/metadata`
  - resolve metadata cho tag thực sự xuất hiện trên conversation-day
  - không đưa toàn bộ tag dictionary của page vào unit phân tích hoặc prompt AI
  - join với `page tag mapping` đã được IT cấu hình, nếu có

### Bước 3: lấy conversation window của ngày D

- gọi `GET /pages/{page_id}/conversations`
- truyền `since/until` theo cửa sổ ngày `D`
- dùng endpoint này như conversation selector của ngày `D`, không coi đây là message selector
- paginate bằng `last_conversation_id`

Lưu ý:

- API spec mô tả endpoint này là danh sách conversation cập nhật gần nhất và có filter theo time range, nhưng không mô tả tuyệt đối rõ `since/until` bind vào trường thời gian nào.
- Vì vậy production design phải coi đây là `conversation selection window`, còn biên message của ngày `D` luôn phải được enforce ở phía mình.

### Bước 4: với mỗi conversation đã chọn, fetch message pages

- gọi `GET /pages/{page_id}/conversations/{conversation_id}/messages`
- paginate bằng `current_count`
- giả định vận hành từ sample là page đầu chứa message mới hơn, page sau chứa message cũ hơn
- với mỗi page:
  - parse tất cả `message.inserted_at`
  - giữ lại message có timestamp trong `[day_start, day_end]`
  - nếu toàn bộ message của page đều cũ hơn `day_start`, dừng paging conversation này
  - nếu page có cả message trong ngày và message cũ hơn `day_start`, giữ phần trong ngày rồi dừng
  - nếu page chỉ có message mới hơn `day_end`, tiếp tục paging

### Bước 5: quyết định conversation-day

- Nếu sau khi filter không còn message nào thuộc ngày `D`:
  - không tạo `conversation-day`
  - conversation đó chỉ được coi là source candidate bị loại
- Nếu còn ít nhất 1 message của ngày `D`:
  - tạo một `conversation-day` unit
  - gắn toàn bộ message-day đã filter
  - gắn tag state/tag history liên quan đến conversation
  - resolve tag metadata bằng page tag dictionary
  - giữ lại opening block raw nếu xuất hiện trong slice ngày đó

## Thiết Kế Transform Production

### Input cho transform

- `conversation head` từ conversation list
- `message-day subset` đã filter
- `page tag dictionary`

### Output slice tối thiểu

- `ConversationDaySource`
  - `page_id`
  - `conversation_id`
  - `business_day`
  - `conversation_inserted_at`
  - `conversation_updated_at`
  - `message_count_seen_from_source`
  - `recent_phone_candidates`
  - `current_tags`
  - `normalized_tag_signals`
  - `opening_block_observation_ids`
  - `first_meaningful_human_message_id`
  - `first_meaningful_human_sender_role`
- `MessageSource`
  - `message_id`
  - `conversation_id`
  - `inserted_at`
  - `sender_source_id`
  - `sender_name`
  - `sender_role`
  - `message_type`
  - `original_text`
  - `redacted_text`
  - `attachments`
  - `message_tags`
- `ObservedConversationTag`
  - current tag state của conversation ở thời điểm extract
- `ObservedConversationTagEvent`
  - tag history event nếu timestamp của event thuộc hoặc liên quan tới conversation-day đang xét
- `OpeningBlockObservation`
  - raw opening block messages/template/postback thuộc conversation-day
- `OpeningBlockSelection`
  - các lựa chọn đã parse được từ opening block như `customer_type`, `need`, `entry_flow`
- `RecentPhoneCandidate`
  - phone number do Pancake capture từ conversation payload

### Transform rule tối thiểu

- phân vai `sender_role`:
  - `customer`
  - `staff_via_pancake`
  - `third_party_bot`
  - `page_system_auto_message`
  - `unclassified_page_actor`
- chuẩn hoá `message_type`
- redact phone khỏi message text
- nhận diện `first_meaningful_human_message`
- đánh dấu `is_meaningful_human_message`
- trích riêng `opening_block_observation` khi match được opening signature theo page/channel
- nếu page chưa có opening signature, vẫn phải tạo `opening_candidate_window` gồm các message từ đầu slice tới trước `first_meaningful_human_message`
- apply `page tag mapping` để sinh deterministic normalized signals trước khi giao cho AI
- giữ `tags` như source evidence để Seam 2 đọc cùng conversation-day/message-day
- không dùng tag để rewrite taxonomy canonical

## Rule Phân Loại Actor

Không có một field duy nhất đủ để phân biệt chắc chắn mọi loại actor. Rule nên chạy theo thứ tự:

1. `customer`

- `from.id != page_id`
- thường là PSID/customer id
- ví dụ customer message ở:
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L98](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L98)

2. `staff_via_pancake`

- `from.id == page_id`
- có `admin_name` là người thật
- không match `bot_signatures`
- `uid` chỉ là tín hiệu phụ, không phải điều kiện bắt buộc
- kể cả message được gửi bằng template/attachment của nhân viên thì vẫn thuộc `staff_via_pancake`
- ví dụ:
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L426](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L426)
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L886](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L886)

3. `third_party_bot`

- `from.id == page_id`
- có `admin_name` của bot hoặc app tích hợp như `Botcake`
- có thêm bot/app markers trong attachments payload hoặc app fields
- ví dụ:
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L158](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L158)
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L133](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L133)

4. `page_system_auto_message`

- `from.id == page_id`
- `ai_generated = false` cũng vẫn có thể xảy ra
- không có `admin_name` người thật
- không match `staff_via_pancake`
- không match `third_party_bot`
- nội dung là auto greeting/system notice của page/platform
- ví dụ:
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L402](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L402)
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L418](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L418)
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L875](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L875)
  - [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L891](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26430154116582971/page_001.json#L891)

5. `unclassified_page_actor`

- mọi message còn lại từ phía page nhưng không match rule trên
- sẽ cần fallback qua `bot_signatures`, content heuristics, hoặc review sau
- đây là bucket phòng thủ nội bộ cho parser, không phải taxonomy business-facing

## Quy Tắc Lọc Để Tìm `first_meaningful_human_message`

Message bị loại khỏi candidate mở đầu nếu rơi vào một trong các nhóm sau:

- bot/system message theo `bot_signatures`
- auto greeting hoặc quick-reply system text
- message rỗng chỉ có wrapper HTML
- sticker/reaction only
- template/attachment-only không có customer intent thực sự

Message đầu tiên còn lại từ phía con người trong ngày `D` sẽ trở thành `first_meaningful_human_message`.

Lưu ý:

- message này có thể đến từ `customer`
- hoặc từ `staff` nếu nhân viên là người mở đầu slice ngày đó bằng một tin nhắn có ý nghĩa như nhắc lịch hẹn
- chatbot/system không được tính là `first_meaningful_human_message`

## Page-Specific Opening Flow Signature

Sample ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L89](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L89)

cho thấy một opening flow rất cụ thể của page này:

1. khách gửi postback khởi động như `Bắt đầu`
2. `Botcake` gửi welcome template với lựa chọn `Khách hàng lần đầu` / `Khách hàng tái khám`
3. khách chọn option
4. `Botcake` gửi tiếp template theo nhánh đã chọn
5. khách chọn tiếp nhánh như `Đặt lịch hẹn`
6. `Botcake` gửi hướng dẫn có cấu trúc
7. sau đó mới tới free-text thực sự của khách ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L404](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L404)

8. rồi nhân viên thật mới vào cuộc ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L443](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26456821540601695/page_001.json#L443)

Ý nghĩa thiết kế:

- chuỗi mở đầu kiểu này không được coi là luật chung cho mọi page
- đây là `page-specific opening signature`
- cần cấu hình qua UI IT trong bảng signature riêng theo `page/channel`
- extractor/transform phải loại được các postback/template/hướng dẫn bot trong opening flow trước khi chọn `first_meaningful_human_message`
- opening block không được vứt bỏ; phải lưu lại thành `OpeningBlockObservation` và nếu parse được thì tạo `OpeningBlockSelection`
- `OpeningBlockSelection` là structured evidence có giá trị cho downstream vì nó có thể chứa loại khách và nhu cầu
- với page này, `Bắt đầu`, `Khách hàng lần đầu`, `Đặt lịch hẹn` không nên được coi là `first_meaningful_human_message`
- với page mới chưa có config, hệ thống vẫn chạy bằng fallback:
  - dùng `first_meaningful_human_message` để cắt mốc
  - phần trước mốc trở thành `opening_candidate_window`
  - lưu raw để IT fine-tune mapping sau

## Vai Trò Của Tags Trong Seam 1 Và Seam 2

- Tags là source evidence page-local.
- Page tag dictionary chỉ dùng để resolve tên và metadata cho tag.
- `page tag mapping` là lớp cấu hình nội bộ do IT quản lý để map tag thô sang taxonomy chuẩn.
- Tags được gắn vào `conversation-day` và các `message` thuộc khối conversation-day đó.
- Các tags hiện hữu trong ngày `D` và các tag event liên quan sẽ được chuyển sang Seam 2 để AI đọc cùng transcript của ngày `D`.
- Nếu `page tag mapping` đã map được tag sang signal chuẩn, AI phải ưu tiên dùng signal đó thay vì tự suy luận lại.
- Tags không phải source of truth cho:
  - `inbox mới / inbox cũ`
  - `tái khám`
  - `closing_outcome`
- Nhưng tags có thể là evidence phụ trợ rất mạnh cho Seam 2 khi suy luận.
- Chỉ các conversation thiếu tag phù hợp hoặc chưa có mapping mới cần AI suy luận thêm từ context khác.

## UI Cấu Hình Cho IT

### Page Onboarding Wizard

- mục tiêu: cho phép IT add page mới mà không cần biết trước opening flow hay tag mapping chi tiết
- input tối thiểu IT phải cung cấp:
  - `organization`
  - `Pancake user access token`
  - chọn `page` từ danh sách page hệ thống fetch được
  - `business timezone`
- input tuỳ chọn:
  - ghi chú nội bộ
  - owner vận hành của page
- input runtime bắt buộc cho run đầu:
  - `initial_conversation_limit`
- run đầu tiên phải là `onboarding sample extract`:
  - chỉ lấy tối đa số conversation theo `initial_conversation_limit`
  - nhưng với mỗi conversation đã chọn vẫn phải lấy toàn bộ message thuộc ngày `D`
  - output của run này chỉ phục vụ fine-tune và pilot, chưa được coi là dashboard official
- hệ thống phải tự làm:
  - `list pages`
  - generate page token
  - test fetch conversations/messages/tags
  - sinh tag dictionary
  - sinh `opening_candidate_window` phổ biến nhất
  - sinh sample `conversation-day` để fine-tune và pilot
- nguyên tắc:
  - add page không được phụ thuộc vào việc IT đã hiểu opening block
  - UI mapping là fine-tune layer sau khi có data thật
  - page mới phải khởi tạo với `Auto Scraper = OFF` và `Auto AI Analysis = OFF`
  - sau khi fine-tune, IT mới quyết định:
    - `Run Pilot AI` trên sample
    - bật `Auto Scraper`
    - bật `Auto AI Analysis`

### Scheduler Controls

- `Auto Scraper`
  - bật/tắt scheduler extract hằng ngày theo từng page
  - khi tắt, manual extract/backfill vẫn được phép
- `Auto AI Analysis`
  - bật/tắt scheduler AI theo từng page
  - chỉ được enqueue khi đã có `final seam 1 snapshot` tương ứng
  - khi tắt, pilot AI hoặc manual rerun AI vẫn được phép
- tắt `Auto Scraper` thì scheduler AI của ngày mới không có đầu vào để chạy

### Tag Taxonomy Mapper

- cấu hình theo từng `page/channel`
- hiển thị tag dictionary thật của page
- cho phép map tag thô sang taxonomy chuẩn nội bộ
- cho phép gắn role như `customer_type`, `need`, `branch`, `staff_label`, `noise`
- có preview conversation thật đang mang tag đó
- có version và `effective_from/effective_to`

### Opening Flow Mapper

- cấu hình theo từng `page/channel`
- khai báo opening signatures, postback/template markers, payload patterns
- map raw opening choices sang các trường chuẩn hoá như:
  - `customer_type`
  - `need`
  - `entry_flow`
- có danh sách opening block chưa match để IT review
- với page mới chưa có config, UI phải gom các `opening_candidate_window` phổ biến nhất để IT map dần; không yêu cầu cấu hình trước khi pipeline chạy

## Carry-Forward Context Cho Seam 2

- Unit phân tích chính của AI vẫn là `conversation-day`.
- Tuy nhiên AI không nên nhìn riêng khối message ngày `D` một cách mù ngữ cảnh.
- Vì vậy Seam 2 phải duy trì `conversation_state_summary` cho từng conversation.

### Cách dùng

- Trước khi phân tích ngày `D`, AI đọc:
  - `conversation_state_summary` đã publish gần nhất của cùng `conversation_id`
  - `message-day + observed tags/tag events` của ngày `D`
  - normalized tag signals từ `page tag mapping`, nếu có
  - opening block selections đã parse được, nếu có
- Sau khi phân tích xong ngày `D`, AI ghi:
  - `ai_result` cho `conversation-day`
  - `conversation_state_summary` mới dạng `as-of-day D`

### Nội dung summary tối thiểu

- `latest_customer_goal`
- `care_stage`
- `appointment_state`
- `known_constraints`
- `open_questions`
- `unresolved_objections`
- `risk_flags_open`
- `last_known_sentiment`
- `promised_follow_up`

### Rule versioning

- `conversation_state_summary` là derived state của Seam 2, không phải canonical seam 1
- summary chain phải bám cùng `analysis baseline`
- không được trộn summary chain giữa prompt/model baseline khác nhau nếu chưa backfill hoặc republish đồng bộ

### Rule ưu tiên evidence

- AI phải ưu tiên dùng evidence đã có cấu trúc trước:
  - opening block selections
  - normalized tag signals
  - previous conversation state summary
- chỉ suy luận thêm từ transcript khi các lớp evidence trên còn thiếu hoặc chưa bao phủ

## Những Gì Không Thuộc Daily Critical Path

- `page_customers` full sync
- CRM mapping
- assignee statistics
- sample writer/raw JSON dump

Các phần này nếu cần sẽ là enrichment hoặc tooling riêng, không được chen vào daily extract path chính.

## Cleanup Hướng Đến

Sau khi tài liệu này được duyệt, phần code probing hiện tại trong `go-worker` nên được dọn như sau:

- bỏ `internal/samples`
- bỏ logic ghi raw payload ra `docs/pancake-api-samples/`
- bỏ README mô tả extractor dạng sample-run
- refactor `main.go` thành production runner mỏng
- tách package `internal/extract`
- tách package `internal/transform`
- giữ `docs/pancake-api-samples/` như artifact tham khảo tĩnh, không còn là output mặc định của worker

## Quyết Định Chốt

- Sample payload vẫn giữ lại ở `docs/pancake-api-samples/` để audit.
- Worker production path sẽ không còn chức năng chọc raw payload rồi dump sample.
- Daily scraper path chính là:
  - select conversation window của ngày `D`
  - fetch message pages
  - filter message-day ở phía worker
  - build `conversation-day + message-day + observed tags`
  - bàn giao sang bước load seam 1 và downstream AI seam 2, nơi AI đọc thêm `conversation_state_summary` gần nhất để carry context qua ngày sau
