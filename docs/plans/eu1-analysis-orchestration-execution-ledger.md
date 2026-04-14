Objective:
Execute Execution Unit 1 from docs/plans/first-end-to-end-slice-plan.md: rewrite the analysis service into an owner-clean runtime and add backend analysis orchestration so a loaded pipeline_run can call the service and persist analysis_run and analysis_result with retry/resume idempotency and full audit metadata.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: pipeline_run, analysis_run, analysis_result, thread_day, bundle freeze, runtime_snapshot, prompt_hash, prompt_version, taxonomy_version, evidence_hash, output_schema_version
- owner map: T1 owns service runtime; T2 owns backend analysis schema/repository/orchestration/controller wiring; T3 owns verification-focused backend/service tests and fixtures in files under backend/src/modules/analysis and service/tests if needed, without editing service runtime implementation files owned by T1
- invariants: backend owns orchestration, freeze snapshot, validation, persistence, retry/resume idempotency; service owns system prompt and never reads live DB; analysis_result uniqueness stays at (analysis_run_id, thread_day_id); journey_code and primary_need_code remain separate and revisit never becomes primary_need_code
- verification bar: service proof with uv run pytest; backend proof with bun test; integration proof for loaded pipeline_run -> analyze -> persisted results; retry/resume proof for no duplicate analysis_result and correct unit/cost aggregation
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: T1 -> T2 -> T3, with T3 allowed to begin after T1 contracts are stable enough to target

| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Service runtime rewrite | 019d59dd-2a9d-73f3-9e97-8882b4832ed3 | service/** | None | Accepted | Passed | Integrated | Removed Before Return | Not Needed | Subagent hit usage limit before final summary; coordinator verified and integrated the resulting owner-clean service rewrite locally. |
| T2 | Backend analysis orchestration and persistence | 019d59de-06e7-7c41-b27c-69f3f7c1f04e | backend/prisma/**; backend/src/modules/analysis/**; backend/src/app.ts | T1 | Accepted | Passed | Reworked During Integration | None | Not Needed | Worker returned schema/client foundation only; coordinator completed repository/service/controller wiring and normalized owner boundaries during integration. |
| T3 | Verification and integration fixtures | Coordinator local rescue | backend/src/modules/analysis/**/*.test.ts; service/tests/**; related README docs if needed | T1, T2 | Accepted | Passed | Integrated | None | Not Needed | Coordinator added backend analysis tests and chat_extractor ETL->AI proof, then ran backend/service verification. |

### Integration Pass 1
- tasks integrated: T1, T2, T3
- terminology normalized:
  `runtime_metadata_json` is persisted under `analysis_run.runtime_snapshot_json.service_runtime`, while backend-frozen prompt/config/taxonomy metadata remains under `backend_runtime`
- boundary corrections:
  completed `analysis.repository.ts` and `analysis.service.ts` locally after T2 returned only a partial foundation; kept orchestration inside `backend/src/modules/analysis/**` and left mart/read-model scope untouched
- bridge code removed during integration:
  legacy `service/analysis_runtime.py`
- debt entries added:
  None
- regressions introduced during integration:
  None

### T1 Acceptance Check
- Assigned requirements:
  Lock the backend/service contract for EU1 around internal `HTTP/JSON`, rewrite the service into owner-clean `pydantic models -> executor -> transport`, keep `journey_code` separate from `primary_need_code`, and fail closed on invalid output.
- Returned summary:
  No final summary because the subagent hit usage limit, but the workspace contained the intended T1 diff: new `service/analysis_models.py`, new `service/analysis_executor.py`, updated transport in `service/main.py`, tests, and removal of `service/analysis_runtime.py`.
- Verification result:
  Approved
- Requirement gaps:
  None after coordinator verification
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT. `uv run pytest` passed in `service/`.
- Bridge code assessment:
  REMOVED. The old heuristic runtime file is deleted and replaced by the executor path.
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Add backend analysis orchestration so a loaded `pipeline_run` can build frozen bundles, call the service over internal `HTTP/JSON`, persist `analysis_run`/`analysis_result` idempotently, and expose a backend seam to trigger and inspect the flow.
- Returned summary:
  Worker returned schema changes, migration, analysis artifacts/types/client foundation, and a partial repository, but orchestration/service/controller wiring and proof were incomplete.
- Verification result:
  Approved after rework
- Requirement gaps:
  repository/service/controller wiring was incomplete on return
- Vocabulary or owner drift:
  Minor drift into `chat_extractor.service.ts` and `app.ts`, kept because those are the correct integration seams for ETL->AI trigger and HTTP registration
- Proof assessment:
  SUFFICIENT after coordinator rescue. `bun test` passed in `backend/`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Prove vertical behaviors for service validation, backend retry/resume idempotency shape, and ETL->AI trigger wiring.
- Returned summary:
  Coordinator added `backend/src/modules/analysis/analysis.service.test.ts` and extended `backend/src/modules/chat_extractor/chat_extractor.service.test.ts`, while T1 had already added `service/tests/test_executor.py`.
- Verification result:
  Approved
- Requirement gaps:
  Full DB-backed migration-on-empty-database proof was not run in this session
- Vocabulary or owner drift:
  None
- Proof assessment:
  SUFFICIENT for code changes in session. `bun test` and `uv run pytest` both passed.
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
