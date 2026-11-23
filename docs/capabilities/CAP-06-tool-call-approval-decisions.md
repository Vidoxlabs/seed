# CAP-06: Tool-call approval decisions

- ID: `CAP-06`
- Title: Tool-call approval decisions
- Lead: `seed`
- Touches: `bloom`, `drosera`
- Horizon: `next`
- Milestone: `M3` (`CAP-06.1` ships at `M3`; `CAP-06.2` to `CAP-06.4` ship at `M4`)
- CLI phase: `P4`
- Status: `proposed`
- Claim: `planned`
- Depends on: `CAP-03`, `CAP-04`

## Why

`docs/contracts/run-model.md` defines the `waiting_for_owner` status and rule 5 ("the gate binds to the digest"), and `docs/contracts/tool-id.md` defines `effect` classes and `ownerGate` / `thirdPartyEgress` flags. However, `seed` does not yet define the owner-gate decision record, which decision kinds are valid for each effect class, how owner edits or text responses return to a run, or how deferred pauses fail closed on resume.

## What it does

`CAP-06` specifies the digest-bound owner-gate decision contract in `seed`, metadata alignment in `drosera`, and the interactive approval flow and trace events in `bloom`:

1. **Owner-gate decision record (`CAP-06.1` at `M3`)**:
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
   - **Plan-digest binding (folded from `CAP-07.3` into `CAP-06.1`)**: the owner-gate decision contract also supports plan approval records bound to a canonical 64-hex SHA-256 `planDigest` (`CAP-07` depends on `CAP-06.1`), failing closed whenever a plan edit alters `planDigest`.
2. **Effect and third-party egress allowances (`CAP-06.1` at `M3`)**:
   - `read` tools with `thirdPartyEgress: false` run freely inside the attempt's admitted `allowedTools` and declared sandbox scopes without pausing (`ownerGate` false), except where an explicit override of a denied secret path (`CAP-05`, pending `D10`) requires a per-call `CAP-06.1` owner approval record.
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

- `seed`: `docs/contracts/run-model.md` (owner-gate decision record shape including call and plan-digest binding for `CAP-07`, deferred call kinds `approval`/`question`/`external`, fail-closed resume rule); `docs/contracts/tool-id.md` (effect and `thirdPartyEgress` decision allowances, mandatory `ownerGate` on third-party egress).
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

1. `digest-mismatch-voids-approval`: Changing `toolId`, `argsDigest`, or bound `planDigest` after an `approve` decision is recorded causes resume from `waiting_for_owner` or plan execution to fail closed without running the tool or plan.
2. `destructive-and-credential-disallow-respond`: Submitting `decision: "respond"` for a `destructive` or `credential` tool is refused by validation, while `write` tools permit all four decision kinds.
3. `third-party-egress-always-gates`: A `read` tool with `thirdPartyEgress: true` pauses at `waiting_for_owner` and requires an owner decision before execution.
4. `edit-revalidates-and-informs-model`: An `edit` decision validates replacement arguments against `inputSchema`, verifies `editedArgsDigest`, records the updated intent, and informs the model that replacement arguments ran.
5. `respond-marks-owner-input`: A `respond` decision skips tool execution and injects the owner's response marked explicitly as owner input rather than tool output.
6. `deferred-calls-fail-closed-on-resume`: Runs paused on `approval`, `question`, or `external` deferred calls refuse transition back to `running` if any required decision record is missing, malformed, or unbound.
7. `bloom-emits-permission-events`: `bloom` emits `permission.requested` on pause and `permission.resolved` upon owner resolution with matching `callId` and correlation IDs.

## Slices

- `CAP-06.1` (`seed`, milestone `M3`, status `proposed`): Define owner-gate decision record validation, plan-digest binding (folded from `CAP-07.3`, so `CAP-07` depends on `CAP-06.1`), call-digest binding, and effect/egress decision allowances in `seed`.
- `CAP-06.2` (`seed`, milestone `M4`, status `proposed`): Define deferred call states (`approval`, `question`, `external`) and fail-closed `waiting_for_owner` resume checks in `seed`.
- `CAP-06.3` (`drosera`, milestone `M4`, status `proposed`): Align `drosera` face metadata checks with `ownerGate`, `effect`, and `thirdPartyEgress` rules.
- `CAP-06.4` (`bloom`, milestone `M4`, status `proposed`): Implement approval CLI/UI flow, `edit` re-validation and model disclosure, `respond` owner-input labeling, and `permission.requested` / `permission.resolved` events.

## Non-goals

- Persisting approval policies across runs ("always allow" wildcard grants) without an explicit future capability and owner decision.
- Letting any model output, specialist verdict, or memory recall record satisfy an owner gate.

## Family rules and conflicts

- **Owner is the only gate authority**: Neither `aestivation` review verdicts nor `myosotis` memory entries can ratify or bypass an owner gate (`CAP-07` cross-check).
- **Receipts over self-report**: Approval applies only to the exact `argsDigest` or `planDigest` presented; edited arguments or edited plans re-enter schema validation and intent or gate recording before execution.

## Open owner decisions

- **D14 (`CAP-06.1` at `M3` with `CAP-07.3` folded in, pending owner ruling)**: Under review convention `D14`, `CAP-06.1` ships at `M3` (covering plan-digest binding folded from `CAP-07.3`, so `CAP-07` depends on `CAP-06.1`), while `CAP-06.2` through `CAP-06.4` ship at `M4` (`P4`). Kept unless overridden by the owner.
- **D10 (secret-file deny list override, pending owner ruling)**: Under `CAP-05`, the secret-file deny list stays always on and symlinks are not followed by default; an explicit include of a denied path requires a per-call `CAP-06.1` owner approval record.
- **Terminal approval prompt UX for `CAP-06.4` (pending owner decision, not yet numbered)**: pending owner rulings for `bloom` CLI `P4` approval prompts and terminal gate UX details.

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Separated `CAP-06.4` terminal approval prompt UX into an unnumbered open owner question distinct from `D12` and removed the review-prompt label from `D14` (`CAP-01.2`).
- `2026-11-23`: Moved `CAP-06.1` to `M3` with `CAP-07.3` plan-digest binding folded in (`CAP-07` depends on `CAP-06.1`), assigned `M4` to `CAP-06.2`..`CAP-06.4`, and aligned open owner decisions with `D10` and `D14`.
- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
