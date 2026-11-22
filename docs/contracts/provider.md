# Contract: provider adapter

Status: `specified`; validation and normalization are `implemented` in `src/provider.mjs`.

## The seam

A provider is any backend that can complete text. Seed and Bloom agree on one call shape:

```js
generate({ system, prompt, model, signal, ...providerConfig })
```

returning

```js
{ text, complete, model, usage }
```

| Field | Contract |
| --- | --- |
| `system` | stable instruction text, sent before the changing prompt body |
| `prompt` | the per-call task body |
| `model` | the model identifier the caller selected, or `null` for the default |
| `signal` | abort support; a stopped run must stop the call |
| `text` | the generated body (string; may be empty when `complete` is `true`) |
| `complete` | `true` only when the provider reports a finished structured response |
| `model` | the model that actually served, for the ledger |
| `usage` | `{ input, output, total, cacheRead, cacheWrite }` or `null` |

## Rules

1. **Missing metrics are `null`, never zero, never invented.** A provider that cannot
   report usage returns `null`; the run records "unreported", the same discipline Bloom
   documents for its own usage lines.
2. **No silent model substitution.** If the requested model is unavailable, the adapter
   errors; it never substitutes another model without the caller deciding.
3. **Stops propagate.** `signal` aborts the call; the adapter resolves without recording
   a fabricated completion.
4. **`complete` is earned.** Streaming adapters return `complete: false` until their
   backend reports a finished structured response. No `complete: true` on truncated text.
5. **One provider process, one responsibility.** A provider never mutates run state,
   memory, or artifacts; those facts belong to the run engine and the stores.

## Model names

`implemented` in `src/model-alias.mjs`. A caller asks for a model by **alias**. An alias
table, held by the caller, maps each alias to a **backend model** name:

```
modelAlias({ alias, backendModel, workload, deprecated?, replacedBy? })
modelAliasTable([alias records])
resolveModel(table, requested)
  → { resolved: true, requested, backendModel, deprecated, replacedBy }
  | { resolved: false, requested, reason: 'unknown-alias' }
```

1. **The two names stay distinct.** An alias is lowercase words joined by hyphens, with
   no wildcard. A record whose alias equals its backend model name is refused. The result
   carries both `requested` and `backendModel`.
2. **Only an alias resolves.** A backend model name that no alias names is
   `unknown-alias`, and nothing is chosen in its place (rule 2 above).
3. **Deprecated is a label, not a swap.** A deprecated alias resolves to its own backend
   model with `deprecated: true`. It may name `replacedBy`, which the table checks is a
   registered alias that is not itself deprecated. Resolution never follows it; the
   caller decides.
4. **The table is local.** Resolution reads only the table it is given. It makes no
   network call and asks no backend which models exist. No seed module opens a listener
   or calls the network, and a test reads every module in `src/` to hold that.

Serving these names over a local endpoint is stage 2, and stays `specified`.

## The OpenAI-compatible tier

Hosted and local services that already speak the chat-completions HTTP surface
(`POST {base}/v1/chat/completions`) are the first adapter class, because Bloom accepts
such a service today via its `--api-base` provider mode. The Stage 2 endpoint (see
[roadmap](../roadmap.md)) puts that HTTP shape — speaking to any configured backend —
inside seed, so workspaces point at one local address while backends remain swappable.

`src/provider.mjs` implements `validateProvider` (checks a candidate adapter against the
seam) and `normalizeGeneration` (accepts a raw provider result and either returns a
conforming record or names every contract violation).

## Changes

- `0.4.0` — model names (`modelAlias`, `modelAliasTable`, `resolveModel`,
  `ModelAliasError`) are new exports in `src/model-alias.mjs`. Additive; no existing
  export changed. Stage 2 stays `specified`.
