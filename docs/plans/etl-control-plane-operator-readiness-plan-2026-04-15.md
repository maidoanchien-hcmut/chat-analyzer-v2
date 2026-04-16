# ETL Control-Plane Operator Readiness Implementation Plan

**Goal:** Làm cho ETL control-plane dùng được thật cho operator không biết source code: thêm page, cấu hình nếu cần, chạy manual đúng ngữ nghĩa, tự chạy `official_daily`, reuse dữ liệu hợp lý, và không tạo config mơ hồ hay dữ liệu bẩn.

**Architecture:** `backend/` tiếp tục là owner của control-plane cho `connected_page`, `page_config_version`, lifecycle page, scheduler dispatch, manual run, publish, validation và contract operator-facing. `go-worker/` là owner của extract, transform, load, reuse theo tầng, và canonical ETL facts cho `thread_day`. `service/` vẫn là owner của AI runtime nội bộ, nhưng plan này chỉ khóa manifest/interface mà ETL phải chuẩn bị; không mở rộng logic hay implementation của `service/` trong slice này. `frontend/` cũng chủ ý out of scope; trong slice này chỉ cần typed backend payloads/resources và docs đủ rõ để frontend sau đó render typed forms mà không buộc operator hiểu JSON/source code.

**Intent:** Chuyển ETL pipeline từ trạng thái “có nhiều field config và endpoint rời rạc” sang trạng thái “có mô hình vận hành rõ, có semantics rõ cho từng config, có scheduler thật, có onboarding lazy/non-lazy đúng nghĩa, có reuse thật, và có validation fail-closed với operator input”.

**Observable Delta:** Sau khi hoàn tất plan này:
- `lazy operator` có thể `nhập token -> chọn page -> activate` và page đó được enroll vào `official_daily` lane với default an toàn, không cần biết source code hay JSON config.
- `non-lazy operator` có thể lấy sample thực từ page, review tag/opening/prompt theo mẫu dữ liệu, chỉnh cấu hình typed, chạy manual preview, rồi mới activate page vào lane ổn định.
- `official_daily` thực sự được scheduler dispatch theo `business_timezone` và `official_daily_time`, không còn là field chỉ để lưu.
- manual partial/full run có reuse raw/ODS hợp lý vào `official_daily`, không luôn luôn `fresh_run`.
- operator nhập sai structured config sẽ bị chặn bằng field-level validation rõ ràng; không còn silent fallback về empty/default cho các config chính.
- tag semantics từ Pancake sample được model lại đủ để phân biệt staff, branch, journey, closing outcome, segment, disqualifier, noise và trạng thái operator review.

**Primary Contract:** Một page đi vào vận hành ổn định phải có đúng một active runtime snapshot tại thời điểm scheduler/manual run bắt đầu; snapshot đó phải freeze được mọi config ảnh hưởng đến ETL semantics. Operator không được chỉnh raw JSON tự do để “hy vọng worker hiểu đúng”. Từng config phải có semantics owner-clean, validation owner-clean, và runtime effect owner-clean. Không field nào được phép tồn tại ở operator surface nếu runtime không tiêu thụ nó thật hoặc không có kế hoạch thực thi trong cùng slice.

**First Proof:** Một integration proof qua control-plane và worker phải chứng minh được chuỗi sau:
- onboard một page ở lazy lane tạo active config an toàn và enroll schedule thật
- onboard một page ở non-lazy lane lấy sample Pancake thật, sinh draft tag decisions/opening rules typed từ sample, cho phép save/activate
- manual partial run cho ngày `D` tạo raw/ODS có thể reuse
- `official_daily` full-day cho cùng ngày `D` reuse phần raw/ODS phù hợp thay vì `fresh_run`
- publish invariants vẫn giữ: partial old day không publish, full-day historical overwrite cần confirm, manual run không phá active official pointer ngoài luật publish

**First Slice:** Khóa lại operator-facing config contract và runtime effect của từng config trong `page_config_version`, vì đây là seam đang làm toàn bộ ETL control-plane mơ hồ ngay từ onboarding đến daily operations.

**Blast Radius:** `backend/prisma/schema.prisma`, `backend/src/modules/chat_extractor/*`, `backend/src/modules/read_models/*`, `backend/src/modules/analysis/*` ở phần runtime contract/reuse identity nếu cần, `backend/go-worker/internal/{config,job,extract,transform,load}/*`, `backend/README.md`, `docs/design.md` hoặc review docs liên quan nếu cần cập nhật divergence, và test fixtures Pancake sample trong `docs/pancake-api-samples/` dùng làm proof input. `frontend/` và `service/` không nằm trong blast radius implementation của slice này. Các seam này thuộc cùng một owner-cut vì chúng cùng định nghĩa semantics ETL control-plane từ operator write -> frozen run snapshot -> worker effect -> publish behavior.

**Execution Posture:** Thực hiện theo các execution unit owner-clean và chấp nhận một diff lớn xuyên backend/go-worker/docs. Không vá lẻ từng field config rồi giữ semantics mơ hồ. Không giữ fake capability chỉ vì schema đang có sẵn field. Không chia theo kiểu “lưu config trước, scheduler/reuse làm sau” nếu như vậy page vẫn chưa vận hành được thật.

**Allowed Mechanism:** Versioned typed config documents trong `page_config_version`, validation bằng backend schemas fail-closed, scheduler dispatcher thật ở backend, runtime manifest freeze đầy đủ xuống worker, reuse keys theo tầng raw/ODS/AI, publish snapshot pointers giữ nguyên mô hình existing, và operator surface của slice này chỉ là typed backend payloads/resources cùng docs semantics rõ ràng.

