/** Run model records and transitions. Specified in docs/contracts/run-model.md. */

import { isValidToolId } from './tool-id.mjs';
import { randomUUID } from 'node:crypto';

export const RUN_STATUSES = [
  'draft', 'ready', 'running', 'waiting_for_owner', 'settling', 'stopping',
  'stopped', 'complete', 'failed',
];

export const TERMINAL_STATUSES = ['stopped', 'complete', 'failed'];

/** Legal transitions; everything not listed is illegal. */
export const TRANSITIONS = {
  draft: ['ready', 'stopped'],
  ready: ['running', 'stopping'],
  running: ['waiting_for_owner', 'settling', 'stopping', 'failed'],
  waiting_for_owner: ['running', 'stopping'],
  settling: ['complete', 'failed'],
  stopping: ['stopped'],
  stopped: [],
  complete: [],
  failed: [],
};

export class RunModelError extends Error {}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

/**
 * Create an objective in draft. Acceptance names the check that makes it done;
 * allowedTools is the exhaustive admission list — not on the list, not callable.
 */
export function createObjective({ id, intent, acceptance, allowedTools }) {
  if (typeof id !== 'string' || id.length === 0) throw new RunModelError('An objective needs a non-empty id.');
  if (typeof intent !== 'string' || intent.length === 0) throw new RunModelError('An objective needs an intent sentence.');
  if (typeof acceptance !== 'string' || acceptance.length === 0) throw new RunModelError('An objective names its acceptance check.');
  if (!Array.isArray(allowedTools) || allowedTools.length === 0) {
    throw new RunModelError('An objective admits at least one tool; an empty list means no work.');
  }
  for (const toolId of allowedTools) {
    if (!isValidToolId(toolId)) throw new RunModelError(`Admitted tool "${toolId}" is not a well-formed neutral tool ID.`);
  }
  return {
    id,
    intent,
    acceptance,
    allowedTools: [...new Set(allowedTools)],
    status: 'draft',
  };
}

/** Move an objective between statuses. Only legal transitions land; changes never mutate history. */
export function transition(objective, to) {
  if (!canTransition(objective.status, to)) {
    throw new RunModelError(`A ${objective.status} objective cannot move to ${to}. Spawn a new objective instead.`);
  }
  return { ...objective, status: to };
}

/**
 * One try at an objective. Intents are recorded before their effects run, so a restart
 * reads what was about to happen instead of guessing from outputs.
 */
export function createAttemptRecord({ objective, attempt = 1 }) {
  if (objective.status !== 'running') {
    throw new RunModelError('An attempt starts only while its objective is running.');
  }
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new RunModelError('Attempt numbers start at 1.');
  const admitted = objective.allowedTools;
  if (!Array.isArray(admitted) || admitted.length === 0 || !admitted.every(toolId => isValidToolId(toolId))) {
    throw new RunModelError('The objective must be re-created before an attempt names its tools.');
  }
  return {
    objectiveId: objective.id,
    attempt,
    lease: randomUUID(),
    allowedTools: [...admitted],
    recordedIntents: [],
    receipts: [],
  };
}

/**
 * Record the intended effect before it runs. Admission is checked here: a tool not on the
 * attempt's admission list is refused, and an attempt with no admission list admits
 * nothing. Returns a new attempt record.
 */
export function recordIntent(attempt, { toolId, argumentsDigest, scope }) {
  if (typeof toolId !== 'string' || !isValidToolId(toolId)) {
    throw new RunModelError('An intent names a well-formed tool ID.');
  }
  if (!Array.isArray(attempt.allowedTools)) {
    throw new RunModelError('The attempt carries no admission list; start it with createAttemptRecord.');
  }
  if (!attempt.allowedTools.includes(toolId)) {
    throw new RunModelError(`Tool "${toolId}" is not admitted to objective ${attempt.objectiveId}. Not on the list, not callable.`);
  }
  const digestIsHex = typeof argumentsDigest === 'string' && /^[0-9a-f]{64}$/.test(argumentsDigest);
  if (!digestIsHex) throw new RunModelError('An intent carries the 64-hex digest of its arguments.');
  if (typeof scope !== 'string' || scope.length === 0) throw new RunModelError('An intent states its scope.');
  const intent = { toolId, argumentsDigest, scope };
  return { ...attempt, recordedIntents: [...attempt.recordedIntents, intent] };
}

/** Attach a verification receipt. Receipts are named checks at a revision, not self-reports. */
export function attachReceipt(attempt, { check, revision }) {
  if (typeof check !== 'string' || check.length === 0) throw new RunModelError('A receipt names its check.');
  if (typeof revision !== 'string' || revision.length === 0) throw new RunModelError('A receipt records its revision.');
  const receipt = { check, revision };
  return { ...attempt, receipts: [...attempt.receipts, receipt] };
}
