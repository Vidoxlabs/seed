# Contract: run model

Status: `specified`; the records, statuses, and transitions are `implemented` in
`src/run-model.mjs`.

## Objective

An objective is a unit of work stated before it runs:

- `id` — stable identifier within the owning workspace.
- `intent` — one sentence saying what the owner asked for.
- `acceptance` — the check that makes the objective done; verification names it.
- `allowedTools` — the exhaustive list of tool IDs admitted to this objective. Not on
  the list, not callable.

Objectives are immutable once `ready`. Changes spawn a new objective; they do not mutate
history.

## Attempt

An attempt is one try at an objective:

- `objectiveId`, `attempt` number, `lease` token.
- `allowedTools` — a copy of the objective's admission list, taken when the attempt
  starts. A later edit to the objective object does not widen it.
- `recordedIntents` — each intended effect appended **before** the effect runs: tool ID,
  arguments digest, target scope. Intent-first ordering means a restart can tell the
  difference between "was about to", "probably ran", and "recorded as done".
- `receipts` — one verification receipt per completing step.

## Statuses

```
draft → ready → running → settling → complete
                  │    ↘ waiting_for_owner
                  │         ↓
                  └──→ stopping → stopped
                          ↘ failed
```

Legal transitions:

| From | To |
| --- | --- |
| `draft` | `ready`, `stopped` |
| `ready` | `running`, `stopping` |
| `running` | `waiting_for_owner`, `settling`, `stopping`, `failed` |
| `waiting_for_owner` | `running` (decision recorded), `stopping` |
| `settling` | `complete`, `failed` |
| `stopping` | `stopped` |

`failed` and `complete` and `stopped` are terminal.

## Rules the records encode

1. **Verification before `complete`.** A run reaches `complete` only with a verification
   receipt naming the objective's acceptance check at the current revision.
2. **Effects are intended first.** The intent precedes the effect in the record; replay
   logic reads intents, never guesses from outputs.
3. **Restarts do not repeat effects.** A restarted attempt resumes from recorded intents,
   and an unclear non-idempotent intent goes to the owner, not the retry loop.
4. **Stops are honored.** A stopping run finishes the in-flight read, holds the effect,
   and lands at `stopped` with what it completed left truthful.
5. **The gate binds to the digest.** An owner decision names the exact digest of the
   action it approves. A changed action needs a new decision.
6. **Admission is checked at intent time, and fails closed.** `recordIntent` refuses a
   tool ID that is not on the attempt's `allowedTools`. An attempt record that carries no
   admission list admits nothing, and `createAttemptRecord` refuses an objective whose
   admission list is empty or malformed.

## Changes

- `0.2.0` — rule 6 is new in code. Before `0.2.0` the contract said "not on the list,
  not callable" but `recordIntent` did not check the list, so a caller could record an
  intent for an unadmitted tool. That call now throws `RunModelError`. This is a
  tightening of an existing export. It is released as a minor bump because seed is
  pre-1.0 and no repository imports it yet; a caller that recorded unadmitted intents
  must add the tool to the objective's `allowedTools` or stop.

## Relation to the provider contract

A provider exists inside an attempt; it never runs the run. [provider.md](provider.md)
defines the seam — attempts effect things and record intents; providers complete text.
