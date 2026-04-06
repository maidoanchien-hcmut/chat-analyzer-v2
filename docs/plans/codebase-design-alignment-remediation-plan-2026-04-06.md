# Kế Hoạch Remediation Slice Sau Review 2026-04-06

**Goal:** Đóng các divergence đã được review xác minh trong slice `Cấu hình` + `Vận hành` + các business read-model liên quan, mà không invent taxonomy canonical production hay CRM active seam khi repo chưa pin đủ contract.

**Architecture:** `frontend/` là owner của draft state, shell layout, route persistence semantics và business view rendering; không được dựa vào full re-render theo từng ký tự để sync form. `backend/` là owner của control-plane contract (`connected_page`, `page_config_version`, `analysis_taxonomy_version`), read-model shape cho business views, và operations/run detail contract. `backend/go-worker` là owner của ETL transform seam như tag normalization/opening extraction; nếu source tag identity hoặc evidence bundle đổi thì phải đổi ở đúng seam này thay vì vá hiển thị ở frontend. `service/` không phải trọng tâm của slice này trừ khi thread audit/read-model cần expose thêm output AI đã tồn tại từ backend seam.

**Intent:** Sửa tận gốc các vấn đề đã xác minh trong review mà repo đã pin đủ boundary để thực hiện owner-clean, đồng thời tách riêng các seam đang blocked bởi thiếu contract/taxonomy content thay vì diễn đạt như thể chắc chắn hoàn tất trong cùng slice.

**Observable Delta:** Sau khi hoàn tất plan này:
- operator nhập token, prompt text, tag mapping, opening rules và notes ổn định mà không bị thay node mỗi lần gõ
- màn `Cấu hình` thực sự có 5 tab với panel đúng nghĩa, tận dụng viewport desktop và không còn form dài một cột
- shell/layout giữa `Tổng quan`, `Khám phá dữ liệu`, `Lịch sử hội thoại`, `Vận hành`, `Cấu hình` có nhịp ổn định; tab, action row và inline checkbox không còn bị giãn/phình sai nhịp
- tag mapping giữ được `pancake_tag_id` thật từ source thay vì ID giả theo thứ tự dòng
- `Thông tin page` hiển thị được token/connection status đủ để debug seam control-plane
- `Tổng quan` có delta kỳ trước thực, `Khám phá dữ liệu` có builder/drill runtime thật, `Lịch sử hội thoại` có workspace audit/evidence đúng design, `Vận hành` có run detail thread coverage đúng grain `thread`
- nếu canonical taxonomy catalogue đã được pin trong repo trước khi execute, `analysis_taxonomy_version` trở thành semantic owner thật; nếu chưa pin, plan chỉ được kết thúc với blocker ledger và tuyệt đối không invent taxonomy production
- nếu CRM contract ngoài repo đã được pin trước khi execute, `Vận hành` mới được mở mapping queue action thật; nếu chưa pin, UI chỉ được hiển thị gating rõ ràng và read-only diagnostics owner-clean

**Primary Contract:** Không được sửa các divergence này bằng symptom patch. Source-of-truth phải nằm đúng seam owner:
- form editing ở `frontend/` phải giữ state owner-clean, không sync bằng DOM query + full `innerHTML` re-render cho mỗi ký tự
- `connected_page` phải owner token/trạng thái kết nối; UI không được tự suy luận mơ hồ từ việc “load page được hay không”
- `page_config_version.tag_mapping_json` phải giữ source tag identity thật và audit được source/default/override
- business views phải đọc từ read-model/API contract đúng grain đã pin, không render placeholder rồi coi như parity
- plan này không được invent `analysis_taxonomy_version` content production hay CRM write-back contract nếu repo chưa pin đủ; với hai seam đó, executor phải stop và ghi blocker thay vì tự suy diễn

