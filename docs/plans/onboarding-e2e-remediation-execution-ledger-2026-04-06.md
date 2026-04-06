# Onboarding E2E Remediation Execution Ledger

## Header

```text
Objective:
Execute docs/plans/onboarding-e2e-remediation-plan.md faithfully so operator can complete the onboarding lane from token -> page -> sample -> editable draft -> activate, while preserving the lazy-operator path and service-owned provider/runtime boundaries.

Coordinator:
Codex (GPT-5)

Objective Card:
- canonical nouns: onboarding workspace draft, connected page lane, runtime sample preview, sample suggestion seed, page-local prompt, activation-safe defaults, business timezone, scheduler timezone, service runtime env
- owner map: frontend owns workspace draft/state/layout and sample-to-draft hydration; backend owns register/sample/default-config/timezone validation contracts; service owns runtime provider env contract and runbook; coordinator owns integration, vocabulary lock, ledger, and per-task acceptance
- invariants: single-company only; lazy operator can activate after token -> page; non-lazy operator keeps one continuous workspace draft; connected_page remains the page boundary; runtime sample never publishes or mutates publish pointer; unmapped tags default to noise; opening rules remain optional; persisted business_timezone and scheduler.timezone are valid IANA strings; provider/model/api key stay service-owned runtime env
- verification bar: frontend targeted bun tests plus frontend build proof; backend targeted bun tests for chat_extractor; service targeted uv run pytest for config/runtime contract; final integration verification against the plan acceptance checklist
- debt register path: docs/plans/onboarding-e2e-remediation-debt.md
- integration order: T1 -> T2 -> T3 -> T4 -> T5
```

## Task Table

```text
| Task ID | Task Name | Owner Sub-Agent | Write Scope | Depends On | Status | Proof Status | Integration Status | Bridge Code Status | Debt Registration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | EU A: frontend workspace draft and compact lane layout | Codex coordinator (local after worker shutdown) | frontend/src/app/frontend-app.ts; frontend/src/app/screen-state.ts; frontend/src/features/configuration/render.ts; frontend/src/features/configuration/state.ts; frontend tests | NONE | Accepted | Passed | Integrated | None | Not Needed | Initial worker `019d61ed-07c2-7480-b068-2a40a05cd3c3` was shut down after no useful return; execution continued locally to protect the critical path. |
| T2 | EU B: runtime sample seed into editable draft | Codex coordinator (local) | frontend/src/features/configuration/render.ts; frontend/src/features/configuration/state.ts; frontend/src/app/frontend-app.ts; frontend tests; optional frontend/src/adapters/contracts.ts | T1 | Accepted | Passed | Integrated | None | Not Needed | Sample preview now seeds editable tag/opening suggestions into the shared draft while preserving operator overrides. |
| T3 | EU C: backend onboarding/register/sample contract support | Worker `019d6209-bf05-7f33-8fec-ca6788e603e4` reviewed and accepted by coordinator | backend/src/modules/chat_extractor/chat_extractor.types.ts; backend/src/modules/chat_extractor/chat_extractor.controller.ts; backend/src/modules/chat_extractor/chat_extractor.service.ts; backend tests | T2 | Accepted | Passed | Integrated | None | Not Needed | Tightened scheduler timezone validation and added proof for register/onboarding sample contracts without widening backend ownership. |
| T4 | EU D: timezone IANA contract | Codex coordinator (local) | frontend configuration state/render/tests; optional backend validation tests | T3 | Accepted | Passed | Integrated | None | Not Needed | Frontend now uses one shared timezone catalog for onboarding and scheduler, while surfacing `Asia/Saigon` only as a legacy alias when already present. |
| T5 | EU E: service live runtime env and runbook | Worker `019d6209-c112-7141-86d1-e2388b6e76b0` | service/config.py; service/README.md; service/.env.example; service tests | T4 | Planned | Not Run | Not Integrated | None | Not Needed | Keep provider/runtime config fully service-owned and fail-closed. |
```

## Acceptance Checks

### T1 Acceptance Check
- Assigned requirements:
  Create one owner-clean frontend workspace draft for onboarding plus page configuration, remove cross-form DOM source-of-truth behavior, keep lazy and existing-page lanes, and prove token persistence plus sample cap propagation in targeted frontend proof.
- Returned summary:
  `ConfigurationState` now stores a single `workspace` draft covering token, selected page, timezone, caps, flags, and editable config state; render and controller logic read/write that draft; targeted frontend tests were rewritten to assert the shared workspace contract.
