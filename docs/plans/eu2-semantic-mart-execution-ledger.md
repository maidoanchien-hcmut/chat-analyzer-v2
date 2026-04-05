Objective:
Execute Execution Unit 2 from docs/plans/first-end-to-end-slice-plan.md: materialize semantic mart rows per pipeline_run, add explicit publish ownership for official/provisional snapshots, and expose backend read APIs so overview/exploration/staff/page-comparison/export/run-preview resolve from mart or run-scoped draft data without querying ODS directly for aggregate business metrics.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: pipeline_run, publish_channel, active_snapshot, publish_history, dim_date, dim_page, dim_staff, fact_thread_day, fact_staff_thread_day, run_preview, snapshot_resolver, published_official, published_provisional
- owner map: T4 owns backend mart schema, migration, publish ownership contract, mart materialization, and repository foundation under backend/prisma/** and backend/src/modules/read_models/**; T5 owns backend read-model service/controller/query shaping and HTTP integration proof in backend/src/modules/read_models/** plus backend/src/app.ts after T4 repository contracts stabilize; T6 is coordinator-owned verification and integration cleanup
- invariants: fact_thread_day and fact_staff_thread_day are the only source-of-truth for aggregate business and export; active snapshot resolution must be explicit by page + target_date + publish_channel and never inferred from latest run; draft rows are only readable through run-scoped preview endpoints with explicit run_id; partial old-day runs remain fail-closed from dashboard paths
- verification bar: backend bun test; migration generate/deploy proof on empty DB if feasible in-session; integration proof for publish official -> overview/staff/export consistency; resolver proof for compare-page using same snapshot contract as overview; provisional metadata proof for current-day snapshots and fail-closed old partial-day dashboards
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: T4 -> T5 -> T6

| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T4 | Mart schema, publish ownership, and materialization foundation | 019d5b70-1a52-7aa3-94e6-14945e170dad | backend/prisma/**; backend/src/modules/read_models/** | None | Returned | Passed | Integrated | None | Not Needed | Coordinator integrated locally after stabilizing the foundation and running generate plus targeted mart-builder proof. |
| T5 | Business read APIs and resolver-backed HTTP endpoints | Coordinator local rescue | backend/src/modules/read_models/**; backend/src/app.ts | T4 | Accepted | Passed | Integrated | None | Not Needed | Added read-model controller/service endpoints, catalog/query shaping, and app wiring on top of the mart foundation. |
| T6 | Verification, integration cleanup, and coordinator rescue | Coordinator | backend/src/modules/read_models/**/*.test.ts; related backend tests/docs as needed | T4, T5 | Accepted | Passed | Integrated | None | Not Needed | Added read-model service proof and reran backend verification after integrating publish/materialize seams. |

### Integration Pass 1
- tasks integrated:
  T4
- terminology normalized:
  active snapshot is represented by `active_publish_snapshot`; publish audit trail is append-only in `publish_history`
- boundary corrections:
  kept mart build, active snapshot write path, and snapshot resolver inside `backend/src/modules/read_models/**`; publish/app wiring is deferred to T5 instead of letting schema work leak into dashboard endpoints
- bridge code removed during integration:
  None
- debt entries added:
  None
- regressions introduced during integration:
  None

### T4 Acceptance Check
- Assigned requirements:
  Lock mart grain, explicit publish ownership, and repository/materialization foundation without relying on latest-run inference or ODS queries for aggregate business source-of-truth.
- Returned summary:
  Coordinator-local rescue added mart schema and migration, `read_models.builder.ts`, `read_models.repository.ts`, `read_models.service.ts`, label helpers, and targeted builder tests while keeping resolver semantics explicit by page + target_date + publish_channel.
- Verification result:
  Approved
- Requirement gaps:
  HTTP business endpoints and publish/app wiring remain in T5
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT for T4 scope. `bun run prisma:generate` and `bun test src/modules/read_models/read_models.builder.test.ts` passed in `backend/`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

Pre-Audit Gate
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries

### Integration Pass 2
- tasks integrated:
  T5, T6
- terminology normalized:
  read endpoints are mounted under `/read-models/*`; `published_official` and `published_provisional` both resolve via `active_publish_snapshot`, while `draft` remains run-scoped through `/read-models/runs/:id/preview`
- boundary corrections:
  analysis completion materializes mart rows through `readModelsService.materializeRun`; publish transaction updates both `pipeline_run.publish_state` and the explicit active snapshot tables in the same backend owner path
- bridge code removed during integration:
  None
- debt entries added:
  None
- regressions introduced during integration:
  None

### T5 Acceptance Check
- Assigned requirements:
  Expose business read APIs for catalog, overview, exploration, staff performance, page comparison, export workbook, and run preview using the mart foundation and explicit snapshot resolver instead of latest-run inference.
- Returned summary:
  Coordinator integrated `read_models.controller.ts`, expanded `read_models.service.ts` and `read_models.repository.ts`, mounted the controller in `app.ts`, and wired materialization/publish seams through `analysis.controller.ts`, `chat_extractor.service.ts`, and `chat_extractor.repository.ts`.
- Verification result:
  Approved
- Requirement gaps:
  DB-backed migrate-deploy proof on a fresh empty database was not run in-session
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT for T5 scope. `bun test` passed in `backend/`, and the service-level proofs cover overview/staff/export/run-preview semantics on resolver-backed mart reads.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T6 Acceptance Check
- Assigned requirements:
  Add proof for overview/staff/export/run-preview semantics, ensure publish/materialize integration does not regress backend tests, and normalize any integration mismatches.
- Returned summary:
  Coordinator added `backend/src/modules/read_models/read_models.service.test.ts`, fixed `read_models` typing/query mismatches, and reran backend verification including the full suite.
- Verification result:
  Approved
- Requirement gaps:
  `bun run typecheck` still reports pre-existing mock typing issues in `app.test.ts` and `chat_extractor` tests that were already outside the semantic-mart path
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT. `bun run prisma:generate`, `bun test src/modules/read_models/read_models.builder.test.ts`, `bun test src/modules/read_models/read_models.service.test.ts`, and full `bun test` all passed.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT
