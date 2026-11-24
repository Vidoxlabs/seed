// One objective carried across every implemented contract at once.
//
// The other test files exercise one module each. This file asks the question those
// cannot answer: do the contracts compose into a run? It wires a registry, a caller
// admission decision, a scripted provider, an objective, attempts, recorded intents,
// a tool surface, receipts, leases, and a resume after a crash, and asserts the
// invariants the contracts claim for the combination.
//
// The driver below is test-local on purpose. Seed ships no runtime loop, so this is
// the shape a composer must write, and every seam it has to bridge is visible here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  admitCaller,
  attachReceipt,
  checkRegistryDocuments,
  checkSchema,
  claimLease,
  createAttemptRecord,
  createObjective,
  isLeaseLive,
  LeaseHeldError,
  normalizeGeneration,
  recordIntent,
  releaseLease,
  modelAlias,
  modelAliasTable,
  resolveModel,
  resumeSteps,
  RunModelError,
  transition,
  validateProvider,
  validateValue,
} from '../src/index.mjs';

// ---------------------------------------------------------------- driver helpers

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// A digest of the arguments, stable across key order, which is what an intent carries.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

const digestOf = (value) => sha256(stableStringify(value));

// The registry a coordinator holds: callers, the commands they may run, and the
// neutral tool ID each command maps to.
function registry() {
  return {
    callers: [
      { id: 'coordinator', enabled: true, allowedTools: ['docs.file.read', 'docs.file.write'] },
      { id: 'specialist', enabled: true, allowedTools: ['docs.file.read'] },
      { id: 'retired', enabled: false, allowedTools: ['docs.file.read'] },
    ],
    commands: [
      { command: ['docs', 'read'], toolId: 'docs.file.read' },
      { command: ['docs', 'write'], toolId: 'docs.file.write' },
    ],
  };
}

// A tool surface that runs the effect and records every call it actually performed.
function surface() {
  const calls = [];
  const run = (toolId, args) => {
    calls.push({ toolId, args });
    if (toolId === 'docs.file.read') return { ok: true, detail: `read ${args.path}` };
    if (toolId === 'docs.file.write') return { ok: true, detail: `wrote ${args.path}` };
    return { ok: false, detail: `no handler for ${toolId}`, failureClass: 'tool-unknown' };
  };
  return { calls, run };
}

// A provider double that conforms to the seam and answers from a script.
function scriptedProvider(turns) {
  let at = 0;
  const provider = {
    name: 'scripted',
    async generate({ prompt }) {
      const turn = turns[at] ?? { text: '', complete: false, usage: null };
      at += 1;
      return { ...turn, promptSeen: prompt };
    },
  };
  return provider;
}

const objectiveInput = (allowedTools = ['docs.file.read', 'docs.file.write']) => ({
  id: 'obj-harness-1',
  intent: 'Read the plan and land one note in the docs tree.',
  acceptance: 'npm test',
  allowedTools,
});

const plan = [
  { id: 'read-plan', toolId: 'docs.file.read', args: { path: 'plan.md' } },
  { id: 'write-note', toolId: 'docs.file.write', args: { path: 'note.md', text: 'landed' } },
];

// Read the attempt's recorded intents back as the set of steps an effect may have
// started. The join is by tool ID and argument digest: seed records intents, not step
// IDs, so every composer writes this function itself. An intent is written before its
// effect runs, so this is "may have run", never "ran".
function intented(attempt, steps) {
  return steps
    .filter(step => attempt.recordedIntents.some(
      intent => intent.toolId === step.toolId && intent.argumentsDigest === digestOf(step.args),
    ))
    .map(step => step.id);
}

// The steps a receipt proves landed. A receipt carries a check name and a revision and
// no step reference, so a composer names its step inside the check string.
function receipted(attempt, steps) {
  return steps
    .filter(step => attempt.receipts.some(receipt => receipt.check === `npm test:${step.id}`))
    .map(step => step.id);
}

