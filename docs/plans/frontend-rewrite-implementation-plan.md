# Kế Hoạch Rewrite Frontend Theo `docs/ui-flows.md`

> Post-implementation correction 2026-04-04: Export semantics đã được chốt lại sau khi rewrite này được execute. Từ thời điểm này, export phải được hiểu là workflow riêng với input tường minh `page + khoảng ngày`, không gắn vào business view hoặc current filter slice. Code hiện tại chưa được sửa theo hướng này.

**Goal:** Thay toàn bộ frontend hiện tại bằng một frontend standalone mới bám đúng `docs/design.md`, `docs/ui-flows.md`, `docs/insight.md`, có thể vận hành được trong dev environment khi backend extract/control-plane seam đã sẵn sàng, còn `service/` và semantic mart vẫn chưa hoàn thiện đầy đủ.

**Architecture:** Frontend mới là một app TypeScript thuần có `app shell` rõ ràng, route/query state rõ ràng, business filter store dùng chung cho các view business, và data access đi qua adapter boundary typed. UI phải được tổ chức theo đúng 7 khu vực đích; các seam backend extract/control-plane đã có phải được ưu tiên wire `http-first`, còn các seam chưa sẵn sàng sẽ được phục vụ bằng `demo adapter` và fixture đúng contract đích, không bẻ UI quay về contract legacy. Frontend cũ bị coi là legacy và phải bị loại khỏi runtime path thay vì được bọc lại.

