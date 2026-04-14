# AI Runtime Selection Design Gate

**Status:** approved for current architecture direction  
**Date:** 2026-04-03  
**Scope:** Seam 2 conversation analysis, AI-assisted CRM mapping, `backend/` <-> `service/` contract, và các yêu cầu UI/config liên quan

## Invariants

- Hướng đi tách biệt ETL và analysis là đúng và phải giữ nguyên. ETL phải chạy độc lập để canonical data luôn sẵn sàng cho analysis sau đó.
- Postgres tables của Seam 1 và Seam 2 là system of record. Runtime state của bất kỳ AI framework nào không được làm source of truth.
- `backend/` là owner của scheduler, run state, publish/supersede, review queue, read API và persistence.
- `service/` chỉ nhận evidence bundle đã freeze và trả kết quả structured, versioned, audit được.
- Tất cả contract request/response của AI module phải được định nghĩa bằng Python `pydantic` v2 models có version.
- `conversation analysis` mặc định là `1 conversation_day -> 1 structured result`, không agent loop, không multi-agent delegation trong cùng request.
- `AI-assisted CRM mapping` có thể cần orchestration chặt hơn, nhưng vẫn phải nằm sau cùng một external contract ổn định.
- UI và docs domain không được leak framework name vào capability chính thức của sản phẩm nếu không thật sự cần cho vận hành kỹ thuật.

## Viable Approaches

### 1. ADK-centric runtime

**Ý tưởng**

- Dùng ADK làm production runtime mặc định cho toàn bộ AI module, và để kiến trúc/wording của domain đi theo concept agent của ADK.

**Ưu điểm**

- Hợp nếu team quyết dùng hệ Google agent stack từ đầu.
- Có sẵn primitives cho agent runtime.

**Nhược điểm**

- Domain bị kéo về concept `agent`, `session`, `runtime` sớm hơn mức bài toán thực sự cần.
- `conversation analysis` của hệ này chủ yếu là structured generation theo unit, không cần agent loop làm abstraction chính.
- Switch framework sau này đau hơn vì contract và UI đã lộ ADK concepts.

### 2. LangGraph-centric runtime

**Ý tưởng**

- Dùng LangGraph làm engine chính cho AI module, tận dụng graph state, branching, checkpoint và HITL.

**Ưu điểm**

- Mạnh hơn ADK ở các flow cần branching, checkpoint, review/resume và control flow khắt khe.
- Hợp với các bài toán CRM mapping nhiều bước hoặc review queue có logic phân nhánh rõ.

**Nhược điểm**

- Nếu lấy làm trung tâm quá sớm thì lại tiếp tục kéo domain sang graph concepts.
- `conversation analysis` vẫn bị over-engineered vì graph không phải nhu cầu chính của flow này.
- Dễ hình thành song song hai lớp state: graph state và run tables trong Postgres.

### 3. Self-orchestration first, framework-neutral contract, LangGraph optional

**Ý tưởng**

- Kiến trúc chính dùng self-owned orchestration ở `backend/` + `service/`.
- Domain contract, run state, retry/publish/audit nằm ở Postgres và code ứng dụng.
- `service/` mặc định dùng model adapter + structured generation.
- Chỉ dùng LangGraph như implementation detail cho flow nào thật sự cần branching/HITL nhiều bước.

**Ưu điểm**

- Phù hợp nhất với bài toán batch ETL -> analysis -> publish.
- Giữ domain độc lập hơn với infra/framework.
- Dễ switch framework trong trường hợp cực đoan vì boundary đã pin bằng `pydantic` models và contract `HTTP/JSON` nội bộ ổn định.
- Vẫn mở cửa cho LangGraph ở chỗ nó thực sự có lợi.

**Nhược điểm**

- Team phải tự giữ kỷ luật owner boundary và orchestration state.
- Cần viết adapter layer gọn gàng thay vì phó mặc cho framework.

## Failure Modes And Mitigations

- **Framework lock-in vào domain**
  - Mitigation: pin external contract bằng `pydantic` v2 models, không để UI/domain nói bằng ngôn ngữ của framework.
- **Runtime state drift so với Postgres run state**
  - Mitigation: framework session/checkpoint chỉ là scratchpad; publish, retry, terminalization và audit đều đọc từ DB owner tables.
- **Over-agent hóa flow analysis**
  - Mitigation: `conversation analysis` giữ ở dạng single-step structured generation theo unit, không tool loop.
- **CRM mapping trở nên quá đơn giản hoặc quá phức tạp**
  - Mitigation: default là structured decision một bước; chỉ nâng lên graph/HITL khi ambiguity thực sự cao và được cô lập trong capability riêng.
- **Schema drift khi đổi prompt/model/framework**
  - Mitigation: version `pydantic` schema, snapshot prompt/model/config trên run, và giữ error envelope ổn định.

## Recommendation

- Chọn **self-orchestration** làm xương sống hệ thống.
- Chọn **Python `pydantic` v2** làm lớp contract chuẩn cho request/response, output schema và validation.
- Chọn **framework-neutral service boundary**: `HTTP/JSON` nội bộ là transport hiện tại, không phải domain contract.
- **Không chọn ADK làm framework mặc định của repo.**
- **Không chọn LangGraph làm kiến trúc trung tâm của toàn hệ thống.**
- **Cho phép dùng LangGraph như implementation detail** cho các flow cần branching/HITL rõ ràng, trước mắt phù hợp nhất là AI-assisted CRM mapping hoặc các review workflow phức tạp sau này.

## Least-Painful Patch vs Long-Lived Route

### Least-painful patch

- Giữ nguyên hard pin sang ADK trong `design.md`, `ui-flows.md` và các plan hiện có rồi tiếp tục code.

### Vì sao reject

- Patch này nhanh nhưng khóa domain vào framework quá sớm.
- UI sẽ bị lệch sang cách nghĩ của infra thay vì capability của sản phẩm.
- Khi requirement của CRM mapping hoặc healthcare review flow thay đổi, team sẽ phải gỡ framework khỏi domain thay vì chỉ thay adapter.

### Long-lived route

- Giữ orchestration owner ở `backend/` và Postgres.
- Giữ `service/` framework-neutral ở boundary.
- Dùng structured generation cho `conversation analysis`.
- Chỉ kéo LangGraph vào các subflow thật sự cần graph semantics.
