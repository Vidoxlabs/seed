# Contract: tool identity

Status: `specified`; parsing and validation are `implemented` in `src/tool-id.mjs`.

## The grammar

```
tool-id    = domain "." ( resource "." )? [ sub "." ] verb
segment    = [a-z] [a-z0-9-]*
```

- Two to four segments. The **first** segment is the `domain`; the **last** is the
  `verb`; between them, at most one `resource` and one `sub`, in that order.
- Lowercase letters, digits, and hyphens only. No uppercase, no underscores, no dots
  inside a segment.

```
vcs.file.read
vcs.repo.read
docs.file.metadata.read
edge.zone.read
telemetry.search
memory.context.read
ingest.job.create
ingest.job.cancel
compute.rows.verify
```

## What an ID never carries

A tool ID is neutral by construction. It never contains:

- a vendor, product, or brand name — vendor identity lives in **connector binding**,
- a hostname, address, port, container, cluster, or environment name,
- a persona or character name,
- an implementation detail (protocol, SDK, client library, or method chain).

An ID states **what the tool does**, in domain terms. The registry entry carries the rest.

## Registry entry

Each admitted tool is registered with:

| Field | Meaning |
| --- | --- |
| `toolId` | the neutral ID (`vcs.file.read`) |
| `connector` | the binding that actually performs it (carries the vendor identity) |
| `effect` | `read` \| `write` \| `destructive` \| `credential` |
| `realm` | the data scope the tool may touch |
| `thirdPartyEgress` | `true` when the effect leaves the owner's systems |
| `ownerGate` | `true` when the effect pauses the run for an owner decision |
| `inputSchema` | the validated argument shape |
| `legacyNames` | read-only aliases kept for migration; never new work |
| `rollback` | optional rollback declaration (below); absent means `unsupported` |

## Rollback posture

A registry entry may declare how its effects can be undone:

```js
rollback: { posture, description?, compensatingTool? }
```

| `posture` | Meaning |
| --- | --- |
| `unsupported` | nothing can be rolled back; the default, and the honest answer for reads |
| `compensating_action` | another registered tool undoes the effect; `compensatingTool` names it |
| `restore_snapshot` | the effect is undone by restoring a prior snapshot |
| `manual_recovery_required` | undoing the effect needs an owner's hands |

Rules:

1. **A declaration, not an executor.** Seed checks the posture. It never runs a rollback,
   and no posture makes an effect safe to repeat on restart (see
   [run-model.md](run-model.md), rule 3).
2. `compensatingTool` is required for `compensating_action`, must be a well-formed tool
   ID, and is refused on any other posture. A tool may name itself.
3. Unknown fields inside `rollback` are refused.

## Registry check

`checkRegistry(entries)` checks a set of entries together: every entry is well formed,
each `toolId` is registered once, and every `compensatingTool` is itself a registered
`toolId`. Each error is prefixed with the entry's tool ID, or `#<index>` when the entry
has none. This is validation over a list the caller holds. The registry service that
publishes and serves entries is stage 3.2 and stays `specified`.

## Caller admission

`admitCaller(registry, { callerId, command })` in `src/admission.mjs` decides whether a
caller may run a command, over a registry the caller holds:

```
{ callers:  [{ id, enabled, allowedTools: [toolId, ...] }],
  commands: [{ command: [segment, ...], toolId }] }
```

It fails closed. Each denial returns `{ admitted: false, code, reason }`:

| `code` | When |
| --- | --- |
| `registry-unavailable` | no registry, a registry without both lists, a caller entry without an id, or a caller id registered twice |
| `caller-unknown` | the call has no caller id, or the id is not registered |
| `caller-disabled` | the caller is not `enabled: true` (a missing flag is not a yes) |
| `command-unmapped` | no entry matches every segment of the command, or the entry's `toolId` is not well formed |
| `tool-not-allowed` | the mapped tool is not on the caller's `allowedTools` |

An admitted call returns `{ admitted: true, callerId, toolId }`. Decisions are frozen.
This is a check over a list, not the registry service of stage 3.2.

## Registry documents

`checkRegistryDocuments({ agents, tools })` in `src/registry-documents.mjs` checks an
agents document and a tools document together. The caller has already read and parsed
both. The function reads no file and opens no directory.

```
agents: { agents: [{ id, allowedTools?: [toolId, ...] }] }   or null
tools:  { tools:  [{ id }] }                                  or null
```

It returns frozen `{ ok, missing, errors }`.

1. **A document not supplied is named, not located.** Each `null` document is named in
   `missing` as `agents` or `tools`, in that order. `missing` carries no path, file
   name, or extension. A missing tools document lists no tools, so every tool an agent
   names is then unknown.
2. **A value that is not a document throws.** A document that is neither a plain object
   nor `null` throws `RegistryDocumentError`. That includes an absent key, a string, a
   number, a boolean, a list, and a function. The message does not repeat the value.
3. **An agent that names an unknown tool is an error.** Each name in an agent's
   `allowedTools` must be the `id` of an entry in the tools document. Otherwise the error
   is `agents.<id>: references unknown tool "<name>".`
4. **Malformed entries are errors.** The `agents` or `tools` key holding something other
   than a list, an entry without a non-empty string `id`, an `id` listed twice, and an
   `allowedTools` that is not a list of non-empty strings are each one error. Errors are
   prefixed `agents.<id>`, `tools.<id>`, or `<document>.#<index>` when the entry has no
   id. A document that leaves its list out holds an empty list.
5. **`ok` fails closed.** `ok` is true only when `missing` and `errors` are both empty.
6. **It grants nothing.** Listing a tool gives it to no agent, and naming it on an
   agent's `allowedTools` does not admit a call. Admission stays with `admitCaller`, which
   this check does not change. The documents are not modified.
7. **Only ids and `allowedTools` are read.** Fields that name nodes, services, policies,
   or capabilities are left unread and are not checked. Tool ids are compared as
   strings. Their grammar is `checkRegistry`'s job.

This ports the predecessor's tool reference check only. Its directory resolution, file
reads, document parsing, file paths in its missing list, and its checks of nodes,
services, policies, capabilities, workflows, and command alignment are not ported.

## Reading classes

- `read`-effect tools run inside the attempt's admitted scopes by default.
- Every non-read class is admitted per objective (`allowedTools`) and intended-before-
  effect (see [run-model.md](run-model.md)). `credential` and third-party egress
  additionally set `ownerGate`.

## Verification

`src/tool-id.mjs` exports `parseToolId`, `formatToolId`, `isValidToolId`,
`isWellFormedRegistryEntry`, `checkRegistry`, `rollbackPosture`, and `ROLLBACK_POSTURES`;
the tests exercise grammar edges, forbidden-token classes, registry-entry shape, rollback
declarations, and cross-entry references. The grammar itself did not change in `0.2.0`;
`rollback` is an additive, optional registry field. Renames are additive: `legacyNames` point back, and the
neutral ID stays the one true name.

`src/registry-documents.mjs` exports `checkRegistryDocuments` and
`RegistryDocumentError`. `0.8.0` adds them. No existing export changes, and every record
and registry valid under `0.7.0` stays valid.
