# service

AI service nội bộ cho seam phân tích hội thoại.

Contract gRPC nằm ở [conversation_analysis.proto](D:/Code/chat-analyzer-v2/proto/conversation_analysis.proto). Tên entity tracked trong contract hiện dùng:

- `thread_day_id`
- `thread_id`
- `pipeline_run_id`
- `opening_block_json`
- `first_meaningful_message_text_redacted`
- `explicit_revisit_signal`
- `explicit_need_signal`
- `explicit_outcome_signal`
- `source_thread_json_redacted`
- `journey_code`
- `closing_outcome_inference_code`
- `staff_assessments_json`

Service hiện dùng runtime owner-clean theo cấu trúc `pydantic models -> executor -> transport`, với `system prompt` thuộc ownership của `service/`. Adapter mặc định vẫn là deterministic dev runtime vì provider/model thật chưa được pin trong repo, nhưng transport và validation đã fail-closed thay vì heuristic shim cũ.

Chạy local:

```powershell
cd D:\Code\chat-analyzer-v2\service
uv sync
uv run python main.py
```

Chạy test:

```powershell
cd D:\Code\chat-analyzer-v2\service
uv run pytest
```
