# CAP-12: Step graph, checkpoints, resume, interrupts

- ID: `CAP-12`
- Title: Step graph, checkpoints, resume, interrupts
- Lead: `seed`
- Touches: `bloom`
- Horizon: `later`
- Milestone: `M7`
- CLI phase: none
- Status: `proposed`
- Claim: `planned`
- Depends on: `CAP-06`, `CAP-10`

## Why

Stage 1 `src/resume.mjs` handles linear in-process step lists (`resumeSteps`) with skipped completed IDs and abort codes, but multi-step workflows also need shared state merging across branches, conditional routing checked before execution, post-step checkpoints with parent links, fork from prior checkpoints, configurable durability modes, per-step retry policies by failure class, and clean interrupt/resume semantics that obey intent-first rule 3.

## What it does

`CAP-12` specifies a declarative step graph engine contract in `seed` and its runtime execution in `bloom`:

1. **Step graph over shared state with per-key merge rules**:
   - A graph declares named step nodes operating on a shared state object.
   - Every key in the shared state schema declares a merge rule: `replace` (single writer or deterministic last-in-plan-order overwrite), `append` (ordered list concatenation in deterministic branch order), or a `named reducer` (identifier referencing a caller-supplied pure reducer function in a closed reducer table).
   - Conflicting concurrent writes to a `replace` key within the same parallel superstep fail validation unless ordered explicitly.
2. **Declarative conditional routes checked pre-run**:
   - Edges between steps are declarative route definitions (`from`, optional `condition` name matching a caller-supplied pure predicate table, `to` step ID or terminal state).
   - Before any step executes, the graph validates that every referenced step ID, reducer name, and route condition name exists, and that step bounds or loop limits are explicitly declared (failing closed pre-run if invalid).
3. **Post-step checkpoints and parallel pending writes**:
   - After each step (or parallel superstep), the engine produces a checkpoint record containing `{ checkpointId, runId, attempt, stepId, parentCheckpointId, stateDigest, state, completedWrites, createdAt }`.
   - `parentCheckpointId` links back to the prior checkpoint in an immutable chain; `stateDigest` holds the 64-hex SHA-256 digest of the canonical merged state.
   - `completedWrites` records outputs from any sibling branches in a parallel superstep that succeeded before another sibling failed or interrupted, so partial progress in completed parallel branches is never lost or re-executed blindly.
4. **Interrupt pause and resume (intent-first rule 3)**:
   - When a step hits an interrupt (an owner gate pause via `CAP-06` or an operator pause), the graph records the latest checkpoint and pending intents and transitions cleanly to `waiting_for_owner` or `stopping`.
   - On resume, any step without a completion checkpoint re-runs **from the start of that step**, reading `recordedIntents` first per `docs/contracts/run-model.md` rule 3 so any unclear non-idempotent intent goes to the owner rather than silently repeating a side effect.
5. **Fork from an earlier checkpoint**:
   - A caller can fork a new attempt or objective starting from a prior `checkpointId`. Forking copies the checkpoint's state, records the fork's `parentCheckpointId`, issues a fresh attempt and lease, and leaves the original checkpoint lineage untouched.
6. **Per-run durability mode**:
   - Each run selects a durability mode explicitly: `per-step` (persist checkpoint after every step before advancing), `on-interrupt` (persist at interrupts, failures, and completion), or `none` (in-memory only, matching Stage 1 `resumeSteps`). The engine never silently downgrades durability.
7. **Per-step retry policy by failure class**:
   - Steps may declare bounded retry rules keyed to `FAILURE_CLASSES` in `docs/contracts/run-model.md`.
   - Transient external failures (`external-unavailable`, `external-exec-failed`) may retry up to the declared cap using a caller-injected clock/scheduler; authority or contract errors (`policy-denied`, `gate-denied`, `tool-unknown`, `tool-not-canonical`, `schema-invalid`, `external-incompatible`) never auto-retry.

## Contract touchpoints