// -------------------------------------------------------------------- the run

test('an objective runs to complete through admission, intents, effects and receipts', async () => {
  const log = [];
  const calls = surface();
  const provider = scriptedProvider([
    { text: 'docs read plan.md', complete: true, model: 'scripted-1', usage: { input: 12, output: 4 } },
  ]);

  assert.equal(validateProvider(provider).ok, true);
  const generation = normalizeGeneration(await provider.generate({ system: 's', prompt: 'p', model: 'scripted-1' }));
  assert.equal(generation.ok, true);
  assert.equal(generation.generation.usage.total, null);          // never invented

  let objective = createObjective(objectiveInput());
  assert.equal(objective.status, 'draft');
  objective = transition(transition(objective, 'ready'), 'running');
  const attempt = createAttemptRecord({ objective, attempt: 1 });

  const registryCheck = checkRegistryDocuments({
    agents: { agents: [{ id: 'coordinator', allowedTools: ['docs.file.read', 'docs.file.write'] }] },
    tools: { tools: [{ id: 'docs.file.read' }, { id: 'docs.file.write' }] },
  });
  assert.equal(registryCheck.ok, true);

  const run = await resumeSteps({
    steps: plan,
    execute: async (step) => {
      const decision = admitCaller(registry(), { callerId: 'coordinator', command: step.toolId === 'docs.file.read' ? ['docs', 'read'] : ['docs', 'write'] });
      assert.equal(decision.admitted, true);
      // The intent is recorded before the effect runs, so a restart reads intent not output.
      Object.assign(attempt, recordIntent(attempt, {
        toolId: step.toolId,
        argumentsDigest: digestOf(step.args),
        scope: 'repo:seed',
      }));
      log.push(`intent:${step.id}`);
      const result = calls.run(step.toolId, step.args);
      log.push(`effect:${step.id}`);
      return result;
    },
  });

  assert.equal(run.status, 'complete');
  assert.deepEqual(run.completed, ['read-plan', 'write-note']);
  assert.deepEqual(log, ['intent:read-plan', 'effect:read-plan', 'intent:write-note', 'effect:write-note']);
  assert.equal(attempt.recordedIntents.length, 2);
  assert.equal(attempt.receipts.length, 0);                        // an effect is not its own receipt

  const receipted = plan.reduce(
    (record, step) => attachReceipt(record, { check: `npm test:${step.id}`, revision: '5838727' }),
    attempt,
  );
  assert.equal(receipted.receipts.length, 2);
  assert.deepEqual(receipted.receipts[1], { check: 'npm test:write-note', revision: '5838727' });

  const settling = transition(objective, 'settling');
  assert.equal(transition(settling, 'complete').status, 'complete');
});

test('a tool the objective did not admit is refused when the intent is recorded', async () => {
  const calls = surface();
  let objective = createObjective(objectiveInput(['docs.file.read']));
  objective = transition(transition(objective, 'ready'), 'running');
  const attempt = createAttemptRecord({ objective, attempt: 1 });

  assert.throws(
    () => recordIntent(attempt, { toolId: 'docs.file.write', argumentsDigest: digestOf({ path: 'note.md' }), scope: 'repo:seed' }),
    RunModelError,
  );
  assert.deepEqual(calls.calls, []);                               // not on the list, not callable
  assert.equal(attempt.recordedIntents.length, 0);
});

test('a caller admission denial stops the step before any intent or effect', async () => {
  const calls = surface();
  let objective = createObjective(objectiveInput());
  objective = transition(transition(objective, 'ready'), 'running');
  const attempt = createAttemptRecord({ objective, attempt: 1 });

  const denied = admitCaller(registry(), { callerId: 'specialist', command: ['docs', 'write'] });
  assert.equal(denied.admitted, false);
  assert.equal(denied.code, 'tool-not-allowed');
  assert.equal(admitCaller(registry(), { callerId: 'retired', command: ['docs', 'read'] }).code, 'caller-disabled');
  assert.equal(attempt.recordedIntents.length, 0);
  assert.deepEqual(calls.calls, []);
});

