# Kế Hoạch Thực Hiện Module Trích Xuất Dữ Liệu

**Goal:** Thiết kế lại trọn vẹn `db + backend + go-worker` cho module trích xuất dữ liệu Pancake, sao cho control-plane, ETL manifest, ODS persistence và contract JSON khớp với `docs/design.md` và đủ nền cho manual run, scheduled run, reuse, audit.

**Architecture:** `backend` là owner của control-plane, config versioning, run planning, publish semantics và persistence. `backend/go-worker` là owner của extract + transform + load deterministic vào ODS, không làm AI reasoning. Database được tách rõ thành control-plane tables và canonical ODS tables; mọi run đều freeze snapshot config, và mọi child run đều materialize được kết quả để review sau execute.

**Intent:** Thay schema và orchestration cũ bằng một owner cut sạch theo `connected_page -> page_config_version -> pipeline_run_group/pipeline_run -> thread/thread_day/message`.
**Observable Delta:** Sau khi hoàn tất, một page mới có thể `nhập token -> chọn page -> activate`, backend preview/execute manual range được, worker persist đúng `thread_day/message`, và run detail phản ánh đúng coverage, config snapshot, reuse class, publish eligibility.
**Primary Contract:** Với một `connected_page`, một `page_config_version` freeze và một `run request`, backend phải sinh ra manifest deterministic; go-worker phải persist đúng ODS rows theo `target_date + coverage window + etl config snapshot`, không phụ thuộc AI.
**First Proof:** Một integration path `manual range preview -> execute -> inspect run group` trên sample/local-run fixture phải chứng minh được: split child run đúng, config snapshot đúng, `thread_day/message` persist đúng, partial old day không có publish action.
**First Slice:** Full-day extract cho đúng 1 `target_date` của 1 page, với config mặc định lazy-operator, persist thành công `pipeline_run + thread + thread_day + message`.
**Blast Radius:** `backend/prisma/schema.prisma`, migration SQL, toàn bộ `backend/src/modules/chat_extractor/*`, và `backend/go-worker/internal/{job,controlplane,extract,transform,load,pancake}` phải đi cùng nhau vì chúng cùng owner một contract dữ liệu và manifest.
**Execution Posture:** Thực hiện như một owner-clean rewrite và được phép mạnh tay nuke extraction seam cũ: drop bảng cũ, xoá model/DTO/struct cũ, reset migration chain của extraction nếu cần. Không giữ dual schema, compatibility DTO, compatibility API payload, hay nhánh code cũ chỉ để giảm diff.
**Allowed Mechanism:** Prisma schema mới, migration reset-compatible, Zod DTO mới trong backend, manifest JSON có version, Go structs đồng bộ 1:1 với contract backend.
**Forbidden Shortcuts:** Vá thêm cột vào `ConnectedPage`/`EtlRun` cũ, giữ song song `ConversationDay` với `ThreadDay`, tiếp tục encode page config trực tiếp trên `connected_page`, hoặc để worker tự đoán config thay vì dùng snapshot freeze từ backend.
**Forbidden Scaffolding:** Không thêm compatibility view, không thêm shim transform từ schema mới về schema cũ, không giữ `PageAiProfileVersion` hay `activeAiProfilesJson` chỉ để code cũ còn chạy, không giữ endpoint/struct/model cũ dưới tên "legacy".
**Proof Obligations:** Prisma schema validate; migration deploy được trên DB trống; backend DTO validation khóa đúng contract; `go test ./...` của worker xanh; preview/execute flow chứng minh split/publish eligibility/reuse class đúng như thiết kế.

**Proof Ownership:**
- Architect-owned proof: Cấu trúc bảng, contract JSON, invariants run snapshot và reuse class phải nhất quán với `docs/design.md`.
- Executor-owned proof: Migration, DTO parsing, manifest generation, worker transform/load, run detail payload.
- Hostile-review focus: Trộn ETL config với AI config, để partial old day publish được, hoặc để tag unmapped trở thành `null` thay vì `noise`.
- Escalation trigger: Nếu implementation buộc phải giữ đồng thời schema cũ và schema mới, hoặc nếu manual/scheduled semantics không biểu diễn được chỉ bằng run snapshot và publish eligibility.

**Not Done Until:** Backend có schema đích, tạo/sửa config version được, preview/execute manual run được, worker ghi ODS đúng, API run detail trả ra đủ dữ liệu để frontend review run mà chưa cần dashboard publish, và extraction seam cũ không còn là runtime path nào có thể được gọi nhầm.

**Solution Integrity Check:**
- Least-painful patch: Sửa tiếp `ConnectedPage.active_*_json`, `EtlRun`, `ConversationDay` và mapper hiện tại, rồi chồng thêm planner/config semantics mới lên trên.
- Why rejected: Cách này biến repo thành một lớp vỏ mới bọc lên seam cũ, giữ lại tên bảng, DTO và assumptions cũ. Nó làm mọi rule quan trọng như config snapshot, publish eligibility, ETL/AI impact classes và prompt identity tiếp tục sống trong code rẽ nhánh thay vì trong model đích.
- Largest owner-clean slice: Rewrite toàn bộ schema extraction + backend chat_extractor + go-worker manifest/load theo contract mới.
- Why this slice is safe for a strong agent: Repo là dev environment, không cần backward compatibility dữ liệu cũ, write scope tập trung trong đúng seam extraction.
- If forced to stage: Chỉ được stage theo owner boundary `schema+backend` và `go-worker`, nhưng mỗi stage vẫn phải xoá runtime path cũ trong boundary đó trước khi coi stage xong.
- Debt or drift path: Không chấp nhận debt compatibility trong slice này. Nếu có đoạn cũ chưa xoá được thì slice chưa hoàn tất.

## 1. Scope Thực Thi

Trong kế hoạch này, module trích xuất dữ liệu bao gồm:

- schema DB cho control-plane và canonical ODS
- backend module `backend/src/modules/chat_extractor`
- go-worker trong `backend/go-worker`
- contract JSON giữa backend và worker
- contract JSON của các cột `jsonb` trong control-plane và ODS

