import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admitCaller, ADMISSION_DENIALS } from '../src/index.mjs';

const registry = () => ({
  callers: [
    { id: 'maintainer', enabled: true, allowedTools: ['docs.file.read', 'ingest.job.create'] },
    { id: 'retired', enabled: false, allowedTools: ['docs.file.read'] },
    { id: 'unflagged', allowedTools: ['docs.file.read'] },
  ],
  commands: [
    { command: ['docs', 'read'], toolId: 'docs.file.read' },
    { command: ['jobs', 'create'], toolId: 'ingest.job.create' },
    { command: ['jobs', 'cancel'], toolId: 'ingest.job.cancel' },
    { command: ['jobs', 'purge'], toolId: 'not a tool id' },
  ],
});

test('an enabled caller is admitted to a mapped command on its list', () => {
  const decision = admitCaller(registry(), { callerId: 'maintainer', command: ['jobs', 'create'] });
  assert.deepEqual(decision, { admitted: true, callerId: 'maintainer', toolId: 'ingest.job.create' });
  assert.equal(Object.isFrozen(decision), true);
});

test('a missing or malformed registry is a denial', () => {
  const call = { callerId: 'maintainer', command: ['docs', 'read'] };
  for (const bad of [undefined, null, [], 'registry', { callers: [] }, { commands: [] },
    { callers: [{}], commands: [] },
    { callers: [{ id: 'a', enabled: true }, { id: 'a', enabled: true }], commands: [] }]) {
    const decision = admitCaller(bad, call);
    assert.equal(decision.admitted, false);
    assert.equal(decision.code, 'registry-unavailable');
  }
});

test('an unknown caller or a call without a caller id is a denial', () => {
  assert.equal(admitCaller(registry(), { callerId: 'stranger', command: ['docs', 'read'] }).code, 'caller-unknown');
  assert.equal(admitCaller(registry(), { command: ['docs', 'read'] }).code, 'caller-unknown');
  assert.equal(admitCaller(registry(), { callerId: '', command: ['docs', 'read'] }).code, 'caller-unknown');
});

test('a disabled caller, or one that is not marked enabled, is a denial', () => {
  assert.equal(admitCaller(registry(), { callerId: 'retired', command: ['docs', 'read'] }).code, 'caller-disabled');
  assert.equal(admitCaller(registry(), { callerId: 'unflagged', command: ['docs', 'read'] }).code, 'caller-disabled');
});

test('an unmapped command is a denial', () => {
  const unmapped = (command) => admitCaller(registry(), { callerId: 'maintainer', command }).code;
  assert.equal(unmapped(['jobs', 'delete']), 'command-unmapped');
  assert.equal(unmapped(['jobs']), 'command-unmapped');                    // a prefix is not a match
  assert.equal(unmapped(['jobs', 'create', 'now']), 'command-unmapped');
  assert.equal(unmapped('jobs create'), 'command-unmapped');               // segments, not a string
  assert.equal(unmapped(['jobs', 'purge']), 'command-unmapped');           // maps to a malformed tool ID
});

test('a mapped tool outside the caller\'s list is a denial', () => {
  const decision = admitCaller(registry(), { callerId: 'maintainer', command: ['jobs', 'cancel'] });
  assert.equal(decision.code, 'tool-not-allowed');
  assert.match(decision.reason, /ingest\.job\.cancel/);
});

test('every denial code is a listed code', () => {
  assert.deepEqual(ADMISSION_DENIALS, [
    'registry-unavailable', 'caller-unknown', 'caller-disabled', 'command-unmapped', 'tool-not-allowed',
  ]);
});
