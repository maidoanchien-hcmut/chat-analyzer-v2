# Kế Hoạch Cho Slice End-to-End Đầu Tiên Của Ứng Dụng

**Goal:** Hoàn tất slice end-to-end đầu tiên của `chat-analyzer-v2` để hệ thống chạy được luồng lõi theo `docs/design.md`: ETL deterministic -> AI analysis có audit -> semantic mart publishable -> dashboard/export/thread investigation đọc dữ liệu thật.

**Scope Note:** Đây không phải plan để hoàn thiện toàn bộ app theo mọi capability trong `docs/design.md` và `docs/ui-flows.md`. Đây là plan để chốt owner-clean first slice cho business analytics path và investigation path, đồng thời ghi rõ những capability nào vẫn còn thiếu sau khi plan này hoàn tất.

**Architecture:** `backend/` tiếp tục là owner của control-plane, orchestration, persistence, publish semantics, semantic mart, read APIs và CRM mapping audit. `service/` được coi là code cũ có thể thay toàn bộ; service mới chỉ là runtime phân tích AI theo bundle freeze từ backend, dùng Python + Pydantic v2, không trở thành framework trung tâm của repo và không tự đọc DB sống. `service` là owner của lớp `system prompt`; `backend` là owner của page prompt snapshot, taxonomy freeze, prompt identity và metadata audit của run. `frontend/` giữ app shell đã rewrite, nhưng business views phải chuyển từ demo fixture sang seam HTTP thật đọc từ semantic mart và audit/read models; frontend không gọi `service` trực tiếp.

**Intent:** Chốt nốt các seam còn thiếu để app trả lời được các câu hỏi trong `docs/insight.md` bằng snapshot đã publish, thay vì bằng fixture hoặc heuristic runtime tạm.
**Observable Delta:** Sau khi hoàn tất plan này, một page có thể `connect -> extract -> analyze -> build mart -> publish` bằng manual/business path, và các màn `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại`, `So sánh trang`, `Export`, `Vận hành` trong scope first slice đều đọc cùng một nguồn publish thật với metadata prompt/config/taxonomy nhất quán.
**Primary Contract:** Mọi dữ liệu business-facing và `.xlsx` chỉ được đọc từ semantic mart đã materialize theo từng `pipeline_run` và được resolve qua active publish snapshot pointer xác định tường minh theo `page + target_date + publish channel`; mọi audit và drill-down AI chỉ được đọc từ ODS + AI inference store của chính snapshot đó; `draft` chỉ đọc qua run-scoped preview/result APIs với `run_id` tường minh, không đi qua dashboard path mặc định; AI runtime chỉ nhận bundle freeze từ backend và trả structured output canonical.
**First Proof:** Một full-day run local cho đúng 1 page và 1 ngày phải chứng minh được toàn tuyến `thread_day/message loaded -> analysis_run/analysis_result persisted idempotent -> fact_thread_day/fact_staff_thread_day materialized -> active published_official pointer atomically switched -> overview/staff/thread/export HTTP trả dữ liệu thật cùng version metadata`.
**First Slice:** Thêm analysis orchestration owner-clean cho một `pipeline_run` đã load xong ODS, persist được `analysis_run` và `analysis_result` từ service mới mà không dùng lại runtime heuristic hiện tại.
**Blast Radius:** `backend/prisma/schema.prisma`, migrations mới, module backend cho analysis/mart/read-model/mapping, `proto/`, toàn bộ `service/` runtime, adapter HTTP business của frontend, và một phần render/state ở `frontend/` phải đi cùng nhau vì cùng owner một contract publish/audit.
**Execution Posture:** Thực hiện theo các execution unit owner-clean. Không giữ dual-path lâu dài kiểu `demo adapter cho business` song song với `HTTP thật`, không giữ service heuristic như runtime thật, và không vá dashboard bằng query trực tiếp từ ODS/raw tables.
**Allowed Mechanism:** Rewrite service mạnh tay; gRPC typed giữa backend và service; materialized fact rows per run; HTTP read APIs typed cho business views; label rendering theo `analysis_taxonomy_version`; targeted tests/integration fixtures; README/docs cập nhật theo shape mới.
**Forbidden Shortcuts:** Query dashboard trực tiếp từ `thread_day + analysis_result`; build staff coaching trong frontend; để frontend tự hợp nhất raw/code thành nhãn business; để service tự query dữ liệu ngoài request bundle; coi `revisit` là `primary_need`; giữ business views trên fixture chỉ vì backend chưa xong.
**Forbidden Scaffolding:** Không thêm shim `demo-to-http`, không thêm bridge service cũ -> service mới, không thêm read endpoint "tạm" trả shape gần giống fixture nhưng không gắn mart, không thêm semantic path thứ hai ngoài mart đã publish, không thêm ownership layer tenant/company/workspace.
**Proof Obligations:** `bun test` cho backend/frontend, `go test ./...`, `uv run pytest` hoặc tương đương cho service mới, migration deploy được trên DB trống, một fixture/integration proof chứng minh full-day publish và HTTP reads nhất quán, export `.xlsx` dùng đúng snapshot official, compare-page đọc cùng snapshot resolver như overview, `draft` run xem được qua preview/run-result mà không rò sang dashboard, và UI/backend cùng expose đúng warning cho `published_provisional` hoặc mixed-version slice.

**Proof Ownership:**
- Architect-owned proof: Owner boundary ETL vs AI vs mart, grain `thread_day` và `staff_thread_day`, publish semantics, taxonomy governance, và contract audit phải đúng `docs/design.md`.
- Executor-owned proof: Runtime analysis orchestration, service rewrite, mart builder, read APIs, frontend adapter swap, export builder, tests.
- Hostile-review focus: Dùng raw/ODS thay mart cho dashboard, giữ heuristic service như production path, trộn `journey_code` với `primary_need_code`, hoặc để frontend business tiếp tục chạy bằng fixture.
- Escalation trigger: Nếu implementation cần service truy cập DB trực tiếp, nếu semantic mart không đủ để trả lời business views mà phải query live từ ODS, hoặc nếu CRM mapping cần contract CRM chưa hề được pin trong repo.

**Not Done Until For This Plan:** Repo không còn phụ thuộc runtime vào `service/analysis_runtime.py` heuristic hiện tại hoặc `frontend/src/adapters/demo/business-adapter.ts` cho business views trong scope first slice, dashboard/export đọc dữ liệu publish thật, thread audit xem được evidence thật, và operator có thể xem rõ snapshot/config/prompt/taxonomy của dữ liệu đang đọc.

**Solution Integrity Check:**
- Least-painful patch: Giữ service heuristic hiện tại, thêm vài endpoint backend query thẳng `thread_day/analysis_result`, rồi map sang UI/export shape trong frontend.
- Why rejected: Cách này cho ra số nhìn giống sản phẩm nhưng phá vỡ ranh giới owner của semantic mart, không khóa được publish semantics, không đảm bảo consistency giữa dashboard/export/thread audit, và sẽ làm mọi metric mới thành một lần vá query.
- Largest owner-clean slice: `analysis orchestration + service rewrite`, rồi `semantic mart + read APIs`, rồi `frontend switch sang HTTP thật`, với CRM mapping là một seam riêng chỉ mở khi contract CRM được pin.
- Why this slice is safe for a strong agent: Repo là dev environment, `service/` đã được user cho phép coi là code cũ có thể đập đi, extraction seam đã có nền ổn định, và frontend business hiện vẫn là demo nên chưa có compatibility burden thật.
- If forced to stage: Chỉ stage theo seam bền vững `analysis`, `mart/read-model`, `frontend wiring`, `CRM mapping`; không stage kiểu "query tạm", "adapter tạm", "heuristic trước LLM sau".
- Debt or drift path: Không chấp nhận debt dual-source cho business UI. Nếu trong lúc chuyển còn cần fixture, fixture chỉ được dùng cho test/offline dev, không được là runtime path mặc định của app business.

## 1. Ảnh Chụp Hiện Trạng Repo

### Đã có nền tương đối tốt

- `backend/` đã có control-plane và ODS seam owner-clean cho extract:
  - `connected_page`
  - `page_config_version`
  - `page_prompt_identity`
  - `analysis_taxonomy_version`
  - `pipeline_run_group`
  - `pipeline_run`
  - `thread`
  - `thread_day`
  - `message`
  - `thread_customer_link`
  - `thread_customer_link_decision`
  - `analysis_run`
  - `analysis_result`
- `backend/go-worker/` đã extract + transform + load deterministic vào ODS, bao gồm opening block, tag signals, entry source, response metrics và staff participants.
- Frontend shell, route/query-state, operations/config views đã rewrite owner-clean và đã có path HTTP-first cho control-plane.

### Chưa hoàn tất hoặc mới là contract

- `backend/` chưa có runtime path cho:
  - gọi AI service
  - persist `analysis_run` / `analysis_result` end-to-end
  - build semantic mart
  - read APIs cho business views và thread investigation
  - export `.xlsx` từ snapshot official
  - health/runtime details cho AI service
  - CRM mapping queue thật
