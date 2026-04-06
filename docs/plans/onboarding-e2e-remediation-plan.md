# Kế Hoạch Hoàn Thiện Onboarding E2E Và Workspace Cấu Hình

**Goal:** Hoàn thiện flow onboarding end-to-end cho `chat-analyzer-v2` theo đúng `docs/design.md` và `docs/ui-flows.md`, để operator có thể đi trọn đường `nhập user access token -> tải page -> chọn page -> lấy sample -> chỉnh heuristic/prompt/config -> activate`, đồng thời vẫn giữ nguyên lane `lazy operator` có thể activate ngay với default an toàn.

**Architecture:** `backend/` tiếp tục là owner của control-plane onboarding, default activation-safe config, runtime sample preview, persistence của `connected_page`/`page_config_version`, và contract scheduler/notification/prompt config. `frontend/` là owner của workspace draft, layout tối giản, state chuyển bước, hydration của sample vào draft editable, và distinction rõ giữa lane onboarding mới với lane vận hành page đã tồn tại. `service/` không tham gia onboarding UI trực tiếp; service chỉ owner runtime env/provider/model routing, prompt compiler, và live/preview analysis adapter contract. Provider/model/API key là service-owned runtime config, không được kéo vào page-local config.

**Intent:** Sửa triệt để các divergence đang chặn onboarding: mất token khi tải page, state sample bị tách rời khỏi draft cấu hình, giới hạn sample không chỉnh được đúng nghĩa, timezone picker không chuẩn IANA, UI lane onboarding và lane vận hành chưa gọn/đúng semantics, và service chưa có env/runbook rõ để bật provider thật.

**Observable Delta:** Sau khi hoàn tất plan này, operator có thể:
- nhập `user access token`
- bấm tải page và thấy đúng danh sách page từ token đó mà không mất draft token
- chọn `sample conversation limit` và `sample message page limit`
- lấy sample runtime thật
- thấy heuristic mặc định từ sample được seed vào draft tag/opening/prompt/scheduler/notification
- chỉnh lại draft ngay trong cùng workspace
- activate page để đưa vào hệ thống chạy theo schedule

Đồng thời:
- `lazy operator` vẫn activate được ngay sau bước chọn page mà không bị block bởi sample/test
- `normal operator` có lane mở page đang vận hành và chỉnh tiếp mà không phải đi lại flow token
- service có env/example và runbook tối thiểu cho runtime `openai_compatible_live`

**Primary Contract:** Onboarding phải có một workspace draft owner-clean duy nhất cho mọi biến operator chỉnh trong suốt flow. Không được để token form, sample form, config form và lane page đang vận hành giữ source-of-truth riêng rồi sync ngược bằng DOM query. Runtime sample chỉ phục vụ preview và seed default cho draft; không được tự publish, không được mutate publish pointer, và không được thay thế persisted config nếu operator chưa activate. Persisted timezone/scheduler values phải là timezone IANA hợp lệ; UI chỉ được làm business-friendly ở label hiển thị chứ không được lưu offset giả hay alias không chuẩn như source-of-truth chính.

**First Proof:** Một proof xuyên suốt trên control-plane HTTP thật phải chứng minh được:
- nhập token và bấm tải page không làm mất token đã nhập
- danh sách page từ token được giữ trong cùng draft state
- `sampleConversationLimit` khác `12` đi qua trọn tuyến frontend -> backend preview -> UI render
- sample runtime hydrate được heuristic mặc định vào draft editable
- operator sửa prompt/config rồi activate được page
- page đã activate mở lại ở lane vận hành với đúng active config

**First Slice:** Chốt workspace draft owner-clean ở frontend và contract seed sample -> draft, vì đây là first divergence đang làm toàn flow không đi hết được dù backend đã có nhiều seam.

**Blast Radius:** `frontend/src/app/frontend-app.ts`, `frontend/src/app/screen-state.ts`, `frontend/src/features/configuration/*`, các test frontend liên quan onboarding/configuration, `backend/src/modules/chat_extractor/*` cho sample/register/default config semantics nếu thiếu contract hỗ trợ, và `service/README.md` cùng env example/runbook cho live provider. Blast radius này phải được xử lý như một slice owner-clean vì cùng chia sẻ một contract onboarding/config workspace.

