/**
 * Caller admission over a registry the caller holds. Specified in
 * docs/contracts/tool-id.md ("Caller admission"). Fails closed: anything the registry
 * cannot prove is a denial, never a pass.
 */

import { isValidToolId } from './tool-id.mjs';

export const ADMISSION_DENIALS = [
  'registry-unavailable', 'caller-unknown', 'caller-disabled', 'command-unmapped', 'tool-not-allowed',
];

const deny = (code, reason) => Object.freeze({ admitted: false, code, reason });

function registryProblem(registry) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) return 'no registry was given';
  const { callers, commands } = registry;
  if (!Array.isArray(callers)) return 'registry.callers is not a list';
  if (!Array.isArray(commands)) return 'registry.commands is not a list';
  const seen = new Set();
  for (const caller of callers) {
    if (caller === null || typeof caller !== 'object' || typeof caller.id !== 'string' || caller.id.length === 0) {
      return 'a caller entry has no id';
    }
    if (seen.has(caller.id)) return `caller "${caller.id}" is registered more than once`;
    seen.add(caller.id);
  }
  return null;
}

const sameCommand = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Decide whether a caller may run a command.
 *
 * `registry` is `{ callers: [{ id, enabled, allowedTools }], commands: [{ command, toolId }] }`,
 * where `command` is a list of segments. Returns a frozen decision:
 * `{ admitted: true, callerId, toolId }`, or `{ admitted: false, code, reason }` with a
 * code from ADMISSION_DENIALS.
 *
 * A missing or malformed registry, a missing caller id, a caller that is not
 * `enabled: true`, a command no entry maps to a well-formed tool ID, and a tool outside
 * the caller's `allowedTools` are all denials.
 */
export function admitCaller(registry, { callerId, command } = {}) {
  const problem = registryProblem(registry);
  if (problem) return deny('registry-unavailable', `Denied: ${problem}.`);
  if (typeof callerId !== 'string' || callerId.length === 0) {
    return deny('caller-unknown', 'Denied: the call carries no caller id.');
  }
  const caller = registry.callers.find(entry => entry.id === callerId);
  if (!caller) return deny('caller-unknown', `Denied: caller "${callerId}" is not in the registry.`);
  if (caller.enabled !== true) return deny('caller-disabled', `Denied: caller "${callerId}" is disabled.`);
  const mapping = registry.commands.find(entry => sameCommand(entry?.command, command));
  if (!mapping || !isValidToolId(mapping.toolId)) {
    const shown = Array.isArray(command) ? command.join(' ') : String(command);
    return deny('command-unmapped', `Denied: no registry tool maps to command "${shown}".`);
  }
  const allowed = Array.isArray(caller.allowedTools) ? caller.allowedTools : [];
  if (!allowed.includes(mapping.toolId)) {
    return deny('tool-not-allowed', `Denied: caller "${callerId}" may not use tool "${mapping.toolId}".`);
  }
  return Object.freeze({ admitted: true, callerId, toolId: mapping.toolId });
}
