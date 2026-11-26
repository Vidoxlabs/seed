# Public lexicon — generalized terminology

Status: `implemented` as a rule of writing for this repository; the mapping below is
naming only and describes no infrastructure.

## The rule

Public repositories speak two kinds of names, and only two:

1. **Proper nouns** of things a public repository backs today — `seed`, `capillary`,
   `myosotis`, `aestivation`, `drosera`, `trellis`, `bloom`, and `videsign`. Use them
   when referring to the product.
2. **Generalized role terms** for everything else — concepts, roles, contracts, planes.

Everything else — internal abbreviations, coined prefixes, brand-sounding concept names,
infrastructure names — is rewritten into the role term before it appears in a public
repository. Two hard prohibitions follow from this:

- **Never coin a new prefixed product name in a public repository.** New public projects
  take ordinary words (`seed`, `bloom`). "Vi" is not an acronym here, is never expanded,
  and is never used to coin a product from its letters.
- **Never carry operational detail.** Hostnames, addresses, ports, container and cluster
  names, account handles, and topologies stay where they live — inside private
  configuration — and never appear in committed public files.

## The mapping

Public repositories describe concepts with the generalized terms below. Internal names
for the same concepts stay in private records and never appear here.

| Generalized term in public repos | Concept |
| --- | --- |
| the native client | The desktop application a person works from |
| the intelligence backend | The private backend service behind the clients |
| coding workspace | A direct session in which an agent edits a real work tree |
| step admission and scaling | Planning which worker, timeout, and context a chain step gets |
| the documentation base | The governed knowledge base |
| (proper noun) `videsign` | The shared design system |
| (proper noun) `drosera`, otherwise the tooling fabric | Tool faces, skills, hooks, cookbooks |
| the local cluster | Private infrastructure; never described beyond that |
| (proper noun) `myosotis`, otherwise the memory fabric | Governed memory with consent and forget |
| the storage triangle | Record authority, cache projection, graph projection |
| (proper noun) `aestivation`, otherwise the admission and ratification loop | Plan proposal, review, and the gate before assembly |
| (proper noun) `capillary`, otherwise the context retrieval system | Provenance-honest, bounded retrieval and context relations |
| user-created agents, described by role | Agents a person creates in setup; public files never name anyone's agents |
| coordinator / model-backed specialist / deterministic verifier | Team roles Bloom defines in its own docs |

Notes on the odd ones out:

- **Bloom's role labels.** Bloom's public documentation explains its own role labels.
  When seed documents the same shapes, it states the role (coordinator, specialist,
  verifier), so a reader never needs Bloom's labels to understand seed.
- **Agents are not a cast.** A harness document has no business naming characters or
  anyone's agents: the run model needs owners, coordinators, specialists, and verifiers.
- **The admission transport.** Its historical name is retired. The public successor is
  `aestivation`, and in prose the concept stays the admission and ratification loop.

## Family naming: the botanic line

The public-product family takes its names from botany (ratified by the owner,
2026-11-23). The names are a stack, not a call chain. `seed` is the contract floor:
run records, tool identity, and the provider-shape checker. `capillary`, `myosotis`,
`aestivation`, and `drosera` are peers. They do not import each other. `bloom` is the
only composer and does not import them yet. `trellis` probes from outside the stack
and does not patch a library. `drosera` is external faces, skills, hooks, and
cookbooks, not seed's harness tooling. Systems are named for their function, never for
a character. Each family name is an ordinary
botanical word that says what its system does, per
[capillary's family.md](https://github.com/Vidoxlabs/capillary/blob/main/docs/family.md).
A new public product earns its name the same way.

## Applying it in review

A public pull request fails review if it:

- introduces an internal abbreviation in prose, identifiers, or a config key,
- coins a new brand-sounding name for a concept,
- describes infrastructure beyond "a local cluster" / "a configured provider", or
- uses a story character name where a role term would do.

When a new concept must meet the public, add its generalized term here in the same pull
request. The internal term itself never appears in a public file.
