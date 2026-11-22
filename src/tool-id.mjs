/** Neutral tool identity. The grammar is specified in docs/contracts/tool-id.md. */

const SEGMENT = /^[a-z][a-z0-9-]*$/;

/** Segments that look like infrastructure or environment names, never part of a tool ID. */
const INFRASTRUCTURE_LIKE = /^(?:v\d+|ct\d+|node\d+|host\d+|stage\d+)$/;

/** Vendor and protocol names belong in a connector binding, never in the ID. */
const FORBIDDEN_SEGMENTS = new Set([
  'openai', 'anthropic', 'claude', 'chatgpt', 'gemini', 'grok', 'copilot', 'cursor',
  'http', 'https', 'websocket', 'grpc', 'sdk',
]);

const VERBS = new Set([
  'read', 'write', 'create', 'update', 'delete', 'list', 'search', 'execute', 'cancel',
  'verify',
]);

export const RESERVED_DOMAINS = new Set([
  'vcs', 'docs', 'edge', 'telemetry', 'memory', 'ingest', 'compute',
]);

export class ToolIdError extends Error {}

/**
 * Parse a neutral tool ID into its parts. Two to four dot-separated segments:
 * domain, [resource, [sub,]] verb. Throws ToolIdError with the reason on any violation.
 */
export function parseToolId(id) {
  if (typeof id !== 'string' || id.length === 0) throw new ToolIdError('A tool ID must be a non-empty string.');
  if (id.startsWith('.') || id.endsWith('.')) throw new ToolIdError(`Tool ID "${id}" starts or ends with a separator.`);
  const segments = id.split('.');
  if (segments.length < 2) throw new ToolIdError(`Tool ID "${id}" needs at least domain and verb.`);
  if (segments.length > 4) throw new ToolIdError(`Tool ID "${id}" has more than four segments.`);
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) {
      throw new ToolIdError(`Segment "${segment}" in "${id}" must be lowercase letters, digits, or hyphens, starting with a letter.`);
    }
    if (INFRASTRUCTURE_LIKE.test(segment)) {
      throw new ToolIdError(`Segment "${segment}" in "${id}" looks like infrastructure; IDs never carry environment names.`);
    }
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new ToolIdError(`Segment "${segment}" in "${id}" carries a vendor or protocol name; that belongs in a connector binding.`);
    }
  }
  const verb = segments.at(-1);
  if (!VERBS.has(verb)) throw new ToolIdError(`Verb "${verb}" in "${id}" is not in the controlled verb set.`);
  return {
    domain: segments[0],
    resource: segments.length >= 3 ? segments[1] : null,
    sub: segments.length === 4 ? segments[2] : null,
    verb,
  };
}

/** Format parts back into an ID, validating along the way. */
export function formatToolId({ domain, resource = null, sub = null, verb }) {
  const segments = [domain, resource, sub, verb].filter(v => v !== null && v !== undefined && v !== '');
  const id = segments.join('.');
  parseToolId(id);
  return id;
}

export function isValidToolId(id) {
  try { parseToolId(id); return true; } catch { return false; }
}

const EFFECT_CLASSES = new Set(['read', 'write', 'destructive', 'credential']);

/**
 * Check a registry entry's shape. Returns { ok, errors }. Effect classes gate runs;
 * connector bindings carry the vendor identity; legacy names are aliases, not truths.
 */
export function isWellFormedRegistryEntry(entry) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (entry === null || typeof entry !== 'object') return { ok: false, errors: ['A registry entry must be an object.'] };
  const { toolId, connector, effect, realm, thirdPartyEgress, ownerGate, inputSchema, legacyNames } = entry;
  try { parseToolId(toolId); } catch (error) { fail(error.message); }
  if (typeof connector !== 'string' || connector.length === 0) fail('connector must be a non-empty string.');
  if (!EFFECT_CLASSES.has(effect)) fail(`effect must be one of ${[...EFFECT_CLASSES].join(', ')}.`);
  if (typeof realm !== 'string' || realm.length === 0) fail('realm must be a non-empty string.');
  if (typeof thirdPartyEgress !== 'boolean') fail('thirdPartyEgress must be a boolean.');
  if (typeof ownerGate !== 'boolean') fail('ownerGate must be a boolean.');
  if (inputSchema === undefined || inputSchema === null || typeof inputSchema !== 'object') fail('inputSchema must be an object.');
  if (legacyNames !== undefined && !Array.isArray(legacyNames)) fail('legacyNames must be an array when present.');
  if (Array.isArray(legacyNames)) for (const name of legacyNames) if (!isValidToolId(name)) fail(`Legacy name "${name}" is not a well-formed tool ID.`);
  return { ok: errors.length === 0, errors };
}
