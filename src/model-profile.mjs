/** Model profile records with capability provenance. Specified in docs/contracts/provider.md. */

export class ModelProfileError extends Error {}

/** Where a slot's value came from. `unknown` always carries a null value. */
export const PROFILE_SOURCES = Object.freeze(['reported', 'probed', 'unknown']);

/** The closed set of profile slots, in record order. */
export const PROFILE_SLOTS = Object.freeze(['model', 'contextLength', 'toolCalling', 'constrainedOutput', 'streaming']);

const SLOT_FIELDS = ['value', 'source'];

const valueChecks = {
  model: value => (typeof value === 'string' && value.length > 0 ? null : 'must be a non-empty string'),
  contextLength: value => (Number.isSafeInteger(value) && value > 0 ? null : 'must be a positive safe integer'),
  toolCalling: value => (typeof value === 'boolean' ? null : 'must be a boolean'),
  constrainedOutput: value => (typeof value === 'boolean' ? null : 'must be a boolean'),
  streaming: value => (typeof value === 'boolean' ? null : 'must be a boolean'),
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function slotErrors(slot, record) {
  if (!isPlainObject(record)) return [`${slot} must be an object with value and source.`];
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!SLOT_FIELDS.includes(key)) errors.push(`${slot}.${key} is not a slot field.`);
  }
  if (!PROFILE_SOURCES.includes(record.source)) {
    errors.push(`${slot}.source must be reported, probed, or unknown.`);
    return errors;
  }
  const value = Object.hasOwn(record, 'value') ? record.value : undefined;
  if (record.source === 'unknown') {
    if (value !== null) errors.push(`${slot}.value must be null when the source is unknown.`);
    return errors;
  }
  if (value === null || value === undefined) {
    errors.push(`${slot}.value must be known when the source is ${record.source}.`);
    return errors;
  }
  const problem = valueChecks[slot](value);
  if (problem) errors.push(`${slot}.value ${problem}.`);
  return errors;
}

/**
 * Check a model profile record. Every slot carries `{ value, source }`; a known source needs
 * a typed value and `unknown` needs null, so no guessed default passes. Error text names
 * slots and expectations and never repeats a supplied value. Returns { ok, errors }.
 */
export function checkModelProfile(profile) {
  if (!isPlainObject(profile)) return { ok: false, errors: ['A model profile must be an object.'] };
  const errors = [];
  for (const key of Object.keys(profile)) {
    if (!PROFILE_SLOTS.includes(key)) errors.push(`${key} is not a profile slot.`);
  }
  for (const slot of PROFILE_SLOTS) errors.push(...slotErrors(slot, profile[slot]));
  return { ok: errors.length === 0, errors };
}

/** Build a frozen copy of a valid profile, or throw ModelProfileError naming every problem. */
export function modelProfile(profile) {
  const { ok, errors } = checkModelProfile(profile);
  if (!ok) throw new ModelProfileError(errors.join(' '));
  const copy = {};
  for (const slot of PROFILE_SLOTS) {
    copy[slot] = Object.freeze({ value: profile[slot].value, source: profile[slot].source });
  }
  return Object.freeze(copy);
}
