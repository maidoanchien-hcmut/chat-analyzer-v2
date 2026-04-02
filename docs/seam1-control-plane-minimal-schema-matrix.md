# Seam 1 Control Plane Minimal Schema Matrix

Tài liệu này mô tả schema tối thiểu để vận hành thật, với nguyên tắc:

- chỉ thêm bảng khi có owner rõ ràng
- không tách mapper/version table quá sớm
- page config phải nằm trong DB
- prompt là ngoại lệ duy nhất cần bảng version riêng

Schema tối thiểu sau redesign:

- `connected_page`
- `page_prompt_version`
- `etl_run`
- `conversation_day`
- `message`
- `thread_customer_mapping`

## 1. `connected_page`

Owner:

- source of truth cho toàn bộ config vận hành của một page Pancake

| Cột                          | Kiểu gợi ý    | Null  | Index / ràng buộc | Ý nghĩa                                              |
| ---------------------------- | ------------- | ----- | ----------------- | ---------------------------------------------------- |
| `id`                         | `uuid`        | Không | PK                | Định danh nội bộ của page config                     |
| `pancake_page_id`            | `text`        | Không | unique            | ID page thật từ Pancake                              |
| `page_name`                  | `text`        | Không | index             | Tên page lấy từ Pancake lúc register                 |
| `pancake_user_access_token`  | `text`        | Không |                   | User access token dùng để generate page access token |
| `business_timezone`          | `text`        | Không |                   | Mặc định `Asia/Ho_Chi_Minh`                          |
| `auto_scraper_enabled`       | `boolean`     | Không | index             | Bật tắt ETL scheduler                                |
| `auto_ai_analysis_enabled`   | `boolean`     | Không | index             | Bật tắt AI scheduler                                 |
| `active_prompt_version_id`   | `uuid`        | Có    | FK                | Prompt version đang active của page                  |
| `active_tag_mapping_json`    | `jsonb`       | Không |                   | Mapping tag hiện hành của page                       |
| `active_opening_rules_json`  | `jsonb`       | Không |                   | Opening rules hiện hành của page                     |
| `active_bot_signatures_json` | `jsonb`       | Không |                   | Bot signatures hiện hành của page                    |
| `onboarding_state_json`      | `jsonb`       | Không |                   | Artifacts/candidates gần nhất sau onboarding sample  |
| `is_active`                  | `boolean`     | Không | index             | Cho phép soft-disable page khỏi scheduler            |
| `created_at`                 | `timestamptz` | Không | index             | Thời điểm tạo config page                            |
| `updated_at`                 | `timestamptz` | Không | index             | Thời điểm cập nhật config page                       |

### JSON shape tối thiểu gợi ý

`active_tag_mapping_json`

- danh sách raw tag
- taxonomy target
- `noise`
- optional note

`active_opening_rules_json`

- opening signatures
- button/postback/template match
- normalized fields như `customer_type`, `need`, `entry_flow`

`active_bot_signatures_json`

- `admin_name_contains`
- `app_id`
- `flow_id`
- note

`onboarding_state_json`

- `latest_onboarding_run_id`
- `latest_onboarding_target_date`
- `tag_candidates`
- `opening_candidates`
- `bot_candidates`
- `status`

### Tại sao không tách thêm bảng mapper

Chưa tách `page_tag_mapping_version`, `page_opening_flow_version`, `page_bot_signature_version` vì:

- phase này chưa cần versioning phức tạp
- shape còn đang học từ data thật
- `jsonb` trên `connected_page` đủ cho vận hành ban đầu

## 2. `page_prompt_version`

Owner:

- quản lý prompt theo page
- clone từ page khác
- lưu lịch sử version prompt

| Cột                 | Kiểu gợi ý    | Null  | Index / ràng buộc | Ý nghĩa                                |
| ------------------- | ------------- | ----- | ----------------- | -------------------------------------- |
| `id`                | `uuid`        | Không | PK                | Định danh prompt version               |
| `connected_page_id` | `uuid`        | Không | FK, index         | Prompt thuộc về page nào               |
| `version_no`        | `integer`     | Không | unique trong page | Số version tăng dần trong phạm vi page |
| `prompt_text`       | `text`        | Không |                   | Nội dung prompt                        |
| `notes`             | `text`        | Có    |                   | Ghi chú nội bộ cho version             |
| `created_at`        | `timestamptz` | Không | index             | Thời điểm tạo version                  |