**Execution Posture:** Thực hiện theo execution unit owner-clean. Không vá lẻ từng bug UI trên layout hiện tại nếu vẫn giữ split ownership giữa nhiều form. Không coi panel sample là vùng quan sát tách biệt với draft chỉnh sửa. Không biến service provider config thành field của page onboarding chỉ để “chạy demo được”.

**Allowed Mechanism:** Gộp state frontend theo một draft model rõ ràng; compact layout lại theo card/lane owner-clean; dùng backend sample preview hiện có nhưng mở rộng mapping/hydration nếu thiếu; thêm timezone options IANA curated hoặc picker/datalist nhưng persisted value vẫn là IANA; thêm `service/.env.example` hoặc tài liệu env tương đương; thêm targeted tests cho token persistence, sample seeding, custom sample limits, activate path, và service runtime config docs.

**Forbidden Shortcuts:** Vá token bằng cách re-fill textarea sau mỗi submit; giữ sample preview là read-only rồi bắt operator copy tay sang draft; hardcode `12` vào UI hoặc silently clamp về `12`; lưu timezone bằng label offset như `GMT+7`; nhét provider/API key vào config page-local; claim onboarding xong khi non-lazy path vẫn không seed được heuristic editable.

**Forbidden Scaffolding:** Không thêm bridge state kiểu `pendingToken`, `tokenShadow`, `hydratedToken`, `sampleMirror` chỉ để nối tạm ba form. Không thêm panel “advanced config clone” chỉ để đẩy trách nhiệm sample hydration sang thao tác tay của operator. Không giữ dual semantics `onboarding sample preview` và `prompt workspace sample` mà cùng dùng một runtime scope nhưng không pin quan hệ owner.

**Proof Obligations:** `frontend` phải có proof cho token persistence, sample limit override, sample seeding vào draft, activate path và compact lane rendering. `backend` phải có proof cho default activation-safe config, onboarding sample normalization, sample cap propagation, và timezone validation. `service` phải có proof hoặc ít nhất fail-closed contract + README/example cho `openai_compatible_live`. README/docs phải phản ánh đúng lane onboarding và runtime env hiện trạng.

**Proof Ownership:**
- Architect-owned proof: lazy operator path, non-lazy operator path, page-local prompt boundary, service-owned provider/env boundary, timezone IANA contract, và distinction giữa sample preview với publish semantics phải đúng `docs/design.md` + `docs/ui-flows.md`.
- Executor-owned proof: frontend state/layout rewrite, backend sample/register contract adjustments, service env example/runbook, và tests/documentation.
- Hostile-review focus: split ownership giữa các form, sample vẫn read-only, custom sample limit không đi qua full path, timezone persisted sai chuẩn, service runtime vẫn chỉ “có code” mà không có vận hành path rõ.
- Escalation trigger: nếu implementation buộc onboarding phải block ở bước prompt/config sample; nếu backend hiện thiếu seam để seed heuristic editable mà cần đổi source-of-truth lớn hơn trong `docs/design.md`; hoặc nếu service runtime provider thật chưa thể pin nhưng người thực thi lại muốn claim e2e-ready.

**Not Done Until:** Không được claim xong plan này nếu operator vẫn không thể đi hết lane non-lazy từ token đến activate trong một workspace draft liên tục; nếu `lazy operator` bị block bởi sample/test; nếu UI vẫn làm mất token hoặc reset sample caps; nếu timezone persisted không phải IANA; hoặc nếu service live runtime vẫn thiếu env/runbook đủ để cấu hình provider thật.

