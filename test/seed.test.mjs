import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseToolId, formatToolId, isValidToolId, isWellFormedRegistryEntry, ToolIdError,
  RESERVED_DOMAINS,
} from '../src/tool-id.mjs';
import { validateProvider, normalizeGeneration } from '../src/provider.mjs';
import {
  createObjective, transition, createAttemptRecord, recordIntent, attachReceipt,
  canTransition, RunModelError,
} from '../src/run-model.mjs';

const DIGEST = 'a'.repeat(64);

test('the contract examples parse into their parts', () => {
  assert.deepEqual(parseToolId('vcs.file.read'), { domain: 'vcs', resource: 'file', sub: null, verb: 'read' });
  assert.deepEqual(parseToolId('telemetry.search'), { domain: 'telemetry', resource: null, sub: null, verb: 'search' });
  assert.deepEqual(parseToolId('memory.context.read'), { domain: 'memory', resource: 'context', sub: null, verb: 'read' });
  assert.deepEqual(parseToolId('docs.file.metadata.read'), { domain: 'docs', resource: 'file', sub: 'metadata', verb: 'read' });
});

test('the grammar rejects what the contract forbids', () => {
  assert.throws(() => parseToolId('read'), ToolIdError);                    // one segment
  assert.throws(() => parseToolId('a.b.c.d.e.read'), ToolIdError);          // five segments
  assert.throws(() => parseToolId('vcs.File.read'), ToolIdError);           // uppercase
  assert.throws(() => parseToolId('vcs.file_read.read'), ToolIdError);     // underscore
  assert.throws(() => parseToolId('vcs.file.fetch'), ToolIdError);          // uncontrolled verb
  assert.throws(() => parseToolId('.vcs.read'), ToolIdError);               // leading separator
  assert.throws(() => parseToolId('openai.chat.read'), ToolIdError);        // vendor in the ID
  assert.throws(() => parseToolId('v37.node.read'), ToolIdError);           // infrastructure in the ID
  assert.equal(isValidToolId('vcs.file.read'), true);
  assert.equal(isValidToolId('v37.node.read'), false);                 // infrastructure in the ID
});

test('formatToolId validates while it composes', () => {
  assert.equal(formatToolId({ domain: 'vcs', resource: 'file', verb: 'read' }), 'vcs.file.read');
  assert.equal(formatToolId({ domain: 'ingest', resource: 'job', verb: 'create' }), 'ingest.job.create');
  assert.throws(() => formatToolId({ domain: 'vcs', verb: 'fetch' }));
});

test('the context domain stays reserved for the retrieval system', () => {
  assert.equal(RESERVED_DOMAINS.has('context'), true);
  assert.equal(RESERVED_DOMAINS.has('compute'), true);
});

test('registry entries carry connector identity and effect classes', () => {
  const good = {
    toolId: 'docs.file.read',
    connector: 'drive-readonly',
    effect: 'read',
    realm: 'docs',
    thirdPartyEgress: true,
    ownerGate: false,
    inputSchema: { type: 'object' },
    legacyNames: ['docs.file.metadata.read'],
  };
  assert.equal(isWellFormedRegistryEntry(good).ok, true);
  const gated = { ...good, effect: 'credential', ownerGate: true };
  assert.equal(isWellFormedRegistryEntry(gated).ok, true);
  assert.equal(isWellFormedRegistryEntry({ ...good, effect: 'side-effect' }).ok, false);
  assert.equal(isWellFormedRegistryEntry({ ...good, ownerGate: 'yes' }).ok, false);
  assert.equal(isWellFormedRegistryEntry({ ...good, legacyNames: ['not valid'] }).ok, false);
});

test('providers conform by shape, not brand', () => {
  assert.equal(validateProvider({ generate: async (call) => call }).ok, true);
  assert.equal(validateProvider({}).ok, false);
  assert.equal(validateProvider({ generate: 42 }).ok, false);
});