**First Proof:** Một proof end-to-end ở `frontend` + `backend` phải chứng minh được:
- nhập token/prompt/tag mapping không mất focus hay reset giá trị khi gõ
- chuyển 5 tab `Cấu hình` chỉ hiện đúng panel tương ứng và không làm mất draft state
- submit config version giữ được `pancake_tag_id` thật trong payload/control-plane flow
- `connected_page` response có token/connection status và UI render đúng ở tab `Thông tin page`
- ít nhất một KPI `Tổng quan` trả delta thật so với kỳ trước
- drill từ `Khám phá dữ liệu` sang `Lịch sử hội thoại` vẫn giữ merge-route semantics hiện tại, đọc đúng slice hiện tại và workspace hiển thị opening block/tag signals/audit output

**First Slice:** Chốt owner-clean frontend configuration shell + draft editing contract trước, vì đây là blocker trực tiếp của onboarding/configuration và là nguyên nhân làm mọi bước sau khó xác minh.

**Blast Radius:** `frontend/src/app/frontend-app.ts`, `frontend/src/app/query-state.ts`, `frontend/src/app/screen-state.ts`, `frontend/src/features/configuration/*`, `frontend/src/features/operations/*`, `frontend/src/features/overview/*`, `frontend/src/features/exploration/*`, `frontend/src/features/thread-history/*`, `frontend/src/styles/*`, `frontend/src/adapters/http/*`, `backend/src/modules/chat_extractor/*`, `backend/src/modules/read_models/*`, `backend/prisma/schema.prisma`, `backend/go-worker/internal/transform/build.go`, và các test/docs liên quan. Đây là remediation slice đa seam nhưng owner boundary rõ; không nên tách theo kiểu “sửa CSS trước rồi semantics sau” nếu vẫn để contract drift.

**Execution Posture:** Thực hiện theo execution units bền vững theo owner seam. Tuy nhiên các seam `taxonomy content activation` và `CRM active mapping` là gated units: chỉ execute khi pre-execution gate tương ứng được chứng minh mở. Nếu gate đóng, executor phải bỏ hẳn unit đó khỏi completion claim của slice này, không fake-pass bằng fallback owner sai.

**Allowed Mechanism:** Refactor event/update loop ở frontend sang state-preserving shape; tách thật các panel/tab; chỉnh CSS utility dùng đúng semantics thay vì một class flex dùng chung cho mọi loại control; mở rộng `connected_page` contract và read-model contract ở backend; thay placeholder read-model bằng query/aggregation/runtime state thật; chỉ activate taxonomy canonical hoặc CRM action path khi repo đã pin đủ contract tương ứng.

**Forbidden Shortcuts:** Vá bằng debounce + re-render toàn bộ; giữ tất cả panel trong DOM chỉ đổi `outline`; thêm field token status hardcode từ frontend state; serialize `sourceTagId` theo index; giữ KPI delta là `"-"` nhưng đổi label; render mapping queue bằng local mock rồi gọi là done; expose thêm vài field audit nhưng không load opening block/tag signals/output bundle thật; tự bịa taxonomy codes/labels/sort order/grouping rules; tự bịa CRM approve/reject/remap side effects.

**Forbidden Scaffolding:** Không thêm bridge state kiểu `shadowDraft`, `transientToken`, `uiOnlyTokenStatus`, `temporaryTagIdMap`, `fakeBuilder`, `mockMappingQueueApi` chỉ để diff nhìn nhỏ. Không giữ dual path giữa taxonomy hardcode labels và taxonomy canonical mới mà không có kill point rõ. Không thêm UI action CRM giả chỉ để màn `Vận hành` nhìn “đủ chức năng”.

**Proof Obligations:**
- `frontend`: proof cho stable input/editing, 5-tab isolation, layout shell ổn định, tab/button/checkbox rhythm, route persistence không hồi quy
- `frontend + route`: proof cho exploration -> thread-history drill preservation và global business filter persistence trên các view bị chạm
- `backend control-plane`: proof cho connected page status contract, source tag identity preservation, taxonomy version plumbing nếu taxonomy gate mở
- `backend read-model`: proof cho KPI delta, exploration builder/drill contract, thread workspace evidence/audit fields, operations run detail thread coverage theo grain `thread`
- `taxonomy gated unit`: chỉ có proof khi repo đã pin canonical taxonomy catalogue đủ dùng; nếu gate đóng thì phải có blocker record thay cho “green proof”
- `CRM gated unit`: chỉ có proof action path khi repo đã pin CRM contract; nếu gate đóng thì phải có proof UI/backend không lộ action giả và chỉ hiện gating đúng seam
- `docs`: cập nhật `README.md` hoặc doc liên quan nếu contract/UI flow thực tế đổi so với hiện trạng mô tả trong repo

