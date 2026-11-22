/**
 * Step resume and run leases. Specified in docs/contracts/run-model.md ("Resume" and
 * "Lease"). In-process records only: nothing here persists state, opens a listener, or
 * reads a clock the caller did not hand in (the default is the current time).
 */

import { randomUUID } from 'node:crypto';

export const STEP_OUTCOMES = ['succeeded', 'failed', 'skipped', 'not_reached'];

export class ResumeError extends Error {}

/** Raised when a live lease is already held. Carries the lease that blocked the claim. */
export class LeaseHeldError extends Error {
  constructor(lease) {
    super(`A lease is held by "${lease.holder}" until ${lease.expiresAt} (lease ${lease.leaseId}).`);
    this.lease = lease;
  }
}

function checkPlan(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new ResumeError('A resume needs a non-empty list of steps.');
  const ids = new Set();
  for (const step of steps) {
    const id = step?.id;
    if (typeof id !== 'string' || id.length === 0) throw new ResumeError('Every step has a non-empty string id.');
    if (ids.has(id)) throw new ResumeError(`Step "${id}" appears more than once.`);
    ids.add(id);
  }
  return ids;
}

/**
 * Run steps in order, carrying forward the steps a previous attempt completed.
 *
 * - A step whose id is in `completed` is reported `skipped`, and `execute` is not called
 *   for it. Its effect does not run twice.
 * - `execute(step)` returns `{ ok, detail? }`. A throw counts as a failure.
 * - The first failed step stops the run. Every later step is `not_reached`.
 * - A `completed` id that is not in the plan is refused: the plan changed, so the record
 *   of what was done no longer describes it.
 *
 * Returns `{ status, steps, completed }`: `status` is `complete` or `failed`, `steps` holds
 * one `{ id, outcome, detail }` per step in plan order, and `completed` is every step id
 * now done, in plan order, for the next attempt to carry.
 */
export async function resumeSteps({ steps, completed = [], execute }) {
  const ids = checkPlan(steps);
  if (typeof execute !== 'function') throw new ResumeError('A resume needs an execute function.');
  if (!Array.isArray(completed)) throw new ResumeError('completed must be an array of step ids.');
  for (const id of completed) {
    if (!ids.has(id)) throw new ResumeError(`Completed step "${id}" is not in this plan; start a new attempt from the current plan.`);
  }
  const done = new Set(completed);
  const outcomes = [];
  let failed = false;
  for (const step of steps) {
    if (done.has(step.id)) {
      outcomes.push({ id: step.id, outcome: 'skipped', detail: 'completed in a previous attempt' });
      continue;
    }
    if (failed) {
      outcomes.push({ id: step.id, outcome: 'not_reached', detail: 'an earlier step failed' });
      continue;
    }
    let result;
    try {
      result = await execute(step);
    } catch (error) {
      result = { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
    if (result?.ok === true) {
      done.add(step.id);
      outcomes.push({ id: step.id, outcome: 'succeeded', detail: typeof result.detail === 'string' ? result.detail : '' });
    } else {
      failed = true;
      outcomes.push({ id: step.id, outcome: 'failed', detail: typeof result?.detail === 'string' ? result.detail : 'step reported failure' });
    }
  }
  return {
    status: failed ? 'failed' : 'complete',
    steps: outcomes,
    completed: steps.map(step => step.id).filter(id => done.has(id)),
  };
}

function toMillis(now) {
  const ms = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(ms)) throw new ResumeError('now must be a Date or a millisecond timestamp.');
  return ms;
}

function leaseExpiry(lease) {
  if (lease === null || typeof lease !== 'object') return Number.NaN;
  if (typeof lease.leaseId !== 'string' || typeof lease.holder !== 'string') return Number.NaN;
  return typeof lease.expiresAt === 'string' ? Date.parse(lease.expiresAt) : Number.NaN;
}

/** True when the lease exists and has not reached its expiry. */
export function isLeaseLive(lease, now = Date.now()) {
  const expiry = leaseExpiry(lease);
  return Number.isFinite(expiry) && toMillis(now) < expiry;
}

/**
 * Claim the run's lease. `current` is the lease on record, or null.
 *
 * - A live lease refuses every second runner with LeaseHeldError, including one that gives
 *   the same holder name: a name is not proof of being the same process.
 * - An expired lease may be replaced.
 * - A malformed lease on record is refused, not broken: it cannot show it has expired.
 *
 * Returns a new lease `{ leaseId, holder, acquiredAt, expiresAt }` with ISO timestamps.
 */
export function claimLease(current, { holder, ttlMs, now = Date.now() } = {}) {
  if (typeof holder !== 'string' || holder.length === 0) throw new ResumeError('A lease names its holder.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new ResumeError('A lease has a positive whole-millisecond ttl.');
  const at = toMillis(now);
  if (current !== null && current !== undefined) {
    if (!Number.isFinite(leaseExpiry(current))) {
      throw new ResumeError('The lease on record is malformed; clear it by hand before a new claim.');
    }
    if (isLeaseLive(current, at)) throw new LeaseHeldError(current);
  }
  return {
    leaseId: randomUUID(),
    holder,
    acquiredAt: new Date(at).toISOString(),
    expiresAt: new Date(at + ttlMs).toISOString(),
  };
}

/**
 * Release a lease. Returns the lease that stays on record: null when `lease` is the one
 * held, otherwise `current` unchanged, so a stale holder cannot release its successor.
 */
export function releaseLease(current, lease) {
  if (current && lease && typeof lease.leaseId === 'string' && current.leaseId === lease.leaseId) return null;
  return current ?? null;
}