**Solution Integrity Check:**
- Least-painful patch: sửa vài chỗ sync DOM giữa ba form, thêm vài option timezone, và để panel sample tiếp tục chỉ hiển thị thông tin.
- Why rejected: Cách đó vẫn để source-of-truth bị chia nhỏ, bug sẽ quay lại khi rerender hoặc đổi lane, và non-lazy operator vẫn phải chuyển ngữ thủ công từ sample sang draft.
- Largest owner-clean slice: gộp onboarding/configuration thành một workspace draft, seed sample vào draft editable, compact lại UI lane, rồi pin service runtime env/provider docs ở đúng seam owner.
- Why this slice is safe for a strong agent: phần lớn backend seam đã có, bug lớn nhất hiện tại nằm ở ownership/state/UI wiring; repo là dev environment nên có thể refactor lane này mạnh tay mà không cần backward compatibility runtime.
- If forced to stage: chỉ được stage theo seam bền vững `frontend workspace draft`, `backend sample/register contract`, `service env/runbook`; không stage kiểu “fix token trước, sample read-only để sau”.
- Debt or drift path: mọi bridge tạm phát sinh trong onboarding/config workspace phải được ghi rõ vào debt file trước khi close-out; không được để hidden drift trong state sync.

## 1. Ảnh Chụp Hiện Trạng Và Divergence Đầu Tiên

### 1.1 Frontend hiện có split ownership giữa nhiều form

State hiện tại đang bị chia thành:

- form `onboarding-token`
- form `onboarding-register`
- form `configuration-create`

nhưng các action quan trọng lại đọc ngược state bằng `querySelector(...)` và sync chéo giữa ba form trong `frontend/src/app/frontend-app.ts`.

Hậu quả dự kiến:

- token có thể biến mất hoặc bị desync sau submit/rerender
- sample limit có thể đọc từ state cũ thay vì draft mới nhất
- sample preview và config draft không cùng một source-of-truth
- lane onboarding nhanh và lane vận hành page đã có không tái sử dụng cùng draft model

### 1.2 UI sample hiện chủ yếu là quan sát, chưa là workspace chỉnh sửa

`Sample dữ liệu thật` hiện render:

- observed tags
- normalized tag signals
- explicit opening signals
- transcript sample

nhưng chưa pin contract “sample seed -> draft editable” cho:

- tag mapping
- opening rules
- prompt text mặc định page-local
- scheduler config
- notification targets

Điều này làm flow non-lazy operator không đi trọn được theo source-of-truth.

### 1.3 Timezone UI chưa pin rõ semantics IANA

Backend đã validate `business_timezone` bằng IANA timezone thật. Nhưng frontend hiện:

- trộn `Asia/Ho_Chi_Minh`, `Asia/Saigon`, `Asia/Bangkok`, `UTC` trong curated list
- không có contract rõ cho curated labels từ `-12` tới `+12`
- chưa pin rõ value persisted phải là IANA hay alias business-facing

Plan này phải chốt dứt điểm: persisted value là IANA; UI có thể hiển thị label offset nếu muốn.

### 1.4 Service live runtime contract đã có code nhưng chưa có vận hành path rõ

`service/config.py` đã có:

- `runtime_mode`
- `provider_name`
- `provider_base_url`
- `provider_api_key`
- `provider_model`

và fail-closed cho `openai_compatible_live`, nhưng repo chưa pin đầy đủ:

- file env example dùng thật
- runbook rõ cho local/dev khi chọn provider thật
- acceptance bar cho integration với backend khi chuyển khỏi `deterministic_dev`

## 2. Invariants Phải Giữ

- Repo là single-company; không được thêm ownership layer tenant/company/workspace.
- `lazy operator` phải activate được chỉ với `token -> chọn page -> activate`.
- `non-lazy operator` phải có một workspace liên tục từ token đến activate.
- `connected_page` vẫn là boundary chính của page vận hành; không thêm layer ownership mới.
- Page-specific prompt chỉ là `page-local prompt`, không chứa service-owned system prompt hay provider config.
- Tag chưa được map tay vẫn mặc định vào `noise`.
- Opening rules là optional signal extractor; không match vẫn phải chạy bằng fallback `first_meaningful_message`.
- Runtime sample không được publish dashboard và không được đổi publish pointer.
- `business_timezone` và `scheduler.timezone` persisted dưới dạng timezone IANA hợp lệ.
- Provider/model/API key là service-owned runtime env; page config chỉ giữ page-local prompt, scheduler, notification, opening rules, tag mapping, enable flags.

## 3. Design Gate Cho Slice Này

### Hướng 1: Vá từng bug trên layout hiện tại

**Ý tưởng**