### Rule active prompt

- không cần `is_active` trên mọi row
- row active được trỏ qua `connected_page.active_prompt_version_id`

Lý do:

- tránh update hàng loạt `is_active=false`
- clone/activate đơn giản hơn

## 3. `etl_run`

Owner:

- audit owner cho onboarding, manual, scheduler
- canonical owner của Seam 1 output

Khuyến nghị chỉnh từ schema hiện tại:

| Cột                                 | Kiểu gợi ý    | Null  | Index / ràng buộc        | Ý nghĩa                                                                |
| ----------------------------------- | ------------- | ----- | ------------------------ | ---------------------------------------------------------------------- |
| `id`                                | `uuid`        | Không | PK                       | Định danh run                                                          |
| `connected_page_id`                 | `uuid`        | Không | FK, index                | Page config mà run này thuộc về                                        |
| `run_group_id`                      | `uuid`        | Có    | index                    | Gom nhiều run con sinh từ một manual range                             |
| `run_mode`                          | `text`        | Không | index                    | `onboarding_sample`, `manual_range`, `backfill_day`, `scheduled_daily` |
| `processing_mode`                   | `text`        | Không | index                    | `etl_only` hoặc `etl_and_ai`                                           |
| `target_date`                       | `date`        | Không | index                    | Ngày local của page                                                    |
| `business_timezone`                 | `text`        | Không |                          | Timezone dùng để cắt window                                            |
| `requested_window_start_at`         | `timestamptz` | Có    |                          | Window mà user/system yêu cầu                                          |
| `requested_window_end_exclusive_at` | `timestamptz` | Có    |                          | Window end-exclusive được yêu cầu                                      |
| `window_start_at`                   | `timestamptz` | Không |                          | Window thực tế của run con này                                         |
| `window_end_exclusive_at`           | `timestamptz` | Không |                          | Window end-exclusive thực tế                                           |
| `snapshot_version`                  | `integer`     | Không | unique trong page/date   | Version snapshot ngày đó                                               |
| `is_published`                      | `boolean`     | Không | partial unique published | Có phải official snapshot hay không                                    |
| `status`                            | `text`        | Không | index                    | `running`, `loaded`, `published`, `failed`                             |
| `run_params_json`                   | `jsonb`       | Không |                          | Thông số runtime như `initial_conversation_limit`, `max_conversations` |
| `tag_dictionary_json`               | `jsonb`       | Không |                          | Dictionary tag snapshot của page lúc extract                           |
| `metrics_json`                      | `jsonb`       | Không |                          | Metrics vận hành                                                       |
| `error_text`                        | `text`        | Có    |                          | Lỗi tổng hợp                                                           |
| `started_at`                        | `timestamptz` | Không | index                    | Thời điểm bắt đầu                                                      |
| `finished_at`                       | `timestamptz` | Có    | index                    | Thời điểm kết thúc                                                     |

### Tại sao thêm `run_params_json`

Để tránh bẻ schema vì các thông số runtime rất ngắn hạn:

- `initial_conversation_limit`
- `max_conversations`
- `max_message_pages_per_conversation`
- flags debug/recovery

Những field này không nên nhét lên `connected_page`.

## 4. `conversation_day`

Giữ nguyên owner hiện tại.

| Cột                                  | Kiểu          | Vai trò               |
| ------------------------------------ | ------------- | --------------------- |
| `id`                                 | `uuid`        | PK                    |
| `etl_run_id`                         | `uuid`        | FK về `etl_run`       |
| `conversation_id`                    | `text`        | Thread từ Pancake     |
| `customer_display_name`              | `text`        | Evidence text         |
| `conversation_inserted_at`           | `timestamptz` | Source fact           |
| `conversation_updated_at`            | `timestamptz` | Source fact           |
| `message_count_seen_from_source`     | `integer`     | Audit                 |
| `normalized_phone_candidates_json`   | `jsonb`       | Evidence map customer |
| `current_tags_json`                  | `jsonb`       | Raw/current tags      |
| `observed_tag_events_json`           | `jsonb`       | Tag history/events    |
| `normalized_tag_signals_json`        | `jsonb`       | Deterministic signals |
| `opening_blocks_json`                | `jsonb`       | Opening evidence      |
| `first_meaningful_human_message_id`  | `text`        | Opening anchor        |
| `first_meaningful_human_sender_role` | `text`        | Opening anchor role   |
| `source_conversation_json`           | `jsonb`       | Audit/debug           |
| `created_at`                         | `timestamptz` | Audit                 |