Ngoài scope:

- AI service trong `service/`
- semantic mart / fact export
- frontend implementation chi tiết

Nhưng plan này vẫn phải chuẩn bị đủ contract để các phần đó nối vào sau mà không phải đổi lại extraction seam.

Quyền nuke trong scope này:

- được phép drop toàn bộ bảng extraction/control-plane cũ nếu không còn khớp thiết kế mới
- được phép xoá module `chat_extractor` cũ rồi dựng lại theo shape mới
- được phép xoá struct/model/test fixture cũ trong `go-worker` nếu chúng encode contract cũ
- được phép reset migration chain của phần extraction trong môi trường dev này
- không cần giữ backward compatibility với dữ liệu cũ, API payload cũ, hay internal DTO cũ

## 2. Invariants Phải Giữ

- `customer = thread` trong extraction scope.
- `thread_day` là grain canonical theo ngày.
- `is_new_inbox` là deterministic theo `thread.thread_first_seen_at`, không do AI quyết định.
- `tái khám` không phải `need`; ETL chỉ trích explicit signal, không suy luận semantic.
- tag chưa được map tay mặc định vào `noise`, không dùng `null`.
- `role` của tag mapping là enum cố định; tag mới chưa được cấu hình vẫn đi vào `role = noise`.
- phải audit được `noise` là do mặc định hệ thống hay do operator chủ động xác nhận, bằng `mapping_source`.
- `system prompt` là cố định ở cấp hệ thống vì sản phẩm này chỉ làm bài toán phân tích hội thoại.
- `prompt_text` là custom prompt riêng của page, mô tả quy trình làm việc/rubric của nhân viên để AI dựa vào đó mà đánh giá.
- khi onboarding page mới, UI prefill một bản `default page prompt` vào ô nhập; operator có thể dùng luôn hoặc chỉnh sửa.
- worker extract không đọc prompt trực tiếp; prompt chỉ đi vào downstream AI runtime/audit seam.
- fallback cắt biên opening luôn là `first_human_message`; đây là logic nội bộ của extractor, không phải phần operator cấu hình.
- `opening_rules` chỉ là optional signal extractor để lấy explicit signal từ đoạn mở đầu nếu có.
- nếu `opening_rules` không extract được gì thì pipeline vẫn chạy bình thường.
- partial-day của ngày cũ chỉ xem run result, không có quyền publish dashboard.
- full-day của ngày cũ publish được nhưng phải là overwrite có kiểm soát.
- mọi run đều freeze `etl_config`, `ai_config`, `taxonomy_version`, `coverage` tại thời điểm tạo run.

## 3. Hướng Triển Khai Chốt

### Approach A: Vá schema hiện tại

Ưu điểm:

- sửa ít file hơn

Nhược điểm:

- giữ lại naming và ownership cũ sai seam
- không có `page_config_version`
- không có `pipeline_run_group`
- không diễn đạt được prompt version identity và config snapshot đúng nghĩa

### Approach B: Rewrite extraction seam theo schema mới

Ưu điểm:

- schema sạch, đúng invariants
- backend/job contract rõ
- worker deterministic hơn
- dễ kiểm chứng reuse và publish eligibility

Nhược điểm:

- diff lớn
- phải bỏ nhiều model/DTO cũ

### Recommendation

Chọn `Approach B`.

## 4. Target Data Model

Nguyên tắc model:

- ưu tiên chuẩn hoá theo khoá ngoại nếu owner table đã rõ
- không duplicate dữ liệu trong control-plane và canonical ODS chỉ để tiện query
- chỉ duplicate khi đó là:
  - snapshot/audit bắt buộc phải freeze theo run
  - semantic/read model phục vụ BI hoặc export

### 4.1 Control-plane tables

#### `connected_page`

Owner:

- định danh page Pancake
- token kết nối
- trạng thái bật/tắt module
- active config pointer duy nhất cho page

Các cột chính:

- `id uuid pk`
- `pancake_page_id text unique not null`
- `page_name text not null`
- `pancake_user_access_token text not null`
- `business_timezone text not null`
- `etl_enabled boolean not null default false`
- `analysis_enabled boolean not null default false`
- `active_config_version_id uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Index:

- unique `(pancake_page_id)`
- btree `(etl_enabled, updated_at desc)`
- btree `(analysis_enabled, updated_at desc)`

#### `page_prompt_identity`

Owner:

- runtime registry map compiled prompt content identity sang nhãn `prompt_version` dễ đọc
- đảm bảo revert về nội dung compiled prompt cũ thì reuse lại version cũ
- không phải owner state của `page_config_version`

Các cột chính:

- `id uuid pk`
- `connected_page_id uuid not null`
- `compiled_prompt_hash text not null`
- `prompt_version text not null`
- `compiled_prompt_text text not null`
- `created_at timestamptz not null default now()`

Constraint:

- unique `(connected_page_id, compiled_prompt_hash)`
- unique `(connected_page_id, prompt_version)`

Rule:

- `prompt_version` là page-local readable label, ví dụ `A`, `B`, `C`
- `compiled_prompt_hash` phải phản ánh full compiled prompt tại runtime:
  - global system prompt cố định
  - taxonomy/output contract đã pin
  - `page_config_version.prompt_text`
- backend lookup theo `compiled_prompt_hash`; nếu đã tồn tại thì reuse `prompt_version`
- `page_config_version` không được giữ FK sang bảng này
- preview/execute và downstream AI runtime mới là nơi resolve hoặc tạo `page_prompt_identity`, rồi freeze identity đó vào run snapshot hoặc audit owner tương ứng

#### `analysis_taxonomy_version`

Owner:

- taxonomy canonical dùng chung

Các cột chính:

- `id uuid pk`
- `version_code text unique not null`
- `taxonomy_json jsonb not null`
- `is_active boolean not null default false`
- `created_at timestamptz not null default now()`

#### `page_config_version`

Owner:

- snapshot config theo page
- phân tách rõ impact class: operational, ETL-transform, AI-analysis, taxonomy

Các cột chính:

- `id uuid pk`
- `connected_page_id uuid not null`
- `version_no integer not null`
- `tag_mapping_json jsonb not null`
- `opening_rules_json jsonb not null`
- `scheduler_json jsonb null`
- `notification_targets_json jsonb null`
- `prompt_text text not null`
- `analysis_taxonomy_version_id uuid not null`
- `notes text null`
- `created_at timestamptz not null default now()`

Constraint:

- unique `(connected_page_id, version_no)`

Rule:

- `connected_page.active_config_version_id` trỏ tới row active hiện tại
- `analysis_taxonomy_version_id` chỉ được chọn qua `page_config_version`; không có active taxonomy pointer riêng trên `connected_page`
- config snapshot không bị mutate; mọi thay đổi tạo row mới
- `tag_mapping_json` mặc định là object rỗng với `default_role = noise`
- `opening_rules_json` mặc định là object rỗng
- `scheduler_json = null` nghĩa là kế thừa default toàn hệ thống
- `notification_targets_json = null` nghĩa là kế thừa default toàn hệ thống hoặc không gửi nếu global default không có
- `prompt_text` là custom prompt của page, không phải system prompt
- khi tạo `page_config_version` mới cho page, backend khởi tạo `prompt_text` bằng `default page prompt`
- UI cho phép operator chỉnh trực tiếp nội dung đó trước hoặc sau khi activate
- `compiled_prompt_hash` và `prompt_version` là runtime identity của compiled prompt, không phải config owner field
- nếu `prompt_text` giữ nguyên nhưng system prompt hoặc taxonomy/output contract đổi thì compiled prompt identity phải đổi theo runtime compile result, không được tái dùng identity cũ chỉ vì config row giống nhau

#### `pipeline_run_group`

Owner:

- đại diện cho 1 thao tác logical của user hoặc scheduler
- gom nhiều child run theo `target_date`

Các cột chính:

- `id uuid pk`
- `run_mode text not null`
- `requested_window_start_at timestamptz null`
- `requested_window_end_exclusive_at timestamptz null`
- `requested_target_date date null`
- `frozen_config_version_id uuid not null`
- `frozen_taxonomy_version_id uuid not null`
- `frozen_compiled_prompt_hash text not null`
- `frozen_prompt_version text not null`
- `publish_intent text not null`
- `status text not null`
- `created_by text not null`
- `created_at timestamptz not null default now()`
- `started_at timestamptz null`
- `finished_at timestamptz null`

Rule:

- `connected_page_id` nên được lấy qua `frozen_config_version_id -> page_config_version -> connected_page`
- `frozen_taxonomy_version_id` phải khớp với `frozen_config_version_id.analysis_taxonomy_version_id`; không có nguồn taxonomy thứ hai
- `frozen_compiled_prompt_hash` và `frozen_prompt_version` được resolve từ runtime compile tại thời điểm preview/execute
- nếu cần filter nhanh theo page ở mức run group thì dùng index theo FK chain hoặc cân nhắc materialized read model, không duplicate trong table owner

#### `pipeline_run`

Owner:

- child run ở grain `page + target_date + coverage`

Các cột chính:

- `id uuid pk`
- `run_group_id uuid not null`
- `target_date date not null`
- `window_start_at timestamptz not null`
- `window_end_exclusive_at timestamptz not null`
- `requested_window_start_at timestamptz null`
- `requested_window_end_exclusive_at timestamptz null`
- `is_full_day boolean not null`
- `run_mode text not null`
- `status text not null`
- `publish_state text not null default 'draft'`
- `publish_eligibility text not null`
- `supersedes_run_id uuid null`
- `superseded_by_run_id uuid null`
- `request_json jsonb not null`
- `metrics_json jsonb not null`
- `reuse_summary_json jsonb not null`
- `error_text text null`
- `created_at timestamptz not null default now()`
- `started_at timestamptz null`
- `finished_at timestamptz null`
- `published_at timestamptz null`

Constraint:

- unique `(run_group_id, target_date, window_start_at, window_end_exclusive_at)`

Index:

- btree `(run_group_id, target_date)`
- btree `(status, created_at desc)`

Rule:

- `pipeline_run` lấy page/config/taxonomy snapshot qua `run_group_id`
- hash/config pointer không nên duplicate xuống `pipeline_run` nếu đã freeze ở `pipeline_run_group`
- `publish_state` là state machine chứ không phải free-form flag:
  - `draft`
  - `published_provisional`
  - `published_official`
  - `superseded`
- mọi transition publish phải chạy trong một transaction backend:
  - promote run hiện tại sang state publish đích
  - đánh dấu snapshot trước đó cùng `page + target_date + publish class` là `superseded`
  - điền quan hệ `supersedes_run_id` / `superseded_by_run_id`
- `official_daily` full-day publish phải supersede `published_provisional` cùng `page + target_date` nếu đang tồn tại
- manual full-day republish ngày cũ chỉ hợp lệ khi backend nhận explicit historical overwrite confirmation và precondition snapshot hiện hành khớp với request

### 4.2 Canonical ODS tables

#### `thread`

Các cột chính:

- `id uuid pk`
- `connected_page_id uuid not null`
- `source_thread_id text not null`
- `thread_first_seen_at timestamptz null`
- `thread_last_seen_at timestamptz null`
- `customer_display_name text null`
- `current_phone_candidates_json jsonb not null`
- `latest_entry_source_type text null`
- `latest_entry_post_id text null`
- `latest_entry_ad_id text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraint:

- unique `(connected_page_id, source_thread_id)`

#### `thread_day`

Các cột chính:

