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

Service giữ owner-clean runtime theo cấu trúc `pydantic models -> executor -> provider adapter -> gRPC transport`.

## Runtime modes

Service có 2 runtime mode tường minh:

- `deterministic_dev`
  - chỉ dành cho local/dev/test
  - không giả làm live provider
  - không cần `provider_base_url`, `provider_api_key`, hoặc `provider_model`
  - model name resolve thành `deterministic-dev`
- `openai_compatible_live`
  - dùng provider HTTP OpenAI-compatible qua `/chat/completions`
  - fail-closed ngay lúc load config nếu thiếu `provider_name`, `provider_base_url`, `provider_api_key`, hoặc `provider_model`

Các field runtime metadata trả về cho backend gồm:

- `runtime_mode`
- `provider`
- `model_name`
- `system_prompt_version`
- `effective_prompt_hash`
- `effective_prompt_text`
- `taxonomy_version`
- `generation_config`

`effective_prompt_text` là input thật đi vào adapter ở cả deterministic path lẫn live path. Không có preview-specific adapter riêng trong `service/`.

Provider config là `service runtime env` thuần kỹ thuật. Không đưa `provider_name`, `provider_base_url`, `provider_api_key`, hoặc `provider_model` vào page onboarding, page config, hay page-local prompt boundary.

## Biến môi trường

```text
ANALYSIS_SERVICE_RUNTIME_MODE=deterministic_dev | openai_compatible_live
ANALYSIS_SERVICE_PROVIDER_NAME=deterministic_dev | openai_compatible
ANALYSIS_SERVICE_PROVIDER_BASE_URL=https://example.test/v1
ANALYSIS_SERVICE_PROVIDER_API_KEY=secret
ANALYSIS_SERVICE_PROVIDER_MODEL=gpt-live
ANALYSIS_SERVICE_REQUEST_TIMEOUT_SECONDS=60
ANALYSIS_SERVICE_GENERATION_TEMPERATURE=0
ANALYSIS_SERVICE_GENERATION_TOP_P=1
ANALYSIS_SERVICE_GENERATION_MAX_OUTPUT_TOKENS=1200
```

Xem [`.env.example`](D:/Code/chat-analyzer-v2/service/.env.example) để lấy template local. Khi chạy `openai_compatible_live`, `provider_name` hiện phải là `openai_compatible`.

## Chạy local

```powershell
cd D:\Code\chat-analyzer-v2\service
uv sync
uv run python main.py
```

Ví dụ deterministic dev:

```powershell
$env:ANALYSIS_SERVICE_RUNTIME_MODE='deterministic_dev'
uv run python main.py
```

Ví dụ live provider:

```powershell
$env:ANALYSIS_SERVICE_RUNTIME_MODE='openai_compatible_live'
$env:ANALYSIS_SERVICE_PROVIDER_NAME='openai_compatible'
$env:ANALYSIS_SERVICE_PROVIDER_BASE_URL='https://example.test/v1'
$env:ANALYSIS_SERVICE_PROVIDER_API_KEY='secret'
$env:ANALYSIS_SERVICE_PROVIDER_MODEL='gpt-live'
uv run python main.py
```

Nếu thiếu bất kỳ field live nào ở ví dụ trên, `load_config()` sẽ raise lỗi và service không được phép khởi động theo live mode.

## Chạy test

```powershell
cd D:\Code\chat-analyzer-v2\service
uv run pytest
```