**Proof Ownership:**
- Architect-owned proof: owner seam của `frontend` draft, `connected_page`, route/filter persistence, `thread`-grain operations detail, `thread_day` workspace và mọi gated boundary phải giữ đúng `docs/design.md` và `docs/ui-flows.md`
- Executor-owned proof: refactor/render/state/CSS/backend contract/query changes, tests, và execution ledger cho các gate
- Hostile-review focus: symptom patch thay vì owner-clean rewrite; fake parity bằng placeholder; source tag identity vẫn drift; drill route hoặc filter persistence bị hồi quy; run detail lỡ chuyển về grain `thread_day`; taxonomy hoặc CRM seam bị invent thay vì block đúng chỗ
- Escalation trigger: nếu canonical taxonomy content thực tế chưa đủ pin trong `docs/`; nếu CRM write-back contract chưa tồn tại trong repo; nếu thread workspace cần thêm field từ AI service mà backend hiện không persist; hoặc nếu business builder `Khám phá dữ liệu` đòi product decision ngoài source-of-truth hiện có

**Not Done Until:** Không được claim xong remediation slice này nếu:
- token/prompt/tag mapping vẫn re-render mất ổn định khi gõ
- `Cấu hình` chưa thật sự tách thành 5 panel
- `sourceTagId` vẫn là ID giả
- `connected_page` chưa có status usable
- `Tổng quan` vẫn không có delta thật
- `Khám phá dữ liệu` vẫn là placeholder summary hoặc drill route làm mất filter/slice hiện có
- `Lịch sử hội thoại` chưa xem được opening block/tag signals/output audit chính
- `Vận hành` chưa có run detail thread coverage đúng grain `thread`
- các filter business chính không còn persist đúng giữa những view bị chạm
- nếu taxonomy gate đã mở từ đầu mà execution vẫn để taxonomy canonical là vỏ rỗng
- nếu CRM gate đã mở từ đầu mà execution vẫn chỉ còn gating/read-only thay vì active seam thật

**Solution Integrity Check:**
- Least-painful patch: chặn `render()` trên một vài input nhạy cảm, ẩn bớt section bằng CSS, thêm vài field status read-only, vá route/button wording cho giống spec, và để taxonomy/CRM ở trạng thái “trông như có”.
- Why rejected: Cách đó không sửa owner boundary, không khóa semantic contract, và vẫn cho phép executor fake-pass bằng UI giống spec nhưng dữ liệu/contracts vẫn sai.
- Largest owner-clean slice: remediation slice này gồm configuration shell/draft, control-plane status + source tag identity, business read-model parity cho overview/exploration/thread-history/operations detail; taxonomy activation và CRM active seam là execution units riêng chỉ mở khi gate tương ứng đã được pin.
- Why this slice is safe for a strong agent: codebase hiện đã có seam tách `frontend`/`backend`/`go-worker`; divergence unblocked chủ yếu là contract drift và placeholder implementation, không đòi tái kiến trúc toàn repo.
- If forced to stage: chỉ được stage theo owner seam bền vững `configuration shell`, `control-plane tag/status`, `business read-model parity`, `taxonomy gated unit`, `CRM gated unit`; không stage kiểu “CSS trước, data sau” hay “frontend mock trước, backend thật sau”.
- Debt or drift path: mọi gated seam chưa mở phải được ghi rõ trong execution ledger hoặc blocker doc; không để “sẽ làm sau” tồn tại ngầm trong code hay completion claim.