- Verification result:
  Approved
- Requirement gaps:
  NONE
- Vocabulary or owner drift:
  NONE
- Proof assessment:
  SUFFICIENT. `bun test ./src/app/frontend-app.test.ts ./src/features/configuration/state.test.ts` passed and `bun run build` passed in `frontend/`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T2 Acceptance Check
- Assigned requirements:
  Seed onboarding runtime sample into editable draft state, preserve operator overrides on repeated sampling, and keep empty samples fail-safe.
- Returned summary:
  Added frontend merge helpers that convert onboarding sample observed tags and explicit opening signals into editable draft rows, seed them during onboarding sample load, and surface a seed summary in the configuration workspace.
- Verification result:
  Approved
- Requirement gaps:
  NONE
- Vocabulary or owner drift:
  NONE
- Proof assessment:
  SUFFICIENT. Added targeted seed precedence tests and reran `bun test ./src/app/frontend-app.test.ts ./src/features/configuration/state.test.ts` plus `bun run build` in `frontend/`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T3 Acceptance Check
- Assigned requirements:
  Keep lazy-path register semantics intact, preserve runtime-only onboarding sample preview, propagate custom sample caps, and enforce the timezone IANA contract at backend request boundaries.
- Returned summary:
  Tightened `scheduler_json.timezone` normalization to parse strictly as IANA instead of silently falling back, and added controller/service proof that register forwards onboarding draft fields and onboarding sample preview overrides scheduler timezone/caps only at runtime.
- Verification result:
  Approved
- Requirement gaps:
  NONE
- Vocabulary or owner drift:
  NONE
- Proof assessment:
  SUFFICIENT. Coordinator reran `bun test ./src/modules/chat_extractor/chat_extractor.controller.test.ts ./src/modules/chat_extractor/chat_extractor.service.test.ts` in `backend/` and confirmed `20 pass, 0 fail`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

### T4 Acceptance Check
- Assigned requirements:
  Use one owner-clean frontend timezone catalog for onboarding and scheduler, keep persisted values as IANA strings, and surface any legacy alias distinctly instead of treating it as the curated standard.
- Returned summary:
  Added a shared frontend timezone option catalog, switched scheduler timezone from free-text/datalist to the same select-based source used by onboarding, and label `Asia/Saigon` explicitly as a legacy alias only when it already exists in draft/page state.
- Verification result:
  Approved
- Requirement gaps:
  NONE
- Vocabulary or owner drift:
  NONE
- Proof assessment:
  SUFFICIENT. `bun test ./src/features/configuration/state.test.ts ./src/app/frontend-app.test.ts` passed and `bun run build` passed in `frontend/`.
- Bridge code assessment:
  NONE
- Debt registration check:
  NOT NEEDED
- Coordinator disposition:
  ACCEPT

## Integration Notes

### Integration Pass 1
- tasks integrated: T1
- terminology normalized:
  `onboarding` form state and configuration editor state now converge under `configuration.workspace`
- boundary corrections:
  Removed frontend dependence on cross-form `querySelector` state syncing as the source of truth for onboarding/configuration actions
- bridge code removed during integration:
  NONE
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE

### Integration Pass 2
- tasks integrated: T2
- terminology normalized:
  `sample preview` remains runtime observation; `seeded draft` is the editable workspace state populated from that preview
- boundary corrections:
  Sample suggestions now flow into the shared draft instead of remaining read-only in a separate panel
- bridge code removed during integration:
  NONE
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE

### Integration Pass 3
- tasks integrated: T3
- terminology normalized:
  Backend keeps `business_timezone` and `scheduler_json.timezone` as the IANA contract; onboarding sample remains a runtime preview rather than a persisted config mutation
- boundary corrections:
  Validation is enforced at backend request normalization instead of relying on frontend-only discipline
- bridge code removed during integration:
  NONE
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE

### Integration Pass 4
- tasks integrated: T4
- terminology normalized:
  Frontend timezone selection now distinguishes `curated IANA catalog` from `legacy alias currently stored`
- boundary corrections:
  Scheduler timezone no longer accepts ad hoc free-text separate from the onboarding timezone catalog
- bridge code removed during integration:
  Removed the scheduler datalist/free-text seam in favor of the shared select catalog
- debt entries added:
  NONE
- regressions introduced during integration:
  NONE


## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
