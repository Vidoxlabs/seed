# Bloom interop

Status: stage 1 is `implemented` in this repository; stages 2 and 3 are `specified`.

Bloom (https://github.com/Vidoxlabs/bloom) is the first surface seed serves. Since Bloom
0.7.0, Bloom imports seed and runs every team provider behind seed's provider seam. Bloom
has one network provider mode: any service that speaks the chat-completions HTTP surface,
named with `--api-base`. Bloom names no default service. Seed lands in three stages, each
consumable by Bloom the day it ships.

## Stage 1 — shared contract modules (`implemented`, `0.2.0`)

Bloom (and any workspace) can adopt seed's modules directly:

- `provider` validation, so an adapter conforms before it is wired in and every generation
  is checked before a caller reads it,
- `tool-id` grammar for neutral tool names in plans and receipts,
- `run-model` records for objective/attempt bookkeeping.

These are dependency-free ES modules. Using them needs no seed process.

### What Bloom has adopted

Bloom 0.7.0 adopted `provider` validation (Bloom commit `3d535e0`):

- Bloom depends on seed as a git dependency pinned to one seed commit. A seed change
  reaches Bloom only when Bloom moves that pin.
- `validateProvider` checks the team provider when Bloom starts. An adapter that does not
  fit the seam stops startup.
- `normalizeGeneration` checks every generation before Bloom's team loop reads it. A record
  outside the contract stops the turn instead of reaching a handoff.
- Seed's generation record has no money field. Bloom carries a reported cost beside the
  record, never inside `usage`, so `usage` holds only the five fields the contract names.
- Bloom's `test/generation-record.test.mjs` holds the adoption: every adapter Bloom ships
  passes seed's checks, and a nonconforming record is refused.

Bloom has not adopted `tool-id` or `run-model`. Those belong to stage 3.

Because Bloom imports seed, a breaking change to `validateProvider`, `normalizeGeneration`,
or the generation record breaks a caller. It bumps the major version in `package.json` and
says so in [contracts/provider.md](contracts/provider.md).

## Stage 2 — local inference endpoint (`specified`)

A local service exposing the OpenAI-compatible chat-completions surface over any
configured backend. Bloom 0.7.0 already consumes such a service through its one provider
mode:

```sh
npm start -- --api-base <endpoint-url> --team-model <model-id>
```

The endpoint owns only completion; runs, tools, and memory stay with their owners. When
the endpoint ships, the exact invocation and its verified receipts land in this document
with `observed` labels — not before.

Worked example of the seam, in the shape Bloom adopted (runnable adapter shapes are in
[contracts/provider.md](contracts/provider.md)):

```js
// A workspace composes seed contracts around any backend:
import { validateProvider, normalizeGeneration } from '@vidoxlabs/seed';
const { ok, errors } = validateProvider(adapter);    // once, when the workspace starts
if (!ok) throw new Error(errors.join(' '));
const result = await adapter.generate({ system, prompt, model, signal });
const gen = normalizeGeneration(result);             // every call, before the caller reads it
if (!gen.ok) throw new Error(gen.errors.join(' ')); // never hand on a nonconforming record
```

## Stage 3 — run engine and tool registry (`specified`)

Bloom's turn loop upgrades from "prompt in, text out" to objectives and attempts:

- a team's task becomes an **objective** with acceptance and admitted tools,
- each specialist call becomes an **attempt** with recorded intents and receipts,
- tool effects resolve through the **registry**, and gated effects wait for the owner.

Bloom's visible contract — the group conversation, roster, shared desktop, file lineage,
review holds — does not change shape; the run model makes each of its steps inspectable.

## What seed does not ask of Bloom

- No hosted accounts. Bloom keeps its local-first, sign-in-free model.
- No required listener. Stage 1 is usable with no seed process running.
- No vendor re-education. Neutral tool IDs mean Bloom's docs never name the backend
  inside the tool call; the connector binding carries it (see
  [contracts/tool-id.md](contracts/tool-id.md)).

## Changes

- Bloom 0.7.0 — Bloom imports seed and adopted stage 1 `provider` validation. Bloom's
  OpenCode connection modes are gone, so this document no longer lists a hosted service or
  an OpenCode-compatible server as Bloom modes. The stage 2 example no longer carries an
  address or port.