test('a recorded intent is not proof of a landed effect, so a crash leaves the step ambiguous', async () => {
  const calls = surface();
  let objective = createObjective(objectiveInput());
  objective = transition(transition(objective, 'ready'), 'running');
  let attempt = createAttemptRecord({ objective, attempt: 1 });

  // The read lands and is receipted. The write records its intent, then the process dies
  // before the effect is known to have run: that is the case a bare intent cannot settle.
  const firstRun = await resumeSteps({
    steps: plan,
    execute: async (step) => {
      attempt = recordIntent(attempt, {
        toolId: step.toolId,
        argumentsDigest: digestOf(step.args),
        scope: 'repo:seed',
      });
      if (step.id === 'read-plan') {
        const result = calls.run(step.toolId, step.args);
        attempt = attachReceipt(attempt, { check: 'npm test:read-plan', revision: '5838727' });
        return result;
      }
      return { ok: false, detail: 'process died after the intent was written', failureClass: 'external-unavailable' };
    },
  });

  assert.equal(firstRun.status, 'failed');
  assert.deepEqual(calls.calls.map(call => call.toolId), ['docs.file.read']);
  // The intent set claims both steps; only the receipt set tells the truth.
  assert.deepEqual(intented(attempt, plan), ['read-plan', 'write-note']);
  assert.deepEqual(receipted(attempt, plan), ['read-plan']);

  // So the resume asks the owner rather than skipping (the write may not have run) or
  // repeating it (the write may have). Nothing the package exports decides this.
  const ambiguous = intented(attempt, plan).filter(id => !receipted(attempt, plan).includes(id));
  assert.deepEqual(ambiguous, ['write-note']);
  assert.equal(transition(objective, 'waiting_for_owner').status, 'waiting_for_owner');
});

test('after the owner answers, the resume runs the unreceipted step and repeats no receipted one', async () => {
  const calls = surface();
  let objective = createObjective(objectiveInput());
  objective = transition(transition(objective, 'ready'), 'running');
  let attempt = createAttemptRecord({ objective, attempt: 1 });

  // Attempt 1: the read lands with a receipt, the write dies with only its intent.
  const first = await resumeSteps({
    steps: plan,
    execute: async (step) => {
      attempt = recordIntent(attempt, {
        toolId: step.toolId,
        argumentsDigest: digestOf(step.args),
        scope: 'repo:seed',
      });
      if (step.id === 'read-plan') {
        const result = calls.run(step.toolId, step.args);
        attempt = attachReceipt(attempt, { check: 'npm test:read-plan', revision: '5838727' });
        return result;
      }
      return { ok: false, detail: 'crash', failureClass: 'external-unavailable' };
    },
  });
  assert.equal(first.status, 'failed');

  const waiting = transition(objective, 'waiting_for_owner');
  const resumedObjective = transition(waiting, 'running');

  // A second process holds a new attempt record; the earlier receipts are what it
  // carries forward, because a fresh attempt starts with no intents and no receipts.
  const second = createAttemptRecord({ objective: resumedObjective, attempt: 2 });
  assert.deepEqual(second.recordedIntents, []);
  assert.deepEqual(second.receipts, []);
  second.receipts = [...attempt.receipts];

  const resumed = await resumeSteps({
    steps: plan,
    completed: receipted(second, plan),
    execute: async (step) => {
      const run2 = recordIntent(second, {
        toolId: step.toolId,
        argumentsDigest: digestOf(step.args),
        scope: 'repo:seed',
      });
      second.recordedIntents = run2.recordedIntents;
      return calls.run(step.toolId, step.args);
    },
  });

  assert.equal(resumed.status, 'complete');
  assert.deepEqual(resumed.steps.map(({ id, outcome }) => [id, outcome]), [
    ['read-plan', 'skipped'], ['write-note', 'succeeded'],
  ]);
  assert.deepEqual(calls.calls.map(call => call.toolId), ['docs.file.read', 'docs.file.write']);
});