test('generation records never invent metrics', () => {
  const full = normalizeGeneration({
    text: 'ok', complete: true, model: 'local-1',
    usage: { input: 10, output: 5, total: 15, cacheRead: 2, cacheWrite: 1 },
  });
  assert.equal(full.ok, true);
  assert.deepEqual(full.generation.usage, { input: 10, output: 5, total: 15, cacheRead: 2, cacheWrite: 1 });

  const unreported = normalizeGeneration({ text: '', complete: true, model: null, usage: null });
  assert.equal(unreported.ok, true);
  assert.equal(unreported.generation.usage, null);

  assert.equal(normalizeGeneration({ text: 'x', complete: false }).ok, true);
  assert.equal(normalizeGeneration({ text: 'x', complete: 'yes' }).ok, false);
  assert.equal(normalizeGeneration({ complete: true }).ok, false);                 // text must exist
  assert.equal(normalizeGeneration({ text: 'x', complete: true, model: 42 }).ok, false);
  assert.equal(normalizeGeneration({ text: 'x', complete: true, usage: { input: -1 } }).ok, false);
  assert.equal(normalizeGeneration({ text: 'x', complete: true, usage: { input: '10' } }).ok, false);
  assert.equal(normalizeGeneration({ text: 'x', complete: true, usage: { mystery: 1 } }).ok, false);
});

test('objectives state acceptance and admit tools before work', () => {
  const objective = createObjective({
    id: 'obj-1',
    intent: 'Assemble the guide from admitted sources.',
    acceptance: 'Guide exists, sections complete, hash recorded.',
    allowedTools: ['docs.file.read', 'compute.rows.verify'],
  });
  assert.equal(objective.status, 'draft');
  assert.deepEqual(objective.allowedTools, ['docs.file.read', 'compute.rows.verify']);
  assert.throws(() => createObjective({ id: 'x', intent: '', acceptance: 'a', allowedTools: ['docs.file.list'] }), RunModelError);
  assert.throws(() => createObjective({ id: 'x', intent: 'i', acceptance: '', allowedTools: ['docs.file.list'] }), RunModelError);
  assert.throws(() => createObjective({ id: 'x', intent: 'i', acceptance: 'a', allowedTools: [] }), RunModelError);
  assert.throws(() => createObjective({ id: 'x', intent: 'i', acceptance: 'a', allowedTools: ['v37.host.read'] }), RunModelError);
});

test('run statuses move only through legal transitions', () => {
  assert.equal(canTransition('draft', 'ready'), true);
  assert.equal(canTransition('running', 'waiting_for_owner'), true);
  assert.equal(canTransition('waiting_for_owner', 'running'), true);
  assert.equal(canTransition('draft', 'running'), false);
  assert.equal(canTransition('settling', 'running'), false);
  const ready = transition(createObjective({
    id: 'obj-2', intent: 'i', acceptance: 'a', allowedTools: ['docs.file.list'],
  }), 'ready');
  const running = transition(ready, 'running');
  assert.equal(running.status, 'running');
  assert.throws(() => transition(running, 'complete'), RunModelError); // settling first
  const settled = transition(running, 'settling');
  const complete = transition(settled, 'complete');
  assert.throws(() => transition(complete, 'draft'), RunModelError);   // terminal stays terminal
});

test('attempts record intents before effects and never guess', () => {
  const objective = transition(createObjective({
    id: 'obj-3', intent: 'i', acceptance: 'a', allowedTools: ['docs.file.read'],
  }), 'ready');
  const running = transition(objective, 'running');
  let attempt = createAttemptRecord({ objective: running });
  assert.equal(attempt.objectiveId, 'obj-3');
  assert.equal(attempt.recordedIntents.length, 0);
  attempt = recordIntent(attempt, { toolId: 'docs.file.read', argumentsDigest: DIGEST, scope: 'docs:guide' });
  assert.equal(attempt.recordedIntents.length, 1);
  assert.throws(() => recordIntent(attempt, { toolId: 'bad id', argumentsDigest: DIGEST, scope: 'docs:guide' }), RunModelError);
  assert.throws(() => recordIntent(attempt, { toolId: 'docs.file.read', argumentsDigest: 'nothex', scope: 'docs' }), RunModelError);
  attempt = attachReceipt(attempt, { check: 'guide sections complete', revision: '0123abc' });
  assert.equal(attempt.receipts[0].check, 'guide sections complete');
  assert.throws(() => createAttemptRecord({ objective: ready_statusless() }), RunModelError);
});

function ready_statusless() {
  return { id: 'x', intent: 'i', acceptance: 'a', allowedTools: [], status: 'ready' };
}