**Forbidden Shortcuts:** Giữ `safeParse` silent fallback cho `tag_mapping_json` hoặc `opening_rules_json`; tiếp tục dùng `official_daily_time` như field chỉ để hiển thị; claim lazy onboarding xong khi page chưa thực sự được enroll vào scheduler; giữ `reuse_reason = fresh_run` cho mọi case; để `canonical_code` là string free-form không taxonomy-backed; bắt operator chỉnh JSON hoặc nhập text tùy ý cho structured fields; giữ 6 tag role hiện tại rồi chỉ viết thêm docs giải thích; để executor tự chọn giữa doctrine tag cũ và semantic model mới.

**Forbidden Scaffolding:** Không thêm dual operator model kiểu vừa giữ `tag_mapping_json` mơ hồ vừa thêm một UI-only draft model khác. Không thêm bridge `reviewed_by_operator` cục bộ nếu runtime không tiêu thụ. Không thêm scheduler “fake cron” chỉ hiện next run nhưng không dispatch. Không cho `notification_targets_json` tiếp tục xuất hiện ở operator flow của slice này.

**Proof Obligations:**
- Proof cho operator write contract: invalid config bị reject có field-level error rõ.
- Proof cho tag semantics: sample Pancake có staff/branch/journey/disqualifier/deactive tags phải đi qua model mới đúng ngữ nghĩa.
- Proof cho runtime fail-open laws: tag mới quan sát sau activation phải rơi vào default-noise an toàn và không chặn daily run; `opening_rules_json` trống hoặc không match vẫn phải fallback qua `first_meaningful_message`.
- Proof cho scheduler semantics: page active thực sự sinh `official_daily` theo ngày business `D` tại đầu ngày `D+1`.
- Proof cho snapshot atomicity: activate, due-scan và manual preview không được race ra mixed snapshot.
- Proof cho reuse semantics: manual partial/full và official full-day dùng reuse theo tầng raw/ODS thay vì full refetch/rebuild vô điều kiện.
- Proof cho preview isolation: manual preview với draft config không được tạo publish pointer hay official reuse side effects nếu operator chưa activate/publish.
- Proof cho publish invariants: manual và official cùng tồn tại mà không làm sai publish pointer/history.

**Proof Ownership:**
- Architect-owned proof: operator mental model, config semantics, scheduler/publish laws, reuse matrix, tag model, và divergence chính so với `docs/design.md` phải được khóa trước khi code.
- Executor-owned proof: migrations, schema/types/backend/worker changes, integration tests, fixture-driven tests, và docs cập nhật đúng trạng thái mới.
- Hostile-review focus: fake capability, silent fallback, tag model không chịu nổi Pancake sample thật, reuse chỉ ghi metadata chứ không reuse thật, manual/offical conflict làm hỏng publish semantics.
- Escalation trigger: nếu implementation buộc operator phải chạm JSON/source code; nếu tag model mới vẫn không biểu đạt được staff/branch/segment/disqualifier và trạng thái reviewed; nếu scheduler/reuse cần một owner boundary khác hẳn backend/go-worker hiện tại.

**Not Done Until:** Không được đóng plan này nếu operator vẫn không thể dùng ETL control-plane mà không biết source code; nếu `official_daily` vẫn không được dispatch thật; nếu config vẫn có field nhìn như capability nhưng runtime không dùng; nếu manual run vẫn không tạo được reuse có ý nghĩa cho official lane; hoặc nếu tag model vẫn không xử lý được Pancake sample thực tế.

**Solution Integrity Check:**
- Least-painful patch: bổ sung docs cho các JSON field, thêm vài validation lẻ, và nối scheduler sau cùng.
- Why rejected: cách đó vẫn giữ model mơ hồ, operator vẫn không biết field nào có tác dụng thật, worker vẫn có thể diễn giải sai hoặc bỏ qua config mà không báo lỗi.
- Largest owner-clean slice: khóa operator-facing config semantics, tag model, scheduler dispatch, reuse matrix và publish behavior trong một remediation plan thống nhất của backend/go-worker.
- Why this slice is safe for a strong agent: control-plane hiện còn tương đối sớm, external compatibility nhỏ, và các seam chính đều nằm trong cùng repo owner boundary.
- If forced to stage: chỉ được stage theo boundary bền vững `config contract`, `scheduler lifecycle`, `reuse/publish`, `operator API/docs`; không stage theo kiểu thêm field trước, giải thích semantics sau.
- Debt or drift path: nếu phải giữ tên field cũ trong DB/API vì blast radius rename không xứng đáng, semantic contract mới phải versioned rõ trong chính payload và phải có debt note ghi lý do giữ physical name cũ.

## 1. Scope Và Divergence Cần Chốt Ngay

### 1.1 Scope của plan này

- In scope: backend ETL control-plane, worker runtime semantics, config contract, onboarding lazy/non-lazy, scheduler, manual run, publish, reuse, validation, docs và tests.
- In scope: interface contract backend chuẩn bị cho analysis, vì config phải phục vụ analysis sau này dù plan này không đi sâu vào AI service internals.
- Out of scope: implementation của `frontend/`, dashboard UX chi tiết, AI prompt engineering chi tiết, và mọi logic/model/provider internals của `service/`.
- Meaning của “operator-ready” trong plan này: backend operator API/payload, validation, scheduler/manual semantics, docs và runbook đã đủ rõ để frontend sau này chỉ việc render typed forms; plan này không claim ship UI hay sửa service runtime.

### 1.2 Divergence chính so với hiện trạng và với docs hiện tại

