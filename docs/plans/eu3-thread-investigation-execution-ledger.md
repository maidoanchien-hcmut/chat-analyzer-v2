Objective:
Execute Execution Unit 3 from docs/plans/first-end-to-end-slice-plan.md: replace thread history and operations business details with real backend read APIs so thread investigation, audit AI, run detail, and health summary read persisted run/thread data instead of fixtures or static placeholders.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: thread_workspace, thread_list, thread_day_history, ai_audit, crm_link_local_state, run_group_detail, run_detail, health_summary, analysis_metrics, publish_warning
- owner map: T7 owns backend thread investigation and operations payloads under backend/src/modules/read_models/** plus minimal seams in chat_extractor if run detail needs richer metadata; T8 owns frontend HTTP adapter and thread/operations render-state wiring under frontend/src/adapters/**, frontend/src/app/**, and affected feature render/state files; T9 is coordinator-owned verification and integration cleanup
- invariants: thread list grain is thread across the selected slice; audit data must come from persisted analysis_result/analysis_run rows of the resolved snapshot; CRM tab remains read-only local state only; run detail must expose ETL counts plus analysis/mart/publish diagnostics without frontend joining raw payloads
- verification bar: backend bun test including thread workspace payload proof; frontend bun test/build/typecheck for thread history and operations HTTP wiring; no demo adapter runtime path for thread history in scope
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: T7 -> T8 -> T9

| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T7 | Backend thread workspace and operations payloads | Coordinator local rescue | backend/src/modules/read_models/**; backend/src/modules/chat_extractor/** if needed | None | Completed | Passed | Integrated | None | Not Needed | Added thread-history + health read APIs and enriched run detail diagnostics. |
| T8 | Frontend thread history and operations HTTP wiring | Coordinator local rescue | frontend/src/adapters/**; frontend/src/app/**; frontend/src/features/thread-history/**; frontend/src/features/operations/** | T7 | Completed | Passed | Integrated | None | Not Needed | Thread history and operations now consume owner-shaped HTTP payloads; CRM action path stays gated/read-only. |
| T9 | Verification and integration cleanup | Coordinator | tests/docs touched by T7 or T8 | T7, T8 | Completed | Passed | Integrated | None | Not Needed | `backend`: `bun test`; `frontend`: `bun run typecheck`, `bun test`, `bun run build`. |

Pre-Audit Gate
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
