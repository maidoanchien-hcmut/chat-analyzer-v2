# Kế Hoạch Hoàn Thiện Toàn Bộ App Sau First Slice

**Goal:** Hoàn thiện các capability còn thiếu sau [first-end-to-end-slice-plan.md](/D:/Code/chat-analyzer-v2/docs/plans/first-end-to-end-slice-plan.md) để `chat-analyzer-v2` đạt parity thực dụng với `docs/design.md` và `docs/ui-flows.md`, thay vì chỉ dừng ở business analytics first slice.

**Architecture:** `backend/` tiếp tục là owner của control-plane, scheduler runtime, orchestration, publish semantics, semantic mart, read APIs, export, mapping queue và audit. `service/` vẫn là AI runtime framework-neutral, chỉ xử lý bundle freeze do backend gửi sang, không tự đọc DB sống và không trở thành nơi owner product flow; đồng thời service phải owner rõ runtime env/provider adapter, compiled system prompt, model/generation metadata và usage/cost audit. `frontend/` chỉ đọc HTTP seam từ backend; mọi dashboard, compare, prompt preview, operations detail và CRM mapping đều phải bám cùng một source-of-truth publish/audit contract.

**Intent:** Khóa nốt các flow vận hành, cấu hình và parity UI còn thiếu sau first slice mà không mở lại owner boundary lõi đã chốt.

**Observable Delta:** Sau khi plan này hoàn tất, operator có thể `connect -> chọn page -> activate` với default an toàn, scheduler `official_daily` chạy thật, `Vận hành` có manual run/publish đúng contract, `service/` có env/provider/model routing rõ ràng và runtime metadata audit được, `Prompt profile` có preview workspace audit được trên cùng runtime thật, reuse định kỳ không còn là fresh rerun mù, các gap cross-view còn lại trong `docs/ui-flows.md` được đóng, và CRM mapping trở thành seam thật nếu contract CRM đã được pin trong repo.

**Primary Contract:** Completion plan này chỉ được quyền claim `full design parity thực dụng` khi mọi flow đã pin trong `docs/ui-flows.md` thuộc scope plan đều owner-clean và proof được, bao gồm cả CRM mapping nếu contract CRM đã tồn tại trong repo. Nếu CRM contract chưa được pin, plan chỉ được phép dừng ở trạng thái `non-CRM parity-ready`, không được diễn đạt là full parity.

**First Proof:** Một integration proof xuyên suốt phải chứng minh được chuỗi sau trên dữ liệu thật của 1 page: `activate với default config -> manual same-day partial run -> publish provisional -> official_daily full-day supersede -> historical full-day republish với overwrite confirm -> dashboard/export/warnings/publish resolver vẫn đúng`.

**First Slice:** Chốt `Execution Unit A + B` với proof end-to-end cho activation mặc định, scheduler runtime, manual publish semantics và historical overwrite; sau đó chốt `Execution Unit C` để runtime AI thật, env/provider contract và system prompt classification được pin trước khi claim prompt workspace/full parity.

**Blast Radius:** `backend/` modules cho activation/scheduler/publish/reuse/read APIs, `frontend/` views `Vận hành` và `Cấu hình`, và `service/` runtime/prompt compiler/provider adapter phải đi cùng nhau vì cùng owner một contract runtime/publish/warning/audit. Service không còn được giả định là chỉ chạm preview prompt; live analysis path, preview path và runtime metadata đều phải bám cùng seam này.

**Execution Posture:** Thực hiện theo execution unit owner-clean, mỗi unit là một seam sản phẩm hoàn chỉnh. Không stage theo kiểu “UI trước, semantics sau”, “scheduler chạy trước, publish rule vá sau”, hay “preview text editor trước, audit metadata sau”.

**Allowed Mechanism:** Mở rộng owner-clean trên publish resolver đã có từ first slice; thêm scheduler runtime thật; thêm service runtime config + provider adapter + compiled prompt contract; preview/prompt audit qua run-scoped APIs; execution ledger/reuse planner theo tầng; HTTP contracts typed cho cross-view parity; CRM connector riêng sau khi contract CRM được pin.

