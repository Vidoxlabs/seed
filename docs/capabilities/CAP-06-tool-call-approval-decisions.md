# CAP-06: Tool-call approval decisions

- ID: `CAP-06`
- Title: Tool-call approval decisions
- Lead: `seed`
- Touches: `bloom`, `drosera`
- Horizon: `next`
- Milestone: `M4`
- CLI phase: `P4`
- Status: `proposed`
- Claim: `planned`
- Depends on: `CAP-03`, `CAP-04`

## Why

`docs/contracts/run-model.md` defines the `waiting_for_owner` status and rule 5 ("the gate binds to the digest"), and `docs/contracts/tool-id.md` defines `effect` classes and `ownerGate` / `thirdPartyEgress` flags. However, `seed` does not yet define the owner-gate decision record, which decision kinds are valid for each effect class, how owner edits or text responses return to a run, or how deferred pauses fail closed on resume.

## What it does

`CAP-06` specifies the digest-bound owner-gate decision contract in `seed`, metadata alignment in `drosera`, and the interactive approval flow and trace events in `bloom`:

1. **Owner-gate decision record**:
   ```
   { callId, toolId, argsDigest, decision, editedArgsDigest?, reason?, decidedAt }
   ```
   - `callId`: non-empty identifier matching the pending deferred call on the active attempt.
   - `toolId`: well-formed neutral tool ID matching the pending intent.
   - `argsDigest`: 64-hex SHA-256 digest of the canonical pending arguments. Any change to `toolId` or `argsDigest` voids the decision (`run-model.md` rule 5).
   - `decision`: one of `"approve"`, `"edit"`, `"reject"`, or `"respond"`.
   - `editedArgsDigest`: required 64-hex SHA-256 digest when `decision === "edit"`, refused on all other decision kinds.
   - `reason`: optional non-empty string explaining a rejection or holding the owner's reply text for `"respond"`.
   - `decidedAt`: ISO-8601 UTC timestamp string recording when the owner decided.
2. **Effect and third-party egress allowances**:
   - `read` tools with `thirdPartyEgress: false` run freely inside the attempt's admitted `allowedTools` and declared sandbox scopes without pausing (`ownerGate` false).
   - `write` tools allow all four decisions: `approve`, `edit`, `reject`, and `respond`.
   - `destructive` and `credential` tools allow `approve`, `edit`, and `reject`, and **disallow `respond`**: an owner reply cannot stand in for or spoof a destructive or credential action.
   - Any tool with `thirdPartyEgress: true` always pauses at the owner gate (`ownerGate: true`), even when its `effect` is `read`.
3. **Handling `edit` and `respond`**:
   - On `edit`, the owner-supplied replacement arguments are validated against the tool's `inputSchema` (`CAP-03`) before execution, a new intent is recorded with `editedArgsDigest`, the original `argsDigest` remains linked on the decision record, and the model is explicitly informed that owner-edited replacement arguments executed.
   - On `respond`, the tool is not executed; the owner's text is delivered back to the model explicitly labeled as owner input rather than tool output.
   - On `reject`, the tool does not execute and the run records the denial (`gate-denied` when halting a step, or explicit refusal feedback per objective policy).
4. **Deferred calls and fail-closed resume**:
   - A run entering `waiting_for_owner` records typed deferred calls across three pause kinds: `approval` (gated tool call), `question` (clarification request to the owner), and `external` (external callback or asynchronous handoff awaited outside the process).
   - Transitioning from `waiting_for_owner` back to `running` fails closed unless every pending deferred call has a matching, valid decision record bound to its exact `callId`, `toolId`, and `argsDigest` (and obeying the effect/egress decision table). Missing, mismatched, or stale decisions keep the run paused or move it to `stopping`.

## Contract touchpoints