test('a live lease refuses the second runner, and a stale holder cannot release its successor', () => {
  const held = claimLease(null, { holder: 'runner-a', ttlMs: 60_000, now: 1_000 });
  assert.equal(isLeaseLive(held, 1_001), true);
  assert.throws(() => claimLease(held, { holder: 'runner-a', ttlMs: 60_000, now: 2_000 }), LeaseHeldError);
  assert.throws(() => claimLease(held, { holder: 'runner-b', ttlMs: 60_000, now: 2_000 }), LeaseHeldError);

  const successor = claimLease(held, { holder: 'runner-b', ttlMs: 60_000, now: 61_000 });
  assert.equal(releaseLease(successor, held), successor);           // the stale holder releases nothing
  assert.equal(releaseLease(successor, successor), null);
});

test('a step whose arguments fail the input schema fails as schema-invalid and stops the run', async () => {
  const schema = {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string' }, text: { type: 'string' } },
    additionalProperties: false,
  };
  assert.equal(checkSchema(schema).ok, true);

  const badPlan = [
    { id: 'write-bad', toolId: 'docs.file.write', args: { path: 7 } },
    { id: 'write-note', toolId: 'docs.file.write', args: { path: 'note.md', text: 'landed' } },
  ];
  const calls = surface();

  const run = await resumeSteps({
    steps: badPlan,
    execute: async (step) => {
      const checked = validateValue(schema, step.args);
      if (!checked.ok) return { ok: false, detail: checked.errors.map(e => `${e.path} ${e.reason}`).join('; '), failureClass: 'schema-invalid' };
      return calls.run(step.toolId, step.args);
    },
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].failureClass, 'schema-invalid');
  assert.equal(run.steps[1].outcome, 'not_reached');
  assert.deepEqual(calls.calls, []);                                // nothing malformed reached the surface
});

test('the same script and the same provider produce the same run twice', async () => {
  const once = async () => {
    let objective = createObjective(objectiveInput());
    objective = transition(transition(objective, 'ready'), 'running');
    let attempt = createAttemptRecord({ objective, attempt: 1 });
    const provider = scriptedProvider([
      { text: 'docs read plan.md', complete: true, usage: null },
      { text: 'docs write note.md', complete: true, usage: null },
    ]);
    const calls = surface();
    const run = await resumeSteps({
      steps: plan,
      execute: async (step) => {
        const generation = normalizeGeneration(await provider.generate({ system: 's', prompt: step.id }));
        assert.equal(generation.ok, true);
        attempt = recordIntent(attempt, {
          toolId: step.toolId,
          argumentsDigest: digestOf(step.args),
          scope: 'repo:seed',
        });
        return calls.run(step.toolId, step.args);
      },
    });
    return {
      status: run.status,
      outcomes: run.steps.map(({ id, outcome }) => `${id}:${outcome}`),
      completed: run.completed,
      intents: attempt.recordedIntents.map(intent => `${intent.toolId}:${intent.argumentsDigest}`),
      effects: calls.calls.map(call => call.toolId),
    };
  };
  assert.deepEqual(await once(), await once());
});

test('a model alias resolves from the caller table, and an unknown alias is refused', () => {
  const table = modelAliasTable([
    modelAlias({ alias: 'fast', backendModel: 'scripted-1', workload: 'chat' }),
    modelAlias({ alias: 'deep', backendModel: 'scripted-2', workload: 'plan' }),
  ]);
  const resolved = resolveModel(table, 'fast');
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.backendModel, 'scripted-1');
  assert.deepEqual(resolveModel(table, 'unlisted'), { resolved: false, requested: 'unlisted', reason: 'unknown-alias' });
});