- `service/` hiện là heuristic runtime tạm, chỉ để giữ gRPC contract; không phải production analysis engine.
- `frontend/` business views vẫn đang đọc `frontend/src/adapters/demo/business-adapter.ts`; app shell hiện hardcode business adapter demo cho:
  - `Tổng quan`
  - `Khám phá dữ liệu`
  - `Hiệu quả nhân viên`
  - `Lịch sử hội thoại`
  - `So sánh trang`
  - `Export`
- Semantic mart đích (`dim_date`, `dim_page`, `dim_staff`, `fact_thread_day`, `fact_staff_thread_day`) chưa tồn tại trong schema hiện tại.

### Kết luận hiện trạng

- Extraction seam không còn là blocker chính.
- Blocker hiện tại là thiếu `analysis -> mart -> read APIs -> frontend wiring`.
- `service/` phải bị xem là legacy replaceable, không phải nền để vá tiếp.

## 2. Invariants Phải Giữ Khi Hoàn Thiện App

- Repo này là single-company; không thêm `organization_id`, `company_id`, `workspace_id` hay tenant boundary mới.
- `customer = thread` trong scope hệ thống này.
- Grain business chính là `thread_day`; grain coaching bắt buộc là `staff_thread_day`.
- `is_new_inbox` là deterministic từ ETL; AI không được quyết định.
- `journey_code` và `primary_need_code` là 2 trục khác nhau; `revisit` không bao giờ là `primary_need_code`.
- Dashboard và export chỉ đọc semantic mart của snapshot đã publish.
- Partial-day ngày cũ không được publish dashboard.
- AI runtime chỉ nhận bundle freeze; không query dữ liệu sống ngoài request.
- `service` là owner của `system prompt`; executor không được chuyển ownership này sang `backend`.
- `backend` là owner của page prompt snapshot, taxonomy freeze, prompt identity, prompt hash/prompt version và metadata audit của run.
- `service` là owner của bước lắp ráp prompt cuối cùng gửi tới model provider, trên cơ sở system prompt của service cộng với runtime snapshot do backend freeze.
- `frontend` không bao giờ gọi `service` trực tiếp.
- Chỉ `backend` được gọi `service`, và transport giữa hai bên là gRPC.
- Page prompt chỉ là rubric cục bộ; không được đổi taxonomy canonical toàn hệ thống.
- Tag chưa cấu hình tay mặc định vào `noise` và không làm nghẽn onboarding hay daily run.
- `service/` mới phải giữ framework-neutral boundary; gRPC là transport, không phải domain contract.

## 3. Design Gate Cho Phần Còn Lại

### Hướng 1: Vá tiếp trên shape hiện tại và lấy ODS làm read model

Ưu điểm:

- ít code mới hơn lúc đầu
- có thể ra vài endpoint nhanh

Nhược điểm:

- dashboard/export sẽ phụ thuộc query động từ ODS + analysis store
- không khóa được publish/draft/provisional/official một cách sạch
- frontend phải tiếp tục map raw shape thành business model
- mọi metric mới sẽ tiếp tục là query patch

### Hướng 2: Hoàn thiện đúng kiến trúc đích `ODS + AI inference store + semantic mart + read APIs`

Ưu điểm:

- đúng owner boundary của `docs/design.md`
- audit và business views cùng đọc từ snapshot nhất quán
- export `.xlsx` có source-of-truth rõ ràng
- tách được drill-down audit khỏi dashboard aggregate

Nhược điểm:

- diff lớn
- phải làm thêm mart builder và read APIs
- cần rewrite service thực sự thay vì giữ heuristic

### Hướng 3: Đẩy nhiều logic read model vào frontend

Ưu điểm:

- backend có vẻ mỏng hơn

Nhược điểm:

- sai boundary
- gây drift giữa UI và export
- business wording/labeling khó audit
- không reuse được cho BI hay các client khác

### Recommendation

Chọn `Hướng 2`.

### Failure Modes Chính Và Mitigation

- `AI output sai taxonomy hoặc lẫn revisit/need`
  - Mitigation: schema output chặt, validation ở backend và service, hostile tests cho các case overlap.
- `Dashboard và export nhìn khác nhau cho cùng snapshot`
  - Mitigation: cả hai đều đọc từ semantic mart và cùng metadata snapshot/version.
- `Frontend tiếp tục lệ thuộc demo adapter`
  - Mitigation: cắt runtime path demo khỏi business views khi HTTP adapter thật sẵn sàng; giữ fixture chỉ cho test/dev offline.
