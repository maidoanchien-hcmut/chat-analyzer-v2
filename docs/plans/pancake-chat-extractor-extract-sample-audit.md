# Observed Pancake API Payload

- thiết kế hiện tại ở [design.md](D:/Code/chat-analyzer-v2/docs/design.md)
- payload sample thật trong [pancake-api-samples](D:/Code/chat-analyzer-v2/docs/pancake-api-samples)
- giới hạn thực tế của Pancake API trong [official-pancake-api.yaml](D:/Code/chat-analyzer-v2/docs/official-pancake-api.yaml)

## Provenance Của Sample

- [20260401T042009Z](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z)

- Nguyên nhân vận hành cần rút ra là: extractor có thể bị ngắt giữa chừng khi paging message quá sâu. Luồng production không được phụ thuộc vào kiểu scrape thăm dò như vậy nữa.

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
- `GET /pages/{page_id}/tags` là page-level dictionary để resolve nội dung tag có ý nghĩa gì cho page đó
- dữ liệu thực sự đi vào unit phân tích là:
  - `tags` hiện có trên conversation
- Để giảm AI cost và hạn chế hallucination, cần một lớp `page tag mapping` do IT cấu hình:
  - gắn role cho tag như `customer_type`, `need`, `branch`, `staff_label`, `noise`, etc.
  - chỉ khi conversation thiếu tag phù hợp hoặc tag chưa được map thì AI mới cần suy luận bổ sung

Chi tiết cột và matrix canonical nằm ở [system-schema-matrix.md](D:/Code/chat-analyzer-v2/docs/system-schema-matrix.md).

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
- không match bot/system heuristics
- `uid` chỉ là tín hiệu phụ, không phải điều kiện bắt buộc
- kể cả message được gửi bằng template/attachment của nhân viên thì vẫn thuộc `staff_via_pancake`
- ví dụ:
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
- sẽ cần fallback qua content heuristics hoặc review sau
- đây là bucket phòng thủ nội bộ cho parser, không phải taxonomy business-facing

## Quy Tắc Lọc Để Tìm `first_meaningful_human_message`

Message bị loại khỏi candidate mở đầu nếu rơi vào một trong các nhóm sau:

- bot/system message theo sender/app/flow markers và message structure heuristics
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

- chuỗi mở đầu kiểu này không được coi là luật chung.
- extractor/transform phải loại được các postback/template/hướng dẫn bot trong opening flow trước khi chọn `first_meaningful_human_message`
- opening block không được vứt bỏ; phải được giữ lại trong `opening_blocks` và nếu parse được thì embed structured selection tương ứng vào cùng payload đó
- structured opening selection là evidence có giá trị cho downstream vì nó có thể chứa loại khách và nhu cầu
- với page này, `Bắt đầu`, `Khách hàng lần đầu`, `Đặt lịch hẹn` không nên được coi là `first_meaningful_human_message`
- với page mới chưa có config, hệ thống vẫn chạy bằng fallback:
  - dùng `first_meaningful_human_message` để cắt mốc
  - phần trước mốc trở thành `opening_candidate_window`
  - lưu raw để IT fine-tune mapping sau

## Page-Specific Ads Interaction Opening Flow Signature

- Sample ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L74](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L74)

cho thấy một opening flow khi khách bấm vào một quảng cáo rất cụ thể của page này:

1. Trang gửi mẫu quảng cáo có message trống với attachment chứa metadata ads như `ad_id`, `click_from`, `type = ad_click`, v.v
2. Tin nhắn tự động hệ thống `page_system_auto_message` định nghĩa như ở trên
3. Thêm một tin nhắn chào mừng tự động nữa
4. sau đó mới tới free-text thực sự của khách ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L207](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L207)

8. rồi nhân viên thật mới vào cuộc ở:

- [D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L246](D:/Code/chat-analyzer-v2/docs/pancake-api-samples/20260401T042009Z/messages/1406535699642677_26088316064173805/page_001.json#L246)

Ý nghĩa thiết kế:

- Ở đây xác định được nguồn vào của khách. Và ad nào được click. Đây là thông tin rất quan trọng để phân tích hiệu quả của quảng cáo và hành vi khách hàng.

## Vai Trò Của Tags Trong Seam 1 Và Seam 2

- Tags là source evidence page-local.
- Tags được gắn vào `conversation-day` và các `message` thuộc khối conversation-day đó.
- Các tags hiện hữu trong ngày `D` và các tag event liên quan sẽ được chuyển sang Seam 2 để AI đọc cùng transcript của ngày `D`.
- Tags có thể là evidence phụ trợ rất mạnh cho Seam 2 khi suy luận.
- Nếu tag đã map được tag sang signal chuẩn, AI phải ưu tiên dùng signal đó thay vì tự suy luận lại.
- Chỉ các conversation thiếu tag phù hợp hoặc chưa có mapping mới cần AI suy luận thêm từ context khác.
