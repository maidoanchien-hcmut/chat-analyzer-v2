## Header

```text
Objective:
Execute the next unblocked owner-clean slices from docs/plans/full-app-completion-plan.md with a subagent-driven workflow. Current ledger scope covers Execution Unit C plus the backend runtime-metadata alignment it directly depended on, and now extends to Execution Unit D for the prompt profile workspace/audit seam. Execution Units A/B/F/G/E remain governed by the plan and stay out of scope unless required for integration safety.

Coordinator:
Codex main agent

Objective Card:
- canonical nouns: connected page, active config snapshot, official_daily, publish resolver, runtime mode, provider adapter, effective prompt text, system prompt version, taxonomy version, runtime metadata, deterministic dev mode
- owner map: service/ owns provider/env/model routing, prompt compiler, adapter contract, and runtime metadata production; backend/src/modules/analysis/** owns runtime snapshot persistence and service metadata alignment; docs/README scope only for the touched modules
- invariants: service stays framework-neutral and DB-blind; live provider mode must fail closed when required env is missing; deterministic mode remains explicit dev/test-only; live analysis and preview-capable paths must share the same prompt compiler/adapter contract; runtime metadata must expose provider/model/system prompt/effective prompt hash/generation config without relying on the ambiguous label service-managed
- verification bar: service unit tests for config validation and prompt/compiler behavior, backend analysis tests for runtime metadata persistence/alignment, targeted README updates, and fresh proof runs for touched suites
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: T1 then T2, then coordinator verification and integration notes

Objective Card Addendum - EU D:
- canonical nouns: prompt profile workspace, preview sample scope, sample scope identity, prompt preview artifact, selected sample conversation, draft prompt, active prompt baseline, page prompt identity, preview comparison, preview runtime metadata
- owner map: backend/src/modules/chat_extractor/** owns connected-page sample workspace preview, prompt preview artifact persistence/reuse, and HTTP seam; backend/prisma/schema.prisma owns preview artifact storage; backend/go-worker runtime-only preview owns sample message payload expansion needed for AI preview; frontend/src/features/configuration/** plus frontend/src/app/frontend-app.ts and frontend/src/adapters/** own prompt workspace state/render/actions only
- invariants: preview must not mutate publish pointers, pipeline runs, or active config; prompt UI remains plain-text business-facing; prompt version reuse remains content-identity-based; preview compare must run against the same sample scope identity; preview inference must use the same analysis client/runtime contract as live analysis; old config-version compare affordances must not masquerade as true runtime preview evidence
- verification bar: backend controller/service/repository tests for sample workspace + preview artifact reuse, targeted frontend tests for prompt workspace rendering/state/adapter wiring, and fresh proof runs for touched backend/frontend suites
- debt register path: docs/plans/first-end-to-end-slice-debt.md
- integration order: T3 then T4, then coordinator integration and senior audit
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Service runtime provider contract | Avicenna (`019d60cb-2367-7f93-94e9-357689b18abc`) | service/config.py, service/analysis_executor.py, service/analysis_models.py, service/main.py, service/tests/test_executor.py, service/README.md | NONE | Accepted | Passed | Reworked During Integration | None | Not Needed | Subagent returned partial patch; coordinator completed wiring, tests, and README locally |
| T2 | Backend analysis runtime metadata alignment | Ramanujan (`019d60cb-3867-7f71-a733-17b64a17b211`) | backend/src/modules/analysis/** | T1 contract | Accepted | Passed | Reworked During Integration | None | Not Needed | Subagent drifted outside write scope; coordinator completed analysis-only alignment locally |
| T3 | Backend prompt preview workspace and artifact seam | Herschel (`019d612b-1dfa-7b92-8376-4468b2c5765d`) | backend/src/modules/chat_extractor/** | T2 contract | Accepted | Passed | Reworked During Integration | None | Not Needed | Subagent converged on the right owner-clean contract but stopped mid-patch; coordinator finished the service/controller/repository integration locally |
| T4 | Frontend prompt profile workspace wiring | Faraday (`019d612b-37a3-7793-8dc2-259dcdf707d1`) | frontend/src/features/configuration/**, frontend/src/app/frontend-app.ts, frontend/src/app/screen-state.ts, frontend/src/adapters/** | T3 HTTP contract | Accepted | Passed | Reworked During Integration | None | Not Needed | Subagent converged on the right freshness semantics but stopped mid-patch; coordinator finished adapter/state/render/test alignment locally |
```

### T1 Acceptance Check
- Assigned requirements:
  Explicit deterministic/live runtime contract in `service/`, shared prompt compiler/adapter contract, fail-closed live mode, richer runtime metadata, and proof on service tests.
- Returned summary:
  Partial subagent patch expanded `service/config.py`, `service/analysis_models.py`, and `service/analysis_executor.py` but left `service/main.py`, tests, and README incomplete.
- Verification result:
  Approved
- Requirement gaps:
  None after coordinator integration.
- Vocabulary or owner drift:
  Corrected runtime naming to `openai_compatible_live` and kept service ownership limited to provider/env/model routing plus metadata generation.