## 1. Scope Đã Xác Minh Từ Review

### 1.1 Findings nằm trong scope remediation này

- `#1` render loop ở `frontend` phá UX nhập liệu
- `#2` màn `Cấu hình` chưa thật sự là 5 tab
- `#3` shell/layout `Cấu hình` và `Vận hành` lệch nhịp business views
- `#4` CSS dùng chung làm tab/button/label/checkbox lệch nhịp
- `#6` tag taxonomy editor làm mất `pancake_tag_id`
- `#7` `Tổng quan` chưa có delta kỳ trước
- `#8` `Khám phá dữ liệu` mới là placeholder
- `#10` `Lịch sử hội thoại` chưa có đủ workspace audit/evidence
- `#11` `Vận hành` thiếu thread coverage thật; mapping queue action chỉ nằm trong scope nếu CRM gate mở
- `#12` `connected_page` chưa trả token status/connection status

### 1.2 Findings gated, không được overclaim

- `#5` taxonomy canonical toàn cục đang là placeholder:
  chỉ nằm trong scope execution nếu repo pin đủ canonical taxonomy catalogue trước khi bắt đầu Unit D; nếu không, remediation slice này phải dừng ở blocker ledger, không invent taxonomy production
- `#11` mapping queue approve/reject/remap:
  chỉ nằm trong scope execution nếu repo pin đủ CRM contract ngoài local persistence seams trước khi bắt đầu Unit E; nếu không, remediation slice này chỉ được hoàn thiện read-only diagnostics + gating rõ ràng

### 1.3 Finding không được hiểu sai trong lúc execute

`#9` không được execute như một bug “filter context mất hoàn toàn”, vì route hiện tại đang merge partial params với route đang sống. Scope đúng ở đây chỉ là:
- giữ nguyên merge semantics hiện có
- thêm proof cho exploration -> thread-history drill nếu implementation mới vô tình làm mất context
- không lén mở rộng thành deep-link redesign

## 2. Out Of Scope Cho Slice Này

- `Hiệu quả nhân viên`
- `So sánh trang`
- export `.xlsx`
- bất kỳ claim nào kiểu “đã đồng bộ toàn bộ codebase với design”

Nếu các lane trên cần sửa, chúng phải đi vào plan riêng. Slice này không được dùng wording khiến reviewer hiểu lầm là full design parity toàn repo.

## 3. Invariants Phải Giữ

- Repo này là single-company; không thêm tenant/workspace/organization ownership layer.
- `connected_page.id` và `pancake_page_id` vẫn là định danh chính cho control-plane page.
- `frontend/` không trở thành nơi owner dữ liệu canonical; chỉ owner draft/view state.
- `backend/` vẫn là owner của status connection, config version, taxonomy version, run detail/read-model.
- `service/` không bị kéo vào làm owner control-plane hay view logic.
- `tag_mapping_json` vẫn support default `noise` cho tag chưa map tay.
- `opening_rules_json` vẫn optional; không match phải fallback.
- `Prompt profile` vẫn là plain-text business rubric; không biến thành JSON editor.
- các list chính ở multi-day slice vẫn giữ grain `thread` theo `docs/ui-flows.md`.
- các filter business chính phải persist khi chuyển giữa những business views bị plan này chạm tới.
- không claim fix `Khám phá dữ liệu` hay `Vận hành` nếu chỉ đổi text/UI mà không có runtime contract tương ứng.

## 4. Pre-Execution Gates

### Gate G1: Canonical taxonomy catalogue availability

Phải xác minh trước khi bắt đầu Unit D:
- repo có file/docs pin đủ `allowed codes`, nhãn tiếng Việt, `sort order`, `grouping rules` cho các families mà `analysis_taxonomy_version` phải owner
- catalogue đó đủ để dùng production path, không chỉ là ví dụ kiến trúc

Nếu gate này không mở:
- Unit D không được execute
- remediation slice này không được claim đã đóng finding taxonomy governance
- executor phải ghi blocker ledger thay vì thêm hardcode labels hoặc taxonomy giả

