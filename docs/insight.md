## Insights

Đây là phần quan trọng nhất, hệ thống có thể làm đủ thứ nhưng phải trả lời được các câu hỏi này một cách rõ ràng, chính xác.

Là một thành viên BoD, tôi muốn biết mỗi ngày:

- Bao nhiêu inbox mới? Các inbox mới đó thường bắt đầu với nội dung gì? + tỷ lệ các nội dung? Dịch vụ các inbox mới quan tâm trong đoạn hội thoại? Kết quả chốt?
- Bao nhiêu inbox tái khám? Mỗi inbox tái khám thường bắt đầu bằng nội dung gì + tỷ lệ?
- Nguồn khách: Khách đến từ Post ID nào hoặc từ quảng cáo nào (Ads).
- Tôi muốn thống kê hiện trạng trước => ưu tiên cải tiến các kịch bản cho các vấn đề khách hàng quan tâm nhất.

Tôi muốn AI tự động phân tích mỗi hội thoại:

- Tâm trạng khách hàng
- Nhu cầu chính, chủ đề quan tâm
- Phân loại kh mới/ tái khám
- Trạng thái chốt đơn/hẹn
- Hệ thống phát hiện rủi ro dựa trên quy trình làm việc.
- Dùng LLM để đưa ra đánh giá trực quan về chất lượng phản hồi của từng nhân viên, chỉ ra lỗi ở đâu, và gợi ý cải thiện. Không dùng để đổ trách nhiệm.

Tôi muốn thống kê hiện trạng để ưu tiên cải tiến các kịch bản và quy trình cho các vấn đề khách hàng quan tâm nhất.

Khi AI đánh giá, phải biết nó đang đánh giá cái gì, dựa trên những dữ liệu nào, và có thể giải thích được kết quả đánh giá. Không phải black box.

Hệ thống phải xuất được file .xlsx báo cáo chuyên nghiệp, không phải raw data như json hay các raw name (e.g. `customer_type`).

## Yêu cầu kỹ thuật

- Hệ thống phải đảm bảo phục vụ được nhu cầu trong [ui-flows](./ui-flows.md).
- Thiết kế datawarehouse vận dụng hết khả năng của postgres17, có thể sử dụng các tính năng mới nhất của postgres17 để tối ưu hiệu suất và khả năng mở rộng.
- Tách biệt 2 luồng rõ ràng là lưu trữ dữ liệu đã được chuẩn hoá và phân tích dữ liệu bằng AI, để có thể tối ưu hiệu suất và khả năng mở rộng của từng phần, đồng thời đảm bảo tính linh hoạt trong việc thay đổi hoặc nâng cấp từng phần mà không ảnh hưởng đến phần còn lại.
- Không nhúng AI vào pipeline lưu trữ dữ liệu.
- Liên kết được dữ liệu hội thoại sau transform với khách trong hệ thống app crm nội bộ.
- **Notes:** Phần liên kết này, module trích xuất chỉ có thể liên kết nếu conversation đó có duy nhất 1 số điện thoại, nếu có nhiều hơn thì nên sử dụng 1 luồng AI để reason dựa trên tên khách. Hoặc nội dung trong chat.
- Có khả năng linh hoạt trong những tình huống hệ thống mất ổn định và service chết, có thể đảm bảo tính toàn vẹn của dữ liệu và khả năng khôi phục nhanh chóng.
- Có snapshot theo ngày để có thể dễ dàng theo dõi và phân tích dữ liệu theo thời gian, đồng thời có thể khôi phục dữ liệu về một thời điểm cụ thể nếu cần thiết.

## Nguyên tắc bất biến

- Hệ thống có 2 phần tách biệt:
  - Pipeline ETL lưu trữ dữ liệu đã được chuẩn hoá và tính toán các chỉ số deterministic, không dùng AI.
  - Phần phân tích dữ liệu không thể dùng toán học để tính toán được, sẽ dùng AI để phân tích và đưa ra kết quả.
