# Seed architecture

Status: `specified`. The modules named below exist (`implemented`) where marked; the
services are contract documents until their stage ships.

## The four planes

1. **Surfaces** (`external`) — the human-facing workspaces. Bloom is the first: a team
   of agents in one group conversation over a shared desktop. Seed defines no UI contract;
   surfaces consume seed's run and provider contracts.
2. **Harness** (this repository) — the run engine, the tool registry, and the provider
   adapters. This is the part workspaces would otherwise rent from a third-party harness.
3. **Providers** (`plugged in`) — any service that can complete text: a local inference
   server, a hosted chat-completions endpoint, an OpenCode-compatible server. Providers
   are replaceable parts behind one `generate` contract.
4. **Authority stores** (`addressed, never duplicated`) — memory, context, and artifact
   stores that own their facts. Seed addresses them through contracts and keeps no second
   copy.

## Inside the harness

- **Run engine** (`specified` per [run model](contracts/run-model.md)). Work is an
  *objective* (an intent plus acceptance criteria) carried out by *attempts*. An attempt
  records its intended effect before the effect runs, holds a lease while it works, and
  *completes only with a verification receipt at the current revision*. Restarting the
  process never silently repeats an effect; an attempt resumes from its recorded intents
  or asks the owner.
- **Tool registry** (`specified` per [tool identity](contracts/tool-id.md)). One place
  that maps neutral tool IDs to connector bindings, effect classes, and schemas. Tools
  are enumerated before a run starts; a run may only call tools admitted to it.
- **Provider adapters** (`implemented as contract validation` in `src/provider.mjs`;
  endpoint adaptation is Stage 2 in the roadmap). Providers take `{ system, prompt, model,
  signal, ... }` and return `{ text, complete, model, usage }` — Bloom's provider contract.
- **Owner gate** (`specified`). Runs move to `waiting_for_owner` when an intended effect
  leaves the run's scopes — writing outside them, spending, sending, creating credentials.
  The gate binds the owner's decision to the exact action digest being approved, and a
  change to the action voids the approval.

## Roles, generalized

- The **owner** is the one human whose decisions open gated effects.
- A **coordinator** frames an objective, selects workers, and accepts results; it does not
  call tools.
- **Specialists** are model-backed workers, each with a jurisdiction and a scope of
  admitted tools; tools execute as scoped effects under the run's allowlist.
- A **verifier** is deterministic: it re-reads the admitted evidence, checks hashes, and
  reports. Verification never consumes a model call.
- **Connectors** bind the registry to external systems and default to read-only. Vendor
  identity lives in the connector, never in the tool ID.

The point of generalizing: an ephemeral team's shape (one coordinator, N specialists,
one deterministic verifier) can be stated, inspected, and budgeted without any product,
vendor, or infrastructure name in the statement.

## What seed refuses to own

- **No second system of record.** Memory, context, and artifact storage stay with their
  authorities; the run engine holds run facts only.
- **No model server.** Inference is a provider behind the adapter.
- **No silent substitution.** Missing usage, a missing provider, or a failed tool is
  reported as such — never approximated, padded, or replaced.
- **No unclaimed capabilities.** Anything not implemented carries its label on its face
  (`AGENTS.md` claim discipline).
