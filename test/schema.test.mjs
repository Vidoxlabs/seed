import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as seed from '../src/index.mjs';

const { checkRegistry, checkSchema, isWellFormedRegistryEntry, validateValue } = seed;
const registryEntry = {
  toolId: 'docs.file.read',
  connector: 'fixture',
  effect: 'read',
  realm: 'fixture',
  thirdPartyEgress: false,
  ownerGate: false,
  inputSchema: { type: 'object' },
};

test('unknown-schema-keyword-refused', () => {
  for (const keyword of ['$ref', 'oneOf', 'pattern', 'constructor']) {
    const schema = { properties: { 'field/name~': { [keyword]: 'fixture rule' } } };
    const result = checkSchema(schema);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map(error => error.path), [`/properties/field~1name~0/${keyword}`]);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.errors));
    assert.ok(Object.isFrozen(result.errors[0]));
    assert.equal(typeof result.errors[0].reason, 'string');
  }

  const cyclic = { type: 'array' };
  cyclic.items = cyclic;
  assert.deepEqual(checkSchema(cyclic).errors.map(error => error.path), ['/items']);
  const shared = { type: 'string' };
  assert.equal(checkSchema({ properties: { name: shared, label: shared } }).ok, true);
});

test('value-validation-json-pointer-no-secret-echo', () => {
  const schema = {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'integer' } },
      'path/label~': { type: 'boolean' },
    },
    required: ['items', 'path/label~', 'absent'],
  };
  const sample = 'opaque fixture payload';
  const result = validateValue(schema, { items: [2, sample], 'path/label~': sample });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => error.path).sort(), ['/absent', '/items/1', '/path~1label~0']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.errors));
  assert.ok(result.errors.every(Object.isFrozen));
  assert.ok(!JSON.stringify(result).includes(sample));

  const malformed = { properties: { limit: { minimum: sample } } };
  const invalidSchema = validateValue(malformed, null);
  assert.deepEqual(invalidSchema, checkSchema(malformed));
  assert.deepEqual(invalidSchema.errors.map(error => error.path), ['/properties/limit/minimum']);
  assert.ok(!JSON.stringify(invalidSchema).includes(sample));
});

test('optional-output-schema-additive', () => {
  const outputSchema = { type: 'object', properties: { count: { type: 'integer', minimum: 0 } } };
  assert.equal(isWellFormedRegistryEntry({ ...registryEntry, outputSchema }).ok, true);
  assert.equal(checkRegistry([{ ...registryEntry, outputSchema }]).ok, true);
  for (const malformed of [null, true, undefined, { items: { pattern: 'fixture' } }]) {
    const entry = { ...registryEntry, outputSchema: malformed };
    const result = isWellFormedRegistryEntry(entry);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /outputSchema/);
    assert.equal(checkRegistry([entry]).ok, false);
  }
});

test('additional-property-refused', () => {
  const schema = {
    type: 'object',
    properties: { count: { type: 'number' } },
    required: ['count'],
    additionalProperties: false,
  };
  assert.deepEqual(validateValue(schema, { count: 1 }), { ok: true, errors: [] });
  const result = validateValue(schema, { count: 1, toString: 'fixture', 'extra/field~': 'fixture' });
  assert.deepEqual(result.errors.map(error => error.path).sort(), ['/extra~1field~0', '/toString']);
  assert.deepEqual(validateValue({ additionalProperties: false }, { name: 'fixture' }).errors.map(error => error.path), ['/name']);

  const ownData = JSON.parse('{"__proto__":{"type":"string"}}');
  const ownValue = JSON.parse('{"__proto__":"fixture"}');
  assert.equal(validateValue({ properties: ownData, additionalProperties: false }, ownValue).ok, true);
  assert.equal(validateValue({ required: ['toString'] }, {}).ok, false);
});

test('enum-and-bounds-enforced', () => {
  const number = { type: 'number', minimum: 1.5, maximum: 3 };
  const text = { type: 'string', minLength: 1, maxLength: 1 };
  const array = { type: 'array', items: { type: 'null' }, maxItems: 1 };
  const cases = [
    [number, 1.5, 1], [number, 3, 4], [number, 2, Infinity],
    [{ type: 'integer' }, 2, 2.5], [{ type: 'boolean' }, true, 'true'],
    [text, '\u{1F680}', ''], [text, 'a', 'ab'],
    [array, [null], [null, null]], [array, [null], [false]],
    [{ enum: [null, false, 'fixture', 2] }, false, true],
  ];
  for (const [schema, accepted, refused] of cases) {
    assert.equal(validateValue(schema, accepted).ok, true);
    assert.equal(validateValue(schema, refused).ok, false);
  }

  const malformed = [
    [{ type: ['string'] }, '/type'], [{ type: 'date' }, '/type'],
    [{ properties: [] }, '/properties'], [{ required: [''] }, '/required/0'],
    [{ additionalProperties: true }, '/additionalProperties'], [{ items: false }, '/items'],
    [{ enum: [] }, '/enum'], [{ enum: [1, {}] }, '/enum/1'],
    [{ maxItems: 0.5 }, '/maxItems'], [{ minLength: -1 }, '/minLength'],
    [{ maxLength: Number.MAX_SAFE_INTEGER + 1 }, '/maxLength'], [{ maximum: NaN }, '/maximum'],
  ];
  for (const [schema, path] of malformed) {
    const result = checkSchema(schema);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map(error => error.path), [path]);
  }
  assert.deepEqual(checkSchema({}), { ok: true, errors: [] });
  assert.deepEqual(checkSchema([]).errors.map(error => error.path), ['']);
});

test('registry-valid-under-0.8.0-stays-valid', () => {
  const existingEntries = [
    registryEntry,
    { ...registryEntry, toolId: 'docs.file.list', inputSchema: {} },
    { ...registryEntry, toolId: 'docs.file.search', inputSchema: { format: 'fixture' } },
  ];
  for (const entry of existingEntries) {
    assert.deepEqual(isWellFormedRegistryEntry(entry), { ok: true, errors: [] });
  }
  assert.deepEqual(checkRegistry(existingEntries), { ok: true, errors: [] });
});