- `connected_page.business_timezone` tiếp tục là timezone owner duy nhất cho canonical window và scheduler dispatch; `scheduler_json` không sở hữu timezone riêng.
- `scheduler_json` không còn được phép chỉ là config lưu trữ; phải thành runtime schedule thật.
- `notification_targets_json` bị rút khỏi operator-facing flow và khỏi acceptance matrix của slice này; không implement runtime consumer trong slice này.
- `tag_mapping_json` hiện tại không đủ biểu đạt Pancake sample; plan này giữ physical field name nhưng thay semantic contract bên trong. Doctrine trong `docs/design.md` phải được update trong cùng change set hoặc ngay trước code để không còn song song hai luật khác nhau.
- `analysis_taxonomy_version` không được phép mặc định là `categories: {}` nếu control-plane còn tham chiếu nó như semantic contract.
- structured config phải reject invalid input; không còn silent fallback `safeParse -> empty/default` cho operator-submitted values.
- explicit tag/opening signals phải có downstream deterministic effect rõ hơn cho read-models; không thể chỉ `revisit` có effect còn `need/outcome` thì gần như bỏ ngỏ.
- source-observed drift phải fail-open an toàn: tag mới sau activation mặc định là noise có provenance rõ; opening rules trống hoặc không match không được làm hỏng parser path.

## 2. Ảnh Chụp Hiện Trạng Và Các Blocker Thực Tế

- `official_daily` chưa có scheduler/orchestrator thật; backend hiện chỉ expose HTTP và Redis health.
- lazy onboarding mới dừng ở `upsert page + active config default`, chưa enroll lane daily automation thật.
- manual run và official run chưa có reuse thật; `reuse_summary_json` luôn nghiêng về `fresh_run`.
- `scheduler_json.official_daily_time` và `lookback_hours` chưa chi phối runtime như operator kỳ vọng.
- `notification_targets_json` đang là dead config.
- default taxonomy rỗng làm `canonical_code` và `signal_code` không có governance thật.
- tag model 6 role hiện tại trộn lẫn signal semantic, context operational và noise fallback; không đủ cho Pancake sample.
- `mapping_source` chỉ là metadata, chưa đủ để biết operator đã review hay chưa.
- `status=inactive` trong tag mapping hiện không chặn runtime sử dụng.
- validation giữa các config không nhất quán: có field hard fail, có field silent fallback.

## 3. Invariants Phải Giữ

- Repo vẫn single-company; page Pancake là operational index chính.
- `connected_page` vẫn là root entity cho onboarding, config, scheduler và publish.
- `connected_page.business_timezone` là timezone owner duy nhất cho canonical window và scheduler due-time; `scheduler_json` chỉ chứa policy time trong timezone đó, không có timezone riêng.
- Operator không biết source code; mọi structured choice phải có semantics hiển nhiên ở UI/API.
- Adding page, editing config, manual preview và scheduler `official_daily` là các hành vi độc lập về thời điểm; operator không cần đợi tới lúc job hằng ngày mới cấu hình được.
- Canonical official window cho ngày `D` luôn là `[00:00 ngày D, 00:00 ngày D + 1)` theo `business_timezone`.
- `lookback_hours` chỉ mở rộng source discovery/recovery quanh biên cuối ngày; không làm nở canonical persisted window.
- Run snapshot freeze config/taxonomy/prompt tại thời điểm run start; config mới không mutate run cũ.
- Partial run ngày cũ không được publish dashboard.
- Manual run không được phá `published_official` pointer ngoài luật supersede đã chốt.
- Structured config không được nhận free-form code nếu code đó phải nằm trong taxonomy hoặc enum known set.
- Tag decision phải phân biệt được ít nhất: default chưa review, operator xác nhận ignore, operator map có hiệu lực, operator disable.
- Tag mới được source gửi về sau khi page đã activate phải tự rơi vào `default noise` với provenance `system_default`, không được chặn onboarding hay daily run.
- Deactive tags từ source phải được lưu source-state rõ ràng; runtime không được ngầm coi chúng là active decision mới.
- `opening_rules_json` là optional extractor; config malformed từ operator phải bị reject, nhưng runtime no-match hoặc empty rule set luôn phải fallback qua `first_meaningful_message`.
- Manual preview với draft config phải bị cô lập: không mutate active config, không tạo publish pointer, và không tạo reusable official artifact ngoài luật publish/activate tường minh.

## 4. Design Gate

### Hướng 1: Giữ model hiện tại, chỉ thêm docs và validation cục bộ

**Ý tưởng**

- Giữ 6 role cũ.
- Giữ `page_config_version` payload gần như cũ.
- Thêm docs, thêm vài validation, thêm scheduler sau.

**Ưu điểm**

- Diff nhỏ lúc đầu.
- Ít migration hơn.

**Nhược điểm**

- Không giải quyết gốc sự mơ hồ operator-facing.
- Vẫn không đủ cho Pancake tag universe thật.
- Dễ kết thúc trong trạng thái “config nhiều hơn nhưng semantics vẫn mập mờ”.

### Hướng 2: Giữ snapshot architecture, nhưng thay semantic contract và runtime effect một cách owner-clean

**Ý tưởng**

- `page_config_version` vẫn là snapshot root.
- Từng config bên trong được version hóa và typed lại theo semantics mới.
- Scheduler, tag decision, opening rules, reuse và publish đều được làm thành runtime behavior thật.

**Ưu điểm**

- Giữ được boundary tốt đang có: page -> config snapshot -> frozen run snapshot.
- Đủ rộng để sửa tận gốc operator model và worker semantics.
- Không phải vứt toàn bộ schema đang có.

**Nhược điểm**

- Diff lớn xuyên backend/go-worker.
- Cần migration/taxonomy/bootstrap/test kỹ.

### Hướng 3: Full normalized rewrite cho toàn bộ config và onboarding state

**Ý tưởng**

- Tách tag decisions, opening rules, schedule policy, notification targets thành nhiều table normalized.
- Thiết kế lại toàn bộ control-plane data model.

**Ưu điểm**

- Semantics có thể rất sạch.

**Nhược điểm**

- Blast radius quá lớn cho nhu cầu hiện tại.
- Chậm đưa ETL control-plane về trạng thái dùng được.
- Có nguy cơ refactor kiến trúc nhiều hơn giá trị operator nhận được trong ngắn hạn.

### Recommendation

Chọn **Hướng 2**.

Lý do:

- Vấn đề cốt lõi không phải nằm ở việc snapshot architecture sai, mà nằm ở semantic contract và runtime effect bên trong snapshot đang sai hoặc chưa hoàn tất.
- Hướng 2 cho phép chốt lại owner boundary rõ ràng, giữ mô hình freeze snapshot hiện có, nhưng vẫn đủ chỗ để thay tag model, scheduler và reuse.
- Hướng 1 chỉ làm repo “giải thích tốt hơn một model chưa dùng được”. Hướng 3 thì đúng nhưng quá nặng cho first usable ETL control-plane.

## 5. Final Target Architecture

### 5.1 Connected page và lifecycle vận hành

`connected_page` tiếp tục là root entity nhưng API/operator view phải expose một `operational_state` rõ ràng, tối thiểu gồm:

- `draft`
- `active_waiting_first_official`
- `active_healthy`
- `paused`
- `attention_required`

`etl_enabled` và `analysis_enabled` vẫn là capability flags, nhưng operator không được buộc phải tự suy luận trạng thái vận hành từ hai boolean này.

Nguồn tính `operational_state`:

- active config đã tồn tại hay chưa
- token còn hợp lệ hay không
- scheduler enrollment có tồn tại hay không
- latest official/manual run health
- publish snapshot mới nhất cho ngày gần nhất có hợp lệ hay không

### 5.2 Page config snapshot vẫn giữ, nhưng từng config phải có semantic contract rõ

`page_config_version` vẫn là snapshot root. Tuy nhiên từng field bên trong phải được hiểu như sau.

#### `tag_mapping_json` giữ physical field name hiện tại nhưng semantic document bên trong đổi sang `tag_decisions_v2`

Document này phải biểu đạt được:

- catalog tag đã quan sát từ source hoặc sample
- source state của tag: `active` hoặc `deactive`
- decision state do server quản lý:
  - `unreviewed_default_noise`
  - `operator_confirmed_noise`
  - `operator_mapped`
  - `operator_disabled`
- category business của tag:
  - `journey`
  - `need`
  - `closing_outcome`
  - `branch`
  - `staff_owner`
  - `customer_segment`
  - `disqualifier`
  - `campaign_marker`
  - `noise`
- code source:
  - `analysis_taxonomy`
  - `page_local`
  - `none`
- canonical code khi applicable
- audit fields cơ bản cho lần review cuối, gồm cả provenance `system_default` hoặc `operator_override`

Doctrine cutover rule:

- `docs/design.md` phải được update trong cùng change set hoặc ngay trước implementation đầu tiên để thay thế luật `role/canonical_role` cũ bằng semantic contract này.
- Executor không được tự chọn giữa model cũ và model mới trong lúc code.

Rules bắt buộc:

- `journey`, `need`, `closing_outcome` phải dùng code thuộc `analysis_taxonomy_version` active.
- `branch`, `staff_owner`, `customer_segment`, `disqualifier`, `campaign_marker` dùng `page_local` code do server cấp. `page_local` code phải là immutable identity trong scope `connected_page + category`, được sinh từ normalized slug ổn định và operator chỉ được chọn từ known set, không gõ free text.
- server phải dùng một Unicode normalization form cố định trước khi slugify; repeated sampling của cùng normalized label trong cùng `connected_page + category` phải reuse đúng `page_local` code đã cấp.
- nếu hai raw labels collapse về cùng slug, server phải mint collision suffix ổn định và từ đó giữ immutable; rename/deactive/reactive không được remint code cũ hay rewrite historical mapping silently.
- `noise` phải dùng `code_source = none`.
- tag mới quan sát sau activation nhưng chưa được operator review phải tự materialize thành `unreviewed_default_noise` với provenance `system_default`, không fail run.
- deactive tag từ source không được auto-map như tag mới active; nếu còn xuất hiện trong current conversation tags, runtime chỉ áp decision đã tồn tại hoặc default-noise an toàn.
- operator không được gõ `canonical_code` tự do cho analysis-backed categories; phải chọn từ known set.

Pancake sample là lý do phải làm vậy:

- có tag staff như `HẰNG`, `TRÂN`, `NHI`
- có tag branch như `Quận 3`, `Bình Thạnh`, `Thủ Đức`
- có tag journey/outcome như `KH TÁI KHÁM`, `KH mới`, `SĐT/CHƯA CHỐT`
- có tag segment như `Sinh Viên`, `Phụ Huynh`, `<18 tuổi`
- có tag disqualifier/noise như `Spam`, `DV khác`, `Không nhu cầu`
- có tag `is_deactive = true` nhưng vẫn xuất hiện trong conversations

Model 6 role hiện tại không đủ sạch để operator review đống dữ liệu này.

#### `opening_rules_json` là typed heuristic selector, không còn free-form mơ hồ

`opening_rules_json` chỉ dùng cho explicit signals từ opening block. Nó phải support:

- taxonomy-backed `journey`, `need`, `closing_outcome`
- selector source scope rõ ràng: `text`, `postback`, `quick_reply_selection`, `template_button`
- priority rõ ràng và conflict policy rõ ràng
- preview evidence để operator biết rule match từ đâu

Rules bắt buộc:

- `signal_code` không còn là free text; phải chọn từ taxonomy-backed codes cho dimension tương ứng.
- `allowed_message_types` không còn là string tùy ý; phải là enum known set của worker.
- malformed selector phải bị reject; không fallback silent về empty selectors.
- rule set rỗng hoặc không match là runtime state hợp lệ; parser phải fallback qua `first_meaningful_message` thay vì coi là failure.
- built-in default selectors và operator selectors phải được merge server-side với precedence rõ ràng; operator không cần biết source code để override.

#### `prompt_text` vẫn là plain text, nhưng phải có guardrails rõ

`prompt_text` vẫn là khối text plain text page-local.

Rules bắt buộc:

- trim và normalize whitespace
- max length hợp lý
- reject control characters hoặc payload rác rõ ràng
- lint warnings tối thiểu cho prompt quá ngắn hoặc để trống
- prompt không được phép là nơi định nghĩa taxonomy, parser rule hay snapshot semantics

#### `scheduler_json` chỉ chứa schedule policy operator-facing

Field này phải thực sự chi phối runtime và bao gồm:

- `official_daily_time`
- `lookback_hours`

Rules bắt buộc:

- timezone duy nhất vẫn là `connected_page.business_timezone`; `scheduler_json` không có timezone riêng.
- `official_daily_time` là input của scheduler dispatch thật.
- `lookback_hours` là input cho source discovery overlap, không làm nở canonical window persisted.
- lazy operator không phải chỉnh field này; hệ thống dùng default an toàn.

#### `notification_targets_json` bị loại khỏi operator contract của slice này

- Không expose field này ở operator onboarding/config API của slice này.
- Không có proof obligation, acceptance step hay validation matrix cho field này trong slice này.
- Nếu DB hiện vẫn còn field cũ, legacy value chỉ được preserve opaque cho audit/backfill; executor không được diễn giải nó như capability đang hoạt động.

#### `analysis_taxonomy_version_id` phải trỏ tới taxonomy thật, không phải placeholder rỗng

Taxonomy phải bootstrap tối thiểu cho các dimension analysis-backed:

- `journey`
- `need`
- `closing_outcome`
- `opening_theme`
- `customer_mood`
- `process_risk_level`
- `response_quality`

Taxonomy phải chứa:

- allowed codes
- business labels tiếng Việt
- sort order
- grouping/export metadata nếu cần

Không còn chấp nhận default taxonomy `categories: {}` trong môi trường được coi là usable.

### 5.3 Runtime manifest và frozen snapshot

Mỗi `pipeline_run_group` phải freeze được ít nhất:

- frozen config version id
- frozen taxonomy version id
- frozen prompt hash/version
- ETL transform hash
- AI analysis identity nếu processing mode cần AI

Worker manifest phải mang đủ data để worker không phải tự “đoán” config runtime từ DB đang live.

Run creation rules bắt buộc:

- scheduler due-scan, activate và manual preview phải pin snapshot atomically; không được tạo run dùng lẫn config/taxonomy/prompt từ hai state khác nhau.
- manual preview phải mang explicit draft config version id riêng và không được reuse như official artifact nếu operator chưa activate/publish theo luật.
- plan này chỉ khóa manifest fields backend/go-worker cần để giữ identity đúng; không kéo thêm service implementation vào scope.

### 5.4 Legacy config cutover và migration policy

- `page_config_version` phải có semantic version marker rõ để phân biệt legacy contract với contract mới.
- Existing active pages không được tiếp tục chạy vô thời hạn trên semantic contract cũ. Trước khi scheduler cutover hoàn tất, mỗi page phải có một active snapshot mới đã migrate owner-clean.
- Legacy config nào migrate được deterministically thì backend tạo migrated snapshot mới và activate theo policy cutover.
- Legacy config nào chứa ambiguity không migrate owner-clean được thì page chuyển `attention_required`, official scheduler enrollment bị pause, operator vẫn có thể review draft/migrate thủ công; không được giữ page chạy bằng ambiguous legacy semantics rồi coi như remediation xong.
- In-flight runs đã start trước cutover tiếp tục hoàn tất trên frozen snapshot cũ để giữ auditability.
- Sau cutover, scheduler và manual run mới chỉ được bind vào active snapshot theo semantic contract mới; legacy snapshot chỉ còn readable cho audit, không được activate lại.

### 5.5 Deterministic ETL fields và quan hệ với analysis

Current state chỉ `explicitRevisitSignal` có downstream deterministic effect rõ. Final state phải sửa lại:

- explicit `journey`, `need`, `closing_outcome` từ tags/opening rules phải được normalize vào deterministic signal bundle trong `thread_day`
- read models phải có precedence rule rõ:
  - explicit deterministic signal không conflict thì thắng cho official field cùng dimension
  - AI inference là fallback hoặc secondary explanation khi không có explicit deterministic signal
  - nếu explicit signals conflict, row phải mang conflict marker và fallback policy rõ ràng

Điều này giúp operator hiểu rằng việc map tag/rule có effect thực, không chỉ “có thể hữu ích cho AI”.

## 6. Operator Flows Phải Hỗ Trợ

### 6.1 Lazy onboarding

Flow:

1. Nhập `user_access_token`.
2. Tải danh sách page từ token.
3. Chọn page.
4. Bấm activate.

Kết quả bắt buộc:

- `connected_page` được upsert
- active config an toàn được tạo nếu page chưa có config
- `scheduler_json` default được materialize
- page được enroll vào scheduler `official_daily`
- page chuyển sang `active_waiting_first_official` hoặc `active_healthy` tùy trạng thái hiện tại

