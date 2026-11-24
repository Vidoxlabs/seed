# CAP-03: Typed tool input and output

- ID: `CAP-03`
- Title: Typed tool input and output
- Lead: `seed`
- Touches: `drosera`, `bloom`
- Horizon: `now`
- Milestone: `M2`
- CLI phase: `P2`
- Status: `in-progress`
- Claim: `specified`
- Depends on: none

## Why

`src/tool-id.mjs` checks that a registry entry carries an `inputSchema` object, and `src/run-model.mjs` admits tool IDs per objective, yet neither `seed` nor its consumers enforce a deterministic schema subset over tool inputs or outputs today. Without shared schema validation, malformed model arguments reach tool executors, outputs lack structural guarantees, and workspaces either import heavy external validators or duplicate ad-hoc checks.

## What it does

`seed` defines and ships a small, zero-dependency, hand-written schema subset and validator for tool inputs and optional tool outputs:

1. **Closed schema subset**:
   - `type`: `"object"`, `"array"`, `"string"`, `"number"`, `"integer"`, `"boolean"`, or `"null"`.
   - Object keywords: `properties` (map of field name to nested schema), `required` (array of non-empty property names), and `additionalProperties` (`false` only when present, refusing unlisted properties).
   - Array keywords: `items` (single schema applied to every element) and `maxItems` (non-negative safe integer).
   - Scalar and enumeration keywords: `enum` (non-empty array of JSON primitive literals), `minLength` and `maxLength` (non-negative safe integers for strings), `minimum` and `maximum` (finite numbers for numbers and integers).
   - Unknown keywords anywhere in a schema object are refused rather than silently ignored.
2. **Schema checker and value validator**:
   - `checkSchema(schema)` validates that `schema` uses only the closed subset and returns a frozen `{ ok, errors }` result where each error carries a JSON-pointer path (such as `/properties/limit/minimum`) and reason.
   - `validateValue(schema, value)` first validates `schema` (failing closed if malformed) and then checks `value`, returning a frozen `{ ok, errors }` result with JSON-pointer paths (such as `/limit` or `/items/0`).
   - Error messages never echo raw string values that could leak credentials or private content; they name the JSON-pointer path and violated constraint only.
3. **Optional `outputSchema` on registry entries**:
   - Registry entries in `src/tool-id.mjs` gain an optional `outputSchema` field validated by `checkSchema`.
   - Omitting `outputSchema` stays valid (additive minor change keeping `0.8.0` entries valid); supplying an invalid `outputSchema` fails `isWellFormedRegistryEntry` and `checkRegistry`.
4. **Consumer execution flow in `drosera` and `bloom`**:
   - `drosera` tool faces accept optional `inputSchema` and `outputSchema` constrained by a dependency-free mirror of the `seed` subset, verified by parity tests.
   - Before dispatching any tool call, `bloom` validates arguments with `validateValue(entry.inputSchema, args)`. On failure, the tool does not execute; `bloom` sends one structured repair turn naming the JSON-pointer errors. If the repaired arguments still fail validation, the call stops with failure class `malformed` (aligned with `schema-invalid` in `run-model.md`).
   - When a tool declares `outputSchema`, `bloom` validates the tool's output before handing it back to the model; an output validation failure counts against the same single-turn repair budget so invalid tool outputs never trigger unbounded retries.

## Contract touchpoints

- `seed`: `docs/contracts/tool-id.md` (adds closed schema subset contract, `checkSchema` / `validateValue` behavior, and optional `outputSchema` on registry entries as an additive minor update); `docs/contracts/run-model.md` (aligns pre-dispatch validation refusal with `schema-invalid`).
- `drosera`: `docs/contracts/tools.md` (optional `inputSchema` and `outputSchema` on `toolFace`, parity against `seed` subset).
- `bloom`: `docs/architecture.md` (pre-dispatch argument validation, single repair turn then `malformed`, output validation sharing repair budget).

## Tool IDs and events

