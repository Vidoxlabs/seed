/** Provider adapter seam. Specified in docs/contracts/provider.md. */

export class ProviderContractError extends Error {}

/**
 * Validate that a candidate adapter conforms to the seam: a `generate` function taking
 * ({ system, prompt, model, signal, ...config }) and resolving a generation record.
 * Returns { ok, errors } — it never throws on shape problems.
 */
export function validateProvider(candidate) {
  const errors = [];
  if (candidate === null || typeof candidate !== 'object') {
    return { ok: false, errors: ['A provider adapter must be an object.'] };
  }
  if (candidate.name !== undefined && typeof candidate.name !== 'string') {
    errors.push('name must be a string when present.');
  }
  if (typeof candidate.generate !== 'function') {
    errors.push('generate must be a function.');
  } else if (candidate.generate.length < 1) {
    errors.push('generate takes at least the call record argument.');
  }
  return { ok: errors.length === 0, errors };
}

const USAGE_FIELDS = ['input', 'output', 'total', 'cacheRead', 'cacheWrite'];

function usageErrors(usage) {
  const errors = [];
  if (usage === null) return { usage: null, errors };
  if (typeof usage !== 'object' || Array.isArray(usage)) {
    return { usage: null, errors: ['usage must be null or an object.'] };
  }
  const normalized = {};
  for (const field of USAGE_FIELDS) {
    const value = usage[field] ?? null;
    if (value !== null) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        errors.push(`usage.${field} must be null or a non-negative integer.`);
        continue;
      }
      normalized[field] = value;
    } else {
      normalized[field] = null;
    }
  }
  for (const key of Object.keys(usage)) {
    if (!USAGE_FIELDS.includes(key)) errors.push(`usage.${key} is not a known usage field.`);
  }
  return { usage: errors.length ? null : normalized, errors };
}

/**
 * Normalize a raw provider result against the contract. Missing metrics are null and
 * are never invented; `complete` is earned; model identity is a string or null.
 * Returns { ok, errors, generation }.
 */
export function normalizeGeneration(result) {
  if (result === null || typeof result !== 'object') {
    throw new ProviderContractError('A generation result must be an object.');
  }
  const errors = [];
  if (typeof result.text !== 'string') errors.push('text must be a string (empty is allowed).');
  if (typeof result.complete !== 'boolean') errors.push('complete must be a boolean.');
  if (result.model !== null && result.model !== undefined && typeof result.model !== 'string') {
    errors.push('model must be a string or null.');
  }
  const { usage, errors: usageErrorList } = usageErrors(result.usage ?? null);
  errors.push(...usageErrorList);
  if (errors.length > 0) return { ok: false, errors, generation: null };
  return {
    ok: true,
    errors: [],
    generation: {
      text: result.text,
      complete: result.complete,
      model: result.model ?? null,
      usage,
    },
  };
}
