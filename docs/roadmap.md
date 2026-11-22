# Seed roadmap

Each row carries one claim label, and the label's evidence must exist before the row
ships as that label. A row never ships quieter than its evidence.

| Stage | Capability | Contract | Status |
| --- | --- | --- | --- |
| 1 | Contract modules: tool ID grammar, registry-entry and registry checks with rollback posture, run records with intent-time admission, provider validation | [tool-id](contracts/tool-id.md) · [run-model](contracts/run-model.md) · [provider](contracts/provider.md) | `implemented` (`0.2.0`) |
| 2 | Local inference endpoint (OpenAI-compatible surface, any backend) | [provider.md](contracts/provider.md) | `specified` |
| 3.1 | Durable run store: objectives, attempts, intents, receipts; restart without repeated effects | [run-model.md](contracts/run-model.md) | `specified` |
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
