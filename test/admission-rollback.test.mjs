import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isWellFormedRegistryEntry, checkRegistry, rollbackPosture, ROLLBACK_POSTURES,
} from '../src/tool-id.mjs';
import {
  createObjective, transition, createAttemptRecord, recordIntent, RunModelError,
} from '../src/run-model.mjs';
import { VERSION } from '../src/index.mjs';

const DIGEST = 'b'.repeat(64);

function runningObjective(allowedTools) {
  const draft = createObjective({ id: 'obj-adm', intent: 'i', acceptance: 'a', allowedTools });
  return transition(transition(draft, 'ready'), 'running');
}

const entry = (overrides = {}) => ({
  toolId: 'ingest.job.create',
  connector: 'local-queue',
  effect: 'write',
  realm: 'ingest',
  thirdPartyEgress: false,
  ownerGate: false,
  inputSchema: { type: 'object' },
  ...overrides,
});

test('an attempt carries the admission list it started with', () => {
  const objective = runningObjective(['docs.file.read', 'ingest.job.create']);
  const attempt = createAttemptRecord({ objective });
  assert.deepEqual(attempt.allowedTools, ['docs.file.read', 'ingest.job.create']);
  objective.allowedTools.push('ingest.job.cancel');                       // later edits do not widen it
  assert.deepEqual(attempt.allowedTools, ['docs.file.read', 'ingest.job.create']);
});

test('an intent for a tool not admitted to the objective is refused', () => {
  const attempt = createAttemptRecord({ objective: runningObjective(['docs.file.read']) });
  const recorded = recordIntent(attempt, { toolId: 'docs.file.read', argumentsDigest: DIGEST, scope: 'docs:guide' });
  assert.equal(recorded.recordedIntents.length, 1);
  assert.throws(
    () => recordIntent(attempt, { toolId: 'docs.file.write', argumentsDigest: DIGEST, scope: 'docs:guide' }),
    { message: /not admitted/ },
  );
  assert.throws(
    () => recordIntent(attempt, { toolId: 'docs.file.write', argumentsDigest: DIGEST, scope: 'docs:guide' }),
    RunModelError,
  );
});

test('admission fails closed when the attempt has no admission list', () => {
  const handBuilt = { objectiveId: 'x', attempt: 1, lease: 'l', recordedIntents: [], receipts: [] };
  assert.throws(
    () => recordIntent(handBuilt, { toolId: 'docs.file.read', argumentsDigest: DIGEST, scope: 'docs' }),
    RunModelError,
  );
  const emptyAdmission = { id: 'x', intent: 'i', acceptance: 'a', allowedTools: [], status: 'running' };
  assert.throws(() => createAttemptRecord({ objective: emptyAdmission }), RunModelError);
});

test('rollback posture is optional and defaults to unsupported', () => {
  assert.deepEqual(ROLLBACK_POSTURES, [
    'unsupported', 'compensating_action', 'restore_snapshot', 'manual_recovery_required',
  ]);
  assert.equal(isWellFormedRegistryEntry(entry()).ok, true);
  assert.equal(rollbackPosture(entry()), 'unsupported');
  const snapshot = entry({ rollback: { posture: 'restore_snapshot', description: 'Restore the prior queue state.' } });
  assert.equal(isWellFormedRegistryEntry(snapshot).ok, true);
  assert.equal(rollbackPosture(snapshot), 'restore_snapshot');
});

test('rollback declarations are checked, not executed', () => {
  const compensating = entry({ rollback: { posture: 'compensating_action', compensatingTool: 'ingest.job.cancel' } });
  assert.equal(isWellFormedRegistryEntry(compensating).ok, true);
  const bad = (rollback) => isWellFormedRegistryEntry(entry({ rollback })).ok;
  assert.equal(bad({ posture: 'compensating_action' }), false);                              // names no compensating tool
  assert.equal(bad({ posture: 'compensating_action', compensatingTool: 'not valid' }), false);
  assert.equal(bad({ posture: 'restore_snapshot', compensatingTool: 'ingest.job.cancel' }), false); // wrong posture for it
  assert.equal(bad({ posture: 'undo' }), false);                                             // unknown posture
  assert.equal(bad({ posture: 'unsupported', description: 7 }), false);
  assert.equal(bad({ posture: 'unsupported', executor: 'auto' }), false);                    // unknown field
  assert.equal(bad(null), false);
  assert.equal(bad(['unsupported']), false);
});

test('a registry check resolves compensating tools and refuses duplicate IDs', () => {
  const create = entry({ rollback: { posture: 'compensating_action', compensatingTool: 'ingest.job.cancel' } });
  const cancel = entry({ toolId: 'ingest.job.cancel', effect: 'destructive' });
  assert.deepEqual(checkRegistry([create, cancel]), { ok: true, errors: [] });

  const dangling = checkRegistry([create]);
  assert.equal(dangling.ok, false);
  assert.match(dangling.errors.join('\n'), /ingest\.job\.cancel.*not registered/);

  const selfCompensating = entry({ rollback: { posture: 'compensating_action', compensatingTool: 'ingest.job.create' } });
  assert.equal(checkRegistry([selfCompensating]).ok, true);                // a tool may compensate itself

  const duplicate = checkRegistry([cancel, { ...cancel }]);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join('\n'), /registered more than once/);

  const malformed = checkRegistry([cancel, { ...cancel, toolId: 'ingest.job.list', effect: 'side-effect' }]);
  assert.equal(malformed.ok, false);
  assert.match(malformed.errors.join('\n'), /^ingest\.job\.list: effect/m);

  assert.equal(checkRegistry('not a list').ok, false);
});

test('the exported version matches the package', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});
