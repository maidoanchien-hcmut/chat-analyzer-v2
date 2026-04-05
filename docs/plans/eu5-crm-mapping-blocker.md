Objective:
Assess Execution Unit 5 from docs/plans/first-end-to-end-slice-plan.md and determine whether CRM linking/mapping queue can be executed owner-clean in the current repo state.

Decision:
Blocked. EU5 must not be executed in this repo state.

Why Blocked:
- `docs/plans/first-end-to-end-slice-plan.md` explicitly says EU5 only executes after the real CRM contract is pinned.
- The repo contains local persistence seams only:
  - `thread_customer_link`
  - `thread_customer_link_decision`
- The repo does not pin the external CRM boundary needed to make mapping actions real:
  - transport/API endpoint to CRM
  - deterministic lookup rules
  - write-back/update semantics
  - approval/remap side effects
- `docs/design.md` and `docs/plans/first-end-to-end-slice-plan.md` both treat CRM as a gated seam, not something the executor may invent.

Evidence:
- [docs/plans/first-end-to-end-slice-plan.md](/D:/Code/chat-analyzer-v2/docs/plans/first-end-to-end-slice-plan.md)
  - Q1 says the repo does not yet contain a clear CRM contract/API/schema.
  - EU5 says to stop if the CRM contract is not pinned.
- [docs/design.md](/D:/Code/chat-analyzer-v2/docs/design.md)
  - defines local tables for current link + decision audit, but not the external CRM connector contract.

Accepted Scope Instead:
- EU3 keeps CRM in thread workspace as read-only local state.
- Frontend hides mapping queue actions from runtime.
- Operations view now states CRM actionability remains gated.

Unblock Requirements:
1. Pin CRM transport and auth boundary in repo docs.
2. Pin deterministic lookup inputs and matching rules.
3. Pin write-back/update semantics and failure handling.
4. Add a stub/testable CRM connector seam before opening UI actions.

Verification:
- Local repo inspection only; no online search used.
