import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  modelAlias, modelAliasTable, resolveModel, ModelAliasError,
} from '../src/index.mjs';

const table = () => modelAliasTable([
  modelAlias({ alias: 'team-instruct', backendModel: 'family-7b-instruct-q4', workload: 'Team specialists' }),
  modelAlias({
    alias: 'team-general', backendModel: 'general-8b', workload: 'General reasoning',
    deprecated: true, replacedBy: 'team-instruct',
  }),
]);

test('the name a caller asks for stays distinct from the backend model', () => {
  const resolved = resolveModel(table(), 'team-instruct');
  assert.deepEqual(resolved, {
    resolved: true,
    requested: 'team-instruct',
    backendModel: 'family-7b-instruct-q4',
    deprecated: false,
    replacedBy: null,
  });
  assert.equal(Object.isFrozen(resolved), true);
  // An alias may not be its own backend name: the two names would blur into one.
  assert.throws(() => modelAlias({ alias: 'same-name', backendModel: 'same-name', workload: 'w' }), ModelAliasError);
});

test('a backend model name is not an alias, so it does not resolve', () => {
  const resolved = resolveModel(table(), 'family-7b-instruct-q4');
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.reason, 'unknown-alias');
  assert.equal(resolved.requested, 'family-7b-instruct-q4');
  assert.equal(Object.hasOwn(resolved, 'backendModel'), false);            // nothing was chosen for the caller
  for (const bad of ['', null, undefined, 7]) assert.equal(resolveModel(table(), bad).reason, 'unknown-alias');
});

test('a deprecated alias is labeled deprecated and is not silently replaced', () => {
  const resolved = resolveModel(table(), 'team-general');
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.requested, 'team-general');
  assert.equal(resolved.backendModel, 'general-8b');                      // its own backend, not the replacement's
  assert.equal(resolved.deprecated, true);
  assert.equal(resolved.replacedBy, 'team-instruct');                     // named for the caller to choose
});

test('an alias table refuses duplicates, dangling replacements, and chains of deprecation', () => {
  const instruct = modelAlias({ alias: 'team-instruct', backendModel: 'b-1', workload: 'w' });
  const twin = modelAlias({ alias: 'team-instruct', backendModel: 'b-9', workload: 'w' });
  assert.throws(() => modelAliasTable([instruct, twin]), /more than once/);
  assert.throws(() => modelAliasTable([instruct, { ...instruct }]), /made with modelAlias/); // a copy is not a record
  assert.throws(() => modelAliasTable([
    modelAlias({ alias: 'old', backendModel: 'b-2', workload: 'w', deprecated: true, replacedBy: 'missing' }),
  ]), /not registered/);
  assert.throws(() => modelAliasTable([
    modelAlias({ alias: 'older', backendModel: 'b-3', workload: 'w', deprecated: true, replacedBy: 'old' }),
    modelAlias({ alias: 'old', backendModel: 'b-2', workload: 'w', deprecated: true }),
  ]), /is itself deprecated/);
  assert.throws(() => modelAliasTable('aliases'), ModelAliasError);
  assert.throws(() => modelAliasTable([{ alias: 'hand-built', backendModel: 'b', workload: 'w' }]), ModelAliasError);
});

test('an alias record is checked when it is made', () => {
  const bad = (input) => () => modelAlias({ alias: 'a-name', backendModel: 'b', workload: 'w', ...input });
  assert.throws(bad({ alias: 'Team Instruct' }), ModelAliasError);         // aliases are lowercase words and hyphens
  assert.throws(bad({ alias: 'local/*' }), ModelAliasError);              // no wildcards
  assert.throws(bad({ backendModel: '' }), ModelAliasError);
  assert.throws(bad({ workload: '' }), ModelAliasError);
  assert.throws(bad({ deprecated: 'yes' }), ModelAliasError);
  assert.throws(bad({ replacedBy: 'team-instruct' }), /only a deprecated alias/);
  assert.throws(bad({ deprecated: true, replacedBy: 'a-name' }), /replace itself/);
});

test('resolving a model makes no network call', () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('resolveModel reached the network'); };
  try {
    assert.equal(resolveModel(table(), 'team-instruct').backendModel, 'family-7b-instruct-q4');
    assert.equal(resolveModel(table(), 'not-listed').resolved, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('no seed module opens a listener or calls the network, and stage 2 stays specified', () => {
  const src = new URL('../src/', import.meta.url);
  for (const file of readdirSync(src).filter(name => name.endsWith('.mjs'))) {
    const text = readFileSync(new URL(file, src), 'utf8');
    assert.doesNotMatch(text, /from ['"]node:(?:http|https|http2|net|dgram|tls)['"]/, `${file} imports a network module`);
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file} calls fetch`);
    assert.doesNotMatch(text, /\.listen\s*\(|createServer\s*\(/, `${file} opens a listener`);
  }
  const roadmap = readFileSync(new URL('../docs/roadmap.md', import.meta.url), 'utf8');
  assert.match(roadmap, /^\| 2 \| Local inference endpoint[^\n]*\| `specified` \|$/m);
});