- `id uuid pk`
- `pipeline_run_id uuid not null`
- `thread_id uuid not null`
- `is_new_inbox boolean not null`
- `entry_source_type text null`
- `entry_post_id text null`
- `entry_ad_id text null`
- `observed_tags_json jsonb not null`
- `normalized_tag_signals_json jsonb not null`
- `opening_block_json jsonb not null`
- `first_meaningful_message_id text null`
- `first_meaningful_message_text_redacted text null`
- `first_meaningful_message_sender_role text null`
- `message_count integer not null`
- `first_staff_response_seconds integer null`
- `avg_staff_response_seconds integer null`
- `staff_participants_json jsonb not null`
- `staff_message_stats_json jsonb not null`
- `explicit_revisit_signal text null`
- `explicit_need_signal text null`
- `explicit_outcome_signal text null`
- `source_thread_json_redacted jsonb not null`
- `created_at timestamptz not null default now()`

Constraint:

- unique `(pipeline_run_id, thread_id)`
- btree `(pipeline_run_id, is_new_inbox)`
- btree `(thread_id, pipeline_run_id desc)`

Rule:

- `target_date` và page context phải lấy qua `pipeline_run_id`
- không duplicate `connected_page_id` hay `target_date` vào `thread_day`

#### `message`

Các cột chính:

- `id uuid pk`
- `thread_day_id uuid not null`
- `source_message_id text not null`
- `inserted_at timestamptz not null`
- `sender_role text not null`
- `sender_source_id text null`
- `sender_name text null`
- `message_type text not null`
- `source_message_type_raw text null`
- `redacted_text text null`
- `attachments_json jsonb not null`
- `is_meaningful_human_message boolean not null`
- `is_opening_block_message boolean not null`
- `source_message_json_redacted jsonb not null`
- `created_at timestamptz not null default now()`

Constraint:

- unique `(thread_day_id, source_message_id)`
- btree `(thread_day_id, inserted_at)`
- btree `(sender_role, inserted_at)`

#### `thread_customer_link`

Các cột chính:

- `thread_id uuid not null`
- `customer_id text not null`
- `mapping_method text not null`
- `mapping_confidence_score numeric(5,4) null`
- `mapped_phone_match_key text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraint:

- primary key `(thread_id)`

Rule:

- `thread_id` phải là khoá ngoại trực tiếp tới bảng `thread`
- bảng này chỉ lưu `current resolved link`, không phải phone master data của CRM
- `mapped_phone_match_key` là evidence phụ cho việc match bằng phone, không giả định dữ liệu CRM chuẩn E.164
- nếu CRM lưu số điện thoại bẩn hoặc không chuẩn hóa được, system vẫn có thể lưu:
  - raw value đã được trim
  - hoặc digits-only match key
- nếu link đến từ AI/manual thay vì phone match thì `mapped_phone_match_key` có thể `null`
- extractor module không tạo `mapped_phone_match_key` từ source; giá trị này chỉ xuất hiện ở flow mapping nếu có bước match riêng

## 5. JSON Contracts Phải Chốt Ngay

Tất cả các JSON dưới đây phải được backend validate trước khi persist, và worker chỉ nhận manifest đã normalize.

### 5.0 `page_config_version.prompt_text`

Mục đích:

- đây là phần custom prompt plain text cho từng page
- operator chỉ nhập đúng 1 khối text, không nhập JSON
- `system prompt` không nằm ở đây; nó là phần cố định của hệ thống
- hệ thống có một `default page prompt` làm nội dung khởi tạo cho page mới

Rule:

- giá trị storage chỉ là `text`, không phải `jsonb`
- `prompt_text` là custom prompt của page, luôn được persist trên `page_config_version`
- khi onboarding page mới, backend khởi tạo `prompt_text = default page prompt`
- operator có thể giữ nguyên hoặc sửa nội dung đó
- để chạy downstream AI, backend/runtime sẽ compile:
  - global system prompt cố định
  - taxonomy/output contract cố định
  - `prompt_text` của page
- prompt identity registry là runtime concern; không được biến thành FK owner state của `page_config_version`
- để audit, hệ thống phải lưu:
  - `compiled_prompt_text`
  - `compiled_prompt_hash`
  - `prompt_version`
- ba giá trị trên phải thuộc runtime/audit owner tương ứng, không được persist ngược vào `page_config_version`
- default page prompt phải phản ánh đúng loại thông tin page cần bổ sung:
  - quy trình làm việc của nhân viên
  - tiêu chí thế nào là phản hồi tốt/chưa tốt
  - cách hiểu outcome/risk của page
- UI có thể hiển thị default page prompt như placeholder hoặc prefilled value, nhưng semantics đúng là: page mới có sẵn một custom prompt mặc định để chạy ngay

### 5.1 `page_config_version.tag_mapping_json`

Mục đích:

- map tag page-local sang signal chuẩn cho ETL
- tag chưa map tay vẫn có default `noise`

Schema:

```json
{
  "version": 1,
  "default_role": "noise",
  "entries": [
    {
      "source_tag_id": "8",
      "source_tag_text": "KH TÁI KHÁM",
      "role": "journey",
      "canonical_code": "revisit",
      "mapping_source": "operator",
      "status": "active"
    }
  ]
}
```

Ràng buộc:

- `version`: integer, hiện tại cố định `1`
- `default_role`: luôn là `"noise"`
- `role`: enum `"journey" | "need" | "outcome" | "branch" | "staff" | "noise"`
- `mapping_source`: enum `"auto_default" | "operator"`
- `status`: enum `"active" | "inactive"`
- unique theo `source_tag_id`
- `canonical_code` bắt buộc khác rỗng nếu `role != "noise"`
- `role` không được `null`
- `canonical_code = "revisit"` chỉ hợp lệ khi `role = "journey"`
- nếu tag mới từ source chưa có entry thì backend/worker vẫn phải normalize về:
  - `role = noise`
  - `mapping_source = auto_default`

Backend normalize thêm:

- dedupe theo `source_tag_id`
- trim text
- sort entries theo `source_tag_text`
- operator không bắt buộc phải cấu hình tag nào để run chạy được

### 5.2 `page_config_version.opening_rules_json`

Mục đích:

- optional signal extractor cho opening flow
- không dùng để làm parser prerequisite
- chỉ dùng để extract explicit signal từ đoạn mở đầu nếu có
- không chứa rule cắt biên transcript
- không lộ implementation detail nội bộ của extractor ra UX operator

Schema:

```json
{
  "version": 1,
  "selectors": [
    {
      "selector_id": "revisit_button",
      "signal_role": "journey",
      "signal_code": "revisit",
      "allowed_message_types": ["postback", "quick_reply_selection", "text"],
      "options": [
        {
          "raw_text": "Khách hàng tái khám",
          "match_mode": "exact"
        }
      ]
    },
    {
      "selector_id": "booking_button",
      "signal_role": "need",
      "signal_code": "dat_lich",
      "allowed_message_types": ["postback", "quick_reply_selection", "text"],
      "options": [
        {
          "raw_text": "Đặt lịch hẹn",
          "match_mode": "exact"
        }
      ]
    }
  ]
}
```

Ví dụ semantics đúng:

- `Khách hàng tái khám -> journey = revisit`
- `Đặt lịch hẹn -> need = dat_lich`

Ràng buộc:

- `signal_role`: enum `"journey" | "need" | "outcome"`
- `signal_code`: canonical code tương ứng với `signal_role`
- `match_mode`: enum `"exact" | "casefold_exact"`
- `allowed_message_types`: non-empty string array
- selectors có thể rỗng

Rule:

- nếu không match selector nào thì worker không extract explicit signal nào từ opening
- việc cắt biên để tìm transcript meaningful vẫn dùng fallback nội bộ `first_human_message`
- operator không cần viết rule để page chạy được
- UI onboarding chỉ nên hiển thị theo ngôn ngữ nghiệp vụ:
  - “Hệ thống phát hiện các lựa chọn mở đầu sau”
  - mỗi lựa chọn cho phép map nhanh sang `journey`, `need` hoặc bỏ qua

### 5.3 `page_config_version.scheduler_json`

Mục đích:

- điều khiển scheduled extract và lookback
- là config tùy chọn; nếu `null` thì page kế thừa default toàn hệ thống
- default toàn hệ thống nên là chạy official lúc `00:00` của ngày `D + 1` cho `target_date = D`

Schema:

```json
{
  "version": 1,
  "timezone": "Asia/Ho_Chi_Minh",
  "official_daily_time": "00:00",
  "lookback_hours": 2,
  "max_conversations_per_run": 0,
  "max_message_pages_per_thread": 0
}
```

Ràng buộc:

- `timezone`: IANA timezone string
- `official_daily_time`: `"HH:MM"`
- `lookback_hours`: integer `>= 0`
- `max_* = 0` nghĩa là không giới hạn bằng config page và dùng hard limit hệ thống nếu có
- `scheduler_json` có thể là `null`

Semantics:

- official run cho ngày `D` có canonical window cố định là `[00:00 ngày D, 00:00 ngày D + 1)`
- `lookback_hours` chỉ là overlap cho source discovery/recovery quanh biên cuối ngày để tránh miss update phút cuối
- `lookback_hours` không làm thay đổi canonical window của `thread_day/message`

### 5.4 `page_config_version.notification_targets_json`

Mục đích:

- nhận override target thông báo theo page
- là config tùy chọn; nếu `null` thì kế thừa default toàn hệ thống hoặc để trống

Schema:

```json
{
  "version": 1,
  "telegram": [
    {
      "chat_id": "-1001234567890",
      "events": ["run_failed", "new_unmapped_tag"]
    }
  ],
  "email": [
    {
      "address": "it@example.com",
      "events": ["run_failed"]
    }
  ]
}
```

Ràng buộc:

- `events`: enum subset `"run_failed" | "publish_failed" | "new_unmapped_tag" | "opening_rule_miss_spike" | "token_expiring"`
- các list có thể rỗng
- `notification_targets_json` có thể là `null`

### 5.5 `pipeline_run.request_json`

Mục đích:

- freeze request business-level để audit

Schema:

```json
{
  "request_kind": "manual_range",
  "requested_by": "operator",
  "processing_mode": "etl_only",
  "requested_target_date": null,
  "requested_window_start_at": "2026-01-24T07:00:00+07:00",
  "requested_window_end_exclusive_at": "2026-01-25T10:00:00+07:00",
  "write_artifacts": false,
  "publish_requested": false
}
```

Ràng buộc:

- `request_kind`: enum `"official_daily" | "manual_range" | "backfill_day" | "onboarding_sample"`
- `processing_mode`: enum `"etl_only" | "etl_and_ai"`
- timestamps là RFC3339

### 5.6 `pipeline_run.metrics_json`

Schema:

```json
{
  "conversation_list_pages_fetched": 3,
  "threads_selected": 128,
  "threads_loaded": 117,
  "messages_loaded": 3482,
  "threads_skipped_outside_window": 11,
  "threads_failed": 2,
  "duration_ms": 91234
}
```

Rule:

- metrics chỉ chứa số deterministic của extract/load
- không nhét error detail dài vào đây

### 5.7 `pipeline_run.reuse_summary_json`

Schema:

```json
{
  "raw_reused_thread_count": 84,
  "raw_refetched_thread_count": 33,
  "ods_reused_thread_count": 0,
  "ods_rebuilt_thread_count": 117,
  "reuse_reason": "etl_config_changed"
}
```

`reuse_reason` enum:

- `"fresh_run"`
- `"coverage_extended"`
- `"etl_config_changed"`
- `"source_updated"`
- `"manual_reuse_for_official"`

### 5.8 `thread.current_phone_candidates_json`

Schema:

```json
[
  {
    "phone_number": "0901234567",
    "source": "conversation_recent_phone_numbers",
    "last_seen_at": "2026-01-24T08:15:00+07:00"
  }
]
```

Rule:

- extractor chỉ dedupe theo raw `phone_number` từ source
- không normalize, không sửa format, không tạo `match_key` trong canonical extract
- nếu sau này cần `match_key` cho CRM mapping thì đó là derived evidence của flow mapping riêng

### 5.9 `thread_day.observed_tags_json`

Schema:

```json
[
  {
    "source_tag_id": "29",
    "source_tag_text": "ĐÃ CHỐT HẸN"
  }
]
```

### 5.10 `thread_day.normalized_tag_signals_json`

Schema:

```json
{
  "journey": [
    {
      "canonical_code": "revisit",
      "source_tag_id": "8",
      "mapping_source": "operator"
    }
  ],
  "need": [],
  "outcome": [
    {
      "canonical_code": "appointment_booked",
      "source_tag_id": "29",
      "mapping_source": "operator"
    }
  ],
  "branch": [],
  "staff": [],
  "noise": [
    {
      "source_tag_id": "999",
      "source_tag_text": "TỰ TẠO",
      "mapping_source": "auto_default"
    }
  ]
}
```

Rule:

- luôn có đủ 6 key
- value luôn là array

### 5.11 `thread_day.opening_block_json`

Schema:

```json
{
  "candidate_message_ids": ["m1", "m2", "m3"],
  "messages": [
    {
      "message_id": "m1",
      "sender_role": "third_party_bot",
      "message_type": "template",
      "redacted_text": "Xin chào..."
    }
  ],
  "explicit_signals": [
    {
      "signal_role": "journey",
      "signal_code": "revisit",
      "source": "opening_rule",
      "message_id": "m2",
      "raw_text": "Khách hàng tái khám"
    }
  ],
  "cut_reason": "first_meaningful_message"
}
```

`cut_reason` enum:

- `"first_meaningful_message"`
- `"max_messages_reached"`
- `"no_opening_block"`

### 5.12 `thread_day.staff_participants_json`

Schema:

```json
[
  {
    "staff_name": "Hằng",
    "sender_source_id": "123456",
    "message_count": 4
  }
]
```

### 5.13 `thread_day.staff_message_stats_json`

Schema:

```json
[
  {
    "staff_name": "Hằng",
    "message_count": 4,
    "first_message_at": "2026-01-24T08:22:00+07:00",
    "last_message_at": "2026-01-24T08:40:00+07:00"
  }
]
```

### 5.14 `message.attachments_json`

Schema:

```json
[
  {
    "attachment_type": "image",
    "url": "https://...",
    "title": null
  }
]
```

Rule:

- chỉ giữ subset cần cho audit/AI bundle về sau
- không dump nguyên raw attachment blob nếu không cần

### 5.15 `thread_day.source_thread_json_redacted`

Mục đích:

- lưu bản redacted của raw thread-level payload để audit/replay

Schema:

```json
{
  "conversation": {
    "id": "26456821540601695",
    "updated_at": "2026-01-24T08:45:00+07:00",
    "recent_phone_numbers": ["+84901234567"]
  },
  "activities": [
    {
      "type": "ad_click",
      "ad_id": "123",
      "post_id": "456"
    }
  ]
}
```

### 5.16 `message.source_message_json_redacted`

Mục đích:

- giữ đủ raw redacted để debug actor classification và opening extraction

Rule:

- shape bám source Pancake sau khi redact token/secret/PII
- không normalize lại ở cột này

## 6. Contract Backend <-> Go-Worker

Worker job JSON phải là contract duy nhất mà worker nhận từ backend.

Schema:

```json
{
  "manifest_version": 1,
  "pipeline_run_id": "uuid",
  "run_group_id": "uuid",
  "connected_page_id": "uuid",
  "page_id": "1406535699642677",
  "user_access_token": "token",
  "business_timezone": "Asia/Ho_Chi_Minh",
  "target_date": "2026-01-24",
  "run_mode": "manual_range",
  "processing_mode": "etl_only",
  "publish_eligibility": "not_publishable_old_partial",
  "requested_window_start_at": "2026-01-24T07:00:00+07:00",
  "requested_window_end_exclusive_at": "2026-01-25T10:00:00+07:00",
  "window_start_at": "2026-01-24T07:00:00+07:00",
  "window_end_exclusive_at": "2026-01-25T00:00:00+07:00",
  "is_full_day": false,
  "etl_config": {
    "config_version_id": "uuid",
    "etl_config_hash": "sha256:...",
    "tag_mapping": {},
    "opening_rules": {},
    "scheduler": {}
  }
}
```

Rule:

- worker không tự query config từ DB rồi tự hợp thành run snapshot
- backend là owner duy nhất của manifest freeze
- nếu manifest đổi shape thì phải bump `manifest_version`
- vì đây là extraction module, worker chỉ nhận ETL-effective config; prompt/taxonomy/AI config không cần đi vào manifest extract

`publish_eligibility` enum:

- `"official_full_day"`
- `"provisional_current_day_partial"`
- `"not_publishable_old_partial"`

## 7. API Contract Cần Có Ở Backend

### 7.1 Page onboarding/control-plane

- `POST /chat-extractor/control-center/pages/list-from-token`
- `POST /chat-extractor/control-center/pages/register`
- `GET /chat-extractor/control-center/pages`
- `GET /chat-extractor/control-center/pages/:id`
- `POST /chat-extractor/control-center/pages/:id/config-versions`
- `POST /chat-extractor/control-center/pages/:id/config-versions/:configVersionId/activate`

`register` phải cho phép lazy operator:

```json
{
  "pancake_page_id": "1406535699642677",
  "user_access_token": "token",
  "business_timezone": "Asia/Ho_Chi_Minh"
}
```

Backend tự làm:

- tạo `connected_page`
- tạo `page_config_version` mặc định:
  - `tag_mapping_json.default_role = noise`
  - `opening_rules_json.selectors = []`
  - `scheduler_json = null` để kế thừa default hệ thống
  - `notification_targets_json = null` hoặc rỗng
  - `prompt_text = default page prompt`

Tinh thần của onboarding:

- tối thiểu chỉ cần `access token -> chọn page -> activate`
- mọi config chi tiết chỉ làm tăng chất lượng parse/phân tích, không phải điều kiện để pipeline chạy

### 7.2 Manual run preview/execute/publish

- `POST /chat-extractor/jobs/preview`
- `POST /chat-extractor/jobs/execute`
- `POST /chat-extractor/runs/:id/publish`
- `GET /chat-extractor/run-groups/:id`
- `GET /chat-extractor/runs/:id`

Preview request:

```json
{
  "kind": "manual",
  "connected_page_id": "uuid",
  "job": {
    "processing_mode": "etl_only",
    "requested_window_start_at": "2026-01-24T07:00:00+07:00",
    "requested_window_end_exclusive_at": "2026-01-25T10:00:00+07:00"
  }
}
```

Preview response phải có:

- `run_group` summary
- `child_runs[]`
- mỗi child có:
  - `target_date`
  - `window_start_at`
  - `window_end_exclusive_at`
  - `is_full_day`
  - `publish_eligibility`
  - `will_use_config_version`
  - `will_use_prompt_version`
  - `will_use_compiled_prompt_hash`
  - `historical_overwrite_required`

Publish request:

```json
{
  "publish_as": "official",
  "confirm_historical_overwrite": false,
  "expected_replaced_run_id": null
}
```

`publish_as` enum:

- `"official"`
- `"provisional"`

Backend validation:

- partial old day: reject mọi publish
- partial current day: chỉ cho `"provisional"`
- full-day current day: cho `"official"`
- full-day historical day: chỉ cho `"official"` nếu `confirm_historical_overwrite = true`
- nếu đang có snapshot cùng `page + target_date + publish class` thì `expected_replaced_run_id` phải khớp để tránh blind overwrite
- publish transaction phải atomically:
  - promote run hiện tại
  - supersede snapshot cũ cùng class nếu có
  - với official publish của full-day run, supersede cả provisional snapshot cùng ngày nếu có

## 8. Go-Worker Processing Shape

### 8.1 Runner contract

`backend/go-worker/internal/job/request.go` phải đổi sang struct mới bám `manifest_version` và `frozen_config`.

### 8.2 Extract sequence

1. lấy conversation list incremental cho window
2. chọn thread candidate theo `updated_at`
3. với từng thread:
   - fetch message pages cho tới khi đã đủ coverage hoặc chạm guardrail
   - classify actor
   - cắt opening block
   - xác định `first_meaningful_message`
   - parse source fact `post_id`, `ad_id`, `activities`, `ad_click`
   - map tags sang signal chuẩn
   - build metrics deterministic
4. load transactionally vào `thread`, `thread_day`, `message`
5. cập nhật `pipeline_run.metrics_json`, `reuse_summary_json`, `status`

Rule window:

- với `official_daily` cho ngày `D`, planner tạo canonical window `[00:00 ngày D, 00:00 ngày D + 1)`
- source discovery có thể overlap thêm `lookback_hours` ở sát biên cuối ngày để tránh miss conversation cập nhật rất muộn
- dù source discovery có overlap, worker chỉ được persist message nằm trong canonical window của run

### 8.3 Reuse logic

Worker không quyết định policy; worker chỉ thực hiện manifest và trả reuse summary:

- raw reuse: sử dụng source payload đã cache/local artifact nếu còn coverage hợp lệ
- ODS reuse: chỉ khi backend manifest chỉ ra ETL config hash không đổi và unit có thể skip rebuild
- nếu ETL config đổi thì worker phải rebuild `thread_day` derived fields từ raw/source đã có

### 8.4 Load semantics

Load theo transaction nhỏ ở grain `thread_day`, không ôm transaction quá lớn cho toàn run.

Mỗi `thread_day`:

- upsert `thread`
- insert `thread_day`
- insert messages của `thread_day`

Nếu fail một thread:

- ghi vào metrics/error bucket
- không rollback toàn run

## 9. Execution Units

### Unit 1: Rewrite Prisma schema và migration extraction seam

**Target outcome:** Schema DB mới tồn tại đầy đủ cho control-plane và ODS; toàn bộ model extraction cũ bị loại bỏ.

**Owned write scope:**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/prisma/seed.ts` nếu cần seed default taxonomy/scheduler

