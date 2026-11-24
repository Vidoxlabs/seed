# CAP-17: Sandbox scopes

- ID: `CAP-17`
- Title: Sandbox scopes
- Lead: `seed`
- Touches: `bloom`
- Horizon: `later`
- Milestone: `M9`
- CLI phase: none
- Status: `proposed`
- Claim: `planned`
- Depends on: `CAP-04`, `CAP-12`

## Why

`seed` roadmap Stage 6 identifies sandbox scopes for specialist effects (`docs/roadmap.md`), and `docs/contracts/run-model.md` requires every intent (`recordIntent`) to name its target `scope`. Without a formal sandbox scope contract, scope strings remain unparsed labels, shell execution lacks a default-off policy check, and specialists lack a verifiable mapping between logical tool paths and declared per-run workspace roots.

## What it does

`CAP-17` specifies the per-run sandbox scope policy contract in `seed` and runtime root containment enforcement in `bloom`:

1. **Per-run workspace roots**:
   - Each run declares an explicit list of admitted root scopes (`{ rootId, access }` where `access` is `"read"` or `"read-write"`).
   - Ambient host access outside declared roots is refused by default; an attempt with an empty root set admits no filesystem scopes.
2. **Virtual path map**:
   - Tool calls and recorded intents address paths through logical root references (for example `rootId` + relative subpath such as `primary/src/index.mjs`) rather than embedding concrete host paths.
   - `seed` defines pure normalized scope/path containment helpers over caller-provided virtual path maps, rejecting parent traversal (`..`), empty segments, unknown `rootId` values, and writes against `"read"` roots.
3. **Shell off by default**:
   - Shell execution tools (such as `workspace.shell.execute` from `CAP-04`) are disabled by default on every run even if present in a registry.
   - Enabling shell execution requires explicit opt-in on the run's sandbox scope policy (`allowShell: true`) in addition to objective `allowedTools` admission and `CAP-06` owner-gate controls.
4. **Effects confined to declared scopes**:
   - Before any non-read or read effect executes, the target scope and virtual path are validated against the run's declared sandbox scopes; any out-of-scope target fails closed with `policy-denied` (`run-model.md` failure class) before reaching an executor.
   - `seed` keeps all checks pure and filesystem-free; `bloom` binds logical `rootId` entries to concrete workspace directories on disk, enforces symlink-resolution confinement, and gates runtime effects.

## Contract touchpoints

- `seed`: `docs/contracts/run-model.md` (binds `recordIntent` scope strings to declared per-run sandbox scopes and `policy-denied` containment failures); `docs/contracts/tool-id.md` (aligns `realm` and effect admission with per-run sandbox scope policies and default-off shell rules).
- `bloom`: `docs/architecture.md` (maps virtual workspace roots to real directories, resolves symlinks fail-closed, and enforces scope checks around `CAP-04` and `CAP-12` execution).

## Tool IDs and events

### Tool IDs

None defined by this capability. Sandbox rules govern existing tools (such as `CAP-04` workspace and shell tools).

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |

### Events

None defined by this capability. Policy denials emit typed events on `bloom`'s `CAP-10` event stream.

| Event | Emitter | Payload summary |
| --- | --- | --- |

## Acceptance tests

1. `shell-disabled-by-default`: A run whose sandbox scope omits `allowShell: true` refuses any shell execution intent with `policy-denied` even when a shell tool is in the registry.
2. `virtual-path-traversal-refused`: Logical paths containing `..`, unknown `rootId` prefixes, or malformed segments are rejected before execution with `policy-denied`.
3. `read-only-root-blocks-write-intent`: A `write` or `destructive` intent targeting a root declared with `access: "read"` is refused before execution.
4. `effects-confined-to-declared-roots`: Only effects whose resolved logical target falls within the run's declared root scopes pass admission; unmapped targets fail closed.
5. `bloom-symlink-escape-blocked`: In `bloom`, a symlink inside an admitted workspace root pointing outside the bound directory is refused rather than followed for writes or unauthorized reads.

## Slices

- `CAP-17.1` (`seed`, milestone `M9`, status `proposed`): Define per-run sandbox scope contract, pure virtual path map containment checks, and default-off shell policy in `seed`.
- `CAP-17.2` (`bloom`, milestone `M9`, status `proposed`): Bind concrete workspace roots, enforce symlink-safe confinement, and check sandbox scopes on every tool dispatch in `bloom`.

## Non-goals

- Shipping OS-level containerization, kernel namespace setup, or host filesystem operations inside `seed`.
- Allowing raw host absolute paths inside public capability contracts, tool IDs, or portable intent records.

## Family rules and conflicts

- **Public safety**: Virtual path mapping keeps host directories out of public logs, trace records, and capability specs.
- **No silent widening**: An agent or tool call cannot add workspace roots or flip `allowShell` mid-attempt; objective scope boundaries stay immutable once `ready`.
- **Zero runtime dependencies**: Scope and virtual path validation in `seed` uses pure JavaScript string normalization with no filesystem or process spawns.

## Open owner decisions

- **Multi-root syntax and read-only symlink exception rules**: Exact separator convention for `virtualPathMap` (`rootId` prefix vs structured `{ rootId, relativePath }` object) and whether read-only symlinks inside a single workspace root ever allow explicit opt-in or stay universally blocked alongside default non-following of symlinks under `D10` (settled when `M9` begins).

## Evidence

None yet. Capability is `proposed` with claim `planned`.

## Changes

- `2026-11-23`: Added `M9` slice milestones across `CAP-17.1`..`CAP-17.2` and referenced `D10` symlink default.
- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
