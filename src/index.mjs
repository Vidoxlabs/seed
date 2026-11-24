/** Seed contract modules. The harness runtime is staged; these contracts are the floor. */

export const VERSION = '0.9.0';

export * from './tool-id.mjs';
export * from './schema.mjs';
export * from './provider.mjs';
export * from './run-model.mjs';
export * from './resume.mjs';
export * from './admission.mjs';
export * from './registry-documents.mjs';
export * from './model-alias.mjs';

/** Print the contract surface and claim labels for a quick human read. */
const about = () => `
seed ${VERSION} — a local-first agent harness foundation. Contract modules only.

Contracts (implemented):
  tool-id    parseToolId, formatToolId, isValidToolId, isWellFormedRegistryEntry,
             checkRegistry, rollbackPosture, ROLLBACK_POSTURES
  schema     checkSchema, validateValue
  run-model  createObjective, transition, createAttemptRecord, recordIntent, attachReceipt
  resume     resumeSteps (dry runs, failure classes, aborts), claimLease, releaseLease, isLeaseLive
  admission  admitCaller, ADMISSION_DENIALS
  registry   checkRegistryDocuments, RegistryDocumentError (documents the caller parsed)
  provider   validateProvider, normalizeGeneration
  models     modelAlias, modelAliasTable, resolveModel (a table the caller holds)

Runtime services (specified, not shipped): local inference endpoint (stage 2),
durable run store, tool registry, owner gate (stage 3). See docs/roadmap.md.

Nothing in this repository opens a network listener or calls a hosted model.
Visit docs/ for the charter, architecture, lexicon, and contracts.
`.trim();

if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  console.log(about());
}