- `Historical overwrite ghi đè âm thầm`
  - Mitigation: publish semantics giữ ở `pipeline_run`, read APIs và UI phải expose rõ prompt/config/taxonomy cũ và mới.
- `CRM mapping bị thiết kế sai vì thiếu contract CRM`
  - Mitigation: coi CRM mapping là execution unit riêng có escalation trigger; không code owner-clean khi contract CRM chưa được pin.

### Publish Ownership Contract Phải Được Pin Trước Khi Execute Mart/Read APIs

- `pipeline_run.publish_state` là trạng thái kỹ thuật của chính run, không phải thuật toán ngầm để read APIs tự đoán "snapshot đang active".
- Backend phải có owner contract tường minh cho active publish snapshot theo tối thiểu các chiều:
  - `connected_page`
  - `target_date`
  - `publish_channel` với ít nhất `official` và `provisional`
- Read APIs cho dashboard/export/compare-page phải resolve snapshot qua contract owner này; không được suy bằng:
  - run mới nhất
  - run publish gần nhất
  - row mart mới nhất
- `draft` mart rows chỉ được đọc qua:
  - `run result view`
  - `config/prompt preview workspace`
  - endpoint/run-scoped query có `run_id` tường minh
- Publish phải là atomic swap:
  - materialize mart rows xong trước
  - rồi trong một transaction/update owner-clean mới đổi active pointer cho `page + target_date + publish_channel`
  - đồng thời ghi publish audit/history để historical overwrite nhìn được snapshot cũ và mới
- `published_official` và `published_provisional` là 2 channel hiển thị khác nhau:
  - dashboard lịch sử mặc định đọc `official`
  - current-day dashboard mới được phép đọc `provisional`
  - `export` chỉ đọc `official`
- Full-day historical overwrite chỉ hợp lệ nếu có action xác nhận mạnh và audit rõ:
  - snapshot cũ bị supersede là gì
  - prompt/config/taxonomy version cũ và mới là gì
  - thời điểm publish và actor thao tác là gì
- Compare-page không có publish resolver riêng; nó phải dùng đúng snapshot resolver của overview/exploration để tránh drift giữa các màn.

## 4. Open Questions Phải Pin Trước Khi Execute Hết Plan

### Q1. Contract CRM thật đang ở đâu?

Repo hiện chưa chứa contract/API/schema rõ ràng cho CRM nội bộ. Điều này có thể đảo kiến trúc của `thread_customer_link` và `thread_customer_link_decision`, nên chỉ được triển khai flow mapping đầy đủ sau khi pin:

- transport tới CRM
- customer identifier chính
- lookup rules deterministic
- update/write-back semantics
- review/manual approve semantics

### Q2. AI provider/runtime target của `service/` là gì?

`design.md` pin contract và audit, nhưng chưa pin provider/model/runtime thật. Điều này không đảo kiến trúc tổng thể, nên execution unit đầu vẫn có thể dựng service owner-clean với boundary trung tính và adapter runtime bên trong. Nhưng trước khi claim production-ready analysis, cần pin:

- model family
- timeout/concurrency budget
- usage/cost accounting format

Điểm không được để mở khi bắt đầu EU1:

- retry/resume idempotency của analysis orchestration trong backend
- canonical unit key và uniqueness rule của `analysis_result`
- semantics cộng dồn hay recompute cho usage/cost/status khi retry

### Q3. `official_daily` scheduler runtime có nằm trong plan này không?

Hiện backend đã có `official_daily` planning semantics, nhưng chưa có scheduler runtime/queue orchestration thật. Trong plan này, scheduler runtime thật được để ngoài scope và manual run là đường hoàn tất first slice. Nếu user muốn daily automation trong cùng đợt, cần mở thêm execution unit riêng cho job runner; nếu không, plan này không được claim là "app hoàn chỉnh đầy đủ mọi flow vận hành".

## 5. Execution Unit 1: Analysis Orchestration Và Rewrite Service

**Target Outcome:** Một `pipeline_run` ở trạng thái `loaded` có thể sinh `analysis_run` và `analysis_result` thật từ bundle freeze theo từng `thread_day`, không dùng service heuristic hiện tại.

**Owned Write Scope:**

- `backend/prisma/schema.prisma`
- migration cho `analysis_run` / `analysis_result` nếu cần chỉnh shape
- module backend mới cho analysis orchestration, gRPC client, bundle builder, persistence
- `proto/conversation_analysis.proto` nếu contract cần chỉnh
- toàn bộ runtime trong `service/`
- README liên quan