- `seed`: `docs/contracts/run-model.md` (owner-gate decision record shape, deferred call kinds `approval`/`question`/`external`, fail-closed resume rule); `docs/contracts/tool-id.md` (effect and `thirdPartyEgress` decision allowances, mandatory `ownerGate` on third-party egress).
- `drosera`: `docs/contracts/tools.md` (face metadata alignment for `ownerGate`, `effect`, and `thirdPartyEgress`).
- `bloom`: `docs/architecture.md` (owner prompt/UI decision flow, `edit` re-validation and model notice, `respond` owner-input labeling, permission events).

## Tool IDs and events

### Tool IDs

None defined by this capability.

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |

### Events

| Event | Emitter | Payload summary |
| --- | --- | --- |
| `permission.requested` | `bloom` | Emitted when a deferred `approval`, `question`, or `external` call pauses the run at `waiting_for_owner`, carrying `callId`, `toolId`, `argsDigest`, `effect`, and `thirdPartyEgress`. |
| `permission.resolved` | `bloom` | Emitted when an owner decision (`approve`, `edit`, `reject`, or `respond`) resolves a pending `callId`, recording `decision`, digest match, and outcome before resume. |

## Acceptance tests

1. `digest-mismatch-voids-approval`: Changing `toolId` or `argsDigest` after an `approve` decision is recorded causes resume from `waiting_for_owner` to fail closed without running the tool.
2. `destructive-and-credential-disallow-respond`: Submitting `decision: "respond"` for a `destructive` or `credential` tool is refused by validation, while `write` tools permit all four decision kinds.
3. `third-party-egress-always-gates`: A `read` tool with `thirdPartyEgress: true` pauses at `waiting_for_owner` and requires an owner decision before execution.
4. `edit-revalidates-and-informs-model`: An `edit` decision validates replacement arguments against `inputSchema`, verifies `editedArgsDigest`, records the updated intent, and informs the model that replacement arguments ran.
5. `respond-marks-owner-input`: A `respond` decision skips tool execution and injects the owner's response marked explicitly as owner input rather than tool output.
6. `deferred-calls-fail-closed-on-resume`: Runs paused on `approval`, `question`, or `external` deferred calls refuse transition back to `running` if any required decision record is missing, malformed, or unbound.
7. `bloom-emits-permission-events`: `bloom` emits `permission.requested` on pause and `permission.resolved` upon owner resolution with matching `callId` and correlation IDs.

## Slices

- `CAP-06.1` (`seed`, status `proposed`): Define owner-gate decision record validation, digest binding, and effect/egress decision allowances in `seed`.
- `CAP-06.2` (`seed`, status `proposed`): Define deferred call states (`approval`, `question`, `external`) and fail-closed `waiting_for_owner` resume checks in `seed`.
- `CAP-06.3` (`drosera`, status `proposed`): Align `drosera` face metadata checks with `ownerGate`, `effect`, and `thirdPartyEgress` rules.
- `CAP-06.4` (`bloom`, status `proposed`): Implement approval CLI/UI flow, `edit` re-validation and model disclosure, `respond` owner-input labeling, and `permission.requested` / `permission.resolved` events.

## Non-goals

- Persisting approval policies across runs ("always allow" wildcard grants) without an explicit future capability and owner decision.
- Letting any model output, specialist verdict, or memory recall record satisfy an owner gate.

## Family rules and conflicts

- **Owner is the only gate authority**: Neither `aestivation` review verdicts nor `myosotis` memory entries can ratify or bypass an owner gate (`CAP-07` cross-check).
- **Receipts over self-report**: Approval applies only to the exact `argsDigest` presented; edited arguments re-enter schema validation and intent recording before effect execution.

## Open owner decisions

- **D12 and M3/M4 sequencing with CAP-07**: `CAP-07` (Plan review and approval loop, assigned to `M3` / `P3`) depends on `CAP-06` (currently assigned to `M4` / `P4`). Owner sequencing guidance is needed on whether `CAP-06` gate records land in `M3` ahead of the full `P4` approval UX or whether `CAP-07` sequences alongside `M4`. Also pending `D12` P2/P4 tool-ID and terminal gate UX rulings.

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