**Intent:** Dời frontend từ một shell demo gắn cứng vào read-model/control-center hiện tại sang một frontend owner-clean phản ánh đúng information architecture, grain dữ liệu, publish semantics, audit semantics và onboarding/config semantics của thiết kế đích.
**Observable Delta:** Sau khi hoàn tất, người dùng có thể đi qua đầy đủ 7 view đích, filter xuyên suốt các màn business với default đúng semantics official, nhìn rõ `official/provisional`, drill từ dashboard xuống thread investigation đúng grain, thao tác onboarding/config/run/publish theo đúng semantics của `ui-flows`, dùng đầy đủ workflow `Prompt profile`, có workflow export `.xlsx` business-facing riêng không phụ thuộc view đang mở, và frontend không còn gọi trực tiếp cấu trúc state/render legacy nữa.
**Primary Contract:** Frontend runtime phải được tổ chức theo 7 view chính trong `docs/ui-flows.md`: `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại`, `So sánh trang`, `Vận hành`, `Cấu hình`, đồng thời phải support các capability bắt buộc gắn với chúng:
- business filters với default official semantics
- workflow export `.xlsx` riêng, không gắn vào `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `So sánh trang`
- investigation/audit workspace theo `thread`
- operations publish/run semantics
- configuration/onboarding/prompt profile workflow owner-clean
**First Proof:** Một shell mới chạy được với adapter seam rõ ràng, có navigation 7 view, filter `Page + Slice + Publish snapshot` persist qua các business views với default đúng official semantics, badge/warning cho `published_provisional` hiển thị đúng, và các flow `Vận hành` + onboarding/config control-plane đã đi qua HTTP thật thay vì fixture.
**First Slice:** Dựng lại `app shell + router/query-state + global filters + design tokens + adapter seam`, đồng thời cắt bỏ runtime dependency vào `frontend/src/main.ts`, `frontend/src/render.ts`, `frontend/src/api.ts` legacy.
**Blast Radius:** Gần như toàn bộ `frontend/src/**`, `frontend/package.json` scripts nếu cần, `frontend/README` hoặc `README.md` phần frontend. Thay đổi này phải đi như một owner-clean rewrite vì state management, render model, route model, data contract và view hierarchy hiện tại đều encode giả định cũ.
**Execution Posture:** Rewrite lớn theo owner boundary của frontend. Không giữ dual-render path, không giữ “màn cũ nằm sau feature flag”, không giữ `AppState` khổng lồ để “bridge tạm” giữa UI mới và UI cũ. Nếu phải stage, mỗi stage vẫn phải có owner boundary rõ và không được để legacy runtime path sống song song cho cùng một responsibility.
**Allowed Mechanism:** TypeScript strict mode, module hóa theo feature/domain, query-string state, adapter interface `demo/http`, fixture JSON typed, view-model mỏng cho từng màn, CSS tokens/layout primitives dùng chung.
**Forbidden Shortcuts:** Vá tiếp `frontend/src/main.ts` và `frontend/src/render.ts`; giữ một `AppState` toàn cục với HTML string renderer rồi chỉ thêm tab/view mới; để UI mới đọc payload legacy rồi “map tạm bằng text”; trộn `thread` list với `thread_day` list trong cùng màn chính; surfacing raw codes như `journey_code` lên màn business.
**Forbidden Scaffolding:** Không thêm compatibility wrapper quanh renderer cũ, không thêm shim “legacyApiToNewUi”, không giữ menu/view cũ trong runtime, không thêm placeholder card dùng dữ liệu sai grain chỉ để lấp chỗ trống, không tạo “view mới gọi state cũ” như bước trung gian lâu dài.
**Proof Obligations:** `bun run typecheck`, `bun run build`, smoke tests cho route/filter/adapters, walkthrough 5 flow chính trong `docs/ui-flows.md`, proof riêng cho export/prompt profile/empty-error states, tài liệu README phản ánh đúng kiến trúc mới, và không còn import/runtime path nào dùng renderer/state legacy.

**Proof Ownership:**
- Architect-owned proof: Navigation, grain hiển thị, publish semantics, config/onboarding semantics, và nhãn business-facing phải khớp `docs/ui-flows.md`.
- Executor-owned proof: Router/query-state, adapter contracts, feature modules, render behavior, fixture/demo data, build/typecheck.
- Hostile-review focus: Trộn grain `thread` với `thread_day`, reintroduce legacy state monolith, đọc trực tiếp contract backend cũ như source-of-truth lâu dài, hoặc làm mờ distinction giữa `draft / provisional / official`.
- Escalation trigger: Nếu implementation buộc phải giữ song song renderer cũ và mới cho cùng một responsibility, hoặc nếu một view quan trọng chỉ render được bằng payload legacy trái với semantic contract đích.

**Not Done Until:** Frontend mới có đủ 7 view đích, hoạt động được với contract typed rõ ràng, dùng `http-first` cho các seam backend extract/control-plane đã có, chỉ dùng `demo` cho seam chưa xong, filter business persist xuyên view, và frontend legacy không còn là runtime path hay mental model chính của repo.

**Solution Integrity Check:**
- Least-painful patch: Giữ `frontend/src/main.ts`, `frontend/src/render.ts`, `frontend/src/api.ts` hiện tại rồi mở rộng thêm menu, form, table và state fields.
- Why rejected: Patch đó khóa toàn bộ frontend vào state monolith và contract control-center/read-model cũ. Nó làm UI mới tiếp tục bị dẫn dắt bởi shape backend hiện tại thay vì shape sản phẩm đích, và gần như chắc chắn dẫn tới thêm một lớp “mapping tạm” khó gỡ.
- Largest owner-clean slice: Rewrite frontend thành app shell mới với feature modules, adapter seam, và view hierarchy đúng `ui-flows`, đồng thời bỏ runtime path legacy.
- Why this slice is safe for a strong agent: Repo là dev environment, frontend hiện tại đã được coi là legacy, và chưa có yêu cầu backward compatibility hay production cutover.
- If forced to stage: Chỉ được stage theo boundary bền vững như `foundation`, `business views`, `investigation views`, `ops/config views`, nhưng từng stage vẫn phải bỏ hoàn toàn runtime path legacy của phần nó tiếp quản.
- Debt or drift path: Không chấp nhận debt “bridge legacy renderer sang UI mới”. Nếu còn phụ thuộc vào state/render cũ thì slice chưa hoàn tất.

## 1. Scope Thực Thi

Trong kế hoạch này, scope frontend bao gồm:

- toàn bộ `frontend/src/**`
- cách tổ chức route/navigation/query-state/filter state
- UI copy và layout cho 7 view đích
- adapter contracts giữa frontend và backend/demo fixtures
- fixture data để phát triển UI trước khi backend/service seam hoàn thiện
- dev workflow của frontend
- tài liệu hướng dẫn frontend trong repo

Ngoài scope:

- implementation chi tiết của backend extract/read-model mới
- implementation chi tiết của `service/`
- semantic mart thật trong database

Nhưng plan này phải pin rõ frontend contract để khi backend/service hoàn thiện, frontend chỉ cần thay adapter thay vì phải đổi information architecture.

## 2. Đánh Giá Legacy Hiện Tại

Frontend hiện tại ở:

- `frontend/src/main.ts`
- `frontend/src/render.ts`
- `frontend/src/api.ts`
- `frontend/src/types.ts`
- `frontend/src/styles.css`

Các vấn đề owner-level:

- Dùng một `AppState` khổng lồ cho toàn app, khiến mọi view và filter dính chặt nhau.
- Route model hiện tại chỉ là switch view đơn giản, chưa có URL/query-state đúng nghĩa.
- Renderer ghép HTML string tập trung trong một file lớn, làm boundary giữa feature/business logic mờ.
- Information architecture không khớp 7 view đích; `settings` đang ôm cả config lẫn vận hành.
- Business wording còn lộ nhiều khái niệm kỹ thuật hoặc label tạm từ seam cũ.
- Contract API hiện bám read model/control-center cũ thay vì semantic contract đích.
- Chưa có lớp adapter để cho phép UI phát triển độc lập khi backend/service chưa xong.
- Chưa biểu diễn đúng `draft / published_provisional / published_official`.
- Chưa có view riêng đúng nghĩa cho `Hiệu quả nhân viên`.
- Chưa có thread investigation workspace đúng 4 tab theo thiết kế.
- Chưa có `Cấu hình` với 5 tab owner-clean theo thiết kế.

Kết luận:

- frontend hiện tại chỉ nên dùng như tư liệu tham chiếu cho một số API cũ và dữ liệu demo
- không nên preserve cấu trúc state/render hiện tại
- phải bỏ code legacy khỏi runtime path trong rewrite

## 3. Invariants Phải Giữ

- Frontend phải có đúng 7 khu vực navigation như `docs/ui-flows.md`.
- UI wording phải là tiếng Việt business-facing; không lộ raw code nội bộ trên màn chính.
- Dashboard official chỉ đọc từ snapshot đã publish.
- Filter `Slice` mặc định của dashboard official chỉ chọn đến hết ngày hôm qua.
- `Publish snapshot` mặc định là snapshot `official` mới nhất của mỗi ngày ở các business views.
- Khi đang hiển thị `published_provisional`, phải có badge `Tạm thời`, coverage window, và config/prompt snapshot liên quan.
- Khi slice phủ nhiều ngày, các danh sách investigation chính phải ở grain `thread`.
- `thread_day` chỉ dùng cho history và breakdown trong drill-down.
- `Hiệu quả nhân viên` là view riêng, không nhét vào dashboard hay history.
- `Vận hành` và `Cấu hình` là hai owner boundary khác nhau.
- Flow thêm page tối thiểu phải là `nhập token -> chọn page -> activate`.
- Sample/test là optional để tinh chỉnh, không phải điều kiện activate.
- Export `.xlsx` phải là workflow riêng với input tường minh `page + khoảng ngày`; builder chỉ emit row cho các ngày trong khoảng chọn đã có `published_official`, và chỉ chặn khi cả khoảng chọn không có ngày official nào.
- Frontend phải chịu được backend/service chưa hoàn chỉnh bằng cách chạy qua adapter `demo`, nhưng contract bề mặt vẫn phải là contract đích.
- Legacy code phải bị loại khỏi runtime path khi frontend mới tiếp quản.

## 4. Ba Hướng Khả Thi

### Hướng 1: Vá SPA hiện tại

Ưu điểm:

- ít thay file lúc đầu
- tận dụng được build/dev server đang có

Nhược điểm:

- state và render model sai kiến trúc
- khó biểu diễn 7 view owner-clean
- gần như chắc chắn tạo thêm compatibility debt
- frontend tiếp tục bị buộc vào payload legacy

### Hướng 2: Rewrite frontend TypeScript thuần theo feature modules

Ưu điểm:

- khớp repo hiện tại
- owner boundary rõ
- dễ dùng fixture/demo adapter khi backend chưa xong
- đúng tinh thần “bỏ legacy”

Nhược điểm:

- diff lớn
- cần dựng lại hầu hết UI primitives và route model

### Hướng 3: Đổi framework UI rồi mới xây lại

Ưu điểm:

- có thể tiện hơn cho componentization nếu team muốn framework

Nhược điểm:

- tăng blast radius ngoài nhu cầu thật
- thêm một quyết định kiến trúc không được yêu cầu trong docs
- làm chậm việc chốt semantics UI

### Recommendation

Chọn `Hướng 2`.

## 5. Target Frontend Architecture

Frontend đích nên có cấu trúc theo boundary sau:

### 5.1 `app shell`

Owner:

- top navigation
- page chrome
- status banner chung
- route resolution
- global filter region cho business views

Trách nhiệm:

- render 7 mục nav
- quyết định view nào cần global filters
- giữ URL/query-state là source-of-truth cho route và filter chính

Không được làm:

- fetch data trực tiếp theo kiểu ad-hoc cho từng click nhỏ lẻ
- chứa business-specific formatting logic của từng view

### 5.2 `route/query state`

Owner:

- `view`
- selected `page`
- `slice`
- `publish snapshot`
- dice filters business
- selection state đủ để deep-link vào thread/run/config tab nếu cần

Nguyên tắc:

- business filters phải persist khi chuyển giữa `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại`
- với business views đọc official dashboard, `slice` mặc định chỉ được chọn đến hết ngày hôm qua
- `publish snapshot` mặc định là official latest per day; người dùng chỉ đi vào provisional khi chọn rõ hoặc qua flow run/result liên quan
- state transient cục bộ của từng panel không ép đẩy lên URL nếu không phục vụ deep-link

### 5.3 `domain contracts`

Frontend phải định nghĩa typed contracts cho các miền dữ liệu sau:

- `overview`
- `exploration`
- `staff-performance`
- `thread-history`
- `page-comparison`
- `operations`
- `configuration`
- `onboarding`
- `export`

Rule:

- contract ở đây là contract frontend cần để render UI đích
- không mirror 1:1 response backend hiện tại nếu shape đó không đúng thiết kế
- adapter là nơi convert từ `http/demo` sang contract frontend

### 5.4 `data adapters`

Phải có ít nhất 2 adapter:

- `demo adapter`
  - đọc fixture nội bộ
  - là đường chạy chính trong giai đoạn backend/service chưa đủ seam
- `http adapter`
  - gọi backend thật ở các seam đã có
  - được phép chỉ phủ một phần capability lúc đầu

Rule:

- app shell và feature views chỉ nói chuyện với adapter interface
- không có import trực tiếp `fetch` vào feature views

### 5.5 `feature modules`

Mỗi view là một module riêng:

- `overview`
- `exploration`
- `staff-performance`
- `thread-history`
- `page-comparison`
- `operations`
- `configuration`
- `onboarding`

Mỗi module nên có:

- `types`
- `adapter contract`
- `view-model`
- `render`
- `fixtures` hoặc selectors nếu cần

### 5.6 `shared UI primitives`

Bao gồm:

- layout container
- section header
- filter bar
- tab strip
- badge
- scorecard
- table
- empty state
- error state
- warning banner
- detail panel

Nguyên tắc:

- shared primitives chỉ giữ cấu trúc trình bày
- label/business copy nằm ở feature module

### 5.7 `design tokens`

Phải chốt rõ:

- spacing
- typography
- colors
- border radius
- status colors cho `draft/provisional/official/error`
- panel density cho desktop
- responsive behavior cho mobile

UI vẫn tối giản nhưng phải có trật tự rõ ràng, không quay lại kiểu bảng demo trần trụi như legacy.

## 6. Contract Strategy Khi Backend Và Service Chưa Xong

Đây là phần bắt buộc để frontend “vận hành được theo thiết kế” trong lúc seam khác chưa hoàn tất.

### 6.1 Nguyên tắc

- UI phải bám contract đích, không bám contract tạm.
- Nếu backend chưa có endpoint đúng shape, frontend vẫn render qua `demo adapter`.
- Nếu backend đã có seam đúng owner boundary, frontend phải ưu tiên wire `http-first` cho seam đó thay vì tiếp tục dựng demo dài hạn.
- Nếu backend mới chỉ có một phần seam, adapter HTTP chỉ map phần đó sang contract đích và phần còn thiếu mới được giữ ở demo.
- Không sửa UI architecture để chiều theo payload legacy.

### 6.2 Coverage dự kiến

`demo adapter` phải phủ đủ:

- 7 view
- publish semantics
- run split semantics
- config tabs
- thread investigation tabs
- export semantics
- prompt profile compare/preview semantics
- empty/error/warning states

`http adapter` ở trạng thái hiện tại phải phủ tối thiểu:

- `list-from-token`
- `register page`
- `list/get connected pages`
- `create/activate config version`
- `preview job`
- `execute job`
- `publish run`
- `get run group`
- `get run`

Những phần backend chưa có đúng seam:

- business views đọc semantic mart đúng chuẩn
- staff performance theo `fact_staff_thread_day`
- full thread audit contract đúng chuẩn
- prompt preview/sample runtime đầy đủ
- AI/service-backed structured preview trong `Prompt profile`

Các phần đó phải dùng fixture typed, không để UI bị què.

### 6.3 Adapter Matrix Bắt Buộc

Frontend phải pin rõ `source-of-truth adapter` cho từng boundary:

- `overview`: `demo` hoặc `hybrid`
  - lý do: semantic mart chưa hoàn thiện
- `exploration`: `demo` hoặc `hybrid`
  - lý do: semantic mart chưa hoàn thiện
- `staff-performance`: `demo`
  - lý do: `fact_staff_thread_day` chưa sẵn seam đầy đủ
- `thread-history`: `demo` hoặc `hybrid`
  - lý do: thread audit contract chuẩn và AI audit đầy đủ chưa hoàn thiện
- `page-comparison`: `demo`
  - lý do: compare view phụ thuộc semantic mart
- `operations`: `http-first`
  - lý do: backend đã có preview/execute/publish/get run group/get run
- `configuration`: `http-first`
  - lý do: backend đã có get page, create config version, activate config version
- `onboarding`: `http-first`
  - lý do: backend đã có list-from-token và register page
- `prompt profile sample preview`: `demo` hoặc `hybrid`
  - lý do: preview AI/service runtime chưa hoàn thiện

Rule:

- plan implementation phải ghi rõ feature nào đang `demo`, `http`, hay `hybrid`
- không được để `operations`, `configuration`, `onboarding` chạy demo-only sau khi frontend mới tiếp quản
- nếu một feature `http-first` còn dùng fixture cho action chính, đó là incomplete state chứ không phải end state

## 7. Information Architecture Đích

Navigation chính:

1. `Tổng quan`
2. `Khám phá dữ liệu`
3. `Hiệu quả nhân viên`
4. `Lịch sử hội thoại`
5. `So sánh trang`
6. `Vận hành`
7. `Cấu hình`

Rule:

- `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại` dùng chung business filters
- `So sánh trang` có rule filter riêng cho multi-page
- `Vận hành` có filter/run selection riêng
- `Cấu hình` có page context riêng và tab nội bộ riêng

## 8. Execution Units

### Unit 1: Dựng nền frontend mới và cắt dependency vào runtime legacy

**Target outcome:** Có app shell mới, route model mới, global filter model mới, design tokens mới, adapter interface mới; runtime không còn đi qua `main.ts/render.ts/api.ts` legacy.

**Owned write scope:**

- toàn bộ entrypoint frontend
- cấu trúc thư mục `frontend/src/**`
- scripts build/dev nếu cần

**Implementation shape:**

- tạo entrypoint mới cho app shell
- tạo router/query-state utilities
- tạo global filter state model
- tạo `demo/http` adapter interfaces
- tạo shared UI primitives tối thiểu
- đưa CSS từ file legacy sang token/layout system mới
- ngắt hoàn toàn runtime path dùng `AppState` cũ

**Proof:**

- app khởi động được
- có 7 mục nav
- query-state đổi đúng khi chuyển view/filter
- `bun run typecheck`
- `bun run build`

**Stop conditions:**

- còn import runtime vào `frontend/src/render.ts` legacy
- còn `AppState` monolith là state owner của app mới
- còn một file renderer tập trung ôm toàn bộ UI

**Banned shortcuts:**

- bọc `renderApp(state)` cũ trong app shell mới
- dùng lại toàn bộ CSS cũ không tái tổ chức

### Unit 2: Ship các business views chính theo semantic mart contract

**Target outcome:** `Tổng quan`, `Khám phá dữ liệu`, `So sánh trang` render được theo contract đích với fixture/demo adapter; có warning/provisional semantics đúng; không coi export là capability của các view này.

**Owned write scope:**

- feature modules cho `overview`, `exploration`, `page-comparison`
- related fixtures/adapters

**Implementation shape:**

- `Tổng quan` có KPI scorecards, opening overview, nhu cầu/outcome, nguồn khách, ưu tiên cải tiến
- `Khám phá dữ liệu` có builder, visualization placeholder owner-clean, detail table, drill action
- `So sánh trang` là multi-page only, không drill trực tiếp xuống transcript
- định nghĩa business labels rõ ràng từ codes sang nhãn
- không render export CTA như capability riêng của `Tổng quan`, `Khám phá dữ liệu`, `So sánh trang`

**Proof:**

- các filter business áp vào cả 3 view
- `published_provisional` hiện badge + coverage window
- click drill điều hướng đúng sang `Khám phá dữ liệu` hoặc `Lịch sử hội thoại`

**Stop conditions:**

- dashboard dùng literal raw text làm opening dimension chính
- comparison cho drill xuống message trực tiếp
- cùng một panel trộn `official` với dữ liệu chưa publish
- business view vẫn render `Xuất .xlsx` như capability của chính view đó

**Banned shortcuts:**

- lấy bảng thread legacy làm “dashboard”
- biến `Khám phá dữ liệu` thành chỉ là table search

### Unit 3: Ship `Hiệu quả nhân viên` và `Lịch sử hội thoại`

**Target outcome:** Có view riêng cho coaching staff và một investigation workspace đúng 4 tab, không gắn export vào view staff.

**Owned write scope:**

- feature modules `staff-performance`, `thread-history`
- fixtures/adapters tương ứng

**Implementation shape:**

- `Hiệu quả nhân viên` có scorecards, bảng xếp hạng nhân viên, issue matrix, coaching inbox
- `Lịch sử hội thoại` có left thread list và right workspace
- workspace có 4 tab:
  - `Hội thoại`
  - `Lịch sử phân tích`
  - `Audit AI`
  - `Liên kết CRM`
- list chính ở grain `thread`
- history tab mới hiển thị `thread_day`

**Proof:**

- chọn filter từ view business khác rồi vào `Lịch sử hội thoại` vẫn giữ scope
- thread detail hiển thị đúng distinction giữa transcript, history, audit, CRM link
- `Hiệu quả nhân viên` không dùng wording đổ lỗi

**Stop conditions:**

- list chính hiển thị nhiều row `thread_day` khi slice nhiều ngày
- `Hiệu quả nhân viên` chỉ là copy của dashboard thread table
- `Audit AI` không giải thích được evidence/model/prompt/taxonomy

**Banned shortcuts:**

- nhét quality metrics vào dashboard cũ rồi gọi đó là xong view staff
- dùng một bảng messages duy nhất thay cho 4 tab workspace

### Unit 3B: Ship workflow export riêng

**Target outcome:** Có một workflow export `.xlsx` business-facing riêng, mở từ app shell, không phụ thuộc view hoặc business filters đang xem.

**Owned write scope:**

- app shell/export entry
- export form state
- shared export builder
- adapter/contracts liên quan đến export

**Implementation shape:**

- app shell có entry `Export`
- form export chọn tường minh `page`
- form export chọn khoảng ngày tự do
- export không ngầm kế thừa `view`, `publish snapshot`, hoặc business filters hiện tại
- builder chỉ lấy các ngày trong khoảng chọn đã có `published_official`
- nếu trong khoảng chọn có ngày không có dữ liệu thì file đơn giản không có row cho các ngày đó
- metadata hiển thị `page`, `khoảng ngày`, `generated_at`, `prompt version`, `config version`, `taxonomy version`

**Proof:**

- user đang đứng ở bất kỳ view nào vẫn mở cùng một flow export
- chọn khoảng rộng hơn dữ liệu available vẫn export được các ngày có official
- khoảng chỉ toàn ngày không có official bị chặn và báo rõ lý do
- không có business view nào còn tự sở hữu export CTA

**Stop conditions:**

- export lấy thẳng current view model để build file
- export tự động dùng current page/current slice mà user không thấy và không sửa được
- export fail cả file chỉ vì trong range có một số ngày trống

### Unit 4: Ship `Vận hành` đúng publish/run semantics

**Target outcome:** Có operations workspace phản ánh đúng health, run monitor, run detail, manual run, mapping queue.

**Owned write scope:**

- feature module `operations`
- run/publish adapters
- fixtures cho split/publish eligibility

**Implementation shape:**

- `Health summary`
- `Run monitor`
- `Run detail`
- `Manual run form`
- `Mapping queue`
- `operations` là `http-first`:
  - preview manual run gọi `POST /chat-extractor/jobs/preview`
  - execute manual run gọi `POST /chat-extractor/jobs/execute`
  - run monitor/detail gọi `GET /chat-extractor/run-groups/:id` và `GET /chat-extractor/runs/:id`
  - publish action gọi `POST /chat-extractor/runs/:id/publish`
- preview manual run phải hiển thị split theo ngày và action eligibility
- publish action labels phải đúng:
  - partial current day -> `Publish tạm thời`
  - partial old day -> không có publish
  - full-day -> `Publish chính thức`
- mapping queue không chỉ là bảng tĩnh; mỗi dòng phải có candidate, confidence, evidence summary và action `approve/reject/remap`
- modal overwrite lịch sử phải nêu rõ:
  - snapshot official ngày nào sẽ bị ghi đè
  - prompt/config version cũ và mới
  - export `.xlsx` của ngày đó sẽ bị regenerate

**Proof:**

- walkthrough HTTP thật `preview -> execute -> run detail -> publish`
- một fixture custom range spanning nhiều ngày chỉ được dùng để bù phần UI state chưa có response thật, không thay thế flow HTTP chính
- confirm modal cho overwrite lịch sử nêu rõ snapshot cũ/mới từ dữ liệu backend thật
- mapping queue fixture cho phép đi hết luồng approve/reject/remap ở mức UI state mà không cần backend thật

**Stop conditions:**

- partial old day vẫn hiện action publish
- `Vận hành` không phân biệt `run output` với `publish`
- run detail list chính không ở grain `thread`
- mapping queue chỉ là placeholder table không có actionability
- `Vận hành` còn dùng fixture cho preview/execute/publish hoặc run detail dù HTTP seam thật đã có

**Banned shortcuts:**

- giữ form custom run kiểu cũ mà không có preview split
- gộp `Vận hành` vào `Cấu hình`

### Unit 5: Ship `Cấu hình` và onboarding đúng lazy-operator flow

**Target outcome:** Có cấu hình owner-clean và flow thêm page đúng thiết kế.

**Owned write scope:**

- feature modules `configuration`, `onboarding`
- config/onboarding adapters
- fixtures cho sample preview

**Implementation shape:**

- `Cấu hình` có 5 tab:
  - `Thông tin page`
  - `Tag taxonomy`
  - `Opening rules`
  - `Prompt profile`
  - `Scheduler và thông báo`
- onboarding là `http-first`:
  - nhập token -> `POST /chat-extractor/control-center/pages/list-from-token`
  - activate page -> `POST /chat-extractor/control-center/pages/register`
- configuration control-plane là `http-first`:
  - đọc page detail -> `GET /chat-extractor/control-center/pages/:id`
  - tạo config version -> `POST /chat-extractor/control-center/pages/:id/config-versions`
  - activate config version -> `POST /chat-extractor/control-center/pages/:id/config-versions/:configVersionId/activate`
- onboarding theo flow:
  - nhập token
  - chọn page
  - activate
  - sample/test là optional advanced path
- prompt UI là textarea lớn, không ép JSON
- opening rules là optional
- tag mới mặc định `noise`
- `Prompt profile` phải có đủ workflow:
  - clone từ version cũ
  - clone từ page khác
  - test với sample runtime
  - xem structured output
  - xem evidence bundle và field explanations
  - so sánh output giữa 2 prompt version
  - phân biệt rõ `prompt version` business-facing với `prompt hash` audit kỹ thuật
- semantics `Chạy thử` phải được UI encode rõ:
  - chỉ tạo preview sample/inference
  - không đổi publish pointer
  - không đồng nghĩa publish dashboard

**Proof:**

- bỏ qua sample/test vẫn activate được page
- config tabs hiển thị rõ default/system vs operator override
- prompt preview workspace có before/after và output structured sample trong adapter demo
- prompt profile support clone từ version cũ/page khác
- `Chạy thử` không làm thay đổi publish state hay active snapshot nào trong UI state
- compare 2 prompt version hiển thị rõ version label, hash, evidence, field explanations
- walkthrough HTTP thật `list-from-token -> register -> get page -> create config version -> activate config version`

**Stop conditions:**

- onboarding bắt user phải hoàn thành opening rules/tag mapping mới activate được
- prompt UI bị tách thành form JSON
- `Cấu hình` vẫn là một form lớn không có tab boundary
- `Prompt profile` chỉ còn textarea + nút preview tối giản mà thiếu clone/compare/evidence semantics
- onboarding/register/activate vẫn là demo-only dù HTTP seam thật đã có
- create/activate config version vẫn là demo-only dù HTTP seam thật đã có

**Banned shortcuts:**

- copy form `settings` legacy rồi rename field
- ép config đi qua textareas JSON như runtime chính

### Unit 6: Wire HTTP seams đã có, giữ demo seam cho phần chưa xong, rồi xóa hẳn legacy

**Target outcome:** Frontend mới có thể chạy hybrid `demo/http` mà không làm sai contract đích; code legacy bị loại bỏ.

**Owned write scope:**

- các HTTP adapters
- fixture registry
- cleanup code legacy
- README/frontend docs

**Implementation shape:**

- map các endpoint backend hiện có vào contract frontend theo adapter matrix bắt buộc
- các seam `http-first` phải wire thật trước:
  - `operations`
  - `configuration`
  - `onboarding`
- nơi nào chưa đúng seam thì giữ fixture/demo adapter nhưng phải ghi rõ là `demo` hoặc `hybrid`
- thêm mode/config dev để chọn adapter source
- xoá hẳn file/state/render legacy khỏi runtime path
- cập nhật README phản ánh frontend mới

**Proof:**

- `demo` mode render đủ 7 view
- `http` mode đi được ít nhất các flow thật:
  - `list-from-token -> register`
  - `create config version -> activate`
  - `preview -> execute -> get run detail -> publish`
- không còn import/use runtime từ legacy files

**Stop conditions:**

- app mới vẫn fallback vào renderer cũ cho một view nào đó
- README còn mô tả frontend như shell cũ
- các seam `http-first` vẫn đang dùng fixture làm source-of-truth chính

**Banned shortcuts:**

- “tạm” giữ menu legacy cho các view chưa wire
- để HTTP adapter trả thẳng raw response lên renderer

## 9. Cấu Trúc Thư Mục Mục Tiêu

Một shape hợp lý cho `frontend/src`:

```text
src/
  app/
    boot.ts
    shell.ts
    router.ts
    query-state.ts
  core/
    config.ts
    types.ts
  adapters/
    contracts/
    demo/
    http/
  features/
    overview/
    exploration/
    staff-performance/
    thread-history/
    page-comparison/
    operations/
    configuration/
    onboarding/
  shared/
    ui/
    format/
    state/
    fixtures/
  styles/
    tokens.css
    layout.css
    components.css
```

Rule:

- không quay lại mô hình “mọi thứ nằm ở vài file top-level”
- mỗi feature chịu trách nhiệm view model và render của nó

## 10. Proof Matrix

Trước khi coi implementation tương lai là xong, phải chứng minh:

1. `Navigation contract`
   - có đúng 7 mục nav
   - `Vận hành` và `Cấu hình` tách riêng

2. `Filter persistence`
   - đổi `Page`, `Slice`, `Inbox mới/cũ`, `Tái khám` ở `Tổng quan`
   - chuyển sang `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `Lịch sử hội thoại`
   - scope vẫn giữ đúng
   - `Slice` default cho official dashboard không đi quá hết ngày hôm qua
   - `Publish snapshot` default là official latest per day

3. `Publish semantics`
   - snapshot `published_provisional` hiện badge + coverage + warning
   - partial old day không có publish CTA
   - overwrite modal cho historical full-day publish nêu rõ snapshot bị ghi đè, version cũ/mới, và impact tới export

4. `Grain correctness`
   - list chính của investigation là `thread`
   - `thread_day` chỉ hiện trong history/detail

5. `Onboarding laziness`
   - activate page được ngay cả khi bỏ qua sample mapping/prompt test

6. `Prompt/config semantics`
   - prompt profile là textarea business-facing
   - tag taxonomy và opening rules là config tách riêng
   - prompt profile có clone từ version cũ/page khác, compare 2 versions, evidence bundle, field explanations
   - `Chạy thử` không làm đổi publish pointer

7. `Auditability`
   - thread workspace giải thích được evidence, prompt version, taxonomy version, model

8. `Export semantics`
   - export là workflow riêng, không gắn vào `Tổng quan`, `Khám phá dữ liệu`, `Hiệu quả nhân viên`, `So sánh trang`
   - user chọn tường minh `page` và `khoảng ngày`
   - builder chỉ emit row cho các ngày trong khoảng chọn đã có `published_official`
   - nếu trong range có ngày trống thì file đơn giản không có row cho các ngày đó
   - nếu khoảng chọn không có ngày official nào thì UI chặn export và báo rõ lý do
   - metadata export hiển thị đủ `page`, `khoảng ngày`, `generated_at`, `prompt version`, `config version`, `taxonomy version`

9. `Empty/Error states`
   - có empty states cho: chưa có page, chưa có official publish, filter rỗng, tag mới đang ở `noise`
   - có error states cho: token hết hạn, ETL failure, AI failure, partial publish, taxonomy mismatch
   - mỗi state chỉ rõ lỗi nằm ở seam nào và hành động tiếp theo là gì

10. `Operations actionability`
   - mapping queue có action `approve/reject/remap` ở mức UI contract
   - run detail và manual run preview không biến thành placeholder read-only
   - `Vận hành` đi qua HTTP thật cho preview/execute/publish/get run

11. `Legacy removal`
   - không còn runtime path nào gọi renderer/state legacy

12. `HTTP-first boundaries`
   - onboarding dùng HTTP thật cho `list-from-token` và `register`
   - `Cấu hình` control-plane dùng HTTP thật cho get page, create config version, activate config version
   - chỉ các seam chưa có backend đúng contract mới được giữ ở `demo` hoặc `hybrid`

## 11. Hostile Review Checklist

- Có view nào đang dùng payload legacy làm contract bề mặt không.
- Có chỗ nào `thread_day` bị dùng làm list grain chính khi slice nhiều ngày không.
- Có chỗ nào `Vận hành` và `Cấu hình` bị trộn lại không.
- Có chỗ nào `published_provisional` bị hiển thị như dữ liệu official không.
- Có chỗ nào filter default của business views cho phép current-day/provisional như mặc định thay vì official đến hôm qua không.
- Có chỗ nào labels lộ raw code nội bộ trên màn business không.
- Có chỗ nào onboarding bắt buộc sample/test mới activate được không.
- Có chỗ nào export vẫn bị gắn vào current view/current filter hoặc leak raw code/metadata sai không.
- Có chỗ nào `Prompt profile` thiếu clone/compare/evidence/explanation semantics nhưng vẫn bị coi là xong không.
- Có chỗ nào adapter HTTP leak raw backend response vào renderer mà không qua contract frontend không.
- Có chỗ nào `operations`, `configuration`, hoặc `onboarding` vẫn chạy demo-only dù backend seam thật đã có không.
- Có chỗ nào demo fixtures encode flow sai với `docs/ui-flows.md` không.
- Có chỗ nào feature không khai báo rõ nó là `demo`, `http`, hay `hybrid` theo adapter matrix không.
- Có chỗ nào empty/error states chỉ có banner chung chung mà không chỉ rõ seam lỗi và next action không.
- Có chỗ nào mapping queue chỉ là bảng placeholder không có action approve/reject/remap không.
- Có chỗ nào vẫn còn import từ `frontend/src/main.ts`, `frontend/src/render.ts`, `frontend/src/api.ts`, `frontend/src/types.ts` legacy vào runtime mới không.

## 12. Không Làm Trong Slice Này

- Thiết kế lại backend hoặc service để chiều frontend
- Đổi framework frontend chỉ vì sở thích
- Cố giữ backward compatibility với state/render model legacy
- Dựng chart engine phức tạp trước khi chốt contract và layout
- Tối ưu pixel-perfect cuối cùng trước khi semantics UI đúng

## 13. Kết Luận

Rewrite frontend này phải được thực hiện như một owner-clean replacement, không phải một đợt “nâng cấp dần” trên shell hiện tại. Frontend mới phải lấy `docs/ui-flows.md` làm source-of-truth, dùng adapter seam để sống độc lập với backend/service chưa hoàn tất, và coi việc loại bỏ code legacy khỏi runtime path là tiêu chí hoàn thành bắt buộc chứ không phải việc dọn dẹp tùy chọn sau cùng.