**Forbidden Shortcuts:** Claim full parity khi CRM contract còn thiếu; bắt operator phải cấu hình opening rules thủ công mới activate được; để `lookback_hours` làm nở canonical window; giữ `service-managed` như nhãn mơ hồ không pin provider/model/env thật; để deterministic keyword runtime đi trên path production; viết system prompt chỉ nói “đánh giá hội thoại” mà không chốt classification contract của các signal trong hội thoại; làm `Prompt profile` thành text editor + ad hoc rerun không có artifact audit; cho scheduler/reuse làm sai provisional/official semantics; giữ EU G ở dạng “beyond nếu cần” không gắn với gap cụ thể trong source-of-truth.

**Forbidden Scaffolding:** Không thêm shim “temporary scheduler”, “preview-only metadata giả”, “compare-page query path riêng”, “fallback latest run = active snapshot”, “fake provider name nhưng vẫn deterministic local”, hay “CRM placeholder action” để gọi là done. Không giữ dual-path giữa built-in opening heuristic và manual rules mà không pin precedence rõ ràng. Không để preview path dùng adapter khác với live analysis path nếu không có contract audit chứng minh được.

**Proof Obligations:** Phải có proof cho activation mặc định theo tinh thần lazy operator, canonical-window invariants, service env/provider fail-closed và runtime metadata, system prompt classification contract theo `docs/design.md`, prompt preview audit metadata, publish/warning semantics sau khi scheduler + manual run + reuse cùng tồn tại, filter/compare parity cross-view, và CRM mapping real seam nếu CRM contract đã được pin.

**Proof Ownership:**
- Architect-owned proof: Lazy operator, publish semantics, canonical window, service runtime/provider contract, prompt identity/audit, cross-view resolver parity, và CRM gating phải đúng `docs/design.md` + `docs/ui-flows.md`.
- Executor-owned proof: Scheduler runtime, operations UX, service env/provider + prompt compiler, prompt preview workspace, reuse invalidation, compare/filter parity, CRM connector/mapping queue khi contract đã có.
- Hostile-review focus: activation có bị block bởi config tay không, opening rules default có đúng heuristic/fallback không, service có provider/env thật hay chỉ đổi nhãn runtime mode, system prompt có ép model phân loại đúng signal families không, preview có audit artifact thật không, publish resolver có drift dưới tác động của scheduler/reuse không, và EU G có drift thành backlog mơ hồ không.
- Escalation trigger: Nếu implementation cần đổi source-of-truth trong `docs/design.md`; nếu default opening heuristic không thể pin từ observed payload đã biết; nếu provider/model thật chưa thể pin nhưng executor muốn claim runtime-ready; nếu CRM contract vẫn chưa có nhưng executor muốn claim full parity; hoặc nếu cross-view parity đòi hỏi query path ngoài mart/publish resolver.

**Not Done Until:** Không được claim xong plan này nếu chưa chứng minh activation mặc định chạy được, `official_daily` chạy đúng contract, `service/` có provider/env/model routing và system prompt classification đúng shape design, `Vận hành` và `Prompt profile` có UX/audit đúng shape design, reuse không phá publish semantics, và EU G chỉ còn backlog ngoài source-of-truth chứ không còn gap đã pin trong `docs/ui-flows.md`. Nếu CRM contract chưa pin thì close-out phải ghi rõ là `blocked before full parity`.

**Solution Integrity Check:**
- Least-painful patch: nối scheduler vào activation hiện tại, để operator tự map opening rules nếu muốn, giữ service ở deterministic local nhưng đổi label runtime thành “service-managed”, thêm nút `Chạy thử` cho prompt, rồi xem như app gần xong vì first slice đã có business views.
- Why rejected: Cách này vẫn cho phép onboarding bị block bởi config tay, service vẫn chưa có provider/env thật, system prompt không khóa được contract phân loại signal, prompt preview không audit được trên runtime thật, publish semantics dễ drift khi reuse vào cuộc, và EU G vẫn mơ hồ nên executor có thể bỏ qua các gap cross-view thực sự còn lại.
- Largest owner-clean slice: `A + B` chốt activation/scheduler/operations semantics, `C` chốt service runtime env/provider/prompt contract, `D` chốt prompt workspace audit, `F` chốt reuse dưới cùng publish contract, `G` chốt các gap cross-view đã pin, `E` chỉ mở khi CRM contract đã có.
- Why this slice is safe for a strong agent: first slice đã chốt mart, publish resolver, business reads và investigation path thật; phần còn lại chủ yếu là product-completion trên các seam đã owner-clean, không phải tái kiến trúc lõi.
- If forced to stage: Chỉ được stage vì thiếu repo contract thật cho CRM; các phần non-CRM khác không được tách theo convenience.
- Debt or drift path: Bất kỳ gap nào “ngoài scope full parity” phải được ghi thành backlog riêng ngoài plan này; không được để cụm từ `beyond` hay `nếu cần` trong acceptance của plan.