- sửa token persistence
- mở input sample limit
- thêm vài timezone option
- thêm nút “áp dụng sample” nếu cần

**Ưu điểm**

- diff nhỏ lúc đầu
- có thể sửa symptom nhanh

**Nhược điểm**

- giữ split ownership giữa nhiều form
- sample vẫn dễ thành lane song song với draft
- bug reset state rất dễ tái phát
- khó đóng triệt để flow non-lazy operator

### Hướng 2: Refactor workspace draft owner-clean ở frontend, giữ backend seam gần như nguyên

**Ý tưởng**

- gộp onboarding + config chỉnh sửa vào một draft state
- sample runtime hydrate heuristic/default vào draft
- lane onboarding và lane page đang vận hành dùng chung draft model
- backend chỉ bổ sung contract nơi thực sự thiếu

**Ưu điểm**

- sửa tận gốc divergence đầu tiên
- đúng owner boundary
- giúp cả lazy path và non-lazy path cùng bám một contract

**Nhược điểm**

- diff frontend tương đối lớn
- cần bổ sung tests rõ ràng để tránh regress

### Hướng 3: Đẩy thêm wizard/state xuống backend

**Ý tưởng**

- backend trả về hẳn onboarding workspace draft đầy đủ
- frontend chỉ render và submit

**Ưu điểm**

- frontend có vẻ đơn giản hơn

**Nhược điểm**

- sai boundary hiện tại của repo
- tăng blast radius không cần thiết
- đẩy UI workspace semantics vào control-plane quá sớm

### Recommendation

Chọn **Hướng 2**.

## 4. Target Product Contract Sau Khi Hoàn Tất

### 4.1 Lazy operator path

1. Nhập `user access token`.
2. Bấm tải page từ token.
3. Chọn một page.
4. Bấm activate.

Kết quả:

- tạo hoặc cập nhật `connected_page`
- seed `page_config_version` activation-safe nếu page chưa có active config
- lưu `business_timezone`
- bật flags ETL/AI theo draft hiện tại
- page sẵn sàng chạy schedule

### 4.2 Non-lazy operator path

1. Nhập `user access token`.
2. Bấm tải page từ token.
3. Chọn page.
4. Chọn số hội thoại sample và số trang tin nhắn mỗi thread.
5. Bấm lấy sample.
6. Hệ thống lấy runtime sample thật trong window onboarding.
7. Hệ thống seed heuristic/default vào draft:
   - tag mapping draft
   - opening rules draft
   - page-local prompt text mặc định
   - scheduler draft
   - notification draft
8. Operator chỉnh lại draft.
9. Bấm activate hoặc tạo config version rồi activate.

### 4.3 Lane page đang vận hành

Operator đang vận hành page cũ phải có thể:

1. Mở page đã kết nối.
2. Nạp active config.
3. Lấy sample workspace mới nếu muốn.
4. Chỉnh prompt/config.
5. Tạo version mới và activate.

Lane này không dùng token flow làm source-of-truth, nhưng vẫn dùng cùng draft model.

## 5. Execution Unit A: Frontend Workspace Draft Và UI Tối Giản

**Target Outcome:** `frontend` có một workspace draft owner-clean cho cả onboarding và cấu hình page, layout gọn theo đúng hai lane chính, không còn desync giữa token/page/sample/config state.

**Owned Write Scope:**

- `frontend/src/app/screen-state.ts`
- `frontend/src/app/frontend-app.ts`
- `frontend/src/features/configuration/render.ts`
- `frontend/src/features/configuration/state.ts`
- test frontend liên quan onboarding/configuration/render

**Boundary Contract:**

- một draft state duy nhất cho:
  - token
  - selected page from token
  - timezone
  - sample caps
  - activation flags
  - tag/opening/prompt/scheduler/notification draft
- actions `list pages`, `load sample`, `register/activate`, `load existing page`, `create config version`, `activate config version` đều đọc/ghi qua draft state này
- render chỉ phản chiếu draft state; không lấy DOM form khác làm source-of-truth phụ
- lane onboarding nhanh và lane page đang vận hành dùng cùng model nhưng CTA khác nhau

**Implementation Shape:**

