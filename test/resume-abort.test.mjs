// Run abort: a resume that stops before any step runs, for a stated reason.
// Contract: docs/contracts/run-model.md ("Resume", "Abort"). Ported from the
// predecessor's abort codes: the reason only, with no job store and no clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resumeSteps, ResumeError, ABORT_CODES, STEP_OUTCOMES } from '../src/index.mjs';

const plan = [{ id: 'prepare' }, { id: 'apply' }, { id: 'verify' }];
const CODES = ['operator-abort', 'lease-expired', 'policy-revoked', 'max-attempts-exceeded'];

function recorder() {
  const calls = [];
  return { calls, execute: async (step) => { calls.push(step.id); return { ok: true }; } };
}

test('the abort codes are the four the predecessor named', () => {
  assert.deepEqual([...ABORT_CODES], CODES);
  assert.ok(Object.isFrozen(ABORT_CODES));
});

test('an aborted run calls execute for no step and carries its code', async () => {
  for (const abort of CODES) {
    const { calls, execute } = recorder();
    const run = await resumeSteps({ steps: plan, completed: ['prepare'], execute, abort });
    assert.deepEqual(calls, [], abort);
    assert.equal(run.status, 'aborted');
    assert.equal(run.abortCode, abort);
    assert.deepEqual(run.steps.map((step) => [step.id, step.outcome]), [
      ['prepare', 'skipped'], ['apply', 'not_reached'], ['verify', 'not_reached'],
    ]);
    assert.deepEqual(run.completed, ['prepare']);
    assert.equal(run.steps.some((step) => Object.hasOwn(step, 'failureClass') || Object.hasOwn(step, 'code')), false);
  }
});

test('an abort needs no executor, and the outcomes stay in the existing set', async () => {
  const run = await resumeSteps({ steps: plan, abort: 'operator-abort' });
  assert.equal(run.status, 'aborted');
  assert.deepEqual(run.completed, []);
  assert.ok(run.steps.every((step) => STEP_OUTCOMES.includes(step.outcome)));
  assert.match(run.steps[0].detail, /aborted/);
});

test('an unknown abort code throws before any step runs', async () => {
  for (const abort of ['timeout', 'Operator-Abort', '', null, 3]) {
    const { calls, execute } = recorder();
    await assert.rejects(resumeSteps({ steps: plan, execute, abort }), ResumeError, String(abort));
    assert.deepEqual(calls, []);
  }
});

test('an abort together with a dry run is refused', async () => {
  const { calls, execute } = recorder();
  await assert.rejects(resumeSteps({ steps: plan, execute, dryRun: true, abort: 'operator-abort' }), /dry run is not an abort/);
  assert.deepEqual(calls, []);
  const explicit = await resumeSteps({ steps: plan, execute, dryRun: false, abort: 'lease-expired' });
  assert.equal(explicit.status, 'aborted');
});

test('an abort still refuses a completed id the plan does not hold', async () => {
  await assert.rejects(resumeSteps({ steps: plan, completed: ['gone'], abort: 'policy-revoked' }), ResumeError);
});

test('without abort, runs, dry runs, and failure classes behave as before', async () => {
  const { calls, execute } = recorder();
  const run = await resumeSteps({ steps: plan, completed: ['prepare'], execute });
  assert.equal(run.status, 'complete');
  assert.deepEqual(calls, ['apply', 'verify']);
  assert.equal(Object.hasOwn(run, 'abortCode'), false);

  const preview = await resumeSteps({ steps: plan, completed: ['prepare'], dryRun: true });
  assert.equal(preview.status, 'dry_run');
  assert.equal(Object.hasOwn(preview, 'abortCode'), false);

  const failed = await resumeSteps({ steps: plan, execute: async (step) => (
    step.id === 'apply' ? { ok: false, failureClass: 'policy-denied' } : { ok: true }) });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.steps[1].failureClass, 'policy-denied');
  assert.equal(Object.hasOwn(failed, 'abortCode'), false);
});
