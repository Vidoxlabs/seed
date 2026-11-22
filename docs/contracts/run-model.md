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

## Resume

`resumeSteps({ steps, completed, execute })` in `src/resume.mjs` runs a list of steps in
order and carries forward what a previous attempt finished:

1. A step whose id is in `completed` is reported `skipped`. `execute` is not called for
   it, so its effect does not run twice.
2. The first failed step stops the run. A throw counts as a failure, and a result
   without `ok: true` is not a success. Every later step is `not_reached`.
3. A `completed` id that the plan does not hold is refused with `ResumeError`. The plan
   changed, so the old record of what was done does not describe it.
4. The result returns `completed` in plan order, for the next attempt to carry.

This is an in-process rule. Keeping `completed` across a process restart is the durable
run store, stage 3.1, which stays `specified`.

## Lease

A lease says which runner may drive an attempt, and until when:
`{ leaseId, holder, acquiredAt, expiresAt }`, with ISO timestamps.

1. `claimLease(current, { holder, ttlMs, now })` refuses with `LeaseHeldError` while
   `current` is live. That includes a claim that gives the same holder name. A name is not
   proof of being the same runner.
2. An expired lease may be replaced. Expiry is exclusive: at `expiresAt` the lease is no
   longer live.
3. A malformed lease on record is refused, not broken. It cannot show it has expired, so
   it is cleared by hand.
4. `releaseLease(current, lease)` clears the record only when `lease` is the one held. A
   stale holder cannot release its successor's lease.

Leases are records the caller keeps. Seed stores none of them.

## Changes

- `0.3.0` — resume and lease records are new exports (`src/resume.mjs`). Additive; no
  existing export changed.
- `0.2.0` — rule 6 is new in code. Before `0.2.0` the contract said "not on the list,
  not callable" but `recordIntent` did not check the list, so a caller could record an
  intent for an unadmitted tool. That call now throws `RunModelError`. This is a
  tightening of an existing export. It is released as a minor bump because seed is
  pre-1.0 and no repository imports it yet; a caller that recorded unadmitted intents
  must add the tool to the objective's `allowedTools` or stop.

## Relation to the provider contract

A provider exists inside an attempt; it never runs the run. [provider.md](provider.md)
defines the seam — attempts effect things and record intents; providers complete text.
