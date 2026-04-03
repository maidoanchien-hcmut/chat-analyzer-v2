# System Schema Matrix

**Status:** source of truth for the database table set  
**Date:** 2026-04-03

Tài liệu này chốt schema matrix hợp nhất cho toàn bộ hệ thống theo hướng:

- ít bảng nhất có thể
- ít cột nhất có thể
- không duplicate dữ liệu nếu join được
- vẫn giữ đủ owner boundary, grain, publish semantics, audit và replay

Các matrix cũ ở:

- `seam1-control-plane-minimal-schema-matrix.md`
- `seam1-lean-schema-matrix.md`
- `seam2-analysis-schema-matrix.md`

được xem là **legacy draft** và chỉ dùng để học lại reasoning cũ. Không dùng chúng làm source of truth mới.

## Run Group Rule

- `run_group_id` là bắt buộc cho mọi run path, kể cả khi chỉ có đúng một run kỹ thuật.
- Ở góc nhìn UI/vận hành, "một run" chính là một `run_group_id`.
- `etl_run.id` và `analysis_run.id` chỉ là child run kỹ thuật bên dưới group đó.
- Với custom range, một `run_group_id` có thể chứa nhiều child run theo từng `target_date`.
- Với scheduled daily hoặc single-run diagnostic, `run_group_id` vẫn phải tồn tại nhưng group đó chỉ có một child run.
- Nếu mapping chạy riêng, toàn bộ decision rows của batch đó cũng phải dùng cùng một `run_group_id`.

## Final Table Set

Hệ thống chốt 8 bảng vận hành lõi và 1 bảng riêng cho AI-assisted CRM mapping:

- `connected_page`
- `page_ai_profile_version`
- `etl_run`
- `conversation_day`
- `message`
- `thread_customer_mapping`
- `analysis_run`
- `analysis_result`
- `thread_customer_mapping_decision`

Giải thích điểm gộp:

- không có `thread_customer_mapping_run` riêng
- `analysis_run` chỉ owner conversation-analysis run
- `thread_customer_mapping_decision` vừa giữ batch/run metadata, vừa giữ decision rows cho mapping flow

## Global Invariants

- Repo này là single-company. Không thêm `organization_id`, `company_id`, `workspace_id`, hoặc ownership layer tương tự.
- `connected_page.id` là page owner nội bộ chuẩn; `pancake_page_id` là source identifier từ Pancake.
- ETL và analysis là hai seam tách biệt. ETL phải chạy độc lập để dữ liệu canonical luôn sẵn cho analysis về sau.
- Postgres là source of truth. Runtime state của framework không được dùng thay cho bảng owner.
- External contract giữa `backend/` và `service/` phải version hoá bằng Python `pydantic` v2 models.
- `conversation analysis` có grain chính thức là `1 conversation_day = 1 unit = 1 analysis_result`.
- `AI-assisted CRM mapping` có grain chính thức là `1 thread = 1 decision row`.
- `thread_customer_mapping` chỉ giữ current state. History quyết định nằm ở `thread_customer_mapping_decision`.
- `analysis_result` không piggyback CRM mapping.
- Mapping flow có thể chạy độc lập mà không cần tạo `analysis_run`.
- Dữ liệu chưa ổn định hoặc page-local nên ưu tiên `jsonb` thay vì nổ thêm bảng.

## Table Summary

| Bảng | Grain | Owner | Ghi chú |
| --- | --- | --- | --- |
| `connected_page` | 1 row / page | Control-plane config | Page config, active profile map, tag/opening config |
| `page_ai_profile_version` | 1 row / page / capability / version | Versioned AI execution profile | Thay cho `page_prompt_version` |
| `etl_run` | 1 row / ETL child run | ETL audit + publish owner | Thuộc đúng một `run_group_id` |
| `conversation_day` | 1 row / conversation / day / ETL run | Canonical conversation slice | Evidence bundle owner của Seam 1 |
| `message` | 1 row / persisted message | Canonical transcript | Chỉ giữ message thuộc window của run |
| `thread_customer_mapping` | 1 row / page / thread current state | Current CRM mapping | Không giữ history |
| `analysis_run` | 1 row / conversation-analysis child run | Conversation-analysis run owner | Thuộc đúng một `run_group_id` |
| `analysis_result` | 1 row / conversation analysis unit | Conversation-analysis output | Chỉ cho `capability_key = conversation_analysis` |
| `thread_customer_mapping_decision` | 1 row / thread / run group | Mapping run-group + decision owner | Không có run table riêng |

