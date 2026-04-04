# Review backend ETL pipeline vs design/plan

Ngày review: `2026-04-04`

Cập nhật lần 2: đã review lại backend sau các thay đổi mới trong `chat_extractor` và `go-worker`.

Cập nhật lần 3: review tiếp sau khi các fix ở lần 2 đã được áp dụng và có thêm test.

Scope:

- Chỉ review `backend/` và `backend/go-worker/`
- Đối chiếu với `docs/design.md`
- Đối chiếu với `docs/plans/extract-module-db-backend-go-worker-implementation-plan.md`
- Bỏ qua `frontend/` và `service/`

## Open Findings

- Không còn finding mở trong scope review này.

## Resolved Findings

### [RESOLVED] Worker exit code khác `0` không còn bị control-plane coi như execute thành công

Trạng thái cũ:

- `runWorkerManifest()` chỉ trả `ok: false` khi process exit non-zero, không throw.
- `executeJobRequest()` chỉ abort execution khi `runWorkerImpl()` throw.
- Vì vậy worker exit `1` có thể vẫn bị collect vào `executions[]` và request backend vẫn trả thành công.

Trạng thái hiện tại:

- `executeJobRequest()` validate kết quả từ worker sau mỗi lần spawn.
- Nếu worker trả `ok: false`, service throw fail-closed với exit code/stdout/stderr compact.
- Path này đi qua cùng abort logic như worker throw, nên current run và queued sibling được mark `failed` nhất quán.

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.test.ts`

### [RESOLVED] Race theo `promptVersion` không còn khi hai compiled prompt hash mới được tạo đồng thời trên cùng page

Trạng thái cũ:

- Fix cũ chỉ absorb unique-conflict theo `(connected_page_id, compiled_prompt_hash)`.
- `promptVersion` vẫn được chọn ở caller bằng `nextPromptVersion(listPromptIdentities(...))` trước khi insert.
- Hai request concurrent tạo hai hash khác nhau trên cùng page vẫn có thể cùng chọn một `promptVersion` mới và một request fail ở unique `(connected_page_id, prompt_version)`.

Trạng thái hiện tại:

- Repository serialize path create prompt identity theo page trong transaction có lock trên `connected_page`.
- Việc resolve existing hash, đọc các version đã có, chọn `nextPromptVersion(...)` và insert mới giờ chạy trong cùng critical section.
- Service không còn tự cấp `promptVersion` trước khi persist; repository là owner của version allocation.

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`
- `backend/src/modules/chat_extractor/chat_extractor.repository.test.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts`

### [RESOLVED] `pipeline_run_group.started_at` và `finished_at` không còn phụ thuộc order query DB

Trạng thái cũ:

- `refreshRunGroupStatus()` fetch child runs theo `runGroupId` nhưng không sort.
- `startedAt` lấy `runs.find(...)`
- `finishedAt` lấy `reverse().find(...)`
- Hai giá trị này phụ thuộc vào order trả về của DB.

Trạng thái hiện tại:

- `refreshRunGroupStatus()` derive `startedAt` theo minimum non-null `started_at`.
- `finishedAt` derive theo maximum non-null `finished_at`.
- Metadata ở `pipeline_run_group` giờ ổn định kể cả khi DB trả child runs theo thứ tự bất kỳ.

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`
- `backend/src/modules/chat_extractor/chat_extractor.repository.test.ts`

### [RESOLVED] `executeJobRequest()` không còn để run/group mới tạo bị kẹt ở `queued` khi worker throw trước lúc worker kịp update state

Trạng thái cũ:

- service chỉ refresh `run_group` sau khi loop worker hoàn tất
- nếu spawn worker fail sớm thì current run và các queued sibling có thể bị kẹt state

Trạng thái hiện tại:

- backend mark từng child run sang `running` trước khi spawn worker
- nếu spawn fail thì backend abort execution theo `run_group`, mark current run và các queued sibling sang `failed`
- `refreshRunGroupStatus()` luôn chạy trong `finally`

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`

### [RESOLVED] Re-register page không còn vô tình reset `etl_enabled` / `analysis_enabled`

Trạng thái cũ:

- `registerPageBodySchema` tự inject default flag ngay cả khi caller không gửi
- re-register có thể ghi đè state hiện tại của page

Trạng thái hiện tại:

- flag trong register request là optional
- service resolve page hiện có theo `pancake_page_id`
- nếu caller không gửi flag thì service preserve state hiện tại; nếu là page mới thì vẫn dùng default onboarding

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.types.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`

### [RESOLVED] Prompt identity không còn fail ngẫu nhiên vì race khi concurrent execute cùng tạo một compiled prompt mới

Trạng thái cũ:

- `createPromptIdentity()` insert trực tiếp
- request race có thể dính `P2002` thay vì reuse row vừa được request còn lại tạo

Trạng thái hiện tại:

- repository absorb unique-conflict trên `page_prompt_identity`
- khi create dính `P2002`, code re-read theo `(connected_page_id, compiled_prompt_hash)` và reuse row đã tồn tại

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.repository.ts`

