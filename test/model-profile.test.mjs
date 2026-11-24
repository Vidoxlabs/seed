import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkModelProfile, modelProfile, ModelProfileError, PROFILE_SLOTS, PROFILE_SOURCES,
} from '../src/index.mjs';

const unknown = { value: null, source: 'unknown' };
const full = () => ({
  model: { value: 'family-7b-instruct-q4', source: 'probed' },
  contextLength: { value: 32768, source: 'reported' },
  toolCalling: { value: false, source: 'probed' },
  constrainedOutput: { ...unknown },
  streaming: { value: true, source: 'probed' },
});

test('model-profile-preserves-unknown', () => {
  assert.deepEqual([...PROFILE_SOURCES], ['reported', 'probed', 'unknown']);
  assert.deepEqual([...PROFILE_SLOTS], ['model', 'contextLength', 'toolCalling', 'constrainedOutput', 'streaming']);
  assert.equal(Object.isFrozen(PROFILE_SOURCES) && Object.isFrozen(PROFILE_SLOTS), true);

  // Every slot unknown is a valid, honest profile.
  const blank = Object.fromEntries(PROFILE_SLOTS.map(slot => [slot, { ...unknown }]));
  assert.deepEqual(checkModelProfile(blank), { ok: true, errors: [] });
  const built = modelProfile(blank);
  for (const slot of PROFILE_SLOTS) assert.deepEqual(built[slot], unknown, slot);

  // An unknown slot that carries a value is a guess, and is refused.
  for (const [slot, guess] of [['contextLength', 8192], ['toolCalling', true], ['constrainedOutput', false], ['streaming', true], ['model', 'any']]) {
    const profile = { ...blank, [slot]: { value: guess, source: 'unknown' } };
    const result = checkModelProfile(profile);
    assert.equal(result.ok, false, slot);
    assert.deepEqual(result.errors, [`${slot}.value must be null when the source is unknown.`], slot);
    assert.throws(() => modelProfile(profile), ModelProfileError, slot);
  }
});

test('model-profile-refuses-values-without-provenance', () => {
  // A bare value, a missing source, or a source outside the closed set is not a profile slot.
  const cases = [
    ['contextLength', 4096, 'contextLength must be an object with value and source.'],
    ['toolCalling', { value: true }, 'toolCalling.source must be reported, probed, or unknown.'],
    ['streaming', { value: true, source: 'assumed' }, 'streaming.source must be reported, probed, or unknown.'],
    ['streaming', { value: true, source: 'default' }, 'streaming.source must be reported, probed, or unknown.'],
  ];
  for (const [slot, value, message] of cases) {
    const result = checkModelProfile({ ...full(), [slot]: value });
    assert.equal(result.ok, false, message);
    assert.deepEqual(result.errors, [message]);
  }
  // A reported or probed slot needs the value it claims to know.
  for (const source of ['reported', 'probed']) {
    const result = checkModelProfile({ ...full(), contextLength: { value: null, source } });
    assert.deepEqual(result.errors, [`contextLength.value must be known when the source is ${source}.`]);
  }
});

test('model-profile-value-types-are-closed', () => {
  assert.deepEqual(checkModelProfile(full()), { ok: true, errors: [] });
  const bad = [
    ['model', { value: '', source: 'reported' }, 'model.value must be a non-empty string.'],
    ['model', { value: 7, source: 'reported' }, 'model.value must be a non-empty string.'],
    ['contextLength', { value: 0, source: 'probed' }, 'contextLength.value must be a positive safe integer.'],
    ['contextLength', { value: 1.5, source: 'probed' }, 'contextLength.value must be a positive safe integer.'],
    ['contextLength', { value: '32768', source: 'probed' }, 'contextLength.value must be a positive safe integer.'],
    ['toolCalling', { value: 'yes', source: 'reported' }, 'toolCalling.value must be a boolean.'],
    ['constrainedOutput', { value: 1, source: 'probed' }, 'constrainedOutput.value must be a boolean.'],
    ['streaming', { value: null, source: 'probed' }, 'streaming.value must be known when the source is probed.'],
  ];
  for (const [slot, value, message] of bad) {
    assert.deepEqual(checkModelProfile({ ...full(), [slot]: value }).errors, [message], message);
  }
});

test('model-profile-shape-is-closed-and-holds-no-endpoint', () => {
  const missing = full();
  delete missing.streaming;
  assert.deepEqual(checkModelProfile(missing).errors, ['streaming must be an object with value and source.']);

  // Extra top-level fields, such as an address or a key, are refused without echoing the value.
  const marker = 'planted-endpoint-marker';
  for (const extra of ['baseURL', 'endpoint', 'apiKey', 'host']) {
    const result = checkModelProfile({ ...full(), [extra]: marker });
    assert.deepEqual(result.errors, [`${extra} is not a profile slot.`]);
    assert.ok(!result.errors.join(' ').includes(marker));
  }
  const extraSlotField = checkModelProfile({ ...full(), model: { value: 'm', source: 'probed', note: marker } });
  assert.deepEqual(extraSlotField.errors, ['model.note is not a slot field.']);

  // Error text never repeats a value the caller supplied.
  const echoed = checkModelProfile({ ...full(), model: { value: marker, source: 'unknown' } });
  assert.ok(!echoed.errors.join(' ').includes(marker));

  for (const bad of [null, [], 'profile', 7]) {
    assert.deepEqual(checkModelProfile(bad), { ok: false, errors: ['A model profile must be an object.'] });
  }
});

test('model-profile-builds-a-frozen-copy', () => {
  const input = full();
  const built = modelProfile(input);
  assert.equal(Object.isFrozen(built), true);
  for (const slot of PROFILE_SLOTS) assert.equal(Object.isFrozen(built[slot]), true, slot);
  assert.deepEqual(Object.keys(built), [...PROFILE_SLOTS]);
  input.contextLength.value = 1;
  assert.equal(built.contextLength.value, 32768);
  assert.deepEqual(Object.keys(built.model), ['value', 'source']);
});