**Boundary Contract:**

- Input là `pipeline_run` + `thread_day/message` + frozen config/taxonomy/prompt identity.
- Service nhận bundle freeze, tự áp lớp `system prompt` của service, rồi trả structured output canonical theo taxonomy.
- Backend validate, persist `analysis_run` và `analysis_result`, kèm usage/cost/audit fields, `prompt_version`, `prompt_hash`, taxonomy version, runtime snapshot và compiled prompt metadata đủ để UI/export/audit re-read lại được.
- Service không tự query DB, không tự quyết định snapshot, không rewrite source fact.
- Analysis orchestration phải idempotent theo unit:
  - một `analysis_run` freeze danh sách unit ngay lúc bắt đầu
  - mỗi unit gắn với `thread_day_id` và canonical reuse identity gồm tối thiểu `evidence_hash`, `prompt_hash`, `taxonomy_version`, `output_schema_version`
  - trong cùng một `analysis_run`, persistence của kết quả phải unique theo `thread_day_id` để retry/resume không double-write
  - retry cùng frozen snapshot phải resume trên `analysis_run` đang dở thay vì tạo side-effect nhân đôi; nếu frozen snapshot đổi thì phải tạo `analysis_run` mới

**Implementation Shape:**

- Rewrite `service/` theo cấu trúc owner-clean:
  - request/response models bằng Pydantic v2
  - runtime compiler cho `system prompt` do service own cộng với taxonomy/page prompt snapshot do backend freeze
  - analysis executor tách khỏi transport
  - validation lớp output trước khi trả ra transport
- Thêm backend analysis module:
  - chọn `pipeline_run` eligible cho analysis
  - build unit bundles từ `thread_day` + `message`
  - gọi service qua gRPC theo batch
  - persist `analysis_run`
  - persist `analysis_result` bằng idempotent upsert/replace trong phạm vi một `analysis_run`
  - mark status/count/cost/error chính xác theo persisted unit rows, không blind increment theo số lần retry
  - support resume chỉ cho các unit chưa thành công hoặc đã fail-closed
- Dựng invalidation/reuse identity tối thiểu:
  - evidence hash
  - prompt hash
  - prompt version
  - taxonomy version
  - output schema version
  - compiled prompt identity/runtime snapshot identity nếu contract backend đang freeze chúng riêng

**Proof To Create Or Reuse:**

- Vertical proof 1: một bundle có explicit revisit + need đặt lịch không được trả `primary_need = revisit`.
- Vertical proof 2: staff assessments chỉ sinh cho staff xuất hiện trong `thread_day`.
- Vertical proof 3: run backend gọi service, persist `analysis_run/result`, và re-read lại được `prompt_version`, `prompt_hash`, taxonomy version, evidence, supporting messages, usage/cost và runtime snapshot audit fields.
- Vertical proof 4: retry cùng một batch hoặc resume một `analysis_run` đang dở không tạo duplicate `analysis_result`, không double-count cost và không làm sai `unit_count_*`.

**Verification Command Or Artifact:**

- `cd D:\Code\chat-analyzer-v2\service && uv run pytest`
- `cd D:\Code\chat-analyzer-v2\backend && bun test`
- Integration test/fixture cho `loaded pipeline_run -> analyze -> persisted results`
- Integration test/fixture cho `analysis_run` partial failure -> resume/retry -> persisted results vẫn unique và status/cost đúng

**Stop Conditions:**

- Nếu service cần truy cập DB trực tiếp để phân tích.
- Nếu output không map sạch vào canonical codes đã pin.
- Nếu backend không thể validate fail-closed khi service trả sai schema.
- Nếu orchestration không chứng minh được resume/retry idempotent ở level `analysis_run` và `analysis_result`.

**Banned Shortcuts For This Unit:**

- Giữ `analysis_runtime.py` heuristic làm runtime chính.
- Persist raw free-text JSON rồi để backend/frontend suy luận tiếp.
- Bỏ qua `staff_assessments_json` và tính staff quality ở UI.

## 6. Execution Unit 2: Semantic Mart, Publish Materialization, Và Read Models

**Target Outcome:** Mọi run sau analysis đều materialize được semantic mart rows theo phạm vi run; dashboard/export chỉ đọc các row thuộc snapshot đã publish.

**Owned Write Scope:**

- schema/migrations cho:
  - `dim_date`
  - `dim_page`
  - `dim_staff`
  - `fact_thread_day`
  - `fact_staff_thread_day`