- tạo một `configuration workspace draft` rõ ràng
- bỏ sync chéo bằng `querySelector` giữa nhiều form nếu không còn cần
- compact lại layout để:
  - cột trái là lane kích hoạt/onboarding
  - cột phải là workspace chỉnh sửa
  - sample và diagnostics nằm trong cùng ngữ cảnh với draft đang chỉnh
- wording tiếng Việt business-facing, không lãng phí không gian màn hình

**Proof To Create Or Reuse:**

- token không biến mất sau `listFromToken`
- `sampleConversationLimit` và `sampleMessagePageLimit` đi qua đúng full path
- render không hardcode sample limit = `12`
- lane page đang vận hành mở lại đúng draft active config
- layout vẫn usable trên desktop một viewport và co theo width mobile

**Verification Command Or Artifact:**

- `bun test` cho các test frontend onboarding/configuration
- thêm targeted state/render tests cho token persistence, custom sample limits, lane rendering
- nếu có build proof trong repo, chạy `bun run build` ở `frontend/`

**Stop Conditions:**

- nếu state mới vẫn cần đọc ngược từ ba form DOM khác nhau
- nếu sample preview vẫn chỉ là panel quan sát tách khỏi draft
- nếu compact layout làm mất distinction giữa lazy path và non-lazy path

**Banned Shortcuts For This Unit:**

- giữ nguyên ba form rồi vá bằng hidden input
- patch token persistence bằng cách “fill lại sau render”
- chỉ sửa text/UI mà không đổi ownership của draft

## 6. Execution Unit B: Sample Runtime Seed -> Draft Editable

**Target Outcome:** runtime sample onboarding không còn là dữ liệu chỉ-đọc; nó seed được heuristic/default vào draft chỉnh sửa cho non-lazy operator.

**Owned Write Scope:**

- `frontend/src/features/configuration/state.ts`
- `frontend/src/features/configuration/render.ts`
- có thể cần contract mapping ở `frontend/src/adapters/contracts.ts`
- backend sample preview mapping nếu shape hiện tại thiếu data để seed

**Boundary Contract:**

- sample preview phải cho phép seed:
  - tag mapping entries gợi ý từ observed tags
  - opening rule suggestions từ opening signals
  - prompt text mặc định page-local
  - scheduler draft hiện hành
  - notification draft hiện hành hoặc default system view
- seed phải theo precedence:
  - explicit operator override hiện có thắng sample suggestion
  - sample chỉ điền vào chỗ trống hoặc tạo suggested rows mới
- sample preview không được auto-activate hay auto-persist config

**Implementation Shape:**

- thêm mapper từ `OnboardingSamplePreviewViewModel` sang draft suggestions
- render rõ distinction:
  - dữ liệu sample quan sát được
  - heuristic/suggestion đã seed vào draft
  - override do operator tự chỉnh
- nếu cần, thêm actions như:
  - `áp dụng gợi ý tag`
  - `áp dụng gợi ý opening`
  nhưng không được biến flow thành copy tay qua lại giữa hai lane rời

**Proof To Create Or Reuse:**

- sample có tag/opening data sẽ seed được draft rows editable
- operator sửa draft rồi lấy sample lại không làm mất override đã chỉnh nếu policy đã pin
- sample rỗng không làm hỏng draft đã có

**Verification Command Or Artifact:**

- frontend unit tests cho seed precedence
- backend/controller tests nếu cần trả thêm shape sample support

**Stop Conditions:**

- nếu sample muốn seed được draft mà phải đổi source-of-truth trong `docs/design.md`
- nếu implementation chỉ đạt bằng cách duplicate toàn bộ sample thành một second config model

**Banned Shortcuts For This Unit:**

- chỉ hiển thị `normalizedTagSignals` mà không nối vào draft
- ép operator copy tay observed tags/opening texts sang bảng config

## 7. Execution Unit C: Backend Onboarding/Register Contract Và Activation-Safe Defaults

**Target Outcome:** backend support trọn vẹn onboarding path theo semantics lazy/non-lazy mà không cần workaround ở frontend.

**Owned Write Scope:**

