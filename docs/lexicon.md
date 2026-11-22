# Public lexicon — generalized terminology

Status: `implemented` as a rule of writing for this repository; the mapping below is
naming only and describes no infrastructure.

## The rule

Public repositories speak two kinds of names, and only two:

1. **Proper nouns** of things a public repository backs today — `seed`, `bloom`,
   `videsign`, `vitools`. Use them when referring to the product.
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
| ViTools | (proper noun) `vitools` | The public skills/agents/tools registry |
| V37 / the cluster | the local cluster | Private infrastructure; never described beyond that |
| Memorix | (proper noun for the project), otherwise the memory fabric | Governed memory with consent and forget |
| Tri-Cluster | the storage triangle | Record authority, cache projection, graph projection |
| ARKSRRA | admission and ratification loop | Plan proposal, review, and the gate before assembly |
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
- **The `Ark` prefix family.** Historical admission-transport names are retired in
  public prose. The loop concept is identified by what it does.

## Applying it in review

A public pull request fails review if it:

- introduces an internal abbreviation in prose, identifiers, or a config key,
- coins a new brand-sounding name for a concept,
- describes infrastructure beyond "a local cluster" / "a configured provider", or
- uses a story character name where a role term would do.

When a new internal term must meet the public, add the row here in the same pull request.