## 1. Những Capability Còn Thiếu Sau First Slice

- Scheduler runtime thật cho `official_daily`, bao gồm queue orchestration vận hành định kỳ thay vì chỉ manual run.
- Activation theo tinh thần `lazy operator`: `connect -> chọn page -> activate` chạy được ngay với default an toàn, không bị chặn bởi bước map tag/opening rules/prompt.
- `opening_rules` mặc định phải có built-in heuristic dựa trên observed payload đã định nghĩa sẵn từ source-of-truth, nhưng vẫn là best-effort extractor và fail-open về `first_meaningful_message` khi không match.
- `service/` chưa có runtime env/provider/model routing thật cho LLM API; hiện backend chỉ biết gọi gRPC sang service, nhưng service chưa pin đang dùng dịch vụ LLM nào và chưa fail-closed khi thiếu provider config.
- System prompt của `service/` phải chốt rõ việc LLM phân loại các signal trong hội thoại theo taxonomy canonical, phân biệt explicit signal với semantic inference, thay vì chỉ mô tả vai trò đánh giá hội thoại chung chung.
- Prompt profile workspace đầy đủ theo `docs/ui-flows.md`, gồm preview audit được, compare `before/after`, clone version cũ/page khác, và semantics tách khỏi publish path.
- `Vận hành` full UX cho health summary, run detail, manual run preview, publish action, historical overwrite confirm và diagnostics.
- CRM connector/write-back thật và mapping queue active sau khi contract CRM được pin.
- Reuse theo tầng raw/source, ODS, AI mà không làm sai publish/warning semantics.
- Các gap UI parity đã pin trong `docs/ui-flows.md` nhưng chưa khóa rõ sau first slice: filter persist xuyên view business, compare-page semantics, entry export riêng, business wording và warning/version boundary nhất quán.

## 2. Design Gate Cho Full Completion

### Hướng 1: Gộp nốt mọi thứ vào first-slice execution units

Ưu điểm:

- ít tài liệu hơn
- nhìn có vẻ nhanh hơn

Nhược điểm:

- làm mờ ranh giới giữa `core data path` và `product completion`
- dễ khiến executor claim xong app khi operational UX hoặc cross-view parity còn hở
- khó pin rõ trạng thái `non-CRM parity-ready` so với `full parity`

### Hướng 2: Giữ owner boundary lõi, mở thêm execution units riêng cho các capability còn thiếu

Ưu điểm:

- rõ dependency sau first slice
- giảm nguy cơ phá vỡ seam data path đã ổn định
- dễ gắn proof đúng từng family contract: activation/scheduler, operations publish, prompt preview, reuse, cross-view parity, CRM mapping

Nhược điểm:

- cần một plan completion riêng
- cần acceptance bar chặt để không drift thành backlog mơ hồ

### Recommendation

Chọn `Hướng 2`.

## 3. Execution Unit A: Activation Mặc Định, Scheduler Runtime Và Official Daily

**Target Outcome:** Operator có thể `connect -> chọn page -> activate` với default an toàn; `official_daily` chạy thật theo scheduler runtime, dùng active snapshot tại thời điểm run bắt đầu, và không làm lệch canonical window hay publish semantics.

**Owned Write Scope:**

- activation flow trong `backend/`
- scheduler/job runner/queue orchestration
- default config resolution cho page activation
- `frontend/` màn `Cấu hình` và các surface activation liên quan
- health/diagnostics surface trong `Vận hành`

**Boundary Contract:**

- `lazy operator` là invariant: activation không đòi operator map tag, chỉnh prompt hay cấu hình opening rules thủ công trước.
- `opening_rules` mặc định là built-in heuristic package dựa trên observed payload đã định nghĩa sẵn; operator có thể override sau, nhưng pipeline phải chạy được ngay cả khi không chỉnh tay.
- Built-in opening heuristic chỉ là signal extractor best-effort; khi không match, parser vẫn phải fall back về `first_meaningful_message`.
- Tag mới chưa được operator cấu hình vẫn mặc định là `noise`.
- Scheduler dùng active config snapshot tại thời điểm run bắt đầu.
- Mỗi page chỉ có tối đa 1 `official_daily` active.
- `lookback_hours` chỉ mở rộng source discovery/recovery, không làm nở canonical window của ngày.
- Failure/retry không được tạo duplicate child runs sai contract và không được làm lệch publish pointer.