### [RESOLVED] Entry-source resolution đã deterministic khi tie đến từ `ad_clicks` của message endpoint

Trạng thái cũ:

- `flattenAdClicks()` iterate trực tiếp trên Go map
- `resolveEntrySource()` fallback về append order ở tie-break cuối

Trạng thái hiện tại:

- `flattenAdClicks()` sort source refs ổn định trước khi merge
- `resolveEntrySource()` thêm lexical tie-break trên `sourceType`, `postID`, `adID` trước khi đụng tới append order

Code refs:

- `backend/go-worker/internal/extract/runner.go`
- `backend/go-worker/internal/transform/build.go`

### [RESOLVED] `/health` degrade nhất quán cho cả Redis và Postgres

Trạng thái cũ:

- Redis ping degrade graceful
- Prisma probe throw ra global error handler thành `500`

Trạng thái hiện tại:

- DB probe được bọc local trong `/health`
- endpoint luôn trả payload health `ok/degraded` thay vì văng `500` khi Postgres probe fail

Code refs:

- `backend/src/app.ts`

### [RESOLVED] Source attribution đã được extract vào `entry_source_type`, `entry_post_id`, `entry_ad_id`

Trạng thái cũ:

- Worker chưa decode và chưa gán source attribution fields.

Trạng thái hiện tại:

- Pancake types đã decode `post_id`, `ad_id`, `activities`, `ad_clicks`
- extractor merge các source facts vào `MessageContext`
- transform có `resolveEntrySource()` và gán các field entry source vào `ConversationDaySource`

Code refs:

- `backend/go-worker/internal/pancake/types.go`
- `backend/go-worker/internal/extract/runner.go`
- `backend/go-worker/internal/transform/build.go`

### [RESOLVED] `thread_day.message_count` không còn lấy từ số message fetch thô

Trạng thái cũ:

- `MessageCount` lấy theo số message nhìn thấy từ source trước khi filter theo canonical window.

Trạng thái hiện tại:

- `MessageCount` được set theo `len(dedupedMessages)`, tức tập message sau sort/dedupe trong canonical build path.

Code refs:

- `backend/go-worker/internal/transform/build.go`

### [RESOLVED] Response metric không còn là placeholder `avg = first`

Trạng thái cũ:

- `buildResponseMetrics()` chỉ lấy cặp customer đầu tiên và staff đầu tiên, rồi set `avg = first`.

Trạng thái hiện tại:

- Code đã tính danh sách `responseDurations`
- `first_staff_response_seconds` lấy phần tử đầu
- `avg_staff_response_seconds` tính average trên các response duration đã thu thập

Code refs:

- `backend/go-worker/internal/transform/build.go`

### [RESOLVED] Actor normalization đã dùng `unknown_page_actor` thay cho `unclassified_page_actor`

Trạng thái cũ:

- Worker emit giá trị actor lệch với contract trong `docs/design.md`.

Trạng thái hiện tại:

- `classifySenderRole()` đã trả `unknown_page_actor`

Code refs:

- `backend/go-worker/internal/transform/build.go`
- `docs/design.md`

### [RESOLVED] Backend đã có runtime path cho `official_daily`

Trạng thái cũ:

- API jobs chỉ nhận manual flow.

Trạng thái hiện tại:

- `previewJobBodySchema` và `executeJobBodySchema` đã support `kind = "official_daily"`
- service plan/execute đúng `run_mode = official_daily`
- đã có service test cover path này

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.types.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.test.ts`

### [RESOLVED] Preview child run đã trả đủ frozen snapshot fields

Trạng thái cũ:

- Child preview chỉ trả coverage/publish eligibility.

Trạng thái hiện tại:

- `serializePreviewChildRun()` đã trả:
  - `will_use_config_version`
  - `will_use_prompt_version`
  - `will_use_compiled_prompt_hash`

Code refs:

- `backend/src/modules/chat_extractor/chat_extractor.service.ts`

## Verification

Đã chạy:

- `bun test`
- `go test ./...`

Kết quả:

- Test hiện tại đều pass.
- `official_daily` path và preview child snapshot fields đã có test ở:
  - `backend/src/modules/chat_extractor/chat_extractor.service.test.ts`
- Các finding vừa resolve hiện đã có test cover trực tiếp cho:
  - worker non-zero exit làm abort/fail state thay vì trả execute thành công
  - worker spawn failure làm abort/fail state thay vì stale `queued`
  - register idempotency với page flags
  - concurrent prompt identity creation
  - run-group timestamp derive theo min/max thay vì order query
  - deterministic tie-break của entry source
  - health degradation khi Postgres lỗi