Lazy operator không phải chạm vào tag decisions, opening rules hay prompt trước khi page được đưa vào hệ thống.

### 6.2 Non-lazy onboarding

Flow:

1. Nhập `user_access_token`.
2. Tải danh sách page.
3. Chọn page.
4. Lấy sample thực từ page.
5. Hệ thống sinh draft tag catalog, default decisions, opening rule candidates và sample transcript/evidence.
6. Operator review/chỉnh typed config.
7. Có thể chạy manual preview từ draft.
8. Activate page khi draft đủ ổn.

Rules bắt buộc:

- sample preview không được mutate publish pointer
- sample preview không được tự persist thành active config nếu operator chưa save/activate
- sample preview không được tạo official reuse artifact hay scheduler-visible state nếu operator chưa activate/publish
- operator không phải viết JSON tay
- structured decisions phải có dropdown/enum/known set thay vì free text

### 6.3 Config editing cho page đang vận hành

Flow này phải cho phép:

- tạo draft config version mới từ active config hiện tại
- lấy sample mới nếu cần để review tags mới xuất hiện
- chạy manual preview bằng draft config
- activate config version mới cho run tương lai

Run cũ đã publish không tự đổi theo config mới.

## 7. Scheduler Và Publish Model Cuối Cùng

### 7.1 Official daily dispatch

Backend phải có scheduler dispatcher thật, ưu tiên theo boundary hiện tại:

- một scheduler loop hoặc BullMQ-based dispatcher trong `backend/`
- scan các page active theo `business_timezone` và `official_daily_time`
- tạo `official_daily` run cho ngày business `D` tại `00:00` ngày `D+1` local time, trừ khi page dùng schedule khác được cấu hình rõ
- đảm bảo mỗi page + target_date chỉ có tối đa một official child run active theo luật thiết kế
- có catch-up policy nếu scheduler bị down trong khung giờ due
- activation, due-scan và dedupe phải dùng cùng một atomic source of truth cho active config version để không thể phát sinh mixed snapshot

### 7.2 Manual run semantics

Manual run phải tách khỏi scheduler time. Operator có thể:

- chạy partial current day để preview
- chạy full-day historical/manual reprocess
- review output mà không publish
- publish theo luật nếu run đủ điều kiện

### 7.3 Publish invariants giữ nguyên nhưng phải có proof

- partial current day có thể `published_provisional`
- partial old day không publish
- full-day có thể `published_official`
- historical overwrite cần confirm mạnh
- official full-day có thể supersede provisional cùng ngày

## 8. Reuse Và Upsert Architecture

### 8.1 Raw/source reuse

Raw layer phải upsert và reuse theo identity nguồn, tối thiểu gồm:

- `connected_page_id`
- source `thread_id`
- source `message_id`
- source update marker nếu Pancake có

Rules:

- manual partial run của ngày `D` phải để lại raw coverage có thể reuse khi official full-day cho ngày `D` chạy sau đó
- official full-day được fetch bổ sung phần thiếu và overlap `lookback_hours` quanh cuối ngày để tránh miss update muộn
- source update marker hoặc equivalent change marker phải được dùng để detect late edits trong vùng overlap và invalidate đúng raw/ODS rows bị ảnh hưởng
- overlap chỉ phục vụ discovery/recovery; persistence canonical vẫn cắt về window ngày `D`
- overlap không được tạo duplicate raw row hay stale derived row nếu cùng message bị thấy lại nhiều lần

### 8.2 ODS reuse

ODS `thread_day`/derived ETL facts chỉ được reuse nguyên trạng khi:

- raw evidence hash tương thích
- ETL transform config hash không đổi

Nếu `tag_decisions` hoặc `opening_rules` đổi:

- raw/source được phép reuse
- ODS phải recompute deterministic fields và normalized signals

### 8.3 AI reuse contract

Plan này không đi sâu vào AI service internals, nhưng ETL control-plane phải chuẩn bị identity đúng:

- evidence hash
- prompt hash/version
- taxonomy version
- runtime profile id/version

Nếu `prompt_text` đổi thì raw/ODS có thể reuse nhưng AI result không được reuse mù.

### 8.4 Reuse summary phải phản ánh thực tế

`reuse_summary_json` phải ghi đúng số lượng:

- raw reused
- raw refetched
- ODS reused
- ODS rebuilt
- AI reused nếu applicable
- reuse reason cụ thể, không luôn `fresh_run`

## 9. Validation Và Operator-Safe Inputs

### 9.1 Structured config writes

Rules bắt buộc:

- invalid structured payload phải reject với field-level errors
- unknown enum phải reject
- unknown taxonomy code phải reject
- `null` và `undefined` phải có semantics riêng, không nhập nhằng
- backend không silent-correct làm thay đổi ý nghĩa operator input mà không báo lại

### 9.2 Text fields

Text fields cho phép operator nhập chỉ nên còn:

- `prompt_text`
- `notes`

Rules:

- trim
- length cap
- normalize whitespace
- reject control chars hoặc binary-looking input
- không cho text tự do ở nơi đáng ra phải là enum/code selection

### 9.3 Defaulting strategy

- Lazy path dùng default an toàn và visible.
- Non-lazy path dùng draft seeded từ sample/default, nhưng operator phải thấy rõ đâu là suggestion, đâu là active decision.
- Backend phải lưu được decision provenance đủ để sau này biết tag nào vẫn chưa review.

## 10. Execution Units

### EU0. Doctrine cutover và legacy cutover policy

