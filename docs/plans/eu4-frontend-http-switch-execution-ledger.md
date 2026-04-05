Objective:
Execute Execution Unit 4 from docs/plans/first-end-to-end-slice-plan.md: switch frontend business views to the real HTTP adapter by default so runtime no longer depends on demo business fixtures for overview, exploration, staff, thread history, page comparison, or export.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: http_business_adapter, business_catalog, published_snapshot, thread_history_http, export_workflow, adapter_matrix
- owner map: Coordinator owns frontend/src/adapters/http/**, frontend/src/app/**, frontend/src/core/config.ts, and README/doc touchpoints needed to reflect the runtime switch
- invariants: frontend business runtime must go through backend HTTP only; demo business adapter may remain for tests/local prompt preview only; export remains an explicit workflow, not an inline per-view side effect
- verification bar: frontend bun run typecheck, bun test, bun run build; smoke proof must show /read-models/* requests rather than demo fixture calls for business views
- debt register path: docs/plans/first-end-to-end-slice-debt.md

| Task ID | Task Name | Owner | Write Scope | Status | Proof Status | Integration Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T10 | Default HTTP business adapter | Coordinator | frontend/src/adapters/http/business-adapter.ts; frontend/src/app/frontend-app.ts | Completed | Passed | Integrated | Runtime business views now use /read-models/* by default. |
| T11 | Adapter matrix and docs normalization | Coordinator | frontend/src/core/config.ts; README.md; backend/README.md | Completed | Passed | Integrated | UI/source docs now reflect HTTP-first business runtime. |

Verification:
- `cd D:\\Code\\chat-analyzer-v2\\frontend && bun run typecheck`
- `cd D:\\Code\\chat-analyzer-v2\\frontend && bun test`
- `cd D:\\Code\\chat-analyzer-v2\\frontend && bun run build`