**Implementation Shape:**

- job runner/queue orchestration cho `official_daily`
- activation path tự cấp default config gồm scheduler default, prompt text rỗng, tag default `noise`, và built-in opening heuristic profile
- planner -> enqueue -> execute -> publish pipeline rõ ràng
- health/diagnostics cho scheduler trong `Vận hành`
- diagnostics phải chỉ ra page đã active bằng default nào và heuristic opening profile nào đang có hiệu lực

**Proof To Create Or Reuse:**

- activation với token hợp lệ + chọn page có thể hoàn tất mà không cần cấu hình tay thêm
- run đầu tiên sau activation dùng built-in opening heuristic đúng precedence và vẫn parse được khi không match rule nào
- `lookback_hours` không làm persist message ngoài `[00:00 ngày D, 00:00 ngày D + 1)`
- `official_daily` tạo đúng child runs cho ngày mục tiêu, không enqueue duplicate work sai contract
- failure giữa chừng recover được mà không làm lệch publish state

**Verification Command Or Artifact:**

- backend integration proof cho activation mặc định + default config snapshot
- integration proof cho observed-payload opening heuristic + fallback
- integration proof cho official scheduler run + canonical window

**Stop Conditions:**

- Nếu activation chỉ chạy được sau khi operator cấu hình opening rules/tag mapping thủ công
- Nếu built-in opening heuristic chưa pin được từ observed payload đã có trong repo
- Nếu `lookback_hours` làm nở canonical window hoặc tạo duplicate persistence

**Banned Shortcuts For This Unit:**

- default `opening_rules = rỗng` rồi bắt operator map tay để có onboarding usable
- dùng latest run thay cho publish contract khi scheduler publish
- để scheduler runtime chạy nhưng không expose default activation state/diagnostics

## 4. Execution Unit B: Vận Hành Full UX Cho Manual Run, Publish Và Diagnostics

**Target Outcome:** Màn `Vận hành` đạt đúng shape product đã pin: health summary, run monitor, run detail, manual run preview, publish action theo child run type, historical overwrite confirm và diagnostics đủ để operator/debugger dùng thật.

**Owned Write Scope:**

- backend operations/read APIs cho health, run monitor, run detail, publish actions
- frontend view `Vận hành`
- publish audit/history UI cho overwrite

**Boundary Contract:**

- Manual run form phải preview được split theo ngày trước khi execute.
- Child run actions phải phụ thuộc đúng loại run:
  - partial same-day -> `Xem kết quả run`, có thể `Publish tạm thời`
  - partial old-day -> chỉ `Xem kết quả run`
  - full-day -> `Xem kết quả run`, có thể `Publish chính thức`
- Historical overwrite phải đi qua xác nhận mạnh với version diff rõ ràng.
- Run detail phải tách rõ ETL metrics, AI metrics, publish status, error logs, thread coverage.
- Health summary phải phản ánh đúng các seam đã pin trong UI flow: backend, go-worker, AI service, database, queue.

**Implementation Shape:**

- manual run form đầy đủ
- preview split + publish eligibility preview
- publish action panel theo child run type
- overwrite confirmation modal với prompt/config/taxonomy diff và tác động export lịch sử
- run detail view theo `run_group` với child timeline + diagnostics thật

**Proof To Create Or Reuse:**

- form preview đúng child run classification
- action set trên UI đúng theo từng loại child run
- historical overwrite modal hiển thị đúng snapshot/version cũ và mới
- run detail hiển thị đúng ETL/AI/publish/error surface thay vì count thô

**Verification Command Or Artifact:**

- HTTP integration tests cho operations endpoints
- frontend smoke proof cho manual run preview + publish actions + overwrite modal

**Stop Conditions:**

- Nếu `Vận hành` vẫn thiếu health summary hoặc run detail diagnostics đúng shape source-of-truth
- Nếu publish action bị suy từ latest run thay vì publish resolver/publish eligibility contract

**Banned Shortcuts For This Unit:**

- chỉ thêm form manual run mà không hoàn thiện run detail/overwrite diagnostics
- expose publish button chung rồi chặn bằng toast mơ hồ thay vì eligibility rõ từ backend