## 1. `connected_page`

Owner:

- source of truth cho config vận hành theo page

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh nội bộ của page |
| `pancake_page_id` | `text` | Không | unique | ID page thật từ Pancake |
| `page_name` | `text` | Không | index | Tên page |
| `pancake_user_access_token` | `text` | Không |  | Access token dùng để sinh page access token |
| `business_timezone` | `text` | Không |  | Mặc định `Asia/Ho_Chi_Minh` |
| `etl_enabled` | `boolean` | Không | index | Bật tắt fetch/ETL scheduler |
| `analysis_enabled` | `boolean` | Không | index | Bật tắt AI scheduler |
| `active_ai_profiles_json` | `jsonb` | Không |  | Map capability -> active `page_ai_profile_version.id` |
| `active_tag_mapping_json` | `jsonb` | Không |  | Tag taxonomy active của page |
| `active_opening_rules_json` | `jsonb` | Không |  | Opening rules active của page |
| `notification_targets_json` | `jsonb` | Không |  | Telegram/email targets cho cảnh báo vận hành |
| `onboarding_state_json` | `jsonb` | Không |  | Runtime artifacts/candidates gần nhất của onboarding sample |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo page config |
| `updated_at` | `timestamptz` | Không | index | Thời điểm cập nhật gần nhất |

### JSON Shape Tối Thiểu

`active_ai_profiles_json`

- `conversation_analysis`: `<uuid>`
- `thread_customer_mapping`: `<uuid>`

`active_tag_mapping_json`

```json
{
  "version_no": 4,
  "updated_at": "2026-04-03T10:30:00+07:00",
  "default_signal": "null",
  "entries": [
    {
      "pancake_tag_id": "123",
      "raw_label": "KH mới",
      "signal": "customer_type"
    },
    {
      "pancake_tag_id": "124",
      "raw_label": "Tái khám",
      "signal": "customer_type"
    },
    {
      "pancake_tag_id": "210",
      "raw_label": "Đặt lịch",
      "signal": "need"
    },
    {
      "pancake_tag_id": "999",
      "raw_label": "Spam",
      "signal": "null"
    }
  ]
}
```

Rule:

- giữ nguyên văn tag của page
- không lưu `normalized_value`
- config này chỉ trả lời câu hỏi: tag đó đang mang loại tín hiệu gì
- extractor vẫn phải carry raw tag sang `conversation_day`, không được thay raw tag bằng giá trị chuẩn hoá tự nghĩ ra

`active_opening_rules_json`

```json
{
  "version_no": 3,
  "updated_at": "2026-04-03T10:30:00+07:00",
  "boundary": {
    "mode": "until_first_meaningful_human_message",
    "max_messages": 12
  },
  "selectors": [
    {
      "signal": "customer_type",
      "allowed_message_types": ["postback", "quick_reply_selection", "template"],
      "options": [
        {
          "raw_text": "Khách hàng lần đầu",
          "decision": "first_time"
        },
        {
          "raw_text": "Tái khám",
          "decision": "revisit"
        }
      ]
    },
    {
      "signal": "entry_flow",
      "allowed_message_types": ["postback", "quick_reply_selection", "template"],
      "options": [
        {
          "raw_text": "Đặt lịch hẹn",
          "decision": "book_appointment"
        },
        {
          "raw_text": "Chat tư vấn",
          "decision": "chat_consultation"
        },
        {
          "raw_text": "Gọi tư vấn",
          "decision": "call_consultation"
        }
      ]
    }
  ],
  "fallback": {
    "store_candidate_if_unmatched": true
  }
}
```

Rule:

- `boundary` chỉ xác định cắt opening block tới đâu
- `selectors` chỉ match các lựa chọn chuẩn trong opening block
- `raw_text` luôn được giữ nguyên để carry sang evidence
- `decision` chỉ dùng khi cần gắn cờ deterministic từ lựa chọn opening block, ví dụ `revisit`
- không dùng JSON này làm rule engine tổng quát
- không nhét `bot_signatures` vào đây