### Gate G2: CRM external contract availability

Phải xác minh trước khi bắt đầu Unit E:
- transport/auth boundary sang CRM
- lookup rules deterministic
- write-back/update semantics
- approve/reject/remap side effects
- failure handling

Nếu gate này không mở:
- Unit E không được execute
- remediation slice này không được claim mapping queue parity/actionability
- UI/backend chỉ được giữ read-only current link/decision history + gating message owner-clean

### Gate G3: Exploration metric catalogue ambiguity

Phải xác minh trước khi hoàn tất Unit C:
- catalogue metric/dimension dùng cho builder không vượt quá những gì `docs/ui-flows.md` đã pin

Nếu gate này không mở:
- executor phải stop ở decision riêng, không tự mở rộng product surface

## 5. Design Gate

### Hướng 1: Vá nhanh blocker UI, defer semantic/read-model

**Ý tưởng**

- sửa render loop
- tinh chỉnh CSS/layout
- thêm token status tối thiểu
- defer read-model parity về sau

**Ưu điểm**

- giải quyết nhanh blocker vận hành trực tiếp

**Nhược điểm**

- để drift ở source tag identity, drill/read-model parity và operations detail sống tiếp
- rất dễ fake-pass bằng UI giống spec nhưng contract sai

### Hướng 2: Remediation slice owner-clean cho các seam unblocked, tách riêng gated units

**Ý tưởng**

- Unit A: configuration shell + draft editing + shared shell/CSS rhythm
- Unit B: control-plane status contract + source tag identity thật
- Unit C: read-model/business view parity cho overview/exploration/thread-history/operations detail
- Unit D: taxonomy activation path chỉ khi Gate G1 mở
- Unit E: CRM active mapping seam chỉ khi Gate G2 mở

**Ưu điểm**

- owner-clean
- completion claim không còn tự mâu thuẫn
- mỗi unit có proof và acceptance bar riêng

**Nhược điểm**

- cần kỷ luật gate/proof cao
- output cuối có thể là “slice hoàn tất nhưng gated seams vẫn blocked”, nên wording phải chặt

### Hướng 3: Chỉ sửa UI rồi thêm mock/fallback để bề ngoài giống spec

**Ý tưởng**

- UI giống doc
- dữ liệu thật bổ sung dần sau

**Ưu điểm**

- nhìn có vẻ “xong” nhanh

**Nhược điểm**

- là fake-pass route rõ nhất
- trái trực tiếp với review, repo doctrine và design gate

### Recommendation

Chọn **Hướng 2**.

### Vì Sao Không Chọn Least-Painful Patch

Least-painful patch thực tế là sửa `onInput`, ẩn bớt section bằng CSS, thêm một ít status text, giữ mapping queue bị gate nhưng vẫn viết plan như thể sẽ xong, và để taxonomy sống bằng hardcode labels. Tôi reject hướng này vì:
- không sửa contract 5 tab thật
- không loại bỏ drift ở `sourceTagId`
- không khóa proof cho drill route, filter persistence và thread-grain
- giữ nguyên hai mâu thuẫn lớn ở taxonomy/CRM acceptance bar

## 6. Execution Unit A: Configuration Draft Ownership Và Shell/Layout

**Target Outcome:** `Cấu hình` và `Vận hành` có shell/layout ổn định; `Cấu hình` thật sự là 5 tab; operator có thể nhập token, prompt, notes, tag/opening rows mà không bị DOM thay node mỗi lần gõ.

**Owned Write Scope:**

- `frontend/src/app/frontend-app.ts`
- `frontend/src/app/screen-state.ts`
- `frontend/src/features/configuration/*`
- `frontend/src/features/operations/*`
- `frontend/src/styles/layout.css`
- `frontend/src/styles/components.css`
- test frontend liên quan app/configuration/operations

**Boundary Contract:**

- input editing không được gọi full `render()` cho mọi ký tự trong form cấu hình/onboarding
- `activeTab` phải kiểm soát panel render thực sự, không chỉ focus/highlight
- `button-row`, `tab-row`, `inline-check`, `label` phải có semantics riêng; không dùng một flex rule cho tất cả
- shell giữa business views và operations/configuration phải giữ nhịp ổn định; nếu bỏ filter bar ở một view thì phải có lý do cấu trúc rõ, không tạo jump ngẫu nhiên

**Implementation Shape:**

- đổi event/update flow sang state-preserving form editing
- render có chọn lọc theo panel/tab
- tách utility CSS cho action row, tab row, meta row, inline checkbox
- điều chỉnh shell widths và composition để `Cấu hình` không thành form dài hẹp, `Vận hành` không giãn nút/tab

**Proof To Create Or Reuse:**

- repro hoặc test cho token/prompt gõ liên tục không mất giá trị/focus
- render proof cho 5 tab chỉ hiện panel tương ứng
- smoke/layout proof cho tab/button/checkbox row
- manual verification cho viewport desktop/mobile width theo repo guideline

**Stop Conditions:**

- nếu implementation vẫn dùng full `innerHTML` rebuild cho form editing nhạy cảm
- nếu 5 tab vẫn render chung một form dài
- nếu CSS vẫn reuse một primitive cho controls khác nghĩa

**Banned Shortcuts For This Unit:**

- debounce rồi vẫn full render
- giữ panel trong DOM và chỉ `display:none` mà không làm rõ state ownership nếu điều đó vẫn phá draft semantics
- fix riêng textarea token mà bỏ qua prompt/tag/opening/notes

## 7. Execution Unit B: Control-Plane Contract Và Source Tag Identity

**Target Outcome:** `connected_page` expose được token/connection status usable; config version giữ source tag identity thật end-to-end.

**Owned Write Scope:**

- `backend/prisma/schema.prisma`
- `backend/src/modules/chat_extractor/*`
- `backend/go-worker/internal/transform/build.go`
- `frontend/src/adapters/http/control-plane-adapter.ts`
- `frontend/src/adapters/contracts.ts`
- `frontend/src/features/configuration/*`
- test backend/frontend control-plane

**Boundary Contract:**

- status token/connection phải do `backend` trả về; `frontend` chỉ render
- `tag_mapping_json.entries[*].sourceTagId` phải giữ `pancake_tag_id` thật nếu source có
- text fallback trong worker chỉ là compatibility guard, không phải primary identity strategy

**Implementation Shape:**

- thêm fields status vào model/serializer/HTTP adapter cho `connected_page`
- sửa flow sample/config draft để giữ `pancakeTagId` từ source đến payload persist
- cập nhật worker normalization để ưu tiên ID thật và audit rõ source/default

**Proof To Create Or Reuse:**

- integration proof `connected_page` serialize status đúng
- integration proof payload config version giữ `pancake_tag_id`
- worker proof tag reorder/duplicate text không làm drift mapping
- proof rằng source Pancake tag payload ở path sample/config hiện có mang ID ổn định end-to-end đủ để thay thế `tag-${index + 1}`

**Stop Conditions:**

- nếu source Pancake seam thực tế không cung cấp ID ổn định cho tag trong path đang dùng

**Banned Shortcuts For This Unit:**

- thêm `tokenStatus: "unknown"` cố định ở serializer
- map source tag ID theo index rồi dựa vào text fallback

## 8. Execution Unit C: Business View Parity Cho Overview, Exploration, Thread History, Operations Detail

**Target Outcome:** `Tổng quan`, `Khám phá dữ liệu`, `Lịch sử hội thoại`, `Vận hành` bám đúng grain/read-model contract quan trọng theo doc, không còn placeholder ở các lane đã bị review bắt lỗi trong phạm vi unblocked.

**Owned Write Scope:**

- `backend/src/modules/read_models/*`
- `frontend/src/features/overview/*`
- `frontend/src/features/exploration/*`
- `frontend/src/features/thread-history/*`
- `frontend/src/features/operations/*`
- các contracts/adapters liên quan
- test read-model/frontend smoke

**Boundary Contract:**

