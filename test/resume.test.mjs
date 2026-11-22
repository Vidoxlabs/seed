import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resumeSteps, claimLease, releaseLease, isLeaseLive, LeaseHeldError, ResumeError,
} from '../src/index.mjs';

const plan = [{ id: 'prepare' }, { id: 'apply' }, { id: 'verify' }];

function recorder(results = {}) {
  const calls = [];
  const execute = async (step) => {
    calls.push(step.id);
    const result = results[step.id] ?? { ok: true };
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, execute };
}

test('a resume skips a step a previous attempt completed', async () => {
  const { calls, execute } = recorder();
  const run = await resumeSteps({ steps: plan, completed: ['prepare'], execute });
  assert.deepEqual(calls, ['apply', 'verify']);                            // prepare does not run again
  assert.equal(run.status, 'complete');
  assert.deepEqual(run.steps.map(s => s.outcome), ['skipped', 'succeeded', 'succeeded']);
  assert.deepEqual(run.completed, ['prepare', 'apply', 'verify']);
});

test('a dry run reports skipped and pending steps without executing or completing them', async () => {
  const { calls, execute } = recorder({ apply: new Error('should not run') });
  const completed = Object.freeze(['prepare']);
  const preview = await resumeSteps({ steps: plan, completed, execute, dryRun: true });
  assert.deepEqual(calls, []);
  assert.equal(preview.status, 'dry_run');
  assert.deepEqual(preview.steps.map(({ id, outcome }) => [id, outcome]), [
    ['prepare', 'skipped'], ['apply', 'would_run'], ['verify', 'would_run'],
  ]);
  assert.deepEqual(preview.completed, ['prepare']);
  assert.deepEqual(await resumeSteps({ steps: plan, completed, dryRun: true }), preview);
});

test('a malformed dry-run option is refused before any step executes', async () => {
  const { calls, execute } = recorder();
  await assert.rejects(resumeSteps({ steps: plan, execute, dryRun: 'true' }), ResumeError);
  assert.deepEqual(calls, []);
});

test('a resume stops after a failed step', async () => {
  const { calls, execute } = recorder({ apply: { ok: false, detail: 'apply refused' } });
  const run = await resumeSteps({ steps: plan, execute });
  assert.deepEqual(calls, ['prepare', 'apply']);                           // verify never runs
  assert.equal(run.status, 'failed');
  assert.deepEqual(run.steps.map(s => s.outcome), ['succeeded', 'failed', 'not_reached']);
  assert.equal(run.steps[1].detail, 'apply refused');
  assert.deepEqual(run.completed, ['prepare']);

  // The next attempt carries what was done and retries only from the failure.
  const retry = recorder();
  const second = await resumeSteps({ steps: plan, completed: run.completed, execute: retry.execute });
  assert.deepEqual(retry.calls, ['apply', 'verify']);
  assert.equal(second.status, 'complete');
});

test('a throwing step is a failure, and a missing ok is not a success', async () => {
  const thrown = await resumeSteps({ steps: plan, execute: recorder({ prepare: new Error('boom') }).execute });
  assert.deepEqual(thrown.steps.map(s => s.outcome), ['failed', 'not_reached', 'not_reached']);
  assert.equal(thrown.steps[0].detail, 'boom');
  const vague = await resumeSteps({ steps: plan, execute: recorder({ prepare: {} }).execute });
  assert.equal(vague.status, 'failed');
});

test('a resume refuses a completed id the plan does not hold, and a malformed plan', async () => {
  const { execute, calls } = recorder();
  await assert.rejects(resumeSteps({ steps: plan, completed: ['migrate'], execute }), ResumeError);
  assert.deepEqual(calls, []);
  await assert.rejects(resumeSteps({ steps: [], execute }), ResumeError);
  await assert.rejects(resumeSteps({ steps: [{ id: 'a' }, { id: 'a' }], execute }), ResumeError);
  await assert.rejects(resumeSteps({ steps: [{}], execute }), ResumeError);
  await assert.rejects(resumeSteps({ steps: plan }), ResumeError);
});

test('a failed step carries a supplied failure class from the closed vocabulary', async () => {
  const classes = [
    'policy-denied', 'gate-denied', 'tool-unknown', 'tool-not-canonical', 'schema-invalid',
    'handler-error', 'external-exec-failed', 'external-unavailable', 'external-incompatible',
  ];
  for (const failureClass of classes) {
    const { execute } = recorder({ apply: { ok: false, detail: 'apply failed', failureClass } });
    const run = await resumeSteps({ steps: plan, execute });
    assert.equal(run.status, 'failed');
    assert.deepEqual(run.completed, ['prepare']);
    assert.deepEqual(run.steps[1], { id: 'apply', outcome: 'failed', detail: 'apply failed', failureClass });
  }
});

