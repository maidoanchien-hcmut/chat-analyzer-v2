# Config Ops Onboarding Sample Ledger

## Header

```text
Objective:
Fix the remaining frontend gaps around configuration and operations by compacting the viewport-heavy UI, making timezone selection owner-clean instead of effectively locked to Asia/Ho_Chi_Minh, replacing configuration mock/sample data with a real HTTP seam, and adding a real onboarding sample workspace so a normal operator can tune tag/opening parameters from real Pancake data before putting a page into scheduled operation.

Coordinator:
Codex GPT-5

Objective Card:
- canonical nouns: business timezone, scheduler timezone, onboarding sample preview, configuration draft, connected page, runtime-only worker preview, non-publish sample workspace
- owner map: backend sample seam owns runtime-only preview contract and worker invocation; frontend configuration flow owns timezone/config draft semantics and sample workspace rendering; frontend styles own viewport compaction only
- invariants: activate flow remains optional-minimal; sample preview never publishes or materializes official/provisional snapshots; timezone must accept valid IANA input and must not drift between page and scheduler draft; configuration and operations views must not silently fall back to demo data
- verification bar: frontend tests pass, backend tests for new schema/service path pass, frontend typecheck passes, no mock preview remains on configuration flow, real sample path is exercised through unit coverage
- debt register path: docs/plans/frontend-rewrite-debt.md
- integration order: backend sample seam -> frontend configuration/sample integration -> style compaction -> whole-app verification -> senior audit
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Backend onboarding sample seam | Tesla (`019d5cf7-6832-7ca1-af0f-8658e72ff7bc`) | backend/src/modules/chat_extractor/**, backend/README.md | NONE | Accepted | Passed | Integrated | None | Not Needed | Subagent hit usage limit mid-run; coordinator completed and verified locally |
| T2 | Frontend config timezone + real sample workspace | Banach (`019d5cf7-7e6c-7760-80df-49d11bbcbe7c`) | frontend/src/adapters/contracts.ts, frontend/src/adapters/http/*.ts, frontend/src/app/frontend-app.ts, frontend/src/app/screen-state.ts, frontend/src/features/configuration/*.ts, frontend/src/**/*.test.ts | T1 contract | Accepted | Passed | Reworked During Integration | None | Not Needed | Subagent hit usage limit mid-run; coordinator finished adapter normalization and tests locally |
| T3 | Frontend viewport compaction | Kierkegaard (`019d5cf7-957c-7f30-af72-e9b96aba2560`) | frontend/src/styles.css, frontend/src/styles/*.css | NONE | Accepted | Passed | Integrated | None | Not Needed | Subagent hit usage limit mid-run; coordinator compacted density and verified no frontend regression |
```

## Acceptance Checks

### T1 Acceptance Check
- Assigned requirements:
  Add a dedicated non-publish onboarding sample preview seam backed by go-worker runtime-only output, with controller/schema/service coverage.
- Returned summary:
  Partial backend seam landed before the worker hit usage limit; coordinator completed the service/controller/test path and README surface locally.
- Verification result:
  Approved
- Requirement gaps:
  None
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT. `bun test src/modules/chat_extractor/chat_extractor.service.test.ts src/modules/chat_extractor/chat_extractor.controller.test.ts` passed.
- Bridge code assessment:
  None
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Remove mock sample dependency from configuration flow, make timezone owner-clean, integrate the real sample workspace, and keep activate non-blocking.
- Returned summary:
  Partial frontend seam landed before the worker hit usage limit; coordinator completed control-plane adapter normalization, render integration, state handling, and focused tests locally.
- Verification result:
  Approved
- Requirement gaps:
  None
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT. `bun run typecheck` and `bun test` in `frontend/` passed.
- Bridge code assessment:
  Removed during integration
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Compact configuration/operations density without changing semantics or HTTP behavior.
- Returned summary:
  Subagent did not complete due usage limit; coordinator performed the style compaction locally in the owned CSS files.
- Verification result:
  Approved
- Requirement gaps:
  None
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT. Full `frontend/` test suite still passed after the density changes.
- Bridge code assessment:
  None
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

## Integration Notes

### Integration Pass 1
- tasks integrated: T1, T2, T3
- terminology normalized:
  `prompt preview sample` -> `sample dữ liệu thật` in the configuration workflow where the seam is ETL/runtime-only rather than AI inference preview
- boundary corrections:
  moved raw worker JSON parsing into the frontend control-plane adapter so render code consumes a normalized view model
- bridge code removed during integration:
  mock prompt preview dependency from the configuration flow
- debt entries added:
  None
- regressions introduced during integration:
  None found in the verified test surface

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
