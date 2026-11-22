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

## The OpenAI-compatible tier

Hosted and local services that already speak the chat-completions HTTP surface
(`POST {base}/v1/chat/completions`) are the first adapter class, because Bloom accepts
such a service today via its `--api-base` provider mode. The Stage 2 endpoint (see
[roadmap](../roadmap.md)) puts that HTTP shape — speaking to any configured backend —
inside seed, so workspaces point at one local address while backends remain swappable.

`src/provider.mjs` implements `validateProvider` (checks a candidate adapter against the
seam) and `normalizeGeneration` (accepts a raw provider result and either returns a
conforming record or names every contract violation).
