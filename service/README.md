# service

AI service nội bộ cho seam phân tích hội thoại.

Contract gRPC nằm ở [conversation_analysis.proto](D:/Code/chat-analyzer-v2/proto/conversation_analysis.proto). Tên entity tracked trong contract hiện dùng:

- `thread_day_id`
- `thread_id`
- `pipeline_run_id`
- `opening_block_json`
- `source_thread_json_redacted`
- `journey_code`
- `closing_outcome_inference_code`
- `staff_assessments_json`

Service hiện chạy heuristic runtime đơn giản để giữ contract ổn định trong dev environment; module này chưa phải runtime phân tích production-ready.

Chạy local:

```powershell
cd D:\Code\chat-analyzer-v2\service
uv sync
uv run python main.py
```
