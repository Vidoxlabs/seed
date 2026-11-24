import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { validateProvider, normalizeGeneration } from '../src/index.mjs';

const fixtureUrl = new URL('./fixtures/provider-conformance.json', import.meta.url);
const fixtureText = readFileSync(fixtureUrl, 'utf8');
const fixtures = JSON.parse(fixtureText);
const byClass = name => fixtures.cases.filter(entry => entry.class === name);

/** A recorded adapter: it replays one case and never reaches a backend. */
function replayAdapter(entry, { onChunk } = {}) {
  return {
    name: `replay-${entry.id}`,
    async generate({ signal }) {
      if (!entry.stream) return structuredClone(entry.response);
      let text = '';
      let sent = 0;
      for (const chunk of entry.stream.chunks) {
        await nextTurn();
        if (signal?.aborted) return { text, complete: false, model: null, usage: null };
        text += chunk;
        sent += 1;
        onChunk?.(sent);
      }
      await nextTurn();
      if (signal?.aborted) return { text, complete: false, model: null, usage: null };
      return { text, ...structuredClone(entry.stream.final) };
    },
  };
}

async function runCase(entry) {
  const controller = new AbortController();
  const abortAfter = entry.stream?.abortAfterChunks ?? null;
  const adapter = replayAdapter(entry, {
    onChunk: sent => { if (sent === abortAfter) controller.abort(); },
  });
  assert.deepEqual(validateProvider(adapter), { ok: true, errors: [] }, entry.id);
  const raw = await adapter.generate({ ...entry.request, signal: controller.signal });
  return normalizeGeneration(raw);
}

async function withNetworkDisabled(body) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('a conformance fixture reached the network'); };
  try {
    await body();
  } finally {
    globalThis.fetch = realFetch;
  }
  return calls;
}

test('conformance-fixtures-run-offline', async () => {
  assert.equal(fixtures.version, 1);
  const classes = new Set(fixtures.cases.map(entry => entry.class));
  assert.deepEqual([...classes].sort(), ['malformed', 'slow-stream', 'truncated', 'unavailable-model', 'valid']);
  assert.equal(new Set(fixtures.cases.map(entry => entry.id)).size, fixtures.cases.length);
  const calls = await withNetworkDisabled(async () => {
    for (const entry of fixtures.cases) {
      const result = await runCase(entry);
      assert.equal(result.ok, entry.expect.ok, entry.id);
      if (entry.expect.ok) assert.deepEqual(result.generation, entry.expect.generation, entry.id);
      else assert.deepEqual(result.errors, entry.expect.errors, entry.id);
    }
  });
  assert.equal(calls, 0);
});

test('conformance-fixtures-hold-no-address-or-credential', () => {
  assert.doesNotMatch(fixtureText, /([0-9]{1,3}\.){3}[0-9]{1,3}/);
  assert.doesNotMatch(fixtureText, /[a-z][a-z0-9+.-]*:\/\//i);
  assert.doesNotMatch(fixtureText, /:[0-9]{2,5}\b/);
  assert.doesNotMatch(fixtureText, /bearer|api[_-]?key|secret|token/i);
});

test('malformed-and-truncated-fixtures-fail-closed', async () => {
  const malformed = byClass('malformed');
  assert.ok(malformed.length >= 6);
  for (const entry of malformed) {
    const result = await runCase(entry);
    assert.equal(result.ok, false, entry.id);
    assert.equal(result.generation, null, entry.id);
    assert.ok(result.errors.length > 0, entry.id);
    assert.deepEqual(result.errors, entry.expect.errors, entry.id);
  }
  const truncated = byClass('truncated');
  assert.ok(truncated.length >= 1);
  for (const entry of truncated) {
    const result = await runCase(entry);
    assert.equal(result.ok, true, entry.id);
    assert.equal(result.generation.complete, false, `${entry.id} was promoted to complete`);
    assert.equal(result.generation.text, entry.response.text, entry.id);
  }
  // An unavailable model fails closed and never names a model in place of the one requested.
  for (const entry of byClass('unavailable-model')) {
    const result = await runCase(entry);
    assert.equal(result.ok, false, entry.id);
    assert.equal(result.generation, null, entry.id);
  }
});

test('slow-stream-abort-produces-no-fabrication', async () => {
  const aborted = byClass('slow-stream').filter(entry => entry.stream.abortAfterChunks !== null);
  assert.ok(aborted.length >= 1);
  for (const entry of aborted) {
    const result = await runCase(entry);
    assert.equal(result.ok, true, entry.id);
    assert.equal(result.generation.complete, false, `${entry.id} recorded a fabricated completion`);
    assert.equal(result.generation.usage, null, `${entry.id} invented usage`);
    const expected = entry.stream.chunks.slice(0, entry.stream.abortAfterChunks).join('');
    assert.equal(result.generation.text, expected, entry.id);
    assert.deepEqual(result.generation, entry.expect.generation, entry.id);
  }
  // The same stream, left to finish, earns its completion.
  for (const entry of byClass('slow-stream').filter(item => item.stream.abortAfterChunks === null)) {
    const result = await runCase(entry);
    assert.equal(result.generation.complete, true, entry.id);
  }
});