- `backend/src/modules/chat_extractor/chat_extractor.types.ts`
- `backend/src/modules/chat_extractor/chat_extractor.controller.ts`
- `backend/src/modules/chat_extractor/chat_extractor.service.ts`
- tests `chat_extractor.service.test.ts` và `chat_extractor.controller.test.ts`

**Boundary Contract:**

- `registerPageConfig` phải tiếp tục seed activation-safe defaults khi page mới chưa có active config
- onboarding sample preview phải nhận đúng sample caps và `business_timezone`
- timezone validation ở backend vẫn là source-of-truth
- sample preview và prompt workspace sample không được drift về scheduler/timezone semantics
- nếu backend cần trả thêm suggestion data để seed draft thì contract mới phải là owner-clean, không phải field “mock only”

**Implementation Shape:**

- giữ `register` đơn giản cho lazy path
- giữ `previewOnboardingSample` riêng cho sample runtime
- nếu cần, mở rộng response sample để frontend seed draft mà không tự dựng heuristic ngược từ text thô quá mức
- không đẩy service/provider/runtime config vào contract này

**Proof To Create Or Reuse:**

- new page register vẫn seed được default scheduler/opening/tag/prompt activation-safe
- sample caps custom đi qua preview request
- invalid timezone bị fail đúng contract
- existing page register không phá flags hiện có khi không gửi explicit overrides

**Verification Command Or Artifact:**

- `bun test` cho backend chat_extractor tests

**Stop Conditions:**

- nếu backend phải biết về UI-only lane layout để trả contract
- nếu contract mới làm lazy path không còn activate được tối thiểu

**Banned Shortcuts For This Unit:**

- thêm field tạm chỉ để frontend phân biệt lane
- để frontend tự suy toàn bộ suggestion quan trọng từ raw sample text nếu backend đã sở hữu signal canonical tốt hơn

## 8. Execution Unit D: Timezone Contract Chuẩn IANA

**Target Outcome:** UI timezone picker/inputs đúng chuẩn IANA nhưng vẫn dễ dùng cho operator.

**Owned Write Scope:**

- frontend configuration render/state/tests
- backend validation tests nếu cần mở rộng coverage
- docs liên quan UI flow nếu wording cần làm rõ

**Boundary Contract:**

- persisted value là IANA timezone string
- business label có thể kèm offset, ví dụ `GMT+07:00 - Asia/Ho_Chi_Minh`
- không persist `GMT+7`, `UTC+7`, `+07`, hay các alias không phải IANA làm source-of-truth
- nếu repo vẫn chấp nhận alias `Asia/Saigon` ở runtime vì platform compatibility, contract phải nói rõ alias nào là display fallback chứ không coi là curated timezone catalog chuẩn

**Implementation Shape:**

- curated timezone options đủ dùng cho operator Việt Nam và các offset `-12` tới `+12` nếu UI flow thực sự cần
- option value là IANA, label là business-friendly
- scheduler timezone input và onboarding business timezone input tái dùng cùng source catalog

**Proof To Create Or Reuse:**

- chọn timezone khác mặc định vẫn submit được đúng IANA value
- scheduler timezone và business timezone không drift về hai catalog khác nhau

**Verification Command Or Artifact:**

- frontend render/state tests
- backend validation test nếu thêm cases mới

**Stop Conditions:**

- nếu implementation muốn persist offset string thay vì IANA
- nếu curated catalog không thể pin từ local source và bắt buộc phải browse ngoài

**Banned Shortcuts For This Unit:**

- chỉ đổi label nhưng value vẫn là alias mơ hồ
- để onboarding dùng select còn scheduler dùng free-text không kiểm soát gì

## 9. Execution Unit E: Service Runtime Env, Provider Và Runbook

**Target Outcome:** repo có đường vận hành rõ ràng để bật service live provider thật thay vì dừng ở deterministic dev.

**Owned Write Scope:**

- `service/config.py` nếu cần chỉnh fail-closed/wording
- `service/README.md`
- file env example mới trong `service/` nếu repo chưa có
- tests service config/runtime metadata nếu thay contract

**Boundary Contract:**