- backend mart builder/publisher
- backend read-model/query modules và HTTP endpoints cho business views

**Boundary Contract:**

- `fact_thread_day` và `fact_staff_thread_day` là source-of-truth cho aggregate business và export.
- Mọi run có mart rows riêng theo `pipeline_run_id`.
- Dashboard/read APIs resolve active snapshot qua publish ownership contract tường minh theo `page + target_date + publish_channel`; `pipeline_run.publish_state` chỉ là input trạng thái, không phải cách suy snapshot active.
- Thread audit/detail không đi qua fact tables, nhưng aggregate phải đi qua fact tables.
- `draft` mart rows chỉ được đọc qua run-scoped preview/result endpoints với `run_id` tường minh; dashboard mặc định không bao giờ lẫn `draft`.

**Implementation Shape:**

- Materialize mart ngay sau analysis hoàn tất:
  - map canonical ODS + analysis result -> fact rows
  - render labels/code grouping qua frozen taxonomy version
  - allocate AI cost xuống `fact_thread_day` và `fact_staff_thread_day`
- Dựng publish ownership owner-clean:
  - active snapshot pointer hoặc contract tương đương cho `official` và `provisional`
  - uniqueness/consistency rule để mỗi `page + target_date + publish_channel` chỉ có tối đa 1 snapshot active
  - publish audit/history cho supersede và historical overwrite
- Tạo read APIs cho:
  - overview
  - exploration
  - staff performance
  - page comparison
  - export preview/data source
  - run result preview đọc `draft` theo `run_id`
- Định nghĩa rõ query contract `published_official` và `published_provisional`:
  - business views historical mặc định official
  - current-day provisional có badge/coverage/version metadata
  - compare-page dùng đúng resolver này, không có query path riêng

**Proof To Create Or Reuse:**

- Vertical proof 1: cùng một snapshot, tổng `thread_count` ở overview khớp số row mart.
- Vertical proof 2: staff view chỉ đọc `fact_staff_thread_day`, không query trực tiếp `analysis_result`.
- Vertical proof 3: export cho cùng page/date range đọc cùng snapshot official như dashboard historical.
- Vertical proof 4: cùng một `page + target_date`, `draft` run xem được ở run result view nhưng dashboard historical/current mặc định không đổi cho tới khi active publish pointer được swap.
- Vertical proof 5: compare-page đọc cùng snapshot resolver như overview; cùng một ngày/page thì metric không drift giữa hai màn.
- Vertical proof 6: same-day `published_provisional` và slice mixed-version trả về coverage/version metadata đủ để frontend hiện warning đúng, còn partial-day của ngày cũ không thể xuất hiện ở dashboard.

**Verification Command Or Artifact:**

- Backend tests cho mart builder
- SQL characterization proof trên fixture run
- HTTP integration test:
  - publish official
  - gọi `/overview`, `/staff-performance`, `/export`
  - verify version metadata đồng nhất
  - verify compare-page khớp snapshot resolver của overview
  - verify `draft` chỉ đọc được qua run result endpoint với `run_id`
  - verify current-day provisional có coverage/version metadata còn old partial-day bị fail-closed khỏi dashboard

**Stop Conditions:**

- Nếu dashboard aggregate vẫn cần query `thread_day` trực tiếp để ra số chính.
- Nếu export cần logic riêng khác dashboard aggregate cho cùng metric.
- Nếu read APIs phải suy snapshot active bằng "latest run" thay vì publish ownership contract tường minh.

**Banned Shortcuts For This Unit:**

- Dùng materialized view tạm chồng trên ODS thay cho mart owner-clean.
- Trả raw code cho frontend rồi để frontend tự map label business.
- Cho business API đọc `draft` row như official data.

## 7. Execution Unit 3: Thread Investigation, Audit AI, Và Run Detail Thật

**Target Outcome:** `Lịch sử hội thoại` và `Vận hành` xem được dữ liệu thật của một run/thread thay vì fixture hoặc count thô.

**Owned Write Scope:**

- backend read APIs cho:
  - thread list trong slice
  - thread workspace 4 tab
  - run group detail
  - run child detail
  - health summary cho backend/go-worker/service/db/queue
- frontend HTTP adapters và render/state tương ứng

**Boundary Contract:**

- Thread list chính trong slice nhiều ngày ở grain `thread`.
- Khi mở thread mới thấy `thread_day` history, transcript, audit, CRM link.
- Run detail phải phân biệt ETL metrics, AI metrics, publish state, error diagnostics.
- Trong scope EU3, tab `Liên kết CRM` chỉ được phép hiển thị local persisted state đã có trong `thread_customer_link` và `thread_customer_link_decision`; mọi action lookup/remap/write-back sang CRM thật vẫn bị gate bởi EU5 sau khi contract CRM được pin.

