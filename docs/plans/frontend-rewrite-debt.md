# Frontend Rewrite Debt Register

Không chấp nhận debt kiểu bridge legacy renderer/state sang runtime mới.

## Open Items

- Export workflow hiện vẫn bị gắn vào `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `So sánh trang` và build file từ current view model. Theo source-of-truth cập nhật ngày 2026-04-04, export phải là workflow riêng với input tường minh `page + khoảng ngày`, không phụ thuộc view/filter đang xem.