- Proof assessment:
  SUFFICIENT. `uv run pytest tests/test_executor.py` passed (7 tests). `uv run python -` import smoke for `main.py` passed.
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Align backend analysis audit trail with returned service runtime metadata without introducing a second provider source of truth in backend.
- Returned summary:
  Subagent did not land a usable `backend/src/modules/analysis/**` patch; coordinator completed the alignment locally.
- Verification result:
  Approved
- Requirement gaps:
  None for the current slice.
- Vocabulary or owner drift:
  Replaced ambiguous `model_name` wording in backend-owned snapshot metadata with `requested_model_name`, and updated `analysis_run.modelName` from service metadata instead of a backend-owned provider choice.
- Proof assessment:
  SUFFICIENT. `bun test src/modules/analysis/analysis.service.test.ts` passed (4 tests).
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Make prompt preview artifacts provenance-safe on the backend, narrow the preview request seam to a server-owned sample workspace identity, and ensure artifact serialization uses persisted taxonomy provenance instead of current page state.
- Returned summary:
  Subagent narrowed the backend contract toward `sampleWorkspaceKey` and taxonomy-fidelity reads but stopped with a partial, unverified patch.
- Verification result:
  Approved after coordinator integration.
- Requirement gaps:
  None for the current slice.
- Vocabulary or owner drift:
  Kept `sample workspace` as a backend-owned preview seam inside `chat_extractor` and avoided leaking prompt preview ownership into `analysis` or `pipeline_run`.
- Proof assessment:
  SUFFICIENT. `bun test src/modules/chat_extractor/chat_extractor.service.test.ts src/modules/chat_extractor/chat_extractor.controller.test.ts src/modules/chat_extractor/chat_extractor.repository.test.ts` passed (21 tests), including unknown/stale workspace rejection and persisted taxonomy metadata coverage.
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

### T4 Acceptance Check
- Assigned requirements:
  Update frontend prompt-profile wiring to the narrowed backend contract and prevent stale runtime preview evidence from presenting as current after draft or sample-driving config changes.
- Returned summary:
  Subagent added the right freshness fingerprint shape and warning semantics but stopped with a partial, unverified patch.
- Verification result:
  Approved after coordinator integration.
- Requirement gaps:
  None for the current slice.
- Vocabulary or owner drift:
  Preserved the separation between saved prompt-version compare and runtime preview evidence; kept frontend limited to adapter/state/render semantics.
- Proof assessment:
  SUFFICIENT. `bun test src/features/configuration/state.test.ts` passed (15 tests), including prompt workspace fingerprint drift, prompt preview comparison drift, and stale-warning render coverage.
- Bridge code assessment:
  None
- Debt registration check:
  Not Needed
- Coordinator disposition:
  ACCEPT

## Integration Notes

```text
### Integration Pass 1
- tasks integrated: T1, T2
- terminology normalized:
  `openai_compatible_live` kept as the live runtime mode name; backend audit wording changed from `model_name` to `requested_model_name` for backend-owned request metadata
- boundary corrections:
  backend README edits were intentionally excluded because unrelated parallel changes were already in progress there
- bridge code removed during integration:
  partial subagent state that left `service/main.py` on deterministic-only wiring
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE

### Integration Pass 2
- tasks integrated: T2
- terminology normalized:
  NONE
- boundary corrections:
  Senior audit found that analysis-run reuse was still keyed before current service runtime metadata was known; coordinator added a zero-bundle preflight to derive the effective service prompt hash/model before reuse decisions
- bridge code removed during integration:
  NONE
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE known after targeted re-proof; follow-up senior re-audit was blocked by subagent usage limits

### Integration Pass 3
- tasks integrated: T3, T4
- terminology normalized:
  `sampleWorkspaceKey` kept as the server-owned sample workspace identity; frontend freshness state names normalized to `promptWorkspaceSampleFingerprint` and `promptPreviewComparisonFingerprint`
- boundary corrections:
  Prior senior audit found that backend still trusted client-posted sample conversation payloads, frontend kept stale preview evidence live after draft edits, and artifact fetches drifted to current taxonomy metadata. Coordinator narrowed the HTTP contract to `draftPromptText + sampleWorkspaceKey + selectedConversationId`, resolved conversations from a backend-owned workspace store, serialized artifact taxonomy from persisted provenance, and added frontend stale-warning/invalidation semantics.
- bridge code removed during integration:
  Partial worker patches that mixed old `sampleConversation` request semantics with the narrowed owner-clean contract
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE known after targeted re-proof
```

## Senior Audit Disposition

```text
- auditor: Bohr (`019d6137-0465-7112-8850-205e59b290bd`)
- scope: EU D audit-fix touched paths only
- result: No material findings
- residual risks:
  - prompt workspace sample ownership currently uses an in-memory 30-minute TTL store, so stale-key rejection is expected across backend restart or multi-instance drift
  - proof remains targeted to backend `chat_extractor` and frontend prompt-configuration suites; no repo-wide typecheck/build or browser-level end-to-end flow was rerun in this round
- coordinator closeout note:
  EU D is accepted only on its targeted owner boundaries. This does not imply whole-repo green status.
```

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