**Implementation Shape:**

- Backend dựng thread investigation APIs từ:
  - `thread`
  - `thread_day`
  - `message`
  - `analysis_result`
  - `analysis_run`
  - `thread_customer_link`
  - `thread_customer_link_decision`
- Backend dựng operations/health APIs:
  - read current service/db/redis/go-worker availability
  - expose analysis counts/cost/errors per run
- Frontend bỏ fixture demo cho thread history và operations business details khi HTTP seam đã có.
- Nếu CRM contract chưa pin:
  - tab CRM là read-only
  - action approve/reject/remap/lookup không xuất hiện hoặc disabled với messaging rõ đây chưa phải seam active
  - không dùng placeholder fake để gọi là done

**Proof To Create Or Reuse:**

- Vertical proof 1: thread list một slice nhiều ngày không duplicate thread.
- Vertical proof 2: audit tab của một `thread_day` show đúng prompt version/hash, taxonomy version, evidence, supporting messages.
- Vertical proof 3: run detail show được cả `thread_day_count`, `message_count`, `analysis unit counts`, `publish warning`, `error_text`.
- Vertical proof 4: khi CRM contract chưa pin, thread workspace vẫn hiển thị đúng current link/decision history local nếu có, và không lộ action CRM giả hoặc placeholder done-state.

**Verification Command Or Artifact:**

- Backend integration tests cho thread workspace payload
- Frontend smoke tests chuyển từ demo sang HTTP cho thread history/operations

**Stop Conditions:**

- Nếu UI chỉ render được bằng cách frontend ghép nhiều endpoint rời rạc không có owner contract.
- Nếu run detail tiếp tục chỉ có count ODS mà không có analysis/mart metadata.

**Banned Shortcuts For This Unit:**

- Tiếp tục lấy thread history từ demo adapter.
- Cho UI tự join transcript, audit, CRM link từ nhiều payload raw không có view model backend.

## 8. Execution Unit 4: Frontend Chuyển Business Views Sang HTTP Thật

**Target Outcome:** Business UI chạy bằng dữ liệu publish thật; demo adapter chỉ còn là tool cho test/offline dev, không còn là runtime path chính.

**Owned Write Scope:**

- `frontend/src/adapters/`
- `frontend/src/app/frontend-app.ts`
- feature render/state nào đang assume demo-only fields
- tests/smoke docs

**Boundary Contract:**

- `FrontendApp` không được hardcode business adapter demo cho runtime chính.
- Business views đọc typed HTTP contracts từ backend mart/read models.
- Frontend không gọi `service`; mọi đường business runtime đều đi qua `backend`.
- Export workflow riêng vẫn giữ input tường minh `page + khoảng ngày`, nhưng data source là backend official snapshots.

**Implementation Shape:**

- Tách rõ:
  - `HttpBusinessAdapter`
  - `DemoBusinessAdapter` chỉ cho fixture/test
- Frontend boot chọn HTTP thật mặc định; demo chỉ qua cờ dev rõ ràng nếu cần.
- Update render expectations theo payload thật:
  - warning provisional
  - version boundary
  - page comparison
  - thread audit
  - export preview/download

**Proof To Create Or Reuse:**

- Vertical proof 1: boot app với backend thật và business views render không cần fixture.
- Vertical proof 2: đổi publish snapshot/filter làm HTTP queries tương ứng và số liệu đổi theo snapshot.
- Vertical proof 3: export preview và file `.xlsx` lấy đúng rows official trong range chọn.
- Vertical proof 4: compare-page render từ HTTP contract thật dùng cùng snapshot resolver với overview.
- Vertical proof 5: UI hiện đúng badge/warning cho `published_provisional`, mixed-version slice, và không hiển thị partial old-day run như dashboard data.

**Verification Command Or Artifact:**

- `cd D:\Code\chat-analyzer-v2\frontend && bun run typecheck`
- `cd D:\Code\chat-analyzer-v2\frontend && bun run build`
- `cd D:\Code\chat-analyzer-v2\frontend && bun run test`
- walkthrough HTTP thật cho các flow chính

**Stop Conditions:**

- Nếu business runtime còn import `demo/business-adapter.ts`.
- Nếu export vẫn build từ current view model thay vì workflow/query HTTP riêng.

**Banned Shortcuts For This Unit:**

