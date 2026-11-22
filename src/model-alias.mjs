/**
 * Model names. Specified in docs/contracts/provider.md ("Model names").
 *
 * A caller asks for a model by alias. The alias table maps it to a backend model name.
 * The two names stay distinct, a deprecated alias says so and is never swapped for its
 * replacement, and resolution reads only the table the caller holds: no network call,
 * no discovery, no listener. The inference endpoint that would serve these names is
 * stage 2 and stays specified.
 */

const ALIAS = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class ModelAliasError extends Error {}

const ALIASES = new WeakSet();

const nonEmpty = (value) => typeof value === 'string' && value.length > 0;

/**
 * Make one alias record: `{ alias, backendModel, workload, deprecated, replacedBy }`.
 * The alias is lowercase words joined by hyphens, with no wildcard. The backend model
 * name is opaque text and must differ from the alias. `replacedBy` names another alias
 * and belongs only to a deprecated record.
 */
export function modelAlias({ alias, backendModel, workload, deprecated = false, replacedBy = null } = {}) {
  if (typeof alias !== 'string' || !ALIAS.test(alias)) {
    throw new ModelAliasError(`Alias "${alias}" must be lowercase words joined by hyphens.`);
  }
  if (!nonEmpty(backendModel)) throw new ModelAliasError(`Alias "${alias}" names its backend model.`);
  if (backendModel === alias) {
    throw new ModelAliasError(`Alias "${alias}" is also its backend model name; keep the caller's name distinct.`);
  }
  if (!nonEmpty(workload)) throw new ModelAliasError(`Alias "${alias}" states the workload it serves.`);
  if (typeof deprecated !== 'boolean') throw new ModelAliasError(`Alias "${alias}": deprecated must be a boolean.`);
  if (replacedBy !== null) {
    if (!deprecated) throw new ModelAliasError(`Alias "${alias}": only a deprecated alias names replacedBy.`);
    if (typeof replacedBy !== 'string' || !ALIAS.test(replacedBy)) {
      throw new ModelAliasError(`Alias "${alias}": replacedBy must be an alias.`);
    }
    if (replacedBy === alias) throw new ModelAliasError(`Alias "${alias}" cannot replace itself.`);
  }
  const record = Object.freeze({ alias, backendModel, workload, deprecated, replacedBy });
  ALIASES.add(record);
  return record;
}

/**
 * Check a list of alias records together and return a frozen table. Each entry must be
 * made by modelAlias, each alias is registered once, and every replacement is a
 * registered alias that is not itself deprecated.
 */
export function modelAliasTable(entries) {
  if (!Array.isArray(entries)) throw new ModelAliasError('An alias table is a list of alias records.');
  const byAlias = new Map();
  for (const entry of entries) {
    if (!ALIASES.has(entry)) throw new ModelAliasError('Every table entry is made with modelAlias.');
    if (byAlias.has(entry.alias)) throw new ModelAliasError(`Alias "${entry.alias}" is registered more than once.`);
    byAlias.set(entry.alias, entry);
  }
  for (const entry of byAlias.values()) {
    if (entry.replacedBy === null) continue;
    const replacement = byAlias.get(entry.replacedBy);
    if (!replacement) {
      throw new ModelAliasError(`Alias "${entry.alias}" is replaced by "${entry.replacedBy}", which is not registered.`);
    }
    if (replacement.deprecated) {
      throw new ModelAliasError(`Alias "${entry.alias}" is replaced by "${entry.replacedBy}", which is itself deprecated.`);
    }
  }
  return Object.freeze({ aliases: Object.freeze([...byAlias.values()]), byAlias });
}

/**
 * Resolve the name a caller asked for. Returns a frozen result:
 *
 * - `{ resolved: true, requested, backendModel, deprecated, replacedBy }` for a
 *   registered alias. A deprecated alias resolves to its own backend model, labeled
 *   `deprecated: true`, with `replacedBy` named for the caller to choose. It is never
 *   swapped for the replacement.
 * - `{ resolved: false, requested, reason: 'unknown-alias' }` for anything else,
 *   including a backend model name that no alias names. Nothing is chosen in its place.
 */
export function resolveModel(table, requested) {
  const entry = nonEmpty(requested) && table?.byAlias instanceof Map ? table.byAlias.get(requested) : undefined;
  if (!entry) return Object.freeze({ resolved: false, requested: requested ?? null, reason: 'unknown-alias' });
  return Object.freeze({
    resolved: true,
    requested,
    backendModel: entry.backendModel,
    deprecated: entry.deprecated,
    replacedBy: entry.replacedBy,
  });
}