### Tool IDs

None defined by this capability.

| Tool ID | Effect | Third-party egress | Owner gate | Summary |
| --- | --- | --- | --- | --- |

### Events

None defined by this capability. Validation and repair events in the team trace belong to `CAP-10`.

| Event | Emitter | Payload summary |
| --- | --- | --- |

## Acceptance tests

1. `unknown-schema-keyword-refused`: `checkSchema` rejects any schema containing an unsupported keyword (such as `$ref`, `oneOf`, or `pattern`) and returns frozen `{ ok: false, errors }` with the JSON-pointer path to the offending keyword.
2. `value-validation-json-pointer-no-secret-echo`: `validateValue` checks `type`, `properties`, `required`, `additionalProperties: false`, `items`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, and `maxItems`, reports JSON-pointer error paths, and never echoes sensitive or arbitrary raw string values in error messages.
3. `optional-output-schema-additive`: Existing `0.8.0` registry entries without `outputSchema` remain valid in `isWellFormedRegistryEntry` and `checkRegistry`, while entries supplying a malformed `outputSchema` are rejected.
4. `drosera-face-schema-parity`: `drosera` tool faces accept optional `inputSchema` and `outputSchema`, and a parity check confirms `drosera` accepts and rejects the exact same schema shapes and values as `seed`.
5. `bloom-single-repair-turn-then-malformed`: In `bloom`, invalid tool arguments never invoke the tool executor, trigger at most one repair turn carrying JSON-pointer error paths, and stop as `malformed` if the second attempt still fails `inputSchema`.
6. `output-validation-shares-repair-budget`: In `bloom`, a tool result failing `outputSchema` consumes from the single-turn repair budget and stops cleanly rather than looping or passing unvalidated output into model context.

## Slices

- `CAP-03.1` (`seed`, milestone `M2`, status `landed`): Implement the closed schema subset (`checkSchema`, `validateValue`) in `seed` and add optional `outputSchema` to registry entries (`docs/contracts/tool-id.md`, additive minor bump).
- `CAP-03.2` (`drosera`, milestone `M2`, status `proposed`): Add optional `inputSchema` and `outputSchema` validation on tool faces with parity verification against `seed`.
- `CAP-03.3` (`bloom`, milestone `M2`, status `proposed`): Wire pre-dispatch `inputSchema` checking, one repair turn then `malformed`, and `outputSchema` validation sharing the repair budget.

## Non-goals

- Implementing full JSON Schema (`$ref`, `allOf`, `oneOf`, `anyOf`, `not`, `pattern`, `format`, remote schema resolution).
- Coercing argument types or silently stripping unknown keys when `additionalProperties: false` is set.
- Adding any runtime dependency or external schema validation package.

## Family rules and conflicts

- **Zero runtime dependencies**: Schema checking and validation are pure hand-written JavaScript in `seed` with zero dependencies.
- **Additive compatibility**: `outputSchema` is strictly optional so existing `seed` `0.8.0` callers remain unbroken; adding `outputSchema` and new exports is a minor version bump.
- **No secret echo**: Validation errors identify JSON-pointer paths and expected types or bounds, never repeating raw string payloads that might hold credentials.

## Open owner decisions

- `D4` Decided 2026-11-24 in seed#3: Where should the schema subset and validator live? Owner's answer, verbatim: "I need you to approve on recommendations and continue".
  `seed` owns the subset and validator. `drosera` mirrors the subset and verifies parity.

## Evidence

- `CAP-03.1` is exercised by six cases in `test/schema.test.mjs` covering nested schema refusal, redacted error paths, bounds, closed objects, and registry compatibility.

## Changes

- `2026-11-24`: Record `D4` and ship the closed schema subset with optional registry output schemas (CAP-03, seed#3).
- `2026-11-23`: Added `M2` slice milestones and aligned `D4` wording with the canonical decision record.
- `2026-11-23`: Initial capability specification created (`CAP-01.2` scaffold).