**Target outcome:** Plan, `docs/design.md` và migration law thống nhất trước khi executor chạm code runtime; không còn song song doctrine tag cũ và semantic contract mới.

**Owned write scope:** `docs/design.md`, plan docs, migration notes/runbook, backend migration guardrails nếu cần.

**Boundary contract:** Executor không được tự chọn giữa legacy `role/canonical_role` semantics và `tag_decisions_v2`; legacy snapshot policy phải rõ trước khi scheduler/manual mới bind vào contract mới.

**Implementation shape:** Update doctrine cho `tag_mapping_json` semantic v2 dưới physical field name hiện tại, chốt `business_timezone` là timezone owner duy nhất, chốt `notification_targets_json` ra khỏi operator slice, và chốt policy migrate/attention-required cho legacy active pages.

**Proof:** Doc diff được review; integration tests chứng minh deterministic legacy migration tạo đúng một active snapshot mới mỗi page; ambiguous legacy page bị chuyển `attention_required`, scheduler enrollment bị pause, và không thể tạo manual/official run mới trên legacy contract; acceptance bar xác nhận chỉ snapshot mới được dùng cho run mới sau cutover còn in-flight run cũ vẫn hoàn tất trên frozen snapshot cũ.

**Stop conditions:** Nếu doctrine và plan còn cho phép hai contract tag cùng tồn tại hoặc còn để fate của legacy active config cho executor tự chọn.

**Banned shortcuts:** Cập nhật code trước rồi để `docs/design.md` sửa sau; tiếp tục cho legacy active page chạy vô thời hạn trên ambiguous semantics.

### EU1. Harden config contract và taxonomy governance

**Target outcome:** Mọi config trong `page_config_version` có typed semantics rõ, validation fail-closed cho operator writes, taxonomy active thật, và operator slice không còn no-op field.

**Owned write scope:** Prisma schema nếu cần, `chat_extractor.types.ts`, `chat_extractor.service.ts`, repository/controller tests, taxonomy seed/bootstrap, docs.

**Boundary contract:** Operator submit structured config không thể tạo runtime ambiguity; frozen snapshot phải luôn valid theo taxonomy/config contract tại thời điểm persist.

**Implementation shape:** Version lại các config documents, thay silent fallback bằng explicit parse errors, bootstrap taxonomy tối thiểu, và loại `notification_targets_json` khỏi operator API/docs trong slice này.

**Proof:** Tests cho invalid config rejection, taxonomy-backed code validation, default lazy config materialization, freeze snapshot integrity, và backend operator payload không còn nhận/trả `notification_targets_json`.

**Stop conditions:** Nếu executor buộc phải giữ silent fallback cho operator writes hoặc giữ taxonomy rỗng để đỡ migration thì phải dừng và escalate.

**Banned shortcuts:** Giữ nguyên schemas cũ rồi chỉ validate ở UI; dùng hardcoded labels thay cho taxonomy governance.

### EU2. Tag decision model và sample-driven onboarding semantics

**Target outcome:** Pancake tag universe được biểu đạt đúng; operator nhìn thấy reviewed state, source active/deactive state, category business, và effect của decision lên ETL/read-models.

**Owned write scope:** sample preview path, tag decision normalization, worker transform model, `thread_day` deterministic signal generation, read-model precedence, fixture-driven tests.

**Boundary contract:** Tag decisions phải chịu được tags staff/branch/segment/disqualifier/deactive từ sample thật và phải có downstream effect rõ ràng.

**Implementation shape:** Thay role model hiện tại bằng category + code-source + decision-state model dưới physical field `tag_mapping_json`; merge current tags và source state rõ ràng; `page_local` codes do server cấp; explicit signals đi qua deterministic bundle.

**Proof:** Tests dùng `docs/pancake-api-samples/...` cho các case mixed tags, deactive tag, add/remove history, operator reviewed vs unreviewed default noise, new tag sau activation tự rơi vào `system_default` noise mà không fail run, repeated sampling reuse đúng `page_local` code, và slug collision/Unicode normalization không làm remint historical identity.

**Stop conditions:** Nếu model mới vẫn phải rely vào free-text canonical codes cho analysis-backed dimensions hoặc không thể phân biệt operator-confirmed noise với default-noise.

**Banned shortcuts:** Giữ `mapping_source` như cờ duy nhất cho reviewed state; bỏ qua `is_deactive`; chỉ sửa docs cho 6 role cũ.

### EU3. Official scheduler lifecycle và page operational state

**Target outcome:** `official_daily` là job thật được dispatch theo `connected_page.business_timezone` + `official_daily_time`, có catch-up, có no-duplicate guard và page state phản ánh vận hành thật.

**Owned write scope:** backend scheduler/orchestrator modules, page status resolver, job planning, tests, health reporting, docs.

**Boundary contract:** Page active trong lazy/non-lazy lane phải được enroll và phải có một story vận hành hàng ngày có thể quan sát được.

**Implementation shape:** Dispatcher loop/BullMQ, due-page scan, job dedupe theo page+date, atomic active-config pinning khi create run, operational_state computation, token health/error surfacing.

**Proof:** Scheduler tests cho due time, catch-up, duplicate suppression, timezone correctness, active page enrollment, và activate-vs-due-scan atomicity.

**Stop conditions:** Nếu scheduler chỉ tạo metadata mà không dispatch run; hoặc operational state vẫn chỉ là hai boolean thô.

**Banned shortcuts:** Cron ngoài repo không được control-plane biết; fake next-run timestamps không có actual dispatcher.

### EU4. Manual run, reuse matrix và publish safety

**Target outcome:** Manual partial/full, official full-day và publish cùng hoạt động đúng ngữ nghĩa; raw/ODS reuse có thật; publish history/pointers giữ đúng luật.