- `openai_compatible_live` yêu cầu:
  - `ANALYSIS_SERVICE_PROVIDER_NAME`
  - `ANALYSIS_SERVICE_PROVIDER_BASE_URL`
  - `ANALYSIS_SERVICE_PROVIDER_API_KEY`
  - `ANALYSIS_SERVICE_PROVIDER_MODEL`
- thiếu field bắt buộc phải fail-closed
- README/runbook phải chỉ rõ deterministic dev và live provider là hai mode khác nhau
- service-owned provider config không được surface thành page onboarding config

**Implementation Shape:**

- thêm `service/.env.example` hoặc tài liệu env tương đương
- cập nhật README cho local run, live run, và expectations với backend
- nếu cần, thêm test config load để pin env contract

**Proof To Create Or Reuse:**

- service start/config parse fail khi thiếu live provider fields
- docs đủ để một người trong repo cấu hình local live provider mà không phải đoán env names

**Verification Command Or Artifact:**

- `uv run pytest` cho service tests liên quan config
- đọc README/env example như artifact vận hành

**Stop Conditions:**

- nếu live provider path vẫn chỉ tồn tại trong code nhưng không có env example/runbook
- nếu implementation lấn sang thay đổi product flow page-local config

**Banned Shortcuts For This Unit:**

- chỉ sửa README mà không có env example dù repo đang thiếu artifact này
- thêm provider selector vào frontend onboarding

## 10. Trình Tự Tích Hợp Khuyến Nghị

1. `EU A` chốt workspace draft owner-clean ở frontend.
2. `EU B` nối sample runtime vào draft editable.
3. `EU C` bổ sung hoặc chỉnh backend contract nếu frontend seed còn thiếu dữ liệu hoặc semantics.
4. `EU D` pin timezone catalog/value semantics.
5. `EU E` hoàn tất service env/runbook để repo có live-runtime path rõ.

Lý do:

- `EU A` và `EU B` giải first divergence của user nhanh nhất.
- `EU C` chỉ nên mở rộng backend sau khi đã pin rõ frontend cần contract nào.
- `EU D` nên land trước close-out vì timezone liên quan cả sample/register/scheduler.
- `EU E` độc lập hơn với UI flow nhưng phải xong trước khi claim onboarding e2e thực dụng.

## 11. Acceptance Checklist

Plan này chỉ được coi là hoàn tất khi tất cả các tiêu chí sau đều đúng:

- token không mất sau bước tải page
- danh sách page từ token hiện ngay trong cùng workspace
- operator đổi được `sample conversation limit` khỏi `12` và giá trị đó đi qua full path
- sample runtime thật hiện được và seed được heuristic vào draft editable
- prompt mặc định page-local hiện được trong workspace chỉnh sửa
- scheduler và notification config hiện được cùng workspace, không tách khỏi prompt/config draft
- lazy path vẫn activate được mà không cần sample/test
- lane page đang vận hành tải lại được active config và tiếp tục chỉnh
- timezone persisted là IANA
- service có env/runbook rõ cho live provider
- docs/README liên quan phản ánh đúng hiện trạng mới

## 12. Open Questions Được Phép Giữ Mở

Những điểm sau có thể giữ mở trong implementation đầu của plan này nếu không chặn flow cốt lõi:

- mức độ phong phú của curated timezone catalog ngoài các timezone business thực sự cần
- UX chi tiết của “áp dụng gợi ý” là auto-seed hoàn toàn hay seed + badge suggested rows
- activation CTA nên là `register và activate mặc định` hay tách `register` với `activate` khi page mới chưa có config version bổ sung

Những điểm sau **không được** giữ mở:

- source-of-truth của draft onboarding/config
- sample có seed được draft hay không
- persisted timezone có phải IANA hay không
- provider/API key có thuộc service-owned runtime env hay không

## 13. Debt Register Gợi Ý

Nếu trong quá trình execute buộc phải giữ bridge tạm, debt phải ghi tối thiểu:

- bridge nào tồn tại
- vì sao chưa bỏ được trong cùng execution
- kill condition của bridge
- proof cho thấy bridge không làm sai lazy path, non-lazy path, timezone semantics hay service runtime boundary

Không được close-out plan này khi còn bridge state sync ngầm giữa nhiều form mà không ghi debt.
