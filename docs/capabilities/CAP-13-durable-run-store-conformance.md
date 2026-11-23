# CAP-13: Durable run store and conformance suite

- ID: `CAP-13`
- Title: Durable run store and conformance suite
- Lead: `seed`
- Touches: `bloom`, `trellis`
- Horizon: `later`
- Milestone: `M7`
- CLI phase: none
- Status: `proposed`
- Claim: `planned`
- Depends on: `CAP-12`

## Why

Stage 1 (`src/run-model.mjs` and `src/resume.mjs`) defines in-memory objective, attempt, intent, receipt, and lease records, while `docs/roadmap.md` Stage 3.1 specifies keeping those records (plus `CAP-12` checkpoints) durable across process restarts. `seed` itself must stay database-free and local-first (`docs/charter.md`), so `seed` needs a pure store interface, a data-driven conformance suite that verifies any store backend, and an in-memory reference store, while `bloom` backs it with SQLite and `trellis` probes the reference.

## What it does

`CAP-13` defines the durable run store contract and its cross-backend verification suite:

1. **Store interface over six run record collections**:
   - `objectives`: create, read by ID, and apply legal `transition` checks while keeping `ready` and later objectives immutable in content (`run-model.md`).
   - `attempts`: start attempt with copied `allowedTools` snapshot, read attempt by `(objectiveId, attempt)`.
   - `intents`: append-only intent log (`recordIntent`) written **before** any effect runs, checked against `allowedTools` at write time.
   - `receipts`: attach verification receipts (`attachReceipt`) binding check name and revision before `settling` -> `complete`.
   - `leases`: atomic `claimLease` and `releaseLease` honoring `expiresAt` exclusivity, stale-holder rejection, and malformed-lease refusal.
   - `checkpoints`: write and read `CAP-12` checkpoints by `checkpointId`, list lineage via `parentCheckpointId`, and read `completedWrites` on resume or fork.
2. **Conformance suite as data plus runner**:
   - `seed` exports declarative conformance case descriptors (inputs, operations, and expected invariants as plain data) alongside a runner `runStoreConformance(createStore, options)` that executes the suite over any caller-injected store factory.
   - The runner supports an optional `reopen` hook so durable backends (such as SQLite in `bloom`) prove records, leases, and intents survive closing and reopening handles across simulated process restarts.
3. **In-memory reference implementation in `seed`**:
   - `seed` ships a zero-dependency in-memory store reference implementing the full interface so callers, unit tests, and `trellis` probes run cleanly with no database package or filesystem state.
4. **Consumer implementations and probes**:
   - `bloom` implements the durable run store on SQLite (`CAP-13.2`), persisting across process restarts and passing the full `seed` conformance suite.
   - `trellis` writes external behavior probes exercising `seed`'s in-memory reference and conformance runner invariants (`CAP-13.3`).

## Contract touchpoints

- `seed`: `docs/contracts/run-model.md` (formalizes Stage 3.1 durable run store interface across objectives, attempts, intents, receipts, leases, and checkpoints).
- `bloom`: `docs/architecture.md` (SQLite-backed durable run store replacing ephemeral in-memory run persistence).
- `trellis`: `docs/contracts/probes.md` (conformance behavior probes targeting `seed`'s reference store).

## Tool IDs and events

### Tool IDs

None defined by this capability.

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |

### Events

None defined by this capability. Store persistence events and trace hooks belong to `CAP-10`.

| Event | Emitter | Payload summary |
| --- | --- | --- |

## Acceptance tests

1. `reference-store-passes-conformance`: `seed`'s in-memory reference store passes 100% of the data-driven conformance suite cases with zero filesystem or network calls.
2. `intent-recorded-before-effect-survives-reopen`: When a conformance test injects a restart (`reopen`) immediately after recording an intent and before completing the step, the reopened store surfaces the uncompleted intent and does not silently mark it finished.
3. `lease-atomic-claim-and-stale-release-rejected`: Concurrent or sequential `claimLease` calls refuse a second holder while live, allow replacement only at or after `expiresAt`, and ignore `releaseLease` from a stale lease holder.
4. `illegal-objective-transition-fails-closed`: Store `transition` rejects illegal status jumps (such as `running` -> `complete` without `settling` and a matching receipt) without mutating stored state.
5. `checkpoint-lineage-and-fork-isolated`: Reading checkpoints across `reopen` preserves `parentCheckpointId`, `stateDigest`, and `completedWrites`, and forking leaves the original attempt history intact.
6. `bloom-sqlite-store-passes-conformance`: `bloom`'s SQLite store passes the identical `seed` conformance suite including real handle reopen across restarts.

## Slices

- `CAP-13.1` (`seed`, status `proposed`): Define durable run store interface, export declarative conformance cases + `runStoreConformance` runner, and ship the zero-DB in-memory reference store (`seed`).
- `CAP-13.2` (`bloom`, status `proposed`): Implement SQLite durable run store in `bloom` passing the `seed` conformance suite (`bloom`).
- `CAP-13.3` (`trellis`, status `proposed`): Add external behavior probes validating the `seed` reference store and conformance suite (`trellis`).

## Non-goals

- Shipping SQLite bindings, filesystem database drivers, or migration runners inside `seed`.
- Storing memory records (`myosotis`), retrieval corpuses (`capillary`), or binary artifact blobs inside the run store.

## Family rules and conflicts

- **Zero runtime dependencies**: `seed` ships no database engine; SQLite stays in `bloom` behind the injected store interface.
- **One authority per fact**: The run store holds run facts (objectives, attempts, intents, receipts, leases, checkpoints) and never duplicates memory or retrieval stores.
- **Receipts over self-report**: An objective cannot transition to `complete` in any conforming store unless a revision-bound verification receipt is recorded.

## Open owner decisions

- **Default store retention and SQLite location policy**: Whether `bloom`'s SQLite run store keeps completed objectives indefinitely or applies an owner-configured retention/archive threshold, and how `bloom` locates its store file per workspace (settled when `M7` begins; `seed` itself holds no path or DB config).

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
