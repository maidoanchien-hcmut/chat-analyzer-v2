# Tài liệu yêu cầu thiết kế UI và các tính năng của hệ thống

## Bộ lọc hệ thống (System-wide filters)

Cái này phải persist trên tất cả các view.

Lựa chọn lọc cho tất cả các view của hệ thống: 1 lần chỉ xem được thông tin của 1 trang (trang pancake). Ngoại trừ view so sánh các trang.

**Slice:** Cho phép chọn khoảng ngày để xem dữ liệu. Mặc định là 01 ngày - hôm qua vì hệ thống chạy ở cuối ngày. Nhưng vẫn cho phép chọn khoảng rộng hơn theo preset 1 ngày, 1 tuần, 1 tháng, 1 quý. Hoặc custom range chọn lịch nhưng phải giới hạn đến ngày hôm qua.

Khi slice phủ nhiều ngày, mọi danh sách chính trong UI phải hiểu ở grain `thread`, không phải `conversation-day`. `conversation-day` chỉ dùng cho lịch sử theo ngày, breakdown và join kết quả phân tích bên dưới từng thread.

## View landing/dashboard

**Dice:** Cho phép lọc các dữ liệu được phân tích: Ví dụ: Tâm trạng tốt. Có thể dice nhiều hơn, ví dụ tâm trạng tốt + khách tái khám.

Tất cả những thông số trong này đều phải nằm trong khoảng dữ liệu đã lọc (toàn hệ thống+ lọc của view)

Các KPI scorecard:

- Tổng số inbox, số inbox mới
- Số khách tái khám theo định nghĩa
- Số khách có tâm trạng tốt
- Số lượng rủi ro (nếu có)
- Tổng số tin nhắn
- Tổng chi phí AI
- Tỷ lệ chuyển đổi: số khách đặt hẹn thành công / số khách có nhu cầu đặt hẹn.

- Một danh sách tổng hợp ngắn gọn các thread mới nhất trong bộ lọc đã chọn. Mỗi thread hiển thị thông tin cơ bản của conversation-day gần nhất của thread đó như: tên khách, nhu cầu gần nhất, thời gian của tin nhắn mới nhất. Bấm vào sẽ dẫn tới view lịch sử trò chuyện của thread đó.

**Breakdown:** Một khu vực hiển thị phân phối theo các chỉ số phân tích. Ví dụ: Phân phối số lượng thread theo nhu cầu trong khoảng dữ liệu được lọc.

## View chi tiết (exploratory view)

View này cho phép self-service BI.

Người dùng có thể tự thực hiện các thao tác BI: drill-down, drill-through, pivot, crosstab, comparision, v.v... trên dữ liệu đã được phân tích. View này có thể có

Ngoài ra có thêm các bộ lọc nâng cao như: các thread có nhiều hơn `n` tin nhắn, lọc theo từ khoá, tên khách hàng, v.v... Sắp xếp theo chi phí AI, số lượng tin nhắn, thời gian bắt đầu, v.v...

## View lịch sử trò chuyện

**Dice:** Cho phép lọc các dữ liệu được phân tích: Ví dụ: Tâm trạng tốt. Có thể dice nhiều hơn, ví dụ tâm trạng tốt + khách tái khám.

Giao diện hiển thị như 1 app nhắn tin: danh sách các thread bên trái, view chi tiết bên phải. Danh sách bên trái, mỗi thread có tên khách, thời gian tin nhắn gần nhất.

Ngay trên view bên phải mỗi thread có tên khách, tổng số tin nhắn, tổng chi phí AI.

Mặc định view bên phải là lịch sử trò chuyện từ trước đến nay của 1 thread, bao gồm tất cả tin nhắn của tất cả conversation-day. Mỗi tin nhắn có nội dung + thời gian gửi, tin nhắn tới từ phía trang phải có tên người gửi.

Mỗi thread đã chọn cho phép chuyển view để xem lịch sử chi phí, lịch sử kết quả phân tích, ví dụ: ngày dd/mm/yyyy, có bao nhiêu tin nhắn, chi phí AI ngày đó là bao nhiêu, kết quả phân tích ngày đó là gì (ví dụ: tâm trạng tốt hay xấu, nhu cầu là gì, có rủi ro nào không, v.v...)

## View tổng hợp so sánh các trang

Hiển thị thông số tổng cộng của tất cả các trang đang chạy trên hệ thống.
Chứa nhiều biểu đồ: ví dụ: xu hướng tâm trạng khách hàng theo thời gian của từng trang, hoặc so sánh tỷ lệ chuyển đổi giữa các trang.