test('omitting the failure class preserves the failed step shape', async () => {
  const { execute } = recorder({ apply: { ok: false, detail: 'apply failed' } });
  const run = await resumeSteps({ steps: plan, execute });
  assert.deepEqual(run.steps[1], { id: 'apply', outcome: 'failed', detail: 'apply failed' });
});

test('an invalid failure class refuses the result and keeps earlier completed steps', async () => {
  const invalidResults = [
    { ok: false, failureClass: 'unrecognized' },
    { ok: true, failureClass: 'unrecognized' },
    { ok: false, failureClass: null },
  ];
  for (const result of invalidResults) {
    const { calls, execute } = recorder({ apply: result });
    const run = await resumeSteps({ steps: plan, execute });
    assert.equal(run.status, 'failed');
    assert.deepEqual(run.completed, ['prepare']);
    assert.deepEqual(calls, ['prepare', 'apply']);
    assert.deepEqual(run.steps.map(step => step.outcome), ['succeeded', 'failed', 'not_reached']);
    assert.equal(run.steps[1].code, 'invalid-failure-class');
    assert.equal(Object.hasOwn(run.steps[1], 'failureClass'), false);
  }
});

test('a dry run reports no failure class', async () => {
  const { calls, execute } = recorder({ apply: { ok: false, failureClass: 'policy-denied' } });
  const preview = await resumeSteps({ steps: plan, completed: ['prepare'], execute, dryRun: true });
  assert.deepEqual(calls, []);
  assert.equal(preview.steps.some(step => Object.hasOwn(step, 'failureClass')), false);
});

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

test('a lease has a holder and an expiry', () => {
  const lease = claimLease(null, { holder: 'runner-a', ttlMs: 60_000, now: T0 });
  assert.equal(lease.holder, 'runner-a');
  assert.match(lease.leaseId, /^[0-9a-f-]{36}$/);
  assert.equal(lease.acquiredAt, '2026-01-01T00:00:00.000Z');
  assert.equal(lease.expiresAt, '2026-01-01T00:01:00.000Z');
  assert.equal(isLeaseLive(lease, T0 + 59_999), true);
  assert.equal(isLeaseLive(lease, T0 + 60_000), false);                    // expiry is exclusive
  assert.equal(isLeaseLive(null, T0), false);
});

test('a live lease refuses a second runner, and an expired lease may be replaced', () => {
  const first = claimLease(null, { holder: 'runner-a', ttlMs: 60_000, now: T0 });
  assert.throws(() => claimLease(first, { holder: 'runner-b', ttlMs: 60_000, now: T0 + 1_000 }), LeaseHeldError);
  assert.throws(() => claimLease(first, { holder: 'runner-a', ttlMs: 60_000, now: T0 + 1_000 }), LeaseHeldError);
  try {
    claimLease(first, { holder: 'runner-b', ttlMs: 60_000, now: T0 + 1_000 });
  } catch (error) {
    assert.equal(error.lease.leaseId, first.leaseId);
    assert.match(error.message, /runner-a/);
  }
  const next = claimLease(first, { holder: 'runner-b', ttlMs: 60_000, now: T0 + 60_000 });
  assert.equal(next.holder, 'runner-b');
  assert.notEqual(next.leaseId, first.leaseId);
});

test('a stale holder cannot release its successor, and a malformed lease is not broken', () => {
  const first = claimLease(null, { holder: 'runner-a', ttlMs: 1_000, now: T0 });
  const second = claimLease(first, { holder: 'runner-b', ttlMs: 60_000, now: T0 + 2_000 });
  assert.equal(releaseLease(second, first), second);                       // runner-a's release is ignored
  assert.equal(releaseLease(second, second), null);
  assert.equal(releaseLease(null, first), null);

  assert.throws(() => claimLease({ holder: 'x', expiresAt: 'soon' }, { holder: 'runner-c', ttlMs: 1_000, now: T0 }), ResumeError);
  assert.throws(() => claimLease(null, { holder: '', ttlMs: 1_000, now: T0 }), ResumeError);
  assert.throws(() => claimLease(null, { holder: 'runner-c', ttlMs: 0, now: T0 }), ResumeError);
  assert.throws(() => claimLease(null, { holder: 'runner-c', ttlMs: 1.5, now: T0 }), ResumeError);
});
