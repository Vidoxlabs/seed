# Seed workspace

Seed is a public repository. Everything committed here can be read by anyone.

## Read order

1. `docs/charter.md` — what seed is for, and its non-goals.
2. `docs/architecture.md` — the planes and authority model.
3. `docs/contracts/` — the three contracts: run model, tool identity, providers.
4. `docs/lexicon.md` — the terminology rule for public repositories.

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
- No invented product names. Use the generalized terms in `docs/lexicon.md` for concepts;
  product proper nouns (seed, bloom, videsign, drosera) only where a public repository
  backs them.
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