`notification_targets_json`

- `telegram_chat_ids`
- `email_recipients`
- `notify_on_new_tag`
- `notify_on_pipeline_failure`

### Vì Sao Không Tách Thêm Bảng

- tag mapping và opening rules còn page-local, thay đổi nhanh
- single-company nên chưa cần ownership layer khác
- `jsonb` đủ cho vận hành đầu tiên và giảm churn schema

## 2. `page_ai_profile_version`

Owner:

- versioned AI execution profile theo page và capability

Thay thế trực tiếp cho `page_prompt_version`.

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh profile version |
| `connected_page_id` | `uuid` | Không | FK, index | Profile thuộc page nào |
| `capability_key` | `text` | Không | index, unique với `connected_page_id + version_no` trong cùng capability | Gợi ý: `conversation_analysis`, `thread_customer_mapping` |
| `version_no` | `integer` | Không | unique trong `(connected_page_id, capability_key)` | Số version tăng dần |
| `profile_json` | `jsonb` | Không |  | Prompt template, model spec, generation config, output schema version, optional policy knobs |
| `notes` | `text` | Có |  | Ghi chú nội bộ |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo version |

### Rule

- Không cần `is_active` trên row.
- Row active được resolve qua `connected_page.active_ai_profiles_json`.
- `profile_json` là owner của:
  - prompt template
  - provider/model selection
  - generation config
  - output schema version
  - optional capability-specific policy

## 3. `etl_run`

Owner:

- ETL run state
- daily snapshot publish owner của Seam 1

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh ETL run |
| `connected_page_id` | `uuid` | Không | FK, index | Run thuộc page nào |
| `run_group_id` | `uuid` | Không | index | User-facing run owner; gom các child run của cùng một yêu cầu vận hành |
| `run_mode` | `text` | Không | index | `scheduled_daily`, `manual_range`, `backfill_day`, `onboarding_sample` |
| `processing_mode` | `text` | Không | index | `etl_only`, `etl_and_ai` |
| `target_date` | `date` | Không | index | Ngày local mà ETL build snapshot |
| `business_timezone` | `text` | Không |  | Freeze timezone dùng để cắt window |
| `requested_window_start_at` | `timestamptz` | Có |  | Window user/system yêu cầu |
| `requested_window_end_exclusive_at` | `timestamptz` | Có |  | Requested end-exclusive |
| `window_start_at` | `timestamptz` | Không |  | Window thực tế của run con |
| `window_end_exclusive_at` | `timestamptz` | Không |  | Effective end-exclusive |
| `snapshot_version` | `integer` | Không | unique trong `(connected_page_id, target_date)` | Version snapshot của ngày đó |
| `status` | `text` | Không | index | `queued`, `running`, `loaded`, `published`, `failed` |
| `is_published` | `boolean` | Không | partial unique published | Official snapshot hay không |
| `run_params_json` | `jsonb` | Không |  | Runtime params như onboarding limit, debug flags |
| `tag_dictionary_json` | `jsonb` | Không |  | Tag dictionary snapshot lúc extract |
| `metrics_json` | `jsonb` | Không |  | Metrics vận hành của run |
| `error_text` | `text` | Có |  | Lỗi tổng hợp nếu fail |
| `started_at` | `timestamptz` | Có | index | Thời điểm bắt đầu |
| `finished_at` | `timestamptz` | Có | index | Thời điểm kết thúc |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo row |

### Constraint Tối Thiểu

- unique (`connected_page_id`, `target_date`, `snapshot_version`)
- partial unique published trên (`connected_page_id`, `target_date`) với `is_published = true`
- index (`run_group_id`)
- index (`status`, `created_at`)

### Rule

- Mọi `etl_run` đều phải có `run_group_id`.
- Single-run scheduled cũng phải có group riêng.
- Manual/custom range tạo nhiều `etl_run` cùng `run_group_id`.
- Với manual/custom range, child run nào phủ trọn canonical full-day bucket của `target_date` thì có thể `is_published = true`; child run partial-day phải giữ `is_published = false`.

## 4. `conversation_day`

Owner:

- canonical conversation slice theo ngày
- evidence bundle owner của Seam 1

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh slice |
| `etl_run_id` | `uuid` | Không | FK, unique với `conversation_id` trong cùng run | Slice thuộc run nào |
| `conversation_id` | `text` | Không | index | Thread ID từ source |
| `thread_first_seen_at` | `timestamptz` | Có | index | Mốc deterministic dùng để suy ra inbox mới/cũ |
| `conversation_updated_at` | `timestamptz` | Có |  | Source fact của thread |
| `customer_display_name` | `text` | Có | index | Tên hiển thị giữ nguyên văn từ source |
| `message_count_persisted` | `integer` | Không |  | Số message thực sự được persist trong day slice |
| `message_count_seen_from_source` | `integer` | Không |  | Số message worker nhìn thấy khi fetch |
| `normalized_phone_candidates_json` | `jsonb` | Không |  | Phone đã normalize + dedupe |
| `observed_tags_json` | `jsonb` | Không |  | Tập tag thực sự quan sát được trên conversation-day |
| `normalized_tag_signals_json` | `jsonb` | Không |  | Tín hiệu deterministic từ tag mapping |
| `opening_blocks_json` | `jsonb` | Không |  | Parsed opening block + candidate window |
| `first_meaningful_human_message_id` | `text` | Có |  | Message mở đầu có ý nghĩa trong slice |
| `first_meaningful_human_sender_role` | `text` | Có |  | `customer` hoặc `staff_via_pancake` |
| `source_conversation_json_redacted` | `jsonb` | Không |  | Conversation head đã redact |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi row |

### Những Gì Đã Chủ Động Bỏ

- không giữ `observed_tag_events_json` riêng
- không giữ summary text lặp lại với `message`
- không giữ AI interpretation ở Seam 1

## 5. `message`

Owner:

- transcript canonical của Seam 1

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh nội bộ của message row |
| `conversation_day_id` | `uuid` | Không | FK, index | Thuộc slice nào |
| `message_id` | `text` | Không | unique với `conversation_day_id` | ID message từ source |
| `conversation_id` | `text` | Không | index | Thread cha, denormalize để query nhanh |
| `inserted_at` | `timestamptz` | Không | index | Timestamp source |
| `sender_source_id` | `text` | Có |  | Source actor ID |
| `sender_name` | `text` | Có |  | Tên hiển thị actor |
| `sender_role` | `text` | Không | index | `customer`, `staff_via_pancake`, `third_party_bot`, `page_system_auto_message`, ... |
| `source_message_type_raw` | `text` | Có |  | Message type nguyên gốc |
| `message_type` | `text` | Không | index | Canonical message type |
| `redacted_text` | `text` | Có |  | Text canonical duy nhất được phép persist |
| `attachments_json` | `jsonb` | Không |  | Attachment metadata |
| `is_meaningful_human_message` | `boolean` | Không | index | Cờ deterministic cho opening/reporting |
| `is_opening_block_message` | `boolean` | Không | index | Cờ deterministic cho opening context |
| `source_message_json_redacted` | `jsonb` | Không |  | Raw payload đã redact |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi row |

### Những Gì Đã Chủ Động Bỏ

- không giữ `original_text`
- không giữ `message_tags_json` riêng nếu chỉ phục vụ audit; shape đó đi vào `source_message_json_redacted`
- không duplicate `etl_run_id` vì đã suy ra qua `conversation_day`

## 6. `thread_customer_mapping`

Owner:

- current CRM mapping state của thread

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `connected_page_id` | `uuid` | Không | PK phần 1 | Page owner |
| `thread_id` | `text` | Không | PK phần 2 | Thread nguồn từ Pancake |
| `customer_id` | `text` | Không | index | Customer nội bộ hiện đang map |
| `mapping_method` | `text` | Không | index | `deterministic_single_phone`, `ai_auto_promoted`, `manual_override` |
| `mapping_confidence_score` | `numeric(5,4)` | Có |  | Confidence của mapping hiện hành nếu có |
| `mapped_phone_e164` | `text` | Có |  | Phone dùng để map nếu có |
| `source_decision_id` | `uuid` | Có | index | Ref tới `thread_customer_mapping_decision.id` nếu mapping đến từ AI/manual decision flow |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo mapping current state |
| `updated_at` | `timestamptz` | Không | index | Thời điểm update gần nhất |

### Rule