## 5. Execution Unit C: Service Runtime Env, Provider Và Prompt Classification Contract

**Target Outcome:** `service/` có runtime env/provider/model routing thật cho LLM API, live analysis path và preview path đi qua cùng provider adapter contract, và compiled system prompt chốt rõ việc phân loại các signal hội thoại theo taxonomy canonical thay vì chỉ đánh giá chung chung.

**Owned Write Scope:**

- `service/config.py` và service env schema/example
- provider adapter boundary trong `service/`
- compiled prompt builder/runtime metadata trong `service/`
- backend analysis runtime metadata/artifacts nếu cần bổ sung provider/model fields
- service README/runbook cho local/dev/prod runtime

**Boundary Contract:**

- `service/` vẫn framework-neutral và không tự đọc DB sống.
- Provider/model thật phải được pin bằng env/config rõ ràng; không dùng nhãn mơ hồ kiểu `service-managed` để che giấu implementation runtime.
- Nếu runtime mode yêu cầu provider thật mà thiếu API key/base URL/model bắt buộc thì service phải fail-closed khi start hoặc khi nhận request, không silently fallback sang deterministic path.
- `effective_prompt_text` phải là input thật của adapter live, không chỉ được hash/audit rồi bỏ qua.
- Live analysis và prompt preview phải dùng cùng prompt compiler + provider adapter contract; mọi khác biệt chỉ được đến từ sample scope hoặc generation config được audit.
- System prompt phải ép model:
  - ưu tiên explicit source evidence, opening selections, tag signals và deterministic metrics trước khi suy luận
  - phân loại tối thiểu các trục `opening_theme_code`, `customer_mood_code`, `primary_need_code`, `primary_topic_code`, `journey_code`, `closing_outcome_inference_code`, `process_risk_level_code`, và `staff_assessments_json`
  - phân biệt `journey_code` với `primary_need_code`; `revisit` không được trở thành `primary_need_code`
  - giải thích field nào dựa trên explicit signal, field nào là inference
  - trả `unknown` khi evidence không đủ thay vì đoán

**Implementation Shape:**

- service env contract rõ cho provider/api key/base URL/model/generation config
- provider adapter interface tách khỏi deterministic dev adapter
- deterministic adapter chỉ còn là explicit dev/test runtime, không phải implicit default production path
- compiled prompt builder gồm:
  - global system prompt cố định
  - taxonomy/output contract cố định
  - page prompt text
  - signal-classification rules theo `docs/design.md`
- runtime metadata phải lưu được tối thiểu:
  - provider/runtime mode
  - model name
  - system prompt version
  - effective prompt hash
  - taxonomy version
  - generation config đã dùng

**Proof To Create Or Reuse:**

- service không thể chạy ở live provider mode nếu thiếu env bắt buộc
- request live thật và preview path cùng gọi qua provider adapter contract thay vì hai path rời
- compiled system prompt chứa instruction phân loại signal families đúng contract thiết kế
- adapter live thật dùng `effective_prompt_text` và trả usage/cost/provider metadata audit được
- deterministic dev mode, nếu còn giữ, phải được gắn nhãn rõ là dev/test-only và không thể bị hiểu nhầm là provider thật

**Verification Command Or Artifact:**

- service unit tests cho env validation + prompt compiler
- integration proof với fake/stub provider cho request/response contract
- backend-service proof cho runtime metadata persist đủ provider/model/system prompt fields

**Stop Conditions:**

- Nếu service vẫn không chỉ ra được đang gọi LLM API nào
- Nếu backend vẫn chỉ biết `model = service-managed` mà không có provider/runtime identity audit được
- Nếu `effective_prompt_text` vẫn không được dùng trong live inference path
- Nếu system prompt vẫn không pin rõ classification contract của các signal trong hội thoại

**Banned Shortcuts For This Unit:**

- chỉ thêm vài env string nhưng adapter runtime thật vẫn là keyword matcher
- coi `runtime_mode` là đủ dù không có provider/api key/model contract
- để preview path gọi runtime khác với live path rồi chỉ hợp nhất ở UI
- sửa prompt text theo kiểu copywriting chung chung mà không khóa trục phân loại và precedence của signal

## 6. Execution Unit D: Prompt Profile Workspace Đầy Đủ Và Audit Được

