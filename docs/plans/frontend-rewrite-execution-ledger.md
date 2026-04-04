# Frontend Rewrite Execution Ledger

## Header

```text
Objective:
Rewrite toàn bộ frontend thành app TypeScript thuần owner-clean bám docs/design.md + docs/ui-flows.md,
loại bỏ runtime path legacy, giữ contract đích qua adapter seam typed, và chứng minh được các flow http-first:
list-from-token -> register, create config version -> activate, preview -> execute -> get run detail -> publish.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns:
  app shell, route state, query state, business filters, publish snapshot, adapter matrix,
  demo adapter, http adapter, hybrid adapter, overview, exploration, staff performance,
  thread history, page comparison, operations, configuration, onboarding, prompt profile,
  run monitor, run detail, mapping queue, thread workspace
- owner map:
  coordinator = foundation/app shell/router/shared state/adapters integration/docs/proof
  worker A = business + investigation views on demo or hybrid seams
  worker B = operations + configuration + onboarding http-first seams
- invariants:
  no legacy runtime path; exactly 7 nav views; business filters persist across business views;
  thread is main investigation grain; thread_day only in history/detail; operations/configuration/onboarding
  must not regress to demo-only; published_provisional must stay visibly non-official; export reads official rows only
- verification bar:
  bun run typecheck; bun run build; targeted smoke/walkthrough proof for route/filter/adapters; README updated;
  walkthrough proof for pinned flows in the implementation request
- debt register path:
  docs/plans/frontend-rewrite-debt.md
- integration order:
  foundation first, then worker A + worker B in parallel, then coordinator integration, then senior audit
```

## Post-Implementation Correction 2026-04-04

- Export semantics đã được chốt lại sau khi rewrite được execute:
  - export là workflow riêng
  - export không gắn vào business view
  - export không kế thừa ngầm current filter slice
  - user phải chọn tường minh `page + khoảng ngày`
- Vì code chưa được sửa, mọi acceptance cũ kiểu "4 business view có export CTA đúng scope" được coi là đã bị supersede bởi source-of-truth mới.
- Gap này được theo dõi ở `docs/plans/frontend-rewrite-debt.md` và `docs/reviews/frontend-rewrite-review-2026-04-04.md`.

## Adapter Matrix Checklist

```text
- [x] overview => demo or hybrid only; never http-first against legacy/read-model contract
- [x] exploration => demo or hybrid only; never flatten into table-search legacy view
- [x] staff-performance => demo only until mart seam exists
- [x] thread-history => demo or hybrid; thread list stays grain thread
- [x] page-comparison => demo only
- [x] operations => http-first, primary actions must call preview/execute/get run group/get run/publish
- [x] configuration => http-first, primary actions must call get page/create config version/activate config version
- [x] onboarding => http-first, primary actions must call list-from-token/register
- [x] prompt profile sample preview => demo or hybrid only, but must not redefine operations publish semantics
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Foundation rewrite | Coordinator | frontend/src/app/**, frontend/src/shared/**, frontend/src/styles/**, frontend/src/main.ts, frontend/src/build-utils.ts, frontend/src/core/**, adapter interfaces | NONE | Accepted | Passed | Integrated | None | Not Needed | New shell/router/controller live; legacy runtime files removed |
| T2 | Business and investigation views | Coordinator (subagent tool unavailable) | frontend/src/features/overview/**, exploration/**, staff-performance/**, thread-history/**, page-comparison/**, demo fixtures for those views | T1 | Accepted | Passed | Integrated | None | Follow-up Needed | Preserved adapter matrix, provisional warnings, thread grain; export portion later superseded by 2026-04-04 design correction |
| T3 | Operations, configuration, onboarding | Coordinator (subagent tool unavailable) | frontend/src/features/operations/**, configuration/**, onboarding/**, frontend/src/adapters/http/** contracts for these seams | T1 | Accepted | Passed | Integrated | None | Not Needed | HTTP-first flows proven through smoke walkthrough |
| T4 | Senior audit | Coordinator hostile audit | Whole frontend after integration | T2,T3 | Accepted | Passed | Integrated | None | Not Needed | Hostile audit reran proof after fixing route persistence and publish-action mapping |
```

## Acceptance Check Per Task

### T1 Acceptance Check
- Assigned requirements:
  Foundation rewrite with new app shell, router/query-state, shared filters, adapter boundaries, design tokens,
  no runtime dependency on legacy renderer/state/api structure.
- Returned summary:
  Replaced runtime entrypoint with new app shell and controller, added route/query-state and adapter boundaries,
  introduced shared styles/tokens, demo business adapter, HTTP control-plane adapter, and removed legacy runtime files.
- Verification result:
  Approved
- Requirement gaps:
  None for foundation slice. Feature depth intentionally deferred to T2/T3.
- Vocabulary or owner drift:
  None observed.
- Proof assessment:
  Sufficient: `bun run typecheck`, `bun run build`
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Business/investigation views using demo or hybrid seams only, stronger Vietnamese business-facing wording,
  visible provisional warning semantics, thread list grain = thread,
  thread_day limited to history/detail, no comparison drill to transcript.
- Returned summary:
  Reworked overview/exploration/staff-performance/thread-history/page-comparison rendering and demo data,
  sharpened provisional warnings, preserved drill routes into thread workspace,
  and kept page comparison at compare-only scope.
- Verification result:
  Approved
- Requirement gaps:
  Export is now a recorded gap under the corrected design: current frontend still wires `.xlsx` export into business views instead of a standalone workflow.
- Vocabulary or owner drift:
  None observed.
- Proof assessment:
  Sufficient: `bun run test`, `bun run typecheck`, `bun run build`
- Bridge code assessment:
  None
- Debt registration check:
  Needed after 2026-04-04 correction
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Operations/configuration/onboarding remain http-first, publish semantics stay explicit,
  prompt profile preview remains hybrid/demo, and pinned flows are proven end-to-end through the frontend HTTP adapter chain.
- Returned summary:
  Tightened HTTP adapter mapping and ops/config rendering, encoded publish eligibility labels,
  historical overwrite copy, onboarding laziness, and config/prompt semantics; added smoke walkthrough for the three pinned flows.
- Verification result:
  Approved
- Requirement gaps:
  No live backend/browser E2E in this session; proof uses a local stub server against the real frontend HTTP adapter chain.
- Vocabulary or owner drift:
  None observed.
- Proof assessment:
  Sufficient: `bun run test`, `bun run typecheck`, `bun run build`
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

## Integration Notes

### Integration Pass 1
- tasks integrated:
  T1, T2, T3
- terminology normalized:
  Legacy `settings/jobs` shell renamed into `configuration/operations` boundaries in the new runtime.
- boundary corrections:
  Legacy renderer/state/api files removed from runtime ownership; business view drill routes now merge with current filter state instead of resetting to defaults.
- bridge code removed during integration:
  `frontend/src/api.ts`, `frontend/src/render.ts`, `frontend/src/types.ts`, `frontend/src/utils.ts`
- debt entries added:
  None yet
- regressions introduced during integration:
  Route persistence reset was found and fixed in coordinator integration before closeout; no open regression remains

### T4 Acceptance Check
- Assigned requirements:
  Final hostile audit over naming, owner boundaries, route/filter persistence, publish semantics, and proof coverage.
- Returned summary:
  Found one integration regression where route buttons could reset filters to defaults and one operations helper mismatch after business-facing eligibility mapping; both were fixed and proof rerun.
- Verification result:
  Approved
- Requirement gaps:
  No new material gap found outside export. Export workflow architecture is now an open gap after the 2026-04-04 correction. Residual UX risk still includes browser download behavior because smoke tests do not click a real file dialog.
- Vocabulary or owner drift:
  None observed after fixes.
- Proof assessment:
  Sufficient: `bun run test`, `bun run typecheck`, `bun run build`
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
