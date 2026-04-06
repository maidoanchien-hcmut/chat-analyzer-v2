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
| T2 | EU B: runtime sample seed into editable draft | Codex coordinator (local) | frontend/src/features/configuration/render.ts; frontend/src/features/configuration/state.ts; frontend/src/app/frontend-app.ts; frontend tests; optional frontend/src/adapters/contracts.ts | T1 | In Progress | Not Run | Not Integrated | None | Not Needed | Preserve operator overrides while seeding suggestions from sample. |
| T3 | EU C: backend onboarding/register/sample contract support | Unassigned | backend/src/modules/chat_extractor/chat_extractor.types.ts; backend/src/modules/chat_extractor/chat_extractor.controller.ts; backend/src/modules/chat_extractor/chat_extractor.service.ts; backend tests | T2 | Planned | Not Run | Not Integrated | None | Not Needed | Only extend canonical seams needed by the frontend draft contract. |
| T4 | EU D: timezone IANA contract | Unassigned | frontend configuration state/render/tests; optional backend validation tests | T3 | Planned | Not Run | Not Integrated | None | Not Needed | Persist IANA only, business-friendly labels allowed. |
| T5 | EU E: service live runtime env and runbook | Unassigned | service/config.py; service/README.md; service/.env.example; service tests | T4 | Planned | Not Run | Not Integrated | None | Not Needed | Keep provider/runtime config fully service-owned and fail-closed. |
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

## Pre-Audit Gate

```text
- all execution tasks are either Accepted or explicitly Blocked with recorded reason
- every Accepted task has a completed Acceptance Check
- proof status is not unknown for any Accepted task
- bridge code is either removed or recorded in the debt register
- integrated result reflects the final naming and owner boundaries
```