- `seed`: `docs/contracts/run-model.md` (extends step execution from linear `resumeSteps` to declarative step graphs, checkpoints, interrupts, forks, durability modes, and failure-class retry rules while preserving rules 1-6).
- `bloom`: `docs/architecture.md` (executes step graphs with `CAP-13` persistence, checkpoint tool handlers, and interrupt/resume wiring).

## Tool IDs and events

### Tool IDs

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |
| `run.checkpoint.read` | `read` | `false` | `false` | Read a recorded step checkpoint by ID or fetch the latest checkpoint for the active run. |
| `run.checkpoint.create` | `write` | `false` | `false` | Record an explicit post-step checkpoint carrying `parentCheckpointId`, `stateDigest`, and `completedWrites`. |
| `run.step.cancel` | `write` | `false` | `true` | Cancel a pending or paused step in the active run and transition cleanly toward `stopping`. |

### Events

None defined in `seed`. Step graph lifecycle and checkpoint events emitted by `bloom` use the `CAP-10` event stream.

| Event | Emitter | Payload summary |
| --- | --- | --- |

## Acceptance tests

1. `graph-pre-run-validation-fails-closed`: Missing step targets, unknown reducer names, or unregistered conditional route names throw before any step executes.
2. `state-merge-replace-append-reducer`: Parallel and sequential step writes merge deterministically under `replace`, `append`, and `named reducer` rules, yielding identical `stateDigest` values on replay.
3. `checkpoint-parent-chain-and-parallel-writes`: Every post-step checkpoint links `parentCheckpointId`, records `stateDigest`, and preserves `completedWrites` from parallel siblings that succeeded before an interrupt or partial failure.
4. `interrupt-resume-respects-rule-3`: Resuming from an interrupt re-runs the interrupted step from its start, skips prior checkpointed steps, and refuses to silently repeat an unresolved non-idempotent recorded intent.
5. `fork-preserves-prior-checkpoint-lineage`: Forking from an earlier checkpoint starts a new attempt/branch without mutating any state or links in the original lineage.
6. `retry-policy-by-failure-class`: Steps retry transient `external-unavailable` or `external-exec-failed` outcomes up to their cap, and immediately stop without retrying `policy-denied`, `gate-denied`, or `schema-invalid`.
7. `durability-mode-honored`: `per-step` writes checkpoints before advancing each step, `on-interrupt` checkpoints on pause/finish, and `none` stays strictly in memory.

## Slices

- `CAP-12.1` (`seed`, status `proposed`): Step graph schema, pre-run route/reducer validation, per-key state merge (`replace`, `append`, named reducer), and failure-class retry policies (`seed`).
- `CAP-12.2` (`seed`, status `proposed`): Post-step checkpoint records with `parentCheckpointId` and `stateDigest`, parallel `completedWrites`, fork, per-run durability modes, and interrupt pause/resume (`seed`).
- `CAP-12.3` (`bloom`, status `proposed`): Runtime graph executor, `run.checkpoint.read` / `run.checkpoint.create` / `run.step.cancel` handlers, and interrupt/fork CLI/UI wiring (`bloom`).

## Non-goals

- Writing directly to disk or SQLite from `seed` (persistence belongs to `CAP-13` and `bloom`).
- Executing arbitrary inline code strings in route conditions or reducer declarations (conditions and reducers are named lookups against caller-supplied pure JS maps).

## Family rules and conflicts

- **Intent-first rule 3**: Checkpoints never authorize blind re-execution of non-idempotent recorded intents; unclear intents pause for the owner (`CAP-06`).
- **One authority per fact**: Checkpoints store run graph state and digests only, never duplicating `myosotis` memory records or `capillary` context packets.

## Open owner decisions

- **Checkpoint retention and built-in reducer set**: Whether `seed` ships a small default table of named reducers alongside caller-supplied reducers, and whether checkpoint pruning/compaction policy lives in `CAP-13` store configuration or per-run options (pending owner guidance when `M7` opens).

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
