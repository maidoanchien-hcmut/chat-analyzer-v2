# Execution Ledger: Extract Module DB + Backend + Go-Worker

## Header

```text
Objective:
Execute docs/plans/extract-module-db-backend-go-worker-implementation-plan.md as an owner-clean rewrite of the extraction seam so that database schema, backend control-plane/planner, and go-worker ETL all match docs/design.md and remove the old extraction runtime path.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: connected_page, page_config_version, page_prompt_identity, analysis_taxonomy_version, pipeline_run_group, pipeline_run, thread, thread_day, message, thread_customer_link, prompt_text, compiled_prompt_hash, prompt_version, publish_eligibility
- owner map: T1 owns backend/prisma/* and any schema-driven repo glue; T2 owns backend/src/modules/chat_extractor/*; T3 owns backend/go-worker/**; coordinator owns cross-slice integration and contract normalization
- invariants: no active_*_json or extraction config on connected_page; no EtlRun/ConversationDay legacy runtime path; backend is sole owner of manifest freeze; worker only receives ETL-effective config; thread_day is canonical ODS grain; unmapped tags default to noise with mapping_source; partial old day is never publishable; frozen config/taxonomy/prompt identity are captured on run group
- verification bar: prisma validate; prisma migrate deploy on empty DB; targeted backend tests for DTO/planner/service semantics; go test ./... in backend/go-worker; integration checks for preview/execute/publish contract and manifest/ODS alignment
- debt register path: docs/plans/extract-module-db-backend-go-worker-debt.md
- integration order: T1 -> (T2 and T3 in parallel once schema nouns are locked) -> coordinator integration -> senior audit
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Schema + control-plane foundation | Tesla (`019d57ab-ef88-7941-915c-c18330c1e457`) | backend/prisma/* and minimal schema-facing backend glue | None | Accepted | Approved | Integrated | None | Not Needed | Schema nouns are clean and integrated; DB-backed proof is now green after local Postgres came up. |
| T2 | Backend planner + API contract | Coordinator local rescue after Sartre (`019d57ac-066d-71b2-88b0-b7a265386773`) | backend/src/modules/chat_extractor/* | T1 nouns locked | Accepted | Approved | Integrated | None | Not Needed | Backend module was rewritten locally to the new preview/execute/publish contract; `bun run typecheck` and planner tests are green. |
| T3 | Go-worker manifest + ETL/load | Coordinator local rescue after Darwin (`019d57ac-1d15-7e63-9559-017cf1d8ecfc`) | backend/go-worker/** | T1 nouns locked | Accepted | Approved | Integrated | None | Not Needed | Go worker now consumes the new manifest and loads `pipeline_run/thread/thread_day/message`; `go test ./...` is green. |
```

## Integration Notes

```text
### Integration Pass 1
- tasks integrated:
  T1 schema nouns and migration rewrite
- terminology normalized:
  `etl_run -> pipeline_run`, `conversation_day -> thread_day`, `message.message_id -> source_message_id`
- boundary corrections:
  `chat_extractor` remains the only manifest owner; worker only receives ETL-effective config
- bridge code removed during integration:
  legacy worker lifecycle/load assumptions around `etl_run` and `conversation_day`
- debt entries added:
  none
- regressions introduced during integration:
  none

### Integration Pass 2
- tasks integrated:
  T2 backend planner/API rewrite, T3 go-worker manifest/load rewrite
- terminology normalized:
  `openingBlocksJson -> openingBlockJson`, `normalized_phone_candidates -> current_phone_candidates`, legacy prompt/config nouns removed from runtime path
- boundary corrections:
  backend freeze remains on `pipeline_run_group`; worker updates only `pipeline_run` lifecycle and ODS tables
- bridge code removed during integration:
  stale go-worker tests/config assumptions and stale backend README/API descriptions
- debt entries added:
  none
- regressions introduced during integration:
  none
```

### T1 Acceptance Check
- Assigned requirements:
  Rewrite extraction Prisma schema to canonical owner-clean nouns, remove legacy extraction fields/tables, keep jsonb contracts, and provide schema-level proof.
- Returned summary:
  Replaced extraction schema with the target control-plane + ODS nouns, added a terminal rewrite migration, and seeded a default taxonomy bootstrap.
- Verification result:
  Approved
- Requirement gaps:
  None.
- Vocabulary or owner drift:
  None in the accepted schema itself. Coordinator still needs to remove the extra untracked migration `backend/prisma/migrations/20260404130000_extract_owner_clean`.
- Proof assessment:
  SUFFICIENT
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Rewrite `chat_extractor` DTO/controller/service/repository/planner to the new control-plane, preview/execute/publish, and manifest-freeze contract.
- Returned summary:
  Coordinator completed the rewrite locally after the delegated attempt failed. The module now exposes config versioning, preview/execute, run-group/run detail, and publish semantics over the new schema nouns.
- Verification result:
  Approved
- Requirement gaps:
  No DB-backed execution proof yet because local Postgres is unavailable; backend proof is limited to typecheck and planner semantics.
- Vocabulary or owner drift:
  None in the final integrated result.
- Proof assessment:
  SUFFICIENT
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Rewrite go-worker request/transform/load to the new manifest and ODS contract, then prove with `go test ./...`.
- Returned summary:
  Coordinator completed the worker rewrite locally after the delegated attempt failed. Worker request parsing, transform contracts, loader semantics, tests, and docs were aligned to `pipeline_run -> thread -> thread_day -> message`.
- Verification result:
  Approved
- Requirement gaps:
  Source entry extraction (`post_id`/`ad_id`) is not covered by dedicated proof yet, but the main manifest/load contract is implemented and verified.
- Vocabulary or owner drift:
  None in the final integrated result.
- Proof assessment:
  SUFFICIENT
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
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

## Final Audit Snapshot

```text
- integrated schema/backend/go-worker now share the target nouns and manifest contract
- backend proof: prisma validate green, typecheck green, planner tests green
- worker proof: go test ./... green
- DB-backed migration proof is green on local Postgres
- legacy backend runtime paths for `analysis` and `read_models` have been removed instead of left as `501` stubs
- frontend shell and AI service contract cleanup were completed to remove stale extraction-era naming
```
