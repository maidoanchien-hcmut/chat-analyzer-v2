# Full App Completion Execution Ledger

## Header

```text
Objective:
Execute docs/plans/full-app-completion-plan.md faithfully toward non-CRM parity-ready first, and only claim full design parity if the CRM contract gate is later satisfied.

Coordinator:
Codex GPT-5 (local execution; spawn_agent unavailable in this session)

Objective Card:
- canonical nouns: lazy operator activation, built-in opening heuristic, official_daily scheduler runtime, publish resolver, prompt identity, runtime provider identity, preview artifact, reuse planner, cross-view parity, CRM contract gate
- owner map: backend owns activation defaults, scheduler runtime, publish semantics, runtime metadata persistence, reuse planning, and read APIs; service owns provider/env/model routing, prompt compiler, and structured analysis runtime; frontend owns HTTP-bound operations/configuration/prompt workspace/cross-view parity only
- invariants: activation must not require manual opening-rule or tag mapping setup; opening rules remain best-effort and must fail-open to first_meaningful_message; lookback_hours must never widen canonical day persistence; official/provisional publish semantics remain resolver-owned; service must not hide behind service-managed provider labels; prompt preview must not mutate publish pointers; export remains its own workflow; CRM full-parity claim stays blocked until contract is pinned
- verification bar: unit-scoped backend/frontend/service tests plus targeted integration proof for any changed seam; no closeout claim stronger than the proof surface actually run
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: A -> B -> C -> D -> F -> G -> E (gate on CRM contract)
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Activation defaults + official_daily scheduler runtime | Local coordinator | backend chat_extractor/scheduler/config surfaces; frontend diagnostics only if contract changes | NONE | In Progress | Not Run | Not Integrated | None | Not Needed | Start here per governing plan |
| B | Operations UX / publish diagnostics parity | Local coordinator | backend operations/read APIs; frontend operations HTTP UX | A contract | Planned | Not Run | Not Integrated | None | Not Needed | Historical overwrite metadata currently looks partial |
| C | Service runtime env/provider/model contract | Local coordinator | service runtime/config/README; backend analysis runtime metadata | Bounded after A/B | Planned | Not Run | Not Integrated | None | Not Needed | Current runtime still uses heuristic_local + service-managed placeholders |
| D | Prompt profile workspace audit parity | Local coordinator | backend prompt identity/preview APIs; frontend configuration prompt workspace | C contract | Planned | Not Run | Not Integrated | None | Not Needed | Current UI contract outruns backend payload shape |
| F | Layered reuse under publish contract | Local coordinator | backend execution/reuse planning and publish metadata | A/B/C stable | Planned | Not Run | Not Integrated | None | Not Needed | Current reuse summary is fresh-run only |
| G | Cross-view parity closure | Local coordinator | frontend query/export/compare wiring; backend parity metadata if needed | A/B/D/F stable | Planned | Not Run | Not Integrated | None | Not Needed | Compare/export shell is present; final parity still needs proof |
| E | CRM mapping active seam | Local coordinator | backend CRM connector + queue; frontend CRM mapping | CRM contract pinned | Blocked | Not Run | Not Integrated | None | Not Needed | Must remain blocked until repo pins CRM contract |
```

## Acceptance Checks

Pending.

## Integration Notes

Pending.

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