## 5. `message`

Giữ nguyên owner hiện tại.

| Cột                            | Kiểu          | Vai trò                             |
| ------------------------------ | ------------- | ----------------------------------- |
| `id`                           | `uuid`        | PK                                  |
| `conversation_day_id`          | `uuid`        | FK                                  |
| `etl_run_id`                   | `uuid`        | FK                                  |
| `message_id`                   | `text`        | Source message id                   |
| `conversation_id`              | `text`        | Denormalized thread id              |
| `inserted_at`                  | `timestamptz` | Timestamp source                    |
| `sender_source_id`             | `text`        | Source actor id                     |
| `sender_name`                  | `text`        | Display name                        |
| `sender_role`                  | `text`        | Role chuẩn hoá                      |
| `source_message_type_raw`      | `text`        | Raw type                            |
| `message_type`                 | `text`        | Canonical type                      |
| `redacted_text`                | `text`        | Persist text duy nhất được phép giữ |
| `attachments_json`             | `jsonb`       | Attachment evidence                 |
| `message_tags_json`            | `jsonb`       | Message-local tags                  |
| `is_meaningful_human_message`  | `boolean`     | Opening / downstream                |
| `source_message_json_redacted` | `jsonb`       | Audit/debug                         |
| `created_at`                   | `timestamptz` | Audit                               |

## 6. `thread_customer_mapping`

Giữ nguyên owner hiện tại.

| Cột                 | Kiểu          | Vai trò                                                        |
| ------------------- | ------------- | -------------------------------------------------------------- |
| `page_id`           | `text`        | Page chứa thread                                               |
| `thread_id`         | `text`        | Thread source                                                  |
| `customer_id`       | `text`        | Customer nội bộ đã resolve                                     |
| `mapped_phone_e164` | `text`        | Phone dùng để map                                              |
| `mapping_method`    | `text`        | `deterministic_single_phone`, `ai_resolved`, `manual_override` |
| `created_at`        | `timestamptz` | Audit                                                          |
| `updated_at`        | `timestamptz` | Audit                                                          |

## Index Và Constraint Tối Thiểu

### `connected_page`

- unique (`pancake_page_id`)
- index (`auto_scraper_enabled`)
- index (`auto_ai_analysis_enabled`)
- index (`is_active`)

### `page_prompt_version`

- unique (`connected_page_id`, `version_no`)
- index (`connected_page_id`, `created_at desc`)

### `etl_run`

- unique (`connected_page_id`, `target_date`, `snapshot_version`)
- partial unique published trên (`connected_page_id`, `target_date`) với `is_published = true`
- index (`run_group_id`)
- index (`processing_mode`)
- index (`status`)

### `conversation_day`

- unique (`etl_run_id`, `conversation_id`)

### `message`

- unique (`etl_run_id`, `message_id`)

### `thread_customer_mapping`

- PK (`page_id`, `thread_id`)

## Những Gì Cố Tình Chưa Làm

Không thêm các bảng sau trong phase tối thiểu:

- `page_tag_mapping_version`
- `page_opening_flow_version`
- `page_bot_signature_version`
- `page_onboarding_run`
- `page_health_metric_daily`

Lý do:

- chưa cần để vận hành lõi
- sẽ làm schema nổ quá nhanh
- nhiều field có thể nằm ổn trong `jsonb` ở `connected_page` và `metrics_json` ở `etl_run`

## Kết Luận

Schema tối thiểu, đủ owner, ít bảng nhất và không làm bừa DB là:

- `connected_page`
- `page_prompt_version`
- `etl_run`
- `conversation_day`
- `message`
- `thread_customer_mapping`

Điểm mấu chốt:

- page config thật phải vào `connected_page`
- prompt clone/version phải có bảng riêng
- onboarding config ngắn hạn đi vào `etl_run.run_params_json`
- mapper/bot/opening phase đầu giữ trên `connected_page` bằng `jsonb`, chưa tách bảng vội

## Hard Constraint Cho Agent Khác

Schema này tuyệt đối không được giả định multi-tenant.

Rule bắt buộc:

- không thêm `organization_id`
- không thêm `company_id`
- không thêm `workspace_id`
- không thêm ownership layer theo team sales hoặc CSKH

Toàn bộ control-plane phải lấy `pancake_page_id` hoặc `connected_page.id` làm index vận hành chính.
