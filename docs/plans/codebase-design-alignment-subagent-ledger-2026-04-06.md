## Header

```text
Objective:
Execute docs/plans/codebase-design-alignment-remediation-plan-2026-04-06.md faithfully with a subagent-driven workflow. Current execution scope covers Unit A (frontend configuration draft ownership + shell/layout), Unit B (control-plane status contract + source tag identity), and Unit C (business read-model parity for overview/exploration/thread-history/operations detail). Unit D (taxonomy activation) and Unit E (CRM active mapping) are explicitly gated and remain blocked unless repo evidence reopens them.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: connected page, control-plane status, token status, connection status, source tag identity, pancake_tag_id, configuration draft, configuration tab, prompt workspace, route merge semantics, overview delta, exploration builder, thread workspace audit, run detail thread coverage
- owner map: frontend/src/app/** plus frontend/src/features/configuration/** and frontend/src/styles/** own configuration draft state, tab/panel rendering, shell rhythm, and state-preserving editing; backend/src/modules/chat_extractor/** plus backend/go-worker/internal/transform/build.go own connected-page/control-plane contract and source tag identity preservation; backend/src/modules/read_models/** own overview/exploration/thread-history/operations-detail read-model contract and thread-grain diagnostics; frontend/src/features/overview/**, frontend/src/features/exploration/**, frontend/src/features/thread-history/**, frontend/src/features/operations/**, and frontend/src/adapters/http/business-adapter.ts own business-view rendering against backend-owned contracts
- invariants: frontend remains owner of draft/view state only; backend remains owner of connected-page status, config-version payload contract, read-model contract, and run detail semantics; route merge semantics for business filters must not regress; thread-grain operations detail must not drift back to thread_day; no fake taxonomy governance or CRM action path may be invented while gates stay closed
- verification bar: targeted frontend tests for stable editing and tab isolation, targeted backend tests for connected-page/tag identity and read-model/runtime behavior, targeted frontend tests or smoke coverage for business views/drill preservation, and final fresh proof runs on touched suites
- debt register path: docs/plans/codebase-design-alignment-subagent-ledger-2026-04-06.md
- integration order: T2 and T3 can run in parallel; T1 can run in parallel with them because it owns only frontend configuration/render/style; T4 starts after T3 and coordinator contract alignment
```

## Pre-Execution Gates

```text
- G1 Canonical taxonomy catalogue availability: BLOCKED
  Evidence: docs/design.md defines analysis_taxonomy_version at an architectural level only, but the repo does not pin a production-ready catalogue with allowed codes, Vietnamese labels, sort order, and grouping rules for the required families. docs/reviews/codebase-vs-design-review-2026-04-06.md also records taxonomy governance as still placeholder.
- G2 CRM external contract availability: BLOCKED
  Evidence: docs/plans/eu5-crm-mapping-blocker.md records the CRM seam as blocked because the repo does not pin transport/auth, deterministic lookup rules, write-back semantics, or approve/reject/remap side effects.
- G3 Exploration metric catalogue ambiguity: OPEN
  Evidence: docs/ui-flows.md pins the current builder surface for metric, breakdown, compare, and drill strongly enough to execute the existing exploration surface without inventing new product scope.
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Frontend configuration shell and stable draft editing | Descartes (`019d625e-4be8-7a52-9da6-b2c31f7f0e43`) | frontend/src/app/frontend-app.ts, frontend/src/app/screen-state.ts, frontend/src/features/configuration/**, frontend/src/styles/layout.css, frontend/src/styles/components.css, frontend tests for configuration/app | NONE | Accepted | Passed | Integrated | None | Not Needed | Worker restored `render.ts`, split the 5 real panels by `activeTab`, preserved draft state during editing, and post-audit fixed config-version-select rerender for the activate CTA. |
| T2 | Backend control-plane status and source tag identity | Planck (`019d625e-818b-77b1-94d2-480d0e91cd5c`) | backend/src/modules/chat_extractor/**, backend/go-worker/internal/transform/build.go, backend tests for chat_extractor/transform | NONE | Accepted | Passed | Integrated | None | Not Needed | Backend now owns token/connection status; source tag identity is preserved through config payloads and worker normalization. |
| T3 | Backend read-model parity for overview/exploration/thread-history/operations detail | Coordinator (rescoped after Helmholtz quota failure) | backend/src/modules/read_models/**, backend read_model tests | NONE | Accepted | Passed | Integrated | None | Not Needed | Coordinator completed the slice locally after initial worker quota failure; overview deltas, exploration builder, thread workspace audit, and thread-grain operations detail are live. |
| T4 | Frontend business view parity for overview/exploration/thread-history/operations detail | Coordinator + Descartes | frontend/src/features/overview/**, frontend/src/features/exploration/**, frontend/src/features/thread-history/**, frontend/src/features/operations/**, frontend business-view tests | T3 | Accepted | Passed | Integrated | None | Not Needed | No owner-clean feature rewrite was needed beyond adapter/contract alignment and operations/configuration proof updates; current frontend business views remained compatible after backend contract completion. |
| T5 | Taxonomy activation path | Local coordinator | BLOCKED by G1 | G1 | Blocked | Not Applicable | Not Integrated | None | Recorded | Must not execute without pinned canonical taxonomy catalogue |
| T6 | CRM active mapping seam | Local coordinator | BLOCKED by G2 | G2 | Blocked | Not Applicable | Not Integrated | None | Recorded | Must not execute without pinned CRM contract |
```

