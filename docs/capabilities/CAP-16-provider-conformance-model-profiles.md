# CAP-16: Provider conformance and model profiles

- ID: `CAP-16`
- Title: Provider conformance and model profiles
- Lead: `seed`
- Touches: `trellis`, `bloom`
- Horizon: `next`
- Milestone: `M4`
- CLI phase: `P4`
- Status: `proposed`
- Claim: `planned`
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

- `CAP-16.1` (`seed`, milestone `M4`, status `proposed`): Ship recorded offline provider conformance fixtures (including malformed, truncated, slow-stream) and the model profile contract/validator in `seed`.
- `CAP-16.2` (`trellis`, milestone `M4`, status `proposed`): Implement provider conformance behavior probes over injected test adapters (`trellis`).
- `CAP-16.3` (`bloom`, milestone `M4`, status `proposed`): Implement `bloom doctor --probe` model profile detection and profile-driven prompt style, budget, and constrained output wiring (`bloom`).

## Non-goals

- Opening network connections, probing ports, or discovering endpoints from inside `seed` (`test/model-alias.test.mjs` enforces zero network/listener code in `seed/src/`).
- Recording endpoint addresses, hostnames, or credentials inside model profiles or trace logs.

## Family rules and conflicts

- **No silent fallback**: Unavailable models or unknown capability slots stay `unknown` or error cleanly; neither `seed` nor `bloom` silently substitutes another model or guesses an optimistic context limit.
- **Missing metrics stay null**: Conforms strictly to `provider.md` rule 1 (`null`, never `0`, never invented) and `CAP-10` privacy rules (no endpoint address logged).
- **Local-first tests**: All `seed` fixtures run offline with zero credentials or network dependencies.

## Open owner decisions

- **Slow-stream timeout thresholds and unknown-capability defaults in `bloom`**: Default probe timeout values for `bloom doctor --probe` and whether `bloom` treats `unknown` tool-calling as text-only fallback vs hard stop (to be ratified when `M4` opens; `seed` enforces schema and provenance truth only).

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Added `M4` slice milestones across `CAP-16.1`..`CAP-16.3`.
- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