**Target Outcome:** Tab `Prompt profile` hỗ trợ workflow tinh chỉnh prompt usable cho operator với preview workspace audit được, thay vì chỉ là nơi sửa text và bấm test mơ hồ.

**Owned Write Scope:**

- backend preview/prompt identity/read APIs
- metadata/audit contract cho preview artifact
- frontend tab `Prompt profile`
- nếu cần, service preview transport/runtime metadata

**Boundary Contract:**

- Prompt UI vẫn là plain text business-facing, không biến thành JSON schema editor.
- Taxonomy output chuẩn của hệ thống là cố định; page prompt chỉ sửa rubric/vocabulary business.
- Preview run/inference không được tự động đẩy lên dashboard publish path.
- `prompt_version` phải reuse theo content identity, không theo số lần save.
- Compare `before/after` phải dựa trên output thật của cùng sample scope.
- Preview artifact phải re-read được tối thiểu:
  - `prompt_version`
  - `prompt_hash`
  - taxonomy version
  - evidence bundle đã dùng
  - field explanations
  - sample scope identity
- UI phải hỗ trợ clone từ version cũ và clone từ page khác theo `docs/ui-flows.md`.

**Implementation Shape:**

- sample preview workspace trong tab `Prompt profile`
- chạy thử trên sample thread/unit
- xem structured output, evidence, field explanations
- compare `before/after` giữa prompt draft và prompt active
- flow clone từ version cũ/page khác
- flow persist/activate tách khỏi preview run

**Proof To Create Or Reuse:**

- preview không làm đổi active publish pointer
- compare cùng sample cho diff có thể audit
- prompt text quay lại nội dung cũ thì reuse `prompt_version` cũ
- preview artifact re-read được `prompt_version`, `prompt_hash`, taxonomy version, evidence bundle và explanations

**Verification Command Or Artifact:**

- backend integration proof cho preview artifact metadata
- frontend smoke proof cho compare, clone, preview workspace

**Stop Conditions:**

- Nếu preview không thể hiện identity/audit metadata
- Nếu `Prompt profile` cần operator nhập JSON hoặc field-level prompt fragments
- Nếu clone flows bị bỏ qua nhưng plan vẫn claim parity với `docs/ui-flows.md`

**Banned Shortcuts For This Unit:**

- text editor + nút `Chạy thử` không lưu được artifact audit
- tạo version label mới mỗi lần save cùng một nội dung
- compare hai prompt trên hai sample scope khác nhau

## 7. Execution Unit E: CRM Mapping Active Seam

**Target Outcome:** Tab `Liên kết CRM` và `Mapping queue` chuyển từ read-only/local state sang seam vận hành thật sau khi contract CRM được pin.

**Prerequisite Gate:** Contract CRM thật phải được pin trong repo trước khi execute unit này. Nếu gate này chưa thỏa, overall plan không được close dưới nhãn `full design parity thực dụng`.

**Owned Write Scope:**

- backend CRM connector boundary
- backend mapping queue/read/write APIs
- frontend `Liên kết CRM` và `Mapping queue`
- service support nếu có AI-assisted mapping riêng

**Boundary Contract:**

- deterministic fast-path chỉ promote khi evidence chắc chắn
- ambiguous cases vào queue/audit
- write-back và decision history phải nhất quán
- AI-assisted mapping, nếu có, chỉ là implementation detail riêng, không trộn vào main conversation analysis runtime
- current link và decision history phải xem được nhất quán trong thread workspace

**Implementation Shape:**

- CRM connector boundary
- lookup/update/write-back semantics
- mapping queue APIs + UI actions
- approve/reject/remap audit path

**Proof To Create Or Reuse:**

- deterministic auto-link đúng
- ambiguous queue xử lý đúng history/current link
- write-back failure không làm corrupt current state
- thread workspace và mapping queue nhìn cùng một current link/decision history

**Verification Command Or Artifact:**

- backend integration tests với CRM stub/contract fixture
- frontend smoke tests cho approve/reject/remap

**Stop Conditions:**

- Nếu contract CRM chưa pin
- Nếu solution cần sửa canonical extract trái với `docs/design.md`

**Banned Shortcuts For This Unit:**

- hardcode candidate/mock queue trong frontend rồi gọi là active seam
- claim full parity khi EU E chưa execute vì thiếu contract

## 8. Execution Unit F: Reuse Optimization Dưới Publish Contract

