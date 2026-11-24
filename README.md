<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/seed-banner-dark.svg">
  <img src=".github/assets/seed-banner.svg" alt="Seed banner: a seed with a vertical contract seam, and the tagline Contracts and schemas for the runtime." width="1280">
</picture>

Contracts and schemas for the runtime

# Seed

Seed is an open, local-first harness foundation for AI agents. It defines the contracts an
agent runtime is built on: the run model, tool identity, and the provider adapter.
Agent workspaces like [Bloom](https://github.com/Vidoxlabs/bloom) can orchestrate
model-backed workers, tools, and shared artifacts without depending on any single hosted
service or third-party harness.

**Status: `0.8.0`, specification and contract modules.** The contracts, grammar, and
validators in this repository are implemented and covered by `npm test`. The runtime
services on the roadmap are specified or planned, not shipped. Nothing in this repository
opens a network listener, calls a hosted model, or touches your files today.

## Why

Bloom proved the model-agnostic part: a notebook-shaped team workspace that treats any
chat-completions-compatible service as one provider binding of several. The layer below
the model is still rented: a third-party harness decides how tools are called, how runs
are recovered, and how work proves itself. Seed takes that layer back as a small, open,
inspectable foundation:

- **One run model.** Work is an *objective* with *attempts*, recorded intents, and a
  verification receipt, not a loose prompt history.
- **Neutral tool identity.** Tools are addressed by grammar, never by vendor, host, or
  product name, so adapters can be swapped without re-teaching agents.
- **Provider-agnostic by contract.** Any inference service that can complete text can sit
  behind the same `generate` contract Bloom already speaks.

## What is here today (`implemented`)

| Module | What it does |
| --- | --- |
| `src/tool-id.mjs` | Parse, format, and validate the neutral tool ID grammar; check registry entries, rollback postures, and cross-entry references |
| `src/run-model.mjs` | Objective/attempt records, run statuses, legal transitions, and intent-time tool admission |
| `src/resume.mjs` | Resume pending steps, report supplied failure classes, preview steps in a dry run, and manage in-process run leases |
| `src/admission.mjs` | Fail-closed caller admission over a registry the caller holds |
| `src/registry-documents.mjs` | Check agents and tools documents the caller already parsed: name a document not supplied, and report an agent that names an unknown tool |
| `src/provider.mjs` | Validate provider adapters and normalize generation results |
| `src/model-alias.mjs` | Resolve the alias a caller asks for to a backend model name from a table the caller holds, keeping the two names distinct and labeling deprecated aliases without swapping them |

`npm install && npm test` verifies all of it. There are no runtime dependencies.

## Contracts (`specified`, `implemented` where modules cover them)

- [Run model](docs/contracts/run-model.md): objectives, attempts, intents, receipts
- [Tool identity](docs/contracts/tool-id.md): the neutral ID grammar and registry fields
- [Provider adapter](docs/contracts/provider.md): the `generate` contract, compatible with Bloom's team provider

## How seed and Bloom fit (`specified`)

Bloom already isolates its model layer behind one provider interface. Seed lands in three
stages, each one usable by Bloom as it ships:

1. **Stage 1, library contracts.** Shared modules: tool IDs, run records, and provider
   validation (this release).
2. **Stage 2, inference endpoint.** A local service exposing an OpenAI-compatible
   chat-completions surface over any configured backend, which Bloom can consume today via
   its provider base URL.
3. **Stage 3, run engine and tool registry.** Durable objectives and attempts, an
   owner gate for effects that leave the run, and a tool registry adapters publish to.

Details and worked examples: [docs/bloom-interop.md](docs/bloom-interop.md).

## Documentation

- [AGENTS.md](AGENTS.md): start here before editing. Stay in this repository's province.
- [Charter](docs/charter.md): mission, principles, non-goals
- [Architecture](docs/architecture.md): planes, authority, and what seed refuses to own
- [Lexicon](docs/lexicon.md): how public repositories stay in generalized terms
- [Roadmap](docs/roadmap.md): staged, status-labeled

## Design principles

1. Local-first. A clean checkout runs; nothing phones home.
2. One authority per fact. Runs own run state; memory owns memory; tools own effects.
3. Receipts over vibes. A run completes with a verification receipt, not a self-report.
4. Effects are gated. Side effects that leave a run pause for the owner.
5. No vendor names in tool identity. Grammar first; connectors carry the brand.

## License

[MIT](LICENSE)

The Vidoxlabs name and mark are trademarks of Vidoxlabs LLC. They are not covered by this repository's MIT license.