**Owned write scope:** worker extract/load reuse logic, run planning, publish service/repository, run detail artifacts, tests.

**Boundary contract:** Manual actions không phá daily automation nhưng cũng không bị tách khỏi data reuse/publish semantics.

**Implementation shape:** raw upsert identities, late-edit invalidation theo update marker, ODS recompute conditions, preview isolation, reuse summary thật, publish conflict checks giữ nguyên nhưng được test trong presence of reused data.

**Proof:** Integration tests manual partial -> official full-day reuse; late edit trong vùng overlap không tạo duplicate/stale rows; manual preview không tạo official artifact trước activate/publish; manual historical full-day -> overwrite confirm; partial old day publish reject.

**Stop conditions:** Nếu official full-day vẫn phải full refetch/full rebuild vô điều kiện; hoặc reuse chỉ được ghi log mà không ảnh hưởng execution plan.

**Banned shortcuts:** chỉ cập nhật `reuse_summary_json` mà không reuse execution path thật.

### EU5. Operator API surface, docs và acceptance matrix

**Target outcome:** API/docs phản ánh đúng mental model operator; repo có acceptance matrix rõ cho lazy lane, non-lazy lane, manual lane, scheduler lane và failure modes.

**Owned write scope:** controller responses, Swagger/OpenAPI nếu có, README/docs, acceptance checklist, runbook.

**Boundary contract:** Backend API/docs phải đủ để frontend sau này chỉ việc render typed forms; slice này không yêu cầu ship `frontend/`.

**Implementation shape:** expose typed endpoints/resources rõ ràng, document decision states/config semantics, ghi rõ field nào internal-only hay operator-facing.

**Proof:** Doc review plus API integration checklist bám theo operator scenarios thực.

**Stop conditions:** Nếu docs vẫn mô tả field theo tên kỹ thuật nhưng không nói runtime effect và validation semantics.

**Banned shortcuts:** viết docs dạng schema dump mà không có operator intent và run semantics.

## 11. Verification Matrix

- Lazy onboarding: token hợp lệ -> chọn page -> activate -> scheduler enrollment -> trạng thái page đúng.
- Scheduler defaults: lazy onboarding và migrated page đều materialize `official_daily_time = 00:00` và `lookback_hours = 2` nếu operator chưa chỉnh.
- Non-lazy onboarding: token -> sample -> draft tag decisions/opening/prompt -> manual preview -> activate.
- Tag semantics: mixed staff/branch/journey/disqualifier tags từ sample cho ra normalized decisions đúng.
- `page_local` identity: repeated sampling, deactive/reactive tags, Unicode normalization và slug collision vẫn giữ code ổn định/duy nhất trong `connected_page + category`.
- Fail-open runtime: tag mới sau activation tự thành `system_default` noise và daily run vẫn xanh; rule set opening trống/no-match vẫn fallback qua `first_meaningful_message`.
- Deactive tags: vẫn được quan sát đúng source-state, không tự biến thành active reviewed decisions.
- Scheduler: due run cho ngày `D` được tạo ở đầu ngày `D+1` theo `connected_page.business_timezone`, không có mixed snapshot khi activate trùng due-scan.
- Legacy cutover: deterministic migration tạo đúng một active snapshot mới; legacy page ambiguous bị `attention_required`, bị unschedule khỏi `official_daily`, và không tạo được manual/official run mới trên legacy contract; in-flight old run vẫn finish trên frozen snapshot cũ.
- Reuse: manual partial/full được reuse vào official full-day cùng ngày khi hashes phù hợp; late edit trong vùng overlap invalidate đúng rows bị ảnh hưởng.
- Publish: partial old day reject; historical official overwrite cần confirm; provisional bị supersede đúng luật.
- Preview isolation: draft manual preview không mutate publish pointer, active config hay official reuse artifact trước activate/publish.
- Validation: invalid taxonomy code, invalid message type, invalid scheduler time đều trả lỗi rõ; operator payload không còn field `notification_targets_json` trong slice này.
- Read-model precedence: explicit deterministic signals thắng AI fallback khi không conflict.

## 12. Copy-Ready Delegation Handoff

### Primary executor

`Thực hiện docs/plans/etl-control-plane-operator-readiness-plan-2026-04-15.md theo đúng owner boundary backend/go-worker/docs. Không giữ silent fallback cho operator writes. Bắt đầu bằng doctrine cutover trong docs cho `tag_mapping_json` semantic v2, `business_timezone` timezone ownership, legacy config migration policy và việc rút `notification_targets_json` khỏi operator slice. Sau đó khóa lại config contract, tag decision model, scheduler dispatch, manual/official reuse, publish invariants và backend docs/API surface theo plan. Mọi structured config phải có proof field-level validation; mọi source-observed drift phải có proof fail-open an toàn. Dùng Pancake sample trong docs làm fixture chính cho tag semantics. Nếu phải giữ field name cũ vì physical rename không đáng, semantic payload mới vẫn phải versioned rõ và phải ghi debt note.`

### Hostile reviewer

`Review implementation của ETL control-plane operator-readiness với mindset tìm fake capability và boundary drift. Tấn công các điểm: structured config còn silent fallback, legacy notification field còn leak vào operator/API surface, scheduler chỉ có metadata chứ không dispatch thật, activate/due-scan vẫn có mixed snapshot risk, reuse chỉ đổi summary chứ không đổi execution path, tag model vẫn không chịu nổi Pancake sample mixed/deactive tags hoặc tag mới sau activation vẫn có thể làm fail run, và operator vẫn cần hiểu JSON/source code để dùng hệ thống.`
