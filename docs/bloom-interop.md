# Bloom interop

Status: `specified` for stages 2-3; stage 1 (`implemented`) ships in this repository.

Bloom (https://github.com/Vidoxlabs/bloom) is the first surface seed serves. Bloom already
isolates model access behind one team-provider interface and accepts three connection
modes today: a hosted service, an OpenCode-compatible server, and any chat-completions
HTTP service via `--api-base`. Seed lands in three stages, each consumable by Bloom the
day it ships.

## Stage 1 — shared contract modules (`implemented`, `0.1.0`)

Bloom (and any workspace) can adopt seed's modules directly:

- `tool-id` grammar for neutral tool names in plans and receipts,
- `run-model` records for objective/attempt bookkeeping,
- `provider` validation so custom adapters conform before they are wired in.

Nothing about Bloom changes to use these; they are dependency-free ES modules.

## Stage 2 — local inference endpoint (`specified`)

A local service exposing the OpenAI-compatible chat-completions surface over any
configured backend. Bloom consumes it with:

```sh
npm start -- --api-base http://127.0.0.1:7071/v1 --team-model <model-id>
```

The endpoint owns only completion; runs, tools, and memory stay with their owners. When
the endpoint ships, the exact invocation and its verified receipts land in this document
with `observed` labels — not before.

Worked example of the seam (contract-level, runnable adapter shapes are in
[contracts/provider.md](contracts/provider.md)):

```js
// A workspace composes seed contracts around any backend:
import { validateProvider, normalizeGeneration } from '@vidoxlabs/seed';
const ok = validateProvider(myLocalAdapter);   // conforms to the seam
const gen = normalizeGeneration(await          // null-safe usage, complete earned
  myLocalAdapter.generate({ system, prompt, model, signal }));
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
