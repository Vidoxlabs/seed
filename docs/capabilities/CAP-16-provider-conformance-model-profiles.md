# CAP-16: Provider conformance and model profiles

- ID: `CAP-16`
- Title: Provider conformance and model profiles
- Lead: `seed`
- Touches: `trellis`, `bloom`
- Horizon: `next`
- Milestone: `M4`
- CLI phase: `P4`
- Status: `in-progress`
- Claim: `specified`
- Depends on: none

## Why

`src/provider.mjs` implements `validateProvider` and `normalizeGeneration`, and `src/model-alias.mjs` implements local alias resolution, yet callers currently lack recorded offline provider fixtures for edge-case validation (malformed payloads, truncated outputs, slow streams) and a standard model profile record distinguishing reported, probed, and unknown capabilities. Without explicit capability provenance, workspaces risk assuming context lengths, tool calling, or constrained output support that a configured backend never proved.

## What it does

`CAP-16` adds recorded offline provider conformance fixtures and an epistemic model profile contract in `seed`, probed by `trellis` and consumed by `bloom doctor --probe`:

1. **Recorded provider conformance fixtures (offline, zero network)**:
   - Plain JSON/data request-response fixture cases exercised through `validateProvider` and `normalizeGeneration` with zero network I/O.
   - Fixture classes cover:
     - valid completions with complete five-field `usage` and valid completions with unreported `usage: null`,
     - malformed responses (missing `text`, non-boolean `complete`, extra unknown `usage` fields, negative or non-integer counts, wrong `model` type),
     - truncated completions (`complete: false` with partial `text`, verifying `normalizeGeneration` never promotes truncated output to `complete: true`),
     - slow-stream and `AbortSignal` cancellations (simulated delayed/partial chunk fixtures asserting `signal` aborts cleanly without inventing a fabricated completion),
     - missing/unavailable model responses ensuring no silent model substitution (`provider.md` rule 2).
2. **Model profile record with explicit provenance**:
   - A structured model profile record captures `{ model, contextLength, toolCalling, constrainedOutput, streaming }`.
   - Every capability slot carries an explicit value plus provenance tag from the closed enum `"reported"`, `"probed"`, or `"unknown"` (or structured `{ value, source }` where `source` is `"reported" | "probed" | "unknown"` and `value` is `null` when `"unknown"`).
   - `seed` validates profile records so `"unknown"` is never coerced into a guessed context window or `true` tool-calling flag.
3. **Consumer behavior in `bloom` and probes in `trellis`**:
   - `bloom doctor --probe` runs injected/configured endpoint diagnostics, populates a conforming model profile (`probed` for directly verified capabilities, `reported` for unverified declarations, `unknown` for anything unavailable), and uses that profile to drive prompt style, context budget sizing, and constrained output mode without guessing.
   - `trellis` executes provider conformance probes over injected adapters using `seed`'s fixture set without touching any live network service inside `seed`.

## Contract touchpoints

- `seed`: `docs/contracts/provider.md` (adds recorded offline conformance fixture expectations and the model profile contract with `reported` / `probed` / `unknown` provenance).
- `trellis`: `docs/contracts/probes.md` (provider conformance probe suite over injected adapters).
- `bloom`: `docs/architecture.md` (`bloom doctor --probe` profile capture and profile-driven prompt style, budget, and constrained output selection).

## Tool IDs and events

### Tool IDs

None defined by this capability.

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |

### Events

None defined by this capability. Probe diagnostic output and runtime trace events belong to `CAP-10`.

| Event | Emitter | Payload summary |
| --- | --- | --- |

## Acceptance tests

1. `conformance-fixtures-run-offline`: Every recorded request/response fixture executes under `validateProvider` and `normalizeGeneration` with `fetch` disabled and zero network calls.
2. `malformed-and-truncated-fixtures-fail-closed`: Malformed usage/field fixtures return `{ ok: false }` with specific violation messages, and truncated fixtures keep `complete: false` without promotion to `complete: true`.
3. `slow-stream-abort-produces-no-fabrication`: Simulated slow-stream fixtures interrupted by `AbortSignal` halt cleanly and never record a fabricated `complete: true` generation.
4. `model-profile-preserves-unknown`: Model profile validation requires each capability (`contextLength`, `toolCalling`, `constrainedOutput`, `streaming`) to be labeled `reported`, `probed`, or `unknown`, rejecting guessed defaults for `unknown` slots.
5. `bloom-doctor-probe-drives-prompt-config`: `bloom doctor --probe` builds a valid model profile and selects prompt style, context budget, and constrained output settings strictly from confirmed `probed`/`reported` values while falling back safely on `unknown`.