## View cài đặt và vận hành

Mặc định sẽ hiển thị các thông số trạng thái và config của trang đang xem trên toàn hệ thống.

- Các config hiện tại là opening block, prompt, phân loại tag, v.v..
- Xem được trạng thái của go-worker, của llm-service, lịch sử chạy end-to-end (thời gian trích xuất, thời gian phân tích, chi phí), log, v.v...
- Lịch sử chạy phải xem theo `run_group_id`. Nếu một yêu cầu materialize thành nhiều run con theo ngày thì UI vẫn coi đó là một run ở góc nhìn người dùng.
- Cho phép chỉnh sửa model và execution profile của từng capability AI; UI không được gắn chặt vào tên framework trừ màn diagnostic kỹ thuật.
- Cho phép cài đặt tài khoản telegram nhận thông báo.
- Cho phép tắt trang (tắt phân tích dữ liệu, hoặc tắt cả fetch dữ liệu)
- Cho thấy các thông số và config của trang đó.
- Cho phép chỉnh lại các thông số như lúc thêm trang.
- Cho phép chạy trích xuất và phân tích tuỳ chỉnh. Những run này vẫn lưu vào db theo kiểu upsert. Ví dụ: hôm nay là giữa ngày 03/04, tôi chạy phân tích khoảng thời gian `20:00 ngày 01/04 - 10:00 ngày 03/04`. Hệ thống phải tự materialize thành các run như mô tả trong design, các run này là tạo mới, và lưu vào db. Những dữ liệu này có thể upsert vào ngày cũ hoặc thêm mới tuỳ theo khoảng thời gian chạy. Tới cuối ngày hệ thống chạy sẽ upsert lại phần của ngày hôm nay.
- Về publish, trong một custom range nếu có child run nào phủ trọn 1 ngày canonical và chạy end-to-end có analysis thì child run đó vẫn phải được publish cho ngày đó. Ví dụ range `20:00 ngày 01/04 - 10:00 ngày 03/04` thì phần `02/04` là full-day nên được publish nếu chạy xong; phần `01/04` và `03/04` vẫn chỉ là partial-day.
- Khi người dùng mở chi tiết một run, UI phải hiểu run đó là toàn bộ `thread` thuộc `run_group_id` đã chọn. Nếu group có nhiều run con và một thread xuất hiện ở nhiều `conversation_day`, danh sách vẫn chỉ hiện 1 dòng thread; bấm vào thread thì mới xem lịch sử message và lịch sử phân tích theo ngày.
- Cho phép chạy mapping customer với crm để nối thread với khách hàng.

## Flow thêm trang

1. Nhập user access token.
2. Bấm nút để list trang.
3. Hệ thống hiển thị danh sách trang để chọn.
4. Chọn trang.
5. Chọn số N conversation initial.
6. Bấm lấy thông tin.
7. Hệ thống chạy fetch conversation + message và lấy về các giá trị cần chỉnh phục vụ cho tự động hoá sau này. Khoảng dữ liệu lấy là từ 0h ngày bấm chạy đến thời điểm chạy. Lấy N conversation và tất cả message của ngày đó, khoảng `[0:00 - now)`. Những dữ liệu này là runtime để config, không lưu vào db.
8. Dev chỉnh các thông số và prompt, tối thiểu có 2 thứ:
   8.1. Tag classification phải có giao diện dễ dùng, cho phép thêm phân loại tag (staff_name, customer_type, location, etc.), cho phép map giá trị tag vào mỗi kiểu, một tag chỉ được thuộc 1 kiểu. Giao diện phải cho phép map nhanh chóng, dễ dàng. Phải có cách chuẩn hoá hoặc validate. Ví dụ: không thể để phân loại tag vô nghĩa như là 'abcd' được.
   8.2. Prompt phải có sẵn placeholder dùng như thật. Có tính năng clone lại prompt cũ, prompt của các trang khác để chỉnh sửa nhanh. Có tính năng test prompt với dữ liệu runtime đã lấy ở bước 7, xem kết quả structured output theo schema đã pin ngay trên giao diện để chỉnh sửa thêm.
9. Chạy analysis trên mẫu dữ liệu nhỏ này để xem kết quả của AI và tinh chỉnh thêm thông số. Hoặc bấm thêm trang, hệ thống sẽ thêm trang vào db, lưu tất cả những thứ cần thiết và đưa trang vào vận hành.
10. Hiện đã thêm thành công.
