/**
 * Registry documents the caller already parsed. Specified in docs/contracts/tool-id.md
 * ("Registry documents"). Ported from the predecessor's tool reference check: every
 * tool an agent's `allowedTools` names must be listed in the tools document. Nothing
 * here reads a file, opens a directory, or grants a tool.
 */

export class RegistryDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryDocumentError';
  }
}

const DOCUMENTS = ['agents', 'tools'];

const isDocument = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isName = (value) => typeof value === 'string' && value.length > 0;

// The list a document holds under its own name. A document that leaves the list out
// holds none, as the predecessor's empty document did.
function listOf(document, key, errors) {
  if (document === null || document[key] === undefined) return [];
  if (!Array.isArray(document[key])) {
    errors.push(`${key}: "${key}" must be a list of ${key}.`);
    return [];
  }
  return document[key];
}

// Each entry's id, or null for an entry that has none. Errors name the entry by its id,
// or by `#<index>` when it has none.
function idsOf(entries, key, noun, errors) {
  const seen = new Set();
  const ids = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || !isName(entry.id)) {
      errors.push(`${key}.#${index}: ${noun} needs a non-empty string id.`);
      return null;
    }
    if (seen.has(entry.id)) errors.push(`${key}.${entry.id}: listed more than once.`);
    seen.add(entry.id);
    return entry.id;
  });
  return { ids, seen };
}

/**
 * Check the agents and tools documents together.
 *
 * `agents` is `{ agents: [{ id, allowedTools? }] }` and `tools` is `{ tools: [{ id }] }`,
 * each already parsed by the caller, or `null` when that document was not supplied. A
 * value that is neither an object nor `null` throws RegistryDocumentError.
 *
 * Returns frozen `{ ok, missing, errors }`. `missing` names each `null` document as
 * `agents` or `tools`. Each error names its entry (`agents.<id>`, `tools.<id>`, or
 * `#<index>`). An agent that names a tool the tools document does not list is an error.
 * `ok` is true only when both documents were supplied and nothing is in `errors`. Every
 * other field on an agent or a tool is left unread, and the result grants no tool.
 */
export function checkRegistryDocuments(documents) {
  if (!isDocument(documents)) throw new RegistryDocumentError('give the agents and tools documents as { agents, tools }');
  for (const name of DOCUMENTS) {
    const value = documents[name];
    if (value !== null && !isDocument(value)) {
      throw new RegistryDocumentError(`the ${name} document must be an object, or null when it was not supplied`);
    }
  }
  const errors = [];
  const missing = DOCUMENTS.filter((name) => documents[name] === null);
  const agents = listOf(documents.agents, 'agents', errors);
  const tools = listOf(documents.tools, 'tools', errors);
  const agentIds = idsOf(agents, 'agents', 'an agent', errors).ids;
  const toolIds = idsOf(tools, 'tools', 'a tool', errors).seen;
  agents.forEach((agent, index) => {
    const id = agentIds[index];
    if (id === null || agent.allowedTools === undefined) return;
    if (!Array.isArray(agent.allowedTools) || !agent.allowedTools.every(isName)) {
      errors.push(`agents.${id}: allowedTools must be a list of non-empty tool names.`);
      return;
    }
    for (const tool of agent.allowedTools) {
      if (!toolIds.has(tool)) errors.push(`agents.${id}: references unknown tool "${tool}".`);
    }
  });
  return Object.freeze({
    ok: missing.length === 0 && errors.length === 0,
    missing: Object.freeze(missing),
    errors: Object.freeze(errors),
  });
}