- Bảng này chỉ giữ current state.
- Không append history ở đây.
- Nếu thread chưa resolve được thì không tạo row current state.

## 7. `analysis_run`

Owner:

- run owner của conversation-analysis path

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh AI run |
| `connected_page_id` | `uuid` | Không | FK, index | Run thuộc page nào |
| `run_group_id` | `uuid` | Không | index | User-facing run owner; thường kế thừa từ ETL group tương ứng |
| `run_mode` | `text` | Không | index | `scheduled_daily`, `manual_day`, `manual_slice` |
| `source_etl_run_id` | `uuid` | Có | FK, index | ETL snapshot mà run này bám vào nếu có |
| `scope_ref_json` | `jsonb` | Có |  | Scope hẹp của manual slice nếu có |
| `job_status` | `text` | Không | index | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `run_outcome` | `text` | Không | index | `published_clean`, `published_with_unknowns`, `diagnostic_only`, `unpublished_failed` |
| `idempotency_key` | `text` | Có | unique | Chống duplicate run |
| `ai_profile_version_id` | `uuid` | Không | FK, index | Effective AI profile version đã dùng |
| `model_name` | `text` | Không | index | Model thực tế đã dùng |
| `output_schema_version` | `text` | Không | index | Version output schema thực tế |
| `runtime_snapshot_json` | `jsonb` | Không |  | Snapshot prompt/model/generation config/effective knobs |
| `attempt_count` | `integer` | Không |  | Retry count nằm trong cùng run |
| `unit_count_planned` | `integer` | Không |  | Tổng unit planned |
| `unit_count_succeeded` | `integer` | Không |  | Tổng unit succeeded |
| `unit_count_unknown` | `integer` | Không |  | Tổng unit có `analysis_result.result_status = 'unknown'`; không đếm các field riêng lẻ mang giá trị `unknown` |
| `unit_count_review_queue` | `integer` | Không |  | Tổng unit phải vào review queue |
| `total_usage_json` | `jsonb` | Không |  | Token/usage aggregate của run |
| `total_cost_micros` | `bigint` | Không | index | Tổng chi phí AI normalized ở run grain |
| `created_by_user_id` | `integer` | Có | index | User tạo manual run |
| `started_at` | `timestamptz` | Có | index | Thời điểm bắt đầu |
| `finished_at` | `timestamptz` | Có | index | Thời điểm kết thúc |
| `published_at` | `timestamptz` | Có | index | Thời điểm official publish nếu capability cần publish |
| `created_at` | `timestamptz` | Không | index | Thời điểm tạo row |

### Constraint Tối Thiểu

- unique (`idempotency_key`) với `idempotency_key is not null`
- partial unique (`source_etl_run_id`) với `run_mode = 'scheduled_daily'` và `source_etl_run_id is not null`
- index (`run_group_id`)
- index (`connected_page_id`, `created_at desc`)

### Rule

- Bảng này chỉ phục vụ `conversation_analysis`.
- CRM mapping không dùng `analysis_run`.
- Mọi `analysis_run` đều phải có `run_group_id`.
- Nếu run này bám vào một `etl_run`, `analysis_run.run_group_id` phải bằng `etl_run.run_group_id`.
- Một UI `manual custom range` có thể materialize thành hỗn hợp:
  - `manual_day` cho child full-day có thể publish
  - `manual_slice` cho child partial-day chỉ diagnostic

## 8. `analysis_result`

Owner:

- output table của `conversation_analysis`

Logical rule:

- mọi row trong bảng này đều là output của `conversation_analysis`

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh result row |
| `analysis_run_id` | `uuid` | Không | FK, index | Run đã sinh row |
| `conversation_day_id` | `uuid` | Có | index | Ref tới Seam 1 unit |
| `custom_scope_json` | `jsonb` | Có |  | Scope hẹp của manual slice nếu không có `conversation_day_id` |
| `publish_state` | `text` | Không | index | `staged`, `published`, `superseded`, `diagnostic` |
| `result_status` | `text` | Không | index | `succeeded`, `unknown` |
| `prompt_hash` | `text` | Không | index | Hash của compiled prompt |
| `opening_theme` | `text` | Không | index | Mở đầu hội thoại nói về gì |
| `customer_mood` | `text` | Không | index | Tâm trạng khách hàng |
| `primary_need` | `text` | Không | index | Nhu cầu/dịch vụ chính |
| `primary_topic` | `text` | Không | index | Chủ đề chính |
| `content_customer_type` | `text` | Không | index | Suy luận từ nội dung: `kh_moi`, `tai_kham`, `unknown`, ... |
| `closing_outcome_as_of_day` | `text` | Không | index | Kết quả chốt tính đến ngày đó |
| `response_quality_label` | `text` | Không | index | Nhãn coaching phía nhân viên |
| `process_risk_level` | `text` | Không | index | Mức rủi ro quy trình nổi bật nhất |
| `response_quality_issue_text` | `text` | Có |  | Vấn đề chính cần cải thiện |
| `response_quality_improvement_text` | `text` | Có |  | Gợi ý cải thiện chính |
| `process_risk_reason_text` | `text` | Có |  | Giải thích ngắn cho risk level |
| `usage_json` | `jsonb` | Không |  | Token/latency/usage ở unit grain |
| `cost_micros` | `bigint` | Không | index | Chi phí AI normalized ở unit grain |
| `failure_info_json` | `jsonb` | Có |  | Retry summary / unknown reason |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi row |
| `published_at` | `timestamptz` | Có | index | Thời điểm row trở thành published/diagnostic |

### Constraint Tối Thiểu

- unique (`analysis_run_id`, `conversation_day_id`) với `conversation_day_id is not null`
- partial unique (`conversation_day_id`) với `conversation_day_id is not null` và `publish_state = 'published'`
- index (`analysis_run_id`, `publish_state`)
- index (`content_customer_type`, `primary_need`, `process_risk_level`)

### Rule

- `result_status = 'succeeded'` nghĩa là unit đã trả structured output hợp lệ và pass validation, kể cả khi một số field riêng lẻ có giá trị `unknown`.
- `result_status = 'unknown'` chỉ dùng khi toàn bộ unit không tạo được output đáng tin cậy sau retry/repair/validation hợp lệ.
- Khi `result_status = 'unknown'`, `failure_info_json` phải giải thích nguyên nhân terminalization ở mức unit.

## 9. `thread_customer_mapping_decision`

Owner:

- owner duy nhất của mapping batch metadata và decision history cho AI-assisted CRM mapping

| Cột | Kiểu gợi ý | Null | Index / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | PK | Định danh decision row |
| `run_group_id` | `uuid` | Không | index | User-facing run owner; gom các row cùng một đợt chạy mapping |
| `connected_page_id` | `uuid` | Không | FK, index | Page owner của decision |
| `run_mode` | `text` | Không | index | `scheduled_mapping_cleanup`, `manual_review_batch`, `manual_mapping_slice` |
| `source_etl_run_id` | `uuid` | Có | FK, index | ETL snapshot mà mapping batch bám vào nếu có |
| `scope_ref_json` | `jsonb` | Có |  | Scope của batch hoặc diagnostic slice |
| `idempotency_key` | `text` | Có | index | Chống duplicate batch nếu cần |
| `ai_profile_version_id` | `uuid` | Không | FK, index | Effective AI profile version đã dùng |
| `model_name` | `text` | Không | index | Model thực tế đã dùng |
| `output_schema_version` | `text` | Không | index | Output schema version |
| `runtime_snapshot_json` | `jsonb` | Không |  | Snapshot prompt/model/generation config/effective knobs |
| `thread_id` | `text` | Không | index | Thread đang được resolve |
| `decision_source` | `text` | Không | index | `ai`, `manual_override` |
| `selected_customer_id` | `text` | Có | index | Customer được chọn; null nếu unknown |
| `confidence_score` | `numeric(5,4)` | Có |  | Confidence của decision |
| `decision_status` | `text` | Không | index | `selected`, `manual_review_required`, `unknown` |
| `promotion_state` | `text` | Không | index | `not_applied`, `applied`, `superseded` |
| `prompt_hash` | `text` | Không | index | Hash của compiled prompt mapping |
| `evidence_json` | `jsonb` | Không |  | Candidate set freeze + evidence bundle + policy context |
| `usage_json` | `jsonb` | Không |  | Token/usage của unit |
| `cost_micros` | `bigint` | Không | index | Chi phí AI normalized ở unit grain |
| `failure_info_json` | `jsonb` | Có |  | Error / unknown reason |
| `created_by_user_id` | `integer` | Có | index | User tạo batch/manual decision |
| `created_at` | `timestamptz` | Không | index | Thời điểm ghi decision |

