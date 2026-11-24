# Seed roadmap

Each row carries one claim label, and the label's evidence must exist before the row
ships as that label. A row never ships quieter than its evidence.

| Stage | Capability | Contract | Status |
| --- | --- | --- | --- |
| 1 | Contract modules: tool ID grammar, registry-entry and registry checks with rollback posture, fail-closed caller admission, agent-to-tool references across caller-parsed registry documents, run records with intent-time admission, in-process step resume with dry runs, failure classes, aborts and leases, provider validation, model alias resolution from a caller-held table | [tool-id](contracts/tool-id.md) · [run-model](contracts/run-model.md) · [provider](contracts/provider.md) | `implemented` (`0.8.0`) |
| 2 | Local inference endpoint (OpenAI-compatible surface, any backend) | [provider.md](contracts/provider.md) | `specified` |
| 3.1 | Durable run store: objectives, attempts, intents, receipts, and leases kept across a process restart | [run-model.md](contracts/run-model.md) | `specified` (the in-process resume and lease rules are `implemented` in stage 1) |
| 3.2 | Tool registry and connector bindings; effect classes; admitted-tools allowlists | [tool-id.md](contracts/tool-id.md) | `specified` |
| 3.3 | Owner gate for write/destructive/credential/egress effects; digest-bound decisions | [architecture.md](architecture.md) | `specified` |
| 4 | Workspace adoption: structured adapter guides, revision-checked verifications | [bloom-interop.md](bloom-interop.md) | `specified` (stage 1 portion `implemented`) |
| 5 | Deterministic verifier role and golden acceptance tasks | [charter.md](charter.md) | `planned` |
| 6 | Sandbox scopes for specialist effects | [charter.md](charter.md) | `planned` |

Rules the roadmap obeys:

1. Nothing is called "shipped" until its tests and receipts are on record in this
   repository (`AGENTS.md` claim discipline).
2. A stage may partially ship; the README and this table say which parts, by label.
3. Dates are not promised. Stages land when their verification lands.

## Capability mapping

How the staged roadmap maps to the family capability ledger (`docs/capabilities/index.json` and the hub timeline in `Vidoxlabs/docs`):

| Stage | Capabilities | Role in `seed` |
| --- | --- | --- |
| 3.1 | [CAP-13](capabilities/CAP-13-durable-run-store-conformance.md) | Durable run store interface, conformance suite, and in-memory reference (builds on [CAP-12](capabilities/CAP-12-step-graph-checkpoints-interrupts.md)) |
| 3.2 | [CAP-03](capabilities/CAP-03-typed-tool-input-output.md), [CAP-06](capabilities/CAP-06-tool-call-approval-decisions.md) | Typed tool input/output schemas and registry/gate admission metadata |
| 3.3 | [CAP-06](capabilities/CAP-06-tool-call-approval-decisions.md), CAP-07 | Digest-bound owner-gate decision record (`CAP-06.1` at `M3`), including plan-digest binding folded from `CAP-07` (`aestivation`), plus deferred pause/resume and runtime gate wiring (`CAP-06.2` to `CAP-06.4` at `M4`) |
| 5 | CAP-14 | Golden acceptance tasks and deterministic evaluators (`CAP-14`, led by `bloom`), with `CAP-14.1` providing scripted and function model test doubles in `seed` |
| 6 | [CAP-17](capabilities/CAP-17-sandbox-scopes.md) | Per-run sandbox scopes and default-off shell policy |

Stage 1 provides the implemented floor referenced across capabilities, and [CAP-16](capabilities/CAP-16-provider-conformance-model-profiles.md) extends [provider.md](contracts/provider.md) with offline conformance fixtures and model profiles alongside Stage 2.
