# Seed workspace

Seed is a public repository. Everything committed here can be read by anyone.

## Read order

1. `docs/charter.md` — what seed is for, and its non-goals.
2. `docs/architecture.md` — the planes and authority model.
3. `docs/contracts/` — the three contracts: run model, tool identity, providers.
4. `docs/lexicon.md` — the terminology rule for public repositories.
5. `docs/capabilities/` - capability specifications and the repository ledger (`index.json`).

Same-PR ledger rule: update `docs/capabilities/index.json`, the owning spec's `Evidence` and `Changes` sections, `docs/CHANGELOG.md`, and any touched contract `Changes` section in the same pull request as any capability change.

## Claim discipline

Every capability in this repository carries one of four labels, and the label must be true:

- `implemented` — code in this repository does the thing, and `npm test` exercises it.
- `specified` — a contract document defines it, but no shipped code does it yet.
- `planned` — a roadmap row names it, and no contract exists yet.
- `observed` — a dated run recorded evidence, kept in `docs/evidence/` with its receipts.

Do not upgrade a label without the evidence the next label requires. A public claim of a
capability that is not `implemented` or `observed` is a defect.

## Public safety

- No credentials, tokens, account names, personal handles, hostnames, IP addresses, port
  numbers, container names, cluster names, or network topologies in any committed file.
- No binary assets (see videsign's ADR-002 precedent); reference assets by a placeholder
  the consuming product resolves.
- No invented product names. Use the generalized terms in `docs/lexicon.md` for concepts.
  The product names a repository backs are `seed`, `capillary`, `myosotis`, `aestivation`,
  `drosera`, `trellis`, `bloom`, and `videsign`.
- Dependencies: none at runtime. A dependency proposal is an architecture decision first.

## Verification cycle

```sh
npm test      # node --test over test/*.test.mjs
```

Every commit keeps `npm test` green. A change that touches a contract document updates the
contract modules and tests in the same commit.

## Commits

Sentence-case subject lines, imperative mood, one concern per commit. Reference the
contract or document that owns the behavior being changed.

## Stay in this province

This repository is the harness foundation: run records, tool identity, and provider-shape checks. It is the floor. Capillary, myosotis, aestivation, and drosera are peers beside each other, not steps above this package. Bloom is the only composer, and since Bloom 0.7.0 it imports this package for provider validation. Trellis is outside the call path. This task does not edit them.

Do not add a listener, a memory store, a retrieval corpus, a roster of specialists, or a connector. A stage named in `docs/roadmap.md` as `specified` or `planned` is not code to invent in passing.

## One change, one repository

A change here is finished when this repository's tests pass. Do not open bloom, drosera, or trellis in the same task to keep them in step.

The compatible surface is the exports and the tests. A repository that does not import this package cannot break because this package changed. Capillary, myosotis, and aestivation do not import it. Bloom does: it pins one seed commit and calls `validateProvider` and `normalizeGeneration` (see `docs/bloom-interop.md`). A seed change reaches Bloom only when Bloom moves its pin, but a breaking change to those exports or to the generation record still breaks Bloom on its next move.

Drosera keeps a local copy of the tool grammar. That copy can lag. The lag is debt, paid later in drosera, not depth you must finish now. Name the lag in the change note. Do not edit drosera.

A breaking change to an export or to the grammar bumps the major version in `package.json` and says so in the contract that changed. Do not tag, publish, or edit a consumer from this task.

## Where the other six live

| The work | Repository |
| --- | --- |
| Run records, tool identity, provider shape | `seed` (here) |
| Bounded retrieval and relations | `capillary` |
| Consent, forget, and recall | `myosotis` |
| Plans, verdicts, and the assembly gate | `aestivation` |
| Tool faces, skills, hooks, cookbooks | `drosera` |
| Probes over those libraries | `trellis` |
| The team workspace a person opens | `bloom` |

`videsign` remains the design canon. It is not one of these seven.

## Skills

This file is the working method. A skill adds instructions and grants nothing: no tool, no domain, and no gate. Do not add a second skill system in this repository. A packaged copy, when one is needed, is a drosera skill record. It still grants nothing.

## Agents

One working method lives here. Do not add a roster of agents, and do not edit a sibling repository from this checkout. Specialists are the workspace's job.

## References

Read in this order: `docs/charter.md`, `docs/architecture.md`, `docs/contracts/`, `docs/lexicon.md`, then `src/`. If a contract and the code disagree, the code plus `npm test` win, and the contract is corrected in the same change.

## Cookbook

1. Read the charter and this file.
2. Run `npm test`.
3. Change a contract only together with the module and the test that hold it.
4. Stop at the province boundary in the table above.

This recipe is instructions. It is not an executable cookbook, because this repository ships no tool pack and no connector.

## Research corpora

Before planning a change to a module that serves a capability, call `research_plan` with
this repository's name. One call returns every capability's claims, the axis with the test
that holds each decision, and the gaps already open. This repository is covered by the `seed`
notebook, and by `myosotis` for memory-facing slices.

- `research_plan <repo>` is the planning call; `research_for <capability>` (for example
  `CAP-04.3`) narrows to one, `research_axis <id>` gives the full decision with its
  options and the test that fails if it is reversed, `research_card <id>` the verbatim
  quote, and `research_challenge <term>` the evidence against behaviour already shipped.
- `research_queue` lists the gaps already recorded. Check it first so you do not re-raise
  one, and so you can see which capabilities are already blocked.
- A capability the plan calls `untouched` has neither a claim nor a gap. Call
  `research_raise` with the capability, the slice and the acceptance test it blocks, then
  stop that slice and report it. Do not plan it on general knowledge.

The tools are read-only apart from `research_raise`, and every call is recorded, so an
unconsulted plan is visible. Funding, syncing, labelling and source deletion belong to
extraction and are not exposed to you: never cite a source a card did not return, and
never edit `intel/research/`. The full rule is the research corpora rule in the workspace
`AGENTS.md`, one directory up.

## MCP

This repository is not an MCP server. Do not commit an MCP configuration, a server address, or a credential. A call that leaves this repository is a drosera face whose identifier passes the tool grammar here. This repository does not ship that face's connector.