- scorecards `Tổng quan` phải có delta kỳ trước tương đương
- `Khám phá dữ liệu` phải có builder runtime thật cho metric/breakdown/compare/drill; không chỉ render summary string cố định
- drill actions phải tiếp tục tương thích với merge-route semantics hiện tại
- các filter business hiện có phải persist đúng khi di chuyển giữa các view bị chạm
- thread workspace phải load và render opening block, normalized tag signals, explicit signals, evidence used, field explanations, structured AI output/audit thiết yếu
- `Vận hành` phải có thread coverage theo grain `thread`

**Implementation Shape:**

- tính delta từ slice kỳ trước tương đương trong read-model service
- đưa builder selections thành contract/view-model/runtime state thực
- mở rộng thread workspace query + view-model cho audit/evidence bundle
- hoàn thiện run detail/query/render cho thread coverage và diagnostics owner-clean

**Proof To Create Or Reuse:**

- backend tests cho delta calculation và slice comparison
- integration proof cho exploration builder/drill row contract
- explicit proof cho exploration -> thread-history drill route preservation
- explicit proof cho filter persistence trên các business views bị chạm
- proof rằng list chính ở multi-day slice và operations run detail vẫn ở grain `thread`
- thread-history proof cho workspace audit fields xuất hiện từ backend đến UI

**Stop Conditions:**

- nếu builder `Khám phá dữ liệu` đòi quyết định metric catalogue ngoài docs hiện có
- nếu implementation buộc operations detail quay về grain `thread_day`

**Banned Shortcuts For This Unit:**

- để `delta: "-"` rồi đổi copy
- giữ builder là text summary + table tĩnh
- render vài string audit nhưng không load thêm data thật
- đổi route handling theo hướng làm mất merge semantics hiện tại rồi gọi đó là “fix deep-link”

## 9. Execution Unit D: Taxonomy Activation Path

**Gate:** Chỉ execute khi Gate G1 mở.

**Target Outcome:** `analysis_taxonomy_version` trở thành semantic owner thật của label resolution trong phạm vi families mà repo đã pin đủ catalogue.

**Owned Write Scope:**

- `backend/prisma/schema.prisma`
- `backend/src/modules/read_models/*`
- data/config bootstrap taxonomy liên quan trong `backend/`
- docs taxonomy liên quan
- tests backend/read-model liên quan

**Boundary Contract:**

- `analysis_taxonomy_version` phải chứa semantic content usable cho categories/labels/grouping trong phạm vi catalogue đã pin
- read-model label resolution đọc canonical taxonomy trước; fallback chỉ là guard rail, không phải semantic owner

**Implementation Shape:**

- persist/seed taxonomy canonical theo đúng catalogue đã pin trong repo
- wiring read-model label resolution sang taxonomy owner-clean
- kill hoặc giới hạn rõ mọi hardcode label path còn sót lại

**Proof To Create Or Reuse:**

- proof taxonomy catalogue source path đã được pin trong repo trước khi code change
- read-model proof resolve labels từ taxonomy canonical thật
- proof không còn path chính nào dựa vào hardcode label map

**Stop Conditions:**

- nếu docs hiện tại chưa pin đủ canonical taxonomy content để tạo `analysis_taxonomy_version` usable

**Banned Shortcuts For This Unit:**

- để taxonomy canonical vẫn rỗng nhưng thêm nhiều hardcode labels hơn
- tự bịa codes/labels/sort order/grouping rules ngoài repo docs

## 10. Execution Unit E: CRM Mapping Active Seam

**Gate:** Chỉ execute khi Gate G2 mở.

**Target Outcome:** `Vận hành` có mapping queue action thật với approve/reject/remap, đọc và ghi qua CRM contract đã pin.

**Owned Write Scope:**

- backend mapping queue/read/write seam liên quan
- frontend operations mapping queue wiring
- docs/contract CRM liên quan nếu chúng đã được pin trong repo
- tests backend/frontend liên quan

**Boundary Contract:**

