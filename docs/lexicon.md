# Public lexicon — generalized terminology

Status: `implemented` as a rule of writing for this repository; the mapping below is
naming only and describes no infrastructure.

## The rule

Public repositories speak two kinds of names, and only two:

1. **Proper nouns** of things a public repository backs today — `seed`, `bloom`,
   `videsign`, and the successor proper nouns named in the mapping below (`capillary`,
   `myosotis`, `aestivation`, `drosera`). Use them when referring to the product.
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

The Vidoxlabs public story uses a handful of named terms (they appear on the public site
lexicon and articles already). Public repositories describing the same *concepts* use the
role terms on the right. The internal column is naming only.

| Story term | Generalized term in public repos | Concept |
| --- | --- | --- |
| ViApp | the native client | The desktop application a person works from |
| ViBot | the intelligence backend | The private backend service behind the clients |
| ViCode | coding workspace | A direct session in which an agent edits a real work tree |
| ViPerScale | step admission and scaling | Planning which worker, timeout, and context a chain step gets |
| ViDocs | the documentation base | The governed knowledge base |
| ViDesign | (proper noun) `videsign` | The shared design system |
| ViTools | (proper noun) `drosera` for the public successor, otherwise the tooling fabric | Tool faces, skills, hooks, cookbooks |
| V37 / the cluster | the local cluster | Private infrastructure; never described beyond that |
| Memorix | (proper noun) `myosotis` for the public successor, otherwise the memory fabric | Governed memory with consent and forget |
| Tri-Cluster | the storage triangle | Record authority, cache projection, graph projection |
| ARKSRRA | (proper noun) `aestivation` for the public successor, otherwise the admission and ratification loop | Plan proposal, review, and the gate before assembly |
| (the context store) | (proper noun) `capillary`, otherwise the context retrieval system | Provenance-honest, bounded retrieval and context relations |
| Violet, Wisteria, Xylia, Yarrow, Zinnia | persona seats, or the cabinet | Character canon; roles only in prose |
| VI / OAI / LA (Bloom's role labels) | coordinator / model-backed specialist / deterministic verifier | Team roles Bloom defines in its own docs |

Notes on the odd ones out:

- **Bloom's `VI · OAI · LA` rows.** Bloom's public documentation already explains these
  as its own role labels. When seed documents the same shapes, it states the role —
  coordinator, specialist, verifier — so a reader never needs Bloom's labels to
  understand seed.
- **Persona canon lives where character work lives.** Persona names, palettes, and voice
  belong to the design canon and the surfaces that present them. A harness document has
  no business naming characters: the run model needs owners, coordinators, specialists,
  and verifiers, not a cast.
- **The `Ark` prefix family.** The historical admission-transport name is settled: its
  public successor is `aestivation`. In prose the concept stays the admission and
  ratification loop.

## Family naming: the botanic line

The public-product family takes its names from botany (ratified by the owner,
2026-11-23): `seed` (the harness foundation) → `capillary` (context retrieval) →
`myosotis` (memory: consent, keep, forget) → `aestivation` (admission and review before
assembly) → `bloom` (the opened team workspace). The line mirrors the house canon —
Violet, Wisteria, Xylia, Yarrow, and Zinnia are all flowering plants — but products are
named for their function, never for a character. Each family name is an ordinary
botanical word that says what its system does, per
[capillary's family.md](https://github.com/Vidoxlabs/capillary/blob/main/docs/family.md).
A new public product earns its name the same way.

## Applying it in review

A public pull request fails review if it:

- introduces an internal abbreviation in prose, identifiers, or a config key,
- coins a new brand-sounding name for a concept,
- describes infrastructure beyond "a local cluster" / "a configured provider", or
- uses a story character name where a role term would do.

When a new internal term must meet the public, add the row here in the same pull request.