### Constraint Tối Thiểu

- unique (`run_group_id`, `thread_id`)
- index (`run_group_id`)
- index (`connected_page_id`, `created_at desc`)
- index (`decision_status`, `promotion_state`, `created_at`)
- index (`selected_customer_id`)

### Rule

- Không update row cũ; mọi decision là append-only.
- Một đợt chạy mapping được nhận diện bằng `run_group_id`.
- Mỗi row vừa là unit output, vừa mang đủ metadata để audit run group khi chỉ chạy mapping riêng.
- `thread_customer_mapping` current state chỉ được update khi:
  - deterministic fast-path thành công ở Seam 1
  - hoặc `thread_customer_mapping_decision` được promote theo policy
  - hoặc manual override tạo decision row rồi promote

## Những Gì Cố Tình Không Tách Thành Bảng Riêng

| Thành phần | Lý do |
| --- | --- |
| Tag mapping version table riêng | Chưa cần; `connected_page.active_tag_mapping_json` đủ owner |
| Opening rules version table riêng | Chưa cần; `connected_page.active_opening_rules_json` đủ owner |
| Telegram/email config table riêng | Single-company, page-centric, `notification_targets_json` đủ |
| Separate `thread_customer_mapping_run` | Run-group metadata được gộp thẳng vào `thread_customer_mapping_decision` qua `run_group_id` và runtime snapshot |
| Separate cost usage tables | Chưa cần; `usage_json` + `cost_micros` đủ cho dashboard và sorting |
| Separate attachment table | Shape đa dạng, `attachments_json` phù hợp hơn |
| Separate phone candidate table | `normalized_phone_candidates_json` đủ evidence và giảm join |

## Deliberate Cuts From Legacy Drafts

- `page_prompt_version` bị thay bằng `page_ai_profile_version`
- `connected_page.active_prompt_version_id` bị thay bằng `connected_page.active_ai_profiles_json`
- `thread_customer_mapping_run` bị gộp vào `thread_customer_mapping_decision`
- `observed_tag_events_json` bị loại khỏi `conversation_day`
- `message_tags_json` bị loại khỏi `message`
- `etl_run` vẫn là snapshot owner; không tạo thêm bảng snapshot riêng

## Read Model Rules

| Chủ đề | Rule |
| --- | --- |
| Official dashboard | Chỉ đọc `etl_run.is_published = true` và `analysis_result.publish_state = 'published'` của cùng kỳ |
| Manual custom range publish | Trong một `run_group_id`, child day full-day vẫn có thể publish độc lập nếu ETL + analysis hoàn tất end-to-end; child partial-day không publish |
| Inbox mới / cũ | Chỉ đọc từ deterministic fields của Seam 1 |
| `tái khám` official | Resolve theo `Seam 1 > analysis_result.content_customer_type > observed tag signals > unknown` |
| Thread history | Join `conversation_day` + `message` theo `conversation_id`, không duplicate transcript ở Seam 2 |
| Multi-day list UI | Khi filter nhiều ngày, danh sách chính phải group theo `conversation_id` thành `thread`, không render 1 dòng cho mỗi `conversation_day` |
| AI cost dashboard | Ưu tiên aggregate từ `analysis_result.cost_micros`; `analysis_run.total_cost_micros` dùng cho vận hành nhanh |
| Mapping review queue | Đọc `thread_customer_mapping_decision` với `decision_status = 'manual_review_required'` và `promotion_state = 'not_applied'` |
| Run history UI | List/filter theo `run_group_id`, không list theo từng child run kỹ thuật trước |
| Run detail UI | Một run group hiển thị union các `thread` thuộc mọi child run trong group đó; nếu một thread có nhiều `conversation_day` thì list chỉ hiện 1 dòng thread và cho phép drill xuống history theo ngày cùng analysis |

## Chốt Cuối

- Đây là matrix duy nhất cần dùng để tiếp tục refactor/rewrite schema.
- Nếu có thay đổi tiếp theo, phải sửa trực tiếp tài liệu này thay vì fork thêm matrix mới.