**Target Outcome:** Hệ thống không còn phải fresh rerun toàn tuyến cho các tình huống thường gặp; reuse hoạt động theo tầng raw/source, ODS, AI mà vẫn giữ đúng publish semantics, warning semantics và invalidation contract đã pin.

**Owned Write Scope:**

- backend execution ledger/reuse planner
- invalidation logic theo config class
- publish/warning metadata cần thiết cho mixed-version and provisional handling

**Boundary Contract:**

- raw/source reuse, ODS reuse, AI reuse phải tách riêng
- đổi `tag_mapping_json` hoặc `opening_rules_json` có thể reuse raw nhưng phải recompute derived ODS
- đổi `prompt_text` có thể reuse raw/ODS nhưng AI phải rerun cho unit bị ảnh hưởng
- đổi taxonomy version có thể invalidate AI + mart
- same-day provisional, full-day official, historical overwrite và mixed-version slice phải tiếp tục đúng semantics sau khi reuse được bật
- partial old-day không được leak lên dashboard vì planner/reuse nhầm snapshot eligibility

**Implementation Shape:**

- execution ledger/reuse planner theo tầng
- invalidation logic rõ theo config class
- selective rerun/rebuild thay vì rerun toàn bộ mù quáng
- metadata cho coverage/version boundary được giữ đúng khi output một phần được reuse

**Proof To Create Or Reuse:**

- prompt-only change không làm rerun extract/ODS ngoài phạm vi cần thiết
- ETL-transform change invalidate đúng derived ODS và downstream AI/mart
- taxonomy change fail-closed cho reused outputs không còn hợp lệ
- integration proof xuyên suốt cho `manual provisional -> official_daily supersede -> historical republish` vẫn đúng dưới reuse planner
- mixed-version slice trả metadata đủ để frontend hiện warning đúng

**Verification Command Or Artifact:**

- backend integration proof cho reuse invalidation
- HTTP integration proof cho provisional/official/mixed-version semantics dưới reuse

**Stop Conditions:**

- Nếu reuse buộc read APIs suy snapshot từ latest run
- Nếu reused outputs làm mất coverage/version boundary hoặc leak partial old-day lên dashboard

**Banned Shortcuts For This Unit:**

- coi `config` là một khối duy nhất cho reuse
- chứng minh perf/reuse mà không chứng minh publish semantics còn đúng

## 9. Execution Unit G: Cross-View Parity Gap Closure Theo `docs/ui-flows.md`

**Target Outcome:** Đóng các gap UI parity còn lại đã pin trong `docs/ui-flows.md` sau first slice, không mở thêm “BI beyond design” mơ hồ.

**Owned Write Scope:**

- frontend app shell/navigation/query state
- backend/read APIs nếu cần bổ sung metadata cho parity
- compare-page/export entry/filter state wiring

**Boundary Contract:**

- Chỉ xử lý các gap đã pin trong source-of-truth:
  - persist filter giữa các view business
  - compare-page dùng đúng publish resolver/warning metadata như overview
  - compare-page là view compare-only, không mở message-level drill-down
  - export giữ entry riêng, không ngầm kế thừa current view/filter state
  - business wording/version boundary/warnings nhất quán giữa các view
- Không thêm capability `beyond`, `nếu cần`, hay visual/reporting không có trong `docs/ui-flows.md`.
- Bất kỳ ý tưởng BI mở rộng nào ngoài source-of-truth phải ra backlog riêng sau plan này.

**Implementation Shape:**

- thống nhất query-state/filter persistence cho các view business
- chốt compare-page semantics và metadata rendering
- chốt app-shell/export entry đúng flow
- chỉnh business wording để không lộ raw code và giữ warning/version copy nhất quán

**Proof To Create Or Reuse:**

- chuyển `Tổng quan -> Khám phá dữ liệu -> Hiệu quả nhân viên -> Lịch sử hội thoại` vẫn giữ filter hợp lệ theo contract
- compare-page và single-page view khớp metric/warning cho cùng snapshot resolver
- export flow không thừa hưởng ngầm filter/view context đang mở
- UI không lộ raw code trên các màn business chính

**Verification Command Or Artifact:**

- frontend smoke walkthrough cho filter persistence + compare-page + export entry
- integration proof cho compare-page resolver parity

**Stop Conditions:**