- mapping queue không được owner bằng local UI state
- approve/reject/remap phải có side effect thật theo contract CRM đã pin
- thread workspace và operations mapping queue phải nhìn cùng current link/decision history

**Implementation Shape:**

- backend queue/read/write endpoints theo contract CRM đã pin
- frontend wiring action thật, không mock
- gating message bị gỡ bỏ chỉ khi action path thật đã sẵn sàng

**Proof To Create Or Reuse:**

- proof CRM contract source path đã được pin trong repo trước khi code change
- operations proof cho mapping queue/action path end-to-end
- proof thread workspace và mapping queue nhìn cùng current link/decision history

**Stop Conditions:**

- nếu CRM mapping action đòi contract write-back chưa tồn tại trong repo

**Banned Shortcuts For This Unit:**

- dùng local `createInitialMappingQueue()` làm acceptance cho mapping queue
- giữ gating text nhưng thêm nút giả để nhìn “đủ action”

## 11. Proof Sequence

### 11.1 Pre-execution gate record

- ghi kết quả Gate G1 vào execution ledger
- ghi kết quả Gate G2 vào execution ledger
- ghi kết quả Gate G3 vào execution ledger nếu builder catalogue có ambiguity

### 11.2 First proof surface

- frontend repro/test cho render loop và 5-tab isolation
- control-plane integration cho source tag identity + page status contract
- exploration -> thread-history drill preservation

### 11.3 Second proof surface

- read-model tests cho KPI delta
- exploration builder/drill contract tests
- filter persistence proof trên các business views bị chạm
- thread workspace evidence/audit tests
- operations run detail thread-grain proof

### 11.4 Gated proof surface

- chỉ chạy proof Unit D nếu Gate G1 mở
- chỉ chạy proof Unit E nếu Gate G2 mở

### 11.5 Final proof surface

- `cd frontend && bun test`
- `cd backend && bun test`
- manual smoke có ghi nhận rõ:
  - nhập token/prompt/tag mapping ổn định
  - chuyển tab `Cấu hình` không mất draft
  - page info có status usable
  - overview có delta thật
  - exploration drill mở thread workspace với audit/evidence mới mà không làm mất slice/filter hiện có
  - viewport desktop/mobile width đúng guideline

## 12. Handoff Prompt

### Primary Executor

Thực hiện plan tại `docs/plans/codebase-design-alignment-remediation-plan-2026-04-06.md`. Giữ đúng các execution unit và proof sequence đã pin. Không mở rộng `#9` thành deep-link redesign. Không dùng mock/local placeholder làm acceptance cho taxonomy governance hay CRM mapping. Gate G1 và G2 phải được ghi vào execution ledger trước khi bắt đầu Unit D hoặc E; nếu gate đóng thì bỏ hẳn unit đó khỏi completion claim và dừng ở blocker ledger.

### Hostile Reviewer

Review kết quả thực thi theo plan `docs/plans/codebase-design-alignment-remediation-plan-2026-04-06.md`. Tấn công các route fake-pass sau: symptom patch cho render loop; 5 tab giả; token status giả; `sourceTagId` vẫn là ID theo index; drill route hoặc filter persistence bị hồi quy; run detail lỡ trượt về grain `thread_day`; taxonomy canonical bị invent khi Gate G1 chưa mở; CRM mapping action bị invent/local mock khi Gate G2 chưa mở; KPI delta vẫn hardcode; exploration builder vẫn là placeholder; thread workspace vẫn thiếu opening/tag/output audit.

## 13. Review Findings Đã Hấp Thụ Vào Bản Sửa Này

- tách mandatory completion bar khỏi hai seam đang gated là `taxonomy activation` và `CRM active mapping`
- đổi wording từ “đồng bộ codebase với design” sang remediation slice, đồng thời thêm `Out Of Scope`
- thêm proof bắt buộc cho exploration -> thread-history drill preservation
- thêm proof bắt buộc cho filter persistence và `thread` grain
- biến các câu hỏi mở về taxonomy/CRM thành `Pre-Execution Gates` có stop condition rõ ràng