**Implementation shape:**

- drop hẳn tables/models extraction cũ không còn đúng seam, sau đó tạo schema mới từ đầu
- reset hoặc thay mới migration chain extraction nếu cách đó sạch hơn so với patch tiếp
- loại bỏ hoàn toàn các model `ConnectedPage`, `EtlRun`, `ConversationDay`, `PageAiProfileVersion` cũ theo shape hiện tại
- tạo models mới theo mục 4
- dùng `jsonb` cho toàn bộ JSON contracts
- thêm unique/index đúng grain

**Proof:**

- `bunx prisma validate`
- `bunx prisma migrate deploy` trên DB trống

**Stop conditions:**

- còn cột `activeAiProfilesJson`, `activeTagMappingJson`, `activeOpeningRulesJson` trên `connected_page`
- còn table `conversation_day` trong schema mới
- còn migration/runtime path nào phụ thuộc vào schema extraction cũ

**Banned shortcuts:**

- giữ model cũ rồi alias tên mới trong code
- rename tối thiểu nhưng giữ nguyên shape cũ ở dưới

### Unit 2: Rewrite backend chat_extractor control-plane và planner

**Target outcome:** Backend là owner duy nhất của page config versioning, prompt identity, preview split, execute manifest, publish eligibility.

**Owned write scope:**

