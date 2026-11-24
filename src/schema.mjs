/** Closed schema subset for caller-supplied tool inputs and outputs. */

const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function field(record, name) {
  return Object.getOwnPropertyDescriptor(record, name)?.value;
}

function pointer(path, segment) {
  return `${path}/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function reject(errors, path, reason) {
  errors.push(Object.freeze({ path, reason }));
}

function result(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function* schemaFields(record, path, errors) {
  if (Object.getOwnPropertySymbols(record).length > 0) {
    reject(errors, path, 'schema field names must be strings');
  }
  for (const name of Object.getOwnPropertyNames(record).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(record, name);
    const fieldPath = pointer(path, name);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      reject(errors, fieldPath, 'schema fields must be enumerable data properties');
      continue;
    }
    yield { name, value: descriptor.value, path: fieldPath };
  }
}

function isPrimitive(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
}

function checkElements(array, path, errors, accepts, reason) {
  for (let index = 0; index < array.length; index += 1) {
    if (!accepts(field(array, index))) reject(errors, pointer(path, index), reason);
  }
}

function checkFields(schema, schemaPath, errors, pending) {
  for (const { name, value, path } of schemaFields(schema, schemaPath, errors)) {
    switch (name) {
      case 'type':
        if (!types.has(value)) reject(errors, path, 'type must name a supported value kind');
        break;
      case 'properties':
        if (!isRecord(value)) {
          reject(errors, path, 'properties must be an object of schemas');
          break;
        }
        for (const child of schemaFields(value, path, errors)) {
          pending.push({ schema: child.value, path: child.path });
        }
        break;
      case 'required':
        if (!Array.isArray(value)) {
          reject(errors, path, 'required must be an array of property names');
          break;
        }
        checkElements(value, path, errors, name => typeof name === 'string' && name.length > 0,
          'required property names must be non-empty strings');
        break;
      case 'additionalProperties':
        if (value !== false) reject(errors, path, 'additionalProperties must be false when present');
        break;
      case 'items':
        pending.push({ schema: value, path });
        break;
      case 'enum':
        if (!Array.isArray(value) || value.length === 0) {
          reject(errors, path, 'enum must be a non-empty array');
          break;
        }
        checkElements(value, path, errors, isPrimitive, 'enum entries must be JSON primitives');
        break;
      case 'maxItems':
      case 'minLength':
      case 'maxLength':
        if (!Number.isSafeInteger(value) || value < 0) {
          reject(errors, path, 'bound must be a non-negative safe integer');
        }
        break;
      case 'minimum':
      case 'maximum':
        if (!Number.isFinite(value)) reject(errors, path, 'bound must be a finite number');
        break;
      default:
        reject(errors, path, 'unsupported schema keyword');
    }
  }
}

/** Check the subset before using a schema. Errors address schema fields. */
export function checkSchema(schema) {
  const errors = [];
  const pending = [{ schema, path: '' }];
  const ancestors = new WeakSet();
  while (pending.length > 0) {
    const { schema, path, leave } = pending.pop();
    if (leave) {
      ancestors.delete(schema);
      continue;
    }
    if (!isRecord(schema)) {
      reject(errors, path, 'schema must be an object');
      continue;
    }
    if (ancestors.has(schema)) {
      reject(errors, path, 'schema must be acyclic');
      continue;
    }
    ancestors.add(schema);
    pending.push({ schema, leave: true });
    checkFields(schema, path, errors, pending);
  }
  return result(errors);
}

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  if (isPrimitive(value)) return typeof value;
  return undefined;
}

function checkObject(schema, value, path, errors, pending) {
  const required = field(schema, 'required') ?? [];
  const properties = field(schema, 'properties');
  const closed = field(schema, 'additionalProperties') === false;
  for (const name of new Set(Array.prototype.values.call(required))) {
    if (!Object.hasOwn(value, name)) reject(errors, pointer(path, name), 'required property is missing');
  }
  for (const name of Object.keys(value).sort()) {
    const child = properties === undefined ? undefined : field(properties, name);
    if (child !== undefined) {
      pending.push({ schema: child, value: field(value, name), path: pointer(path, name) });
    } else if (closed) {
      reject(errors, pointer(path, name), 'additional property is not allowed');
    }
  }
}

/** Validate declared constraints after checking the schema. Errors never repeat values. */
export function validateValue(schema, value) {
  const checked = checkSchema(schema);
  if (!checked.ok) return checked;

  const errors = [];
  const pending = [{ schema, value, path: '' }];
  while (pending.length > 0) {
    const { schema, value, path } = pending.pop();
    const kind = kindOf(value);
    if (kind === undefined) {
      reject(errors, path, 'expected a JSON value');
      continue;
    }
    const type = field(schema, 'type');
    if (type !== undefined && (type === 'integer' ? !Number.isInteger(value) : kind !== type)) {
      reject(errors, path, `expected ${type}`);
      continue;
    }
    const allowed = field(schema, 'enum');
    if (allowed !== undefined && !Array.prototype.includes.call(allowed, value)) {
      reject(errors, path, 'value is not in enum');
    }

    switch (kind) {
      case 'object':
        checkObject(schema, value, path, errors, pending);
        break;
      case 'array': {
        const maximum = field(schema, 'maxItems') ?? Infinity;
        if (value.length > maximum) reject(errors, path, 'array exceeds maxItems');
        const items = field(schema, 'items');
        if (items === undefined) break;
        for (let index = value.length - 1; index >= 0; index -= 1) {
          pending.push({ schema: items, value: field(value, index), path: pointer(path, index) });
        }
        break;
      }
      case 'string': {
        const minimum = field(schema, 'minLength') ?? 0;
        const maximum = field(schema, 'maxLength') ?? Infinity;
        if (minimum === 0 && maximum === Infinity) break;
        const length = [...value].length;
        if (length < minimum) reject(errors, path, 'string is shorter than minLength');
        if (length > maximum) reject(errors, path, 'string exceeds maxLength');
        break;
      }
      case 'number': {
        const minimum = field(schema, 'minimum') ?? -Infinity;
        const maximum = field(schema, 'maximum') ?? Infinity;
        if (value < minimum) reject(errors, path, 'number is below minimum');
        if (value > maximum) reject(errors, path, 'number exceeds maximum');
        break;
      }
    }
  }
  return result(errors);
}
