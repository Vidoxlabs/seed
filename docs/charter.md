# Seed charter

## Mission

Give agent workstations a foundation their owner can read, modify, and trust: the run
model, tool identity, and provider adapter that make an agent harness a small, inspectable
local component instead of a rented black box.

Seed is the harness layer underneath workspaces like Bloom. Bloom owns the team
experience — the head agent, specialists, shared desktop, and files. Seed owns what that
experience rests on: how work is stated, attempted, verified, admitted to tools, and
filtered by a human gate when effects leave the run.

## Principles

1. **Local-first.** A clean checkout of seed must install, test, and run with no accounts,
   no credentials, and no network. Anything that leaves the machine is an adapter, never
   an assumption.
2. **One authority per fact.** The run engine is the system of record for runs; a memory
   service is the authority for memory; a context store is the authority for context
   retrieval. Seed never duplicates a store it can address through a contract.
3. **Receipts over self-report.** Work completes with verification receipts tied to
   revision. An agent saying it did the thing is not evidence; an executed check is.
4. **Effects are gated.** Read-class tools run freely inside scopes; anything that
   writes, spends, sends, or creates credentials pauses for the owner's decision.
5. **Neutral identity.** Tools, runs, and roles are named by grammar and role. Vendor
   identity lives in a connector field, never in the ID.
6. **Provider-agnostic.** Any backend that can complete text can be adapted. A model
   server is a replaceable part.
7. **No silent fallback.** When the preferred provider or tool is unavailable, seed says
   so and stops rather than substituting a different model or path without disclosure.

## Non-goals

- Seed is not a chat product. It has no UI; surfaces like Bloom own the human experience.
- Seed is not a memory fabric. It addresses memory through a contract and never keeps a
  second copy of what a memory authority owns.
- Seed is not a hosted service. No telemetry, no accounts, no server that must be running
  for anything else in a clean checkout to work.
- Seed does not ratify itself. Claim labels (`implemented`, `specified`, `planned`,
  `observed`) are enforced by tests and evidence, and `observed` always carries a date.

## Roadmap stance

Stage boundaries live in [roadmap.md](roadmap.md). A stage ships only when its tests and
receipts say so; a stage that only exists on paper stays `planned` and is never described
as shipped. Seed's own maturity claims follow the same rule this repository enforces.