- Nếu execution drift sang “thêm BI mới” không có trong `docs/ui-flows.md`
- Nếu filter persistence/comparison parity chưa khóa nhưng plan lại claim xong

**Banned Shortcuts For This Unit:**

- giữ câu chữ `beyond các view đã pin`, `additional filters/visuals nếu cần`
- coi compare-page là xong chỉ vì đã có vài chart đọc cùng dữ liệu

## 10. Thứ Tự Thực Thi Khuyến Nghị

1. `Execution Unit A`
   - Vì activation mặc định + scheduler runtime là khoảng trống lớn nhất giữa first slice và vận hành thật hằng ngày.
2. `Execution Unit B`
   - Vì `Vận hành` phải thành seam usable với publish semantics và diagnostics đúng shape.
3. `Execution Unit C`
   - Vì runtime LLM/provider/system prompt phải được pin trước khi claim service-ready hay prompt preview-ready.
4. `Execution Unit D`
   - Vì prompt tuning là flow cấu hình cốt lõi và rất dễ fake-pass nếu service runtime/audit chưa đúng contract.
5. `Execution Unit F`
   - Vì reuse chỉ nên mở sau khi activation/operations/service runtime/prompt workspace đã đúng contract.
6. `Execution Unit G`
   - Vì cross-view parity phải được đóng trước khi claim non-CRM parity-ready.
7. `Execution Unit E`
   - Chỉ mở sau khi contract CRM được pin; đây là gate cuối để chuyển từ `non-CRM parity-ready` sang `full parity`.

## 11. Acceptance Bar

Plan này chỉ có 2 trạng thái close-out hợp lệ:

### Trạng thái A: `Blocked Before Full Parity`

Chỉ được dùng khi:

- `Execution Unit A`, `B`, `C`, `D`, `F`, `G` đã hoàn tất với proof tương ứng
- `Execution Unit E` chưa thể execute chỉ vì contract CRM chưa được pin trong repo
- close-out ghi rõ app mới đạt `non-CRM parity-ready`, chưa được mô tả là `full design parity thực dụng`

### Trạng thái B: `Full Design Parity Thực Dụng`

Chỉ được dùng khi:

- `official_daily` chạy được bằng scheduler runtime thật
- activation mặc định theo `lazy operator` chạy được, gồm built-in opening heuristic theo observed payload và fallback đúng contract
- `service/` có provider/env/model routing thật, runtime metadata audit được, và system prompt ép model phân loại signal families đúng contract thiết kế
- `Vận hành` hỗ trợ health summary, run detail, manual run/publish flow và historical overwrite đúng UX chính
- `Prompt profile` có preview/compare/clone usable và audit được
- reuse không còn dừng ở fresh end-to-end rerun cho các thay đổi phổ biến và không phá publish/warning semantics
- các gap cross-view đã pin trong `docs/ui-flows.md` được đóng, không còn hạng mục `beyond` mơ hồ trong plan
- CRM mapping active seam chạy thật vì CRM contract đã được pin và EU E đã hoàn tất

## 12. Prompt Handoff Ngắn Cho Executor Và Reviewer

### Primary Executor

Thực hiện `Execution Unit A` trước theo đúng invariant `lazy operator`: page phải activate được với default an toàn, trong đó `opening_rules` mặc định là built-in heuristic package dựa trên observed payload đã định nghĩa sẵn, nhưng vẫn fail-open về `first_meaningful_message` khi không match. Sau đó hoàn thiện `B`, `C`, `D`, `F`, `G` theo proof đã pin; không được claim `full parity` nếu `E` chưa execute vì thiếu CRM contract. Ở `C`, phải pin rõ provider/env/model/runtime metadata và system prompt classification contract trước khi coi `Prompt profile` là runtime thật.

### Hostile Reviewer

Tấn công các điểm sau:

- activation có bị block bởi config tay không
- built-in opening heuristic có đúng contract best-effort + fallback không
- `lookback_hours` có làm nở canonical window không
- service có thật sự pin được LLM provider/env/model và dùng `effective_prompt_text` trên live path không
- system prompt có ép model phân loại đúng signal families, explicit-vs-inference và precedence giữa `journey_code` / `primary_need_code` không
- `Prompt profile` có artifact audit thật hay chỉ là test runner bọc UI
- reuse có làm sai provisional/official/mixed-version semantics không
- compare-page/filter persistence/export entry có còn gap dù plan đã claim parity không
- EU E có bị bypass trong close-out wording không