- Giữ demo adapter làm default rồi thêm toggle "real mode" sau.
- Map payload HTTP thật về fixture shape cũ chỉ để né sửa render.

## 9. Execution Unit 5: CRM Linking Và Mapping Queue

**Target Outcome:** `thread_customer_link` và `thread_customer_link_decision` trở thành seam thật cho deterministic link + review/manual/AI remap, thay vì placeholder UI.

**Owned Write Scope:**

- backend CRM connector boundary
- backend mapping queue/read/write endpoints
- service support nếu có AI-assisted mapping
- frontend mapping queue UI wiring

**Boundary Contract:**

- Fast-path deterministic chỉ promote khi evidence chắc chắn.
- Ambiguous cases đi vào queue/audit.
- Current link và decision history phải xem được trong thread workspace.
- Không normalize hay sửa raw phone evidence trong canonical extract.

**Implementation Shape:**

- Chỉ execute sau khi pin contract CRM thật.
- Thêm connector boundary riêng cho CRM lookup/update.
- Backend tạo queue items từ ambiguous threads.
- Nếu cần AI mapping, coi đó là implementation detail riêng, không trộn vào main conversation analysis runtime.

**Proof To Create Or Reuse:**

- Vertical proof 1: thread có đúng 1 phone match được auto-link deterministic.
- Vertical proof 2: thread ambiguous vào queue, approve/reject/remap cập nhật decision audit và current link đúng.
- Vertical proof 3: thread workspace hiển thị history mapping thật.

**Verification Command Or Artifact:**

- Backend integration tests với CRM stub
- Frontend tests cho approve/reject/remap

**Stop Conditions:**

- Nếu chưa pin xong CRM contract.
- Nếu solution bắt extractor tự dựng CRM match key từ raw phone trái design.

**Banned Shortcuts For This Unit:**

- Hardcode CRM IDs/sample queue trong frontend rồi gọi là done.
- Để AI mapping ghi đè thẳng current link mà không có decision audit.

## 10. Follow-Up Sau First Slice

Các capability còn thiếu để tiến tới full design parity đã được tách sang plan riêng: [full-app-completion-plan.md](/D:/Code/chat-analyzer-v2/docs/plans/full-app-completion-plan.md).

Khi plan hiện tại hoàn tất, hệ thống chỉ được claim là:

- đã có `first end-to-end slice` chạy bằng dữ liệu thật cho business analytics path và investigation path
- chưa có full app parity với toàn bộ `docs/design.md` và `docs/ui-flows.md`

## 11. Thứ Tự Thực Thi Khuyến Nghị

1. `Execution Unit 1`
   - Vì đây là blocker trực tiếp giữa ODS và mọi phần còn lại.
2. `Execution Unit 2`
   - Vì business UI/export không có source-of-truth nếu chưa có semantic mart.
3. `Execution Unit 3`
   - Vì thread audit và operations detail cần để debug và chứng minh analysis/mart đúng.
4. `Execution Unit 4`
   - Khi read APIs đã ổn định thì cắt frontend khỏi demo runtime path và khóa warning/version behavior ở UI.
5. `Execution Unit 5`
   - Chỉ mở action CRM thật khi contract CRM được pin; trước đó EU3 chỉ hiển thị local persisted state read-only.

## 12. Prompt Handoff Ngắn Cho Executor Và Reviewer

### Primary Executor

Thực hiện `Execution Unit 1` trước: rewrite `service/` owner-clean, thêm backend analysis orchestration để một `pipeline_run` đã `loaded` có thể gọi service và persist `analysis_run/analysis_result` thật. Không giữ heuristic runtime hiện tại làm path chính. Không cho service query DB hay dữ liệu sống ngoài bundle freeze. EU1 chỉ được coi là xong nếu đã pin và chứng minh được `analysis_run` retry/resume idempotent, không double-write `analysis_result`, và audit re-read được `prompt_version`, `prompt_hash`, taxonomy/runtime snapshot metadata.

### Hostile Reviewer

Tấn công các điểm sau:

- có chỗ nào dashboard/export vẫn phụ thuộc ODS thay vì mart không
- active snapshot có đang bị suy bằng "latest run" thay vì publish ownership contract tường minh không
- `journey_code` có bị trộn với `primary_need_code` không
- service có còn là heuristic shim trá hình hay đang thật sự owner-clean không
- retry/resume của analysis có double-write hoặc double-count cost/status không
- frontend business runtime có còn import demo adapter không
- compare-page có đi query path khác overview không
- publish semantics có fail-closed cho partial old day, draft leakage, provisional warning và historical overwrite không