- `backend/src/modules/chat_extractor/chat_extractor.types.ts`
- `backend/src/modules/chat_extractor/chat_extractor.controller.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`
- `backend/src/modules/chat_extractor/chat_extractor.planner.ts`
- `backend/src/modules/chat_extractor/chat_extractor.artifacts.ts`

**Implementation shape:**

- xoá hoặc rewrite toàn bộ DTO/repository/service/planner cũ của `chat_extractor` theo contract mới
- không giữ endpoint payload cũ để "đỡ sửa frontend"; frontend sẽ follow contract mới sau
- thay DTO cũ bằng DTO mới cho config version, preview, execute, publish
- planner split range thành child run theo `target_date`
- tính `publish_eligibility`
- freeze `page_config_version`, `taxonomy_version`, và runtime-resolved compiled prompt identity trên `run_group`
- build worker manifest versioned
- run detail API trả child runs và action eligibility

**Proof:**

- DTO validation tests
- planner tests cho:
  - full-day
  - partial current day
  - partial old day
  - config snapshot freeze
  - historical overwrite confirmation
  - supersede provisional bằng official cho cùng `page + target_date`
  - `prompt_text` giữ nguyên nhưng taxonomy/system prompt đổi thì compiled prompt hash phải đổi
  - prompt content quay lại đúng compiled content cũ thì reuse lại `prompt_version`