## Acceptance Check Per Task

```text
T1 Accepted
- scope check: frontend-only shell/layout/draft files stayed in Unit A boundaries
- owner check: frontend remains owner of draft/view state; backend status inference did not leak into UI
- proof:
  - `cd D:\Code\chat-analyzer-v2\frontend && bun run typecheck`
  - `cd D:\Code\chat-analyzer-v2\frontend && bun run build`
  - `cd D:\Code\chat-analyzer-v2\frontend && bun test src/app/frontend-app.test.ts src/features/configuration/state.test.ts src/features/operations/state.test.ts src/features/operations/render.test.ts src/smoke.test.ts`
- result: pass

T2 Accepted
- scope check: chat_extractor backend seam + go-worker only; Prisma schema unchanged
- owner check: connected-page status is backend-owned, frontend only renders; source tag identity prefers real Pancake id and keeps text fallback only as compatibility guard
- proof:
  - `cd D:\Code\chat-analyzer-v2\backend && bun test src/modules/chat_extractor/chat_extractor.service.test.ts src/modules/chat_extractor/chat_extractor.controller.test.ts src/modules/chat_extractor/chat_extractor.repository.test.ts`
  - `cd D:\Code\chat-analyzer-v2\backend\go-worker && go test ./internal/transform`
- result: pass

T3 Accepted
- scope check: read_models only; no drift back to thread_day for operations detail
- owner check: overview delta is computed from prior equivalent slice; exploration builder/runtime selections are backend-owned; thread workspace audit fields flow from persisted mart/runtime data
- proof:
  - `cd D:\Code\chat-analyzer-v2\backend && bun test src/modules/read_models/read_models.service.test.ts src/modules/read_models/read_models.controller.test.ts`
- result: pass

T4 Accepted
- scope check: frontend business-view compatibility confirmed through contracts/adapters plus operations/configuration smoke coverage; no unnecessary rewrite of stable views
- owner check: merge-route semantics and thread-grain operations view remain intact after backend contract expansion
- proof:
  - `cd D:\Code\chat-analyzer-v2\frontend && bun test src/app/frontend-app.test.ts src/features/configuration/state.test.ts src/features/operations/state.test.ts src/features/operations/render.test.ts src/smoke.test.ts`
- result: pass
```

## Integration Notes

```text
### Integration Pass 0
- tasks integrated: NONE
- terminology normalized:
  NONE
- boundary corrections:
  G1 and G2 recorded as blocked before delegation; frontend/backend shared adapter contract alignment reserved for coordinator integration to avoid worker write-scope overlap
- bridge code removed during integration:
  NONE
- debt entries added:
  T5 blocked by missing taxonomy catalogue
  T6 blocked by missing CRM contract
- regressions introduced during integration:
  NONE

### Integration Pass 1
- tasks integrated: T1, T2, T3, T4
- terminology normalized:
  control-plane status is split into `tokenStatus` and `connectionStatus`
  source tag identity is `sourceTagId` / `source_tag_id`, backed by real Pancake tag ids when available
  operations detail artifact counts stay thread-grain via `threadCount` and `coveredThreadIds`
  prompt workspace sample uses runtime conversation fields directly instead of frontend inference
- boundary corrections:
  live token validation remains detail-lane only; list lane stays unchecked by design
  configuration draft state stays frontend-owned; config payload/status serialization stays backend-owned
  read-model builder/runtime state stays in backend contract; frontend only forwards/query-renders it
- bridge code removed during integration:
  NONE
- debt entries added:
  NONE beyond the original T5/T6 gates
- regressions introduced during integration:
  NONE found in targeted proof
```

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