## Slices

- `CAP-16.1` (`seed`, milestone `M4`, status `landed`): Ship recorded offline provider conformance fixtures (including malformed, truncated, slow-stream) and the model profile contract/validator in `seed`.
- `CAP-16.2` (`trellis`, milestone `M4`, status `proposed`): Implement provider conformance behavior probes over injected test adapters (`trellis`).
- `CAP-16.3` (`bloom`, milestone `M4`, status `landed`): Implement `bloom doctor --probe` model profile detection and profile-driven prompt style, budget, and constrained output wiring (`bloom`).

## Non-goals

- Opening network connections, probing ports, or discovering endpoints from inside `seed` (`test/model-alias.test.mjs` enforces zero network/listener code in `seed/src/`).
- Recording endpoint addresses, hostnames, or credentials inside model profiles or trace logs.

## Family rules and conflicts

- **No silent fallback**: Unavailable models or unknown capability slots stay `unknown` or error cleanly; neither `seed` nor `bloom` silently substitutes another model or guesses an optimistic context limit.
- **Missing metrics stay null**: Conforms strictly to `provider.md` rule 1 (`null`, never `0`, never invented) and `CAP-10` privacy rules (no endpoint address logged).
- **Local-first tests**: All `seed` fixtures run offline with zero credentials or network dependencies.

## Open owner decisions

- `D20` Decided 2026-11-24 in bloom#6: Timeouts: 5 seconds for the models list and 30 seconds for the one-token streaming request? The spec leaves these open. (Recommend yes.) Owner's answer, verbatim: "Accept all".
- `D21` Decided 2026-11-24 in bloom#6: Unknown tool calling: if the probe can't confirm native tool calling, the loop keeps the fenced json action format from D16 instead of refusing to start. The loop only uses that text format anyway. (Recommend fallback.) Owner's answer, verbatim: "Accept all".
- `D22` Decided 2026-11-24 in bloom#6: Where the profile lives: `doctor --probe` writes `profiles.json` in bloom's data directory, keyed by provider config name and model alias, and the coding loop reads it. If there is no profile, every slot counts as unknown and the loop uses default budgets. The file holds no address. (Recommend yes.) Owner's answer, verbatim: "Accept all".
- `D23` Decided 2026-11-24 in bloom#6: What gets probed: only the models list and the fixed one-token streaming request. Context length, constrained output and tool calling are `reported` only if the models list exposes them, and `unknown` otherwise. No extra probe request carries a tools or schema field. (Recommend yes.) Owner's answer, verbatim: "Accept all".
- `D24` Decided 2026-11-24 in bloom#6: Exit code: `doctor --probe` exits 1 on any `fail`, such as unreachable or the configured alias missing. An `unknown` never fails. (Recommend yes.) Owner's answer, verbatim: "Accept all".

## Evidence

- `CAP-16.1` is exercised by four cases in `test/provider-conformance.test.mjs` over thirteen recorded cases in `test/fixtures/provider-conformance.json`, run with `fetch` disabled, and by five cases in `test/model-profile.test.mjs` covering unknown slots, missing provenance, closed value types, a closed record with no endpoint field, and frozen copies.
- `CAP-16.3` is exercised in bloom by `test/doctor-probe.test.mjs` (`bloom-doctor-probe-drives-prompt-config`, `probe-unknown-never-pass`, `probe-failure-reasons-and-exit-codes`, `probe-output-never-contains-endpoint-marker`) against a fake server through an injected fetch, and by `cli-doctor-probe-profile-drives-run` in `test/cli-coding.test.mjs`.

## Changes

- `2026-11-24`: Record the CAP-16.3 probe decisions D20 to D24 and mark the bloom slice landed (CAP-16, bloom#6).
- `2026-11-24`: Ship recorded offline conformance fixtures and the model profile validator in seed 0.10.0 (CAP-16, seed#4).
- `2026-11-23`: Added `M4` slice milestones across `CAP-16.1`..`CAP-16.3`.
- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