**Stop conditions:**

- backend vẫn cho publish partial old day
- preview response không trả rõ `publish_eligibility`
- run manifest không chứa frozen config hash
- run_group không freeze được `frozen_compiled_prompt_hash` và `frozen_prompt_version`
- còn service/repository path nào đọc `active_*_json` trực tiếp từ `connected_page`

**Banned shortcuts:**

- để worker tự đọc config từ DB
- dùng `prompt_hash` làm version hiển thị cho người dùng
- giữ lại controller/service method cũ chỉ để route cũ còn pass
- ép operator nhập prompt dưới dạng JSON config
- trộn `system prompt` và `page custom prompt` thành một field không phân biệt trách nhiệm

### Unit 3: Rewrite go-worker extract/transform/load

**Target outcome:** Worker tiêu thụ manifest mới và persist đúng ODS theo schema mới.

**Owned write scope:**

- `backend/go-worker/internal/job/*`
- `backend/go-worker/internal/controlplane/*`
- `backend/go-worker/internal/extract/*`
- `backend/go-worker/internal/transform/*`
- `backend/go-worker/internal/load/*`
- `backend/go-worker/internal/pancake/*`
- `backend/go-worker/main.go`

**Implementation shape:**

- xoá hoặc rewrite triệt để request/transform/load structs cũ encode contract cũ
- đổi request struct sang manifest mới
- implement actor classification theo sample audit
- implement `first_meaningful_message`
- implement opening signal extraction best-effort
- implement tag normalization default `noise`
- persist `recent_phone_numbers[].phone_number` theo raw source value đã dedupe, không normalize
- implement per-thread-day transactional load
- persist run metrics/reuse summary

**Proof:**

- `go test ./...`
- fixture tests cho:
  - opening flow Botcake
  - ad click opening
  - tag unmapped -> `noise`
  - partial window chỉ persist message thuộc coverage

**Stop conditions:**

- worker còn assume config nullable
- worker còn persist message ngoài window canonical của child run
- worker không lưu `source_thread_json_redacted` và `source_message_json_redacted`
- còn code path load vào bảng/cột extraction cũ

**Banned shortcuts:**

- regex-heavy intent detection thay cho signal extraction deterministic
- persist nguyên raw payload chưa redact
- giữ song song parser/loader cũ và mới sau khi slice hoàn tất
- đưa prompt/taxonomy/AI config thừa vào worker extract manifest
- normalize hay rewrite phone source value ngay trong extractor

## 10. Verification Matrix

Trước khi coi slice là xong, phải chứng minh:

1. `Lazy operator`
   - register page chỉ với token + page id + timezone
   - backend tự tạo default config chạy được

2. `Preview semantics`
   - manual range `2026-01-24 07:00 -> 2026-01-25 10:00` split đúng:
     - `24/01` partial old day -> not publishable
     - `25/01` partial current day -> provisional eligible

3. `Official window semantics`
   - official run cho ngày `D` mặc định bắt đầu lúc `00:00 ngày D + 1`
   - canonical window phải là `[00:00 ngày D, 00:00 ngày D + 1)`
   - overlap `lookback_hours = 2` không làm persist thêm message ngoài window này

4. `Config freeze`
   - đổi prompt/config sau khi tạo preview không làm thay đổi run_group đã execute

5. `Prompt identity`
   - nội dung compiled prompt quay lại đúng content cũ thì reuse lại `prompt_version` cũ
   - nếu `prompt_text` giữ nguyên nhưng taxonomy/output contract hoặc system prompt đổi thì `compiled_prompt_hash` phải đổi theo

6. `ODS correctness`
   - `is_new_inbox` deterministic
   - `opening_block_json` có explicit signal nếu rules match
   - unmapped tag mặc định vào `noise`

7. `Run detail usefulness`
   - run detail response đủ để frontend render `xem kết quả run` mà chưa cần publish dashboard

8. `Publish supersede semantics`
   - publish official cho full-day run phải supersede provisional snapshot cùng `page + target_date` nếu tồn tại
   - historical full-day publish phải fail nếu thiếu `confirm_historical_overwrite` hoặc lệch `expected_replaced_run_id`

## 11. Hostile Review Checklist

- Có chỗ nào để `role = null` không.
- Có chỗ nào tag chưa map không rơi vào `role = noise` với `mapping_source = auto_default` không.
- Có chỗ nào `prompt_text` lại bị ép thành JSON form trong backend DTO không.
- Có chỗ nào `page_config_version` lại giữ FK hoặc cached field cho compiled prompt identity không.
- Có chỗ nào worker tự đọc page config live thay vì manifest freeze không.
- Có chỗ nào worker extract lại nhận cả AI config/prompt dù không cần không.
- Có chỗ nào partial old day vẫn lọt vào publish path không.
- Có chỗ nào publish historical full-day thiếu explicit overwrite confirmation hoặc không supersede atomically snapshot cũ không.
- Có chỗ nào config impact class bị trộn, khiến đổi `opening_rules` mà lại chỉ rerun AI không rebuild ODS không.
- Có chỗ nào taxonomy active của page lại được chọn ngoài `active_config_version_id -> analysis_taxonomy_version_id` không.
- Có chỗ nào `thread_day` không còn là grain canonical chính không.

## 12. Không Làm Trong Slice Này

- AI analysis execution
- semantic mart / export `.xlsx`
- UI implementation
- AI-assisted CRM mapping flow cho ambiguous thread link

Những phần đó nối vào sau, nhưng không được làm thay đổi lại extraction contract của slice này.
