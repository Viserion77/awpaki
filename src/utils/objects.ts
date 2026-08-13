/**
 * Pure object utilities: cleaning, diffing and merging plain objects.
 *
 * Every function here is pure — it never mutates its arguments, never performs I/O
 * and always returns a brand new value.
 *
 * "Plain object" means an object literal (prototype `Object.prototype` or `null`).
 * Arrays, `Date`, `Map`, class instances and every other non-plain value are treated
 * as opaque values: they are compared/replaced as a whole and never merged key by key.
 *
 * @module utils/objects
 */

type UnknownRecord = Record<string, unknown>;

/**
 * Writes a key/value pair into a result object, including the one key plain assignment
 * cannot carry.
 *
 * `JSON.parse('{"__proto__":{}}')` produces a genuine own data property, so a request body
 * can legitimately contain `__proto__` as a field name. Writing it back with `result[key] =`
 * goes through the setter inherited from `Object.prototype` and swaps the *result's*
 * prototype instead of storing a key: the value becomes readable as `result.role` while
 * `Object.keys(result)` never shows it, so an authorization check passes and an audit built
 * from the key list sees nothing. (`Object.prototype` itself is untouched — this is object
 * corruption and silent data loss, not global prototype pollution.)
 *
 * `defineProperty` stores it as what it always was: an own, enumerable, writable key.
 *
 * @param target - Object being built
 * @param key - Key to write
 * @param value - Value to store
 * @returns Nothing
 */
function assign(target: UnknownRecord, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }

  target[key] = value;
}

/**
 * Checks whether a value is a plain object (object literal or `Object.create(null)`).
 *
 * Internal helper — arrays, `null`, `Date` and class instances return `false`.
 *
 * @param value - Value to check
 * @returns `true` when the value is a plain object
 */
function isPlainObject(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deeply compares two values.
 *
 * Plain objects and arrays are compared structurally; `Date` instances are compared by
 * timestamp; every other value falls back to `Object.is` (so `NaN` equals `NaN`).
 *
 * @param a - First value
 * @param b - Second value
 * @returns `true` when both values are structurally equal
 */
function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEquals(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEquals(a[key], b[key])
    );
  }

  return false;
}

/**
 * Same record without the keys whose value is `undefined`.
 *
 * Optional keys stay optional and `undefined` is removed from their value type.
 */
export type CleanedRecord<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Removes every own enumerable key whose value is `undefined` from a record.
 *
 * This is the pre-step of every `Record<string, string | undefined>` before it goes to an
 * AWS SDK command: DynamoDB `ExpressionAttributeValues`, S3 `Metadata`, SQS
 * `MessageAttributes` and friends reject (or silently persist) keys carrying `undefined`.
 *
 * **`null` is preserved on purpose.** Only `undefined` means "absent"; `null` is a value the
 * caller deliberately chose and it is kept in the result. The operation is **shallow** —
 * nested objects are copied by reference and are not cleaned.
 *
 * @template T - Type of the input record
 * @param record - Record to clean (never mutated)
 * @returns A new object with the same keys minus the ones holding `undefined`
 *
 * @example
 * ```typescript
 * cleanRecord({ name: 'sensor-1', description: undefined, group: null });
 * // → { name: 'sensor-1', group: null }
 * ```
 *
 * @example
 * ```typescript
 * // Building an SDK input without leaking `undefined` keys
 * await s3Client.send(
 *   new PutObjectCommand({
 *     Bucket: bucket,
 *     Key: key,
 *     Body: body,
 *     Metadata: cleanRecord({ traceId, tenantId: maybeTenantId }),
 *   })
 * );
 * ```
 */
export function cleanRecord<T extends object>(record: T): CleanedRecord<T> {
  const result: UnknownRecord = {};

  for (const [key, value] of Object.entries(record) as Array<[string, unknown]>) {
    if (value !== undefined) {
      assign(result, key, value);
    }
  }

  return result as CleanedRecord<T>;
}

/**
 * Result of {@link compareJsonDiff}.
 */
export interface JsonDiffResult {
  /**
   * Values of `newObj` that were added or changed, nested with the same shape as the input.
   */
  diff: Record<string, unknown>;
  /**
   * Values of `oldObj` whose key no longer exists in `newObj`, nested with the same shape.
   */
  removed: Record<string, unknown>;
}

/**
 * Recursive worker of {@link compareJsonDiff}.
 *
 * @param oldObject - Previous state
 * @param newObject - Next state
 * @returns The `diff`/`removed` pair for this nesting level
 */
function diffRecords(oldObject: UnknownRecord, newObject: UnknownRecord): JsonDiffResult {
  const diff: UnknownRecord = {};
  const removed: UnknownRecord = {};

  for (const key of Object.keys(newObject)) {
    const newValue = newObject[key];
    const oldValue = oldObject[key];
    const existedBefore =
      Object.prototype.hasOwnProperty.call(oldObject, key) && oldValue !== undefined;

    // `undefined` in the new state means "absent" (JSON semantics), so it counts as a removal.
    if (newValue === undefined) {
      if (existedBefore) {
        assign(removed, key, oldValue);
      }
      continue;
    }

    if (!existedBefore) {
      assign(diff, key, newValue);
      continue;
    }

    if (isPlainObject(oldValue) && isPlainObject(newValue)) {
      const nested = diffRecords(oldValue, newValue);
      if (Object.keys(nested.diff).length > 0) {
        assign(diff, key, nested.diff);
      }
      if (Object.keys(nested.removed).length > 0) {
        assign(removed, key, nested.removed);
      }
      continue;
    }

    if (!deepEquals(oldValue, newValue)) {
      assign(diff, key, newValue);
    }
  }

  for (const key of Object.keys(oldObject)) {
    if (Object.prototype.hasOwnProperty.call(newObject, key)) {
      continue;
    }
    if (oldObject[key] !== undefined) {
      assign(removed, key, oldObject[key]);
    }
  }

  return { diff, removed };
}

/**
 * Compares two objects and reports what changed between them.
 *
 * Useful to build audit trails, to log only what a request actually modified or to send a
 * minimal `UpdateItem` to DynamoDB instead of rewriting the whole item.
 *
 * Rules:
 * - `diff` carries the **new** value of every key that was added or changed, keeping the
 *   original nesting (only the changed leaves show up).
 * - `removed` carries the **old** value of every key present in `oldObj` and absent in
 *   `newObj`, keeping the original nesting.
 * - A key whose new value is `undefined` counts as removed — `undefined` is not valid JSON
 *   and means "absent" everywhere in this module.
 * - `null` is a value: `{ a: 1 } → { a: null }` shows up in `diff` as `{ a: null }`.
 * - Arrays are compared deeply but reported **whole** — there is no per-index diff, matching
 *   the "arrays replace, never concatenate" rule of {@link mergeObjectChanges}.
 * - Values that are not plain objects (`Date`, class instances, ...) are compared as a whole;
 *   `Date` uses the timestamp.
 *
 * @param oldObj - Previous state (never mutated)
 * @param newObj - Next state (never mutated)
 * @returns `{ diff, removed }` — both are new plain objects, `{}` when there is nothing to report
 *
 * @example
 * ```typescript
 * compareJsonDiff(
 *   { name: 'old', tags: ['a'], config: { retries: 3, timeout: 10 }, legacy: true },
 *   { name: 'new', tags: ['a'], config: { retries: 5 } }
 * );
 * // → {
 * //     diff: { name: 'new', config: { retries: 5 } },
 * //     removed: { config: { timeout: 10 }, legacy: true },
 * //   }
 * ```
 *
 * @example
 * ```typescript
 * // Nothing changed
 * compareJsonDiff({ a: 1 }, { a: 1 }); // → { diff: {}, removed: {} }
 * ```
 */
export function compareJsonDiff(oldObj: object, newObj: object): JsonDiffResult {
  return diffRecords(oldObj as UnknownRecord, newObj as UnknownRecord);
}

/**
 * Policy that drives {@link mergeObjectChanges}. Both flags apply at every nesting level.
 */
export interface MergeObjectChangesPolicy {
  /**
   * Keep keys that exist in the old object and are absent from the new one.
   *
   * @defaultValue true
   */
  useOldKeysIfNotPresentInNew?: boolean;
  /**
   * Add keys that exist only in the new object.
   *
   * @defaultValue true
   */
  addNewKeys?: boolean;
}

/**
 * Recursive worker of {@link mergeObjectChanges}.
 *
 * @param oldObject - Base object
 * @param newObject - Object carrying the changes
 * @param keepOldKeys - Value of `useOldKeysIfNotPresentInNew`
 * @param addNewKeys - Value of `addNewKeys`
 * @returns A new object with the merge result for this nesting level
 */
function mergeRecords(
  oldObject: UnknownRecord,
  newObject: UnknownRecord,
  keepOldKeys: boolean,
  addNewKeys: boolean
): UnknownRecord {
  const result: UnknownRecord = {};

  if (keepOldKeys) {
    for (const key of Object.keys(oldObject)) {
      if (oldObject[key] !== undefined) {
        assign(result, key, oldObject[key]);
      }
    }
  }

  for (const key of Object.keys(newObject)) {
    const newValue = newObject[key];

    // `undefined` in the new object means "no value provided", never "erase this key".
    if (newValue === undefined) {
      continue;
    }

    const oldValue = oldObject[key];
    const existedBefore =
      Object.prototype.hasOwnProperty.call(oldObject, key) && oldValue !== undefined;

    if (!existedBefore) {
      if (addNewKeys) {
        assign(result, key, newValue);
      }
      continue;
    }

    if (isPlainObject(oldValue) && isPlainObject(newValue)) {
      assign(result, key, mergeRecords(oldValue, newValue, keepOldKeys, addNewKeys));
      continue;
    }

    // Arrays (and every other non-plain value) REPLACE — they never concatenate.
    assign(result, key, newValue);
  }

  return result;
}

/**
 * Recursively merges `newObj` on top of `oldObj` under a configurable policy.
 *
 * The typical use is a `PATCH` handler: the stored item is `oldObj`, the request payload is
 * `newObj`, and the policy decides whether unknown keys may be created and whether omitted
 * keys survive.
 *
 * Rules:
 * - **Arrays replace, they never concatenate.** `{ tags: ['a', 'b'] }` merged with
 *   `{ tags: ['c'] }` yields `{ tags: ['c'] }`. A PATCH that sends a list means "this is the
 *   new list"; concatenating would make it impossible to remove an item.
 * - Only plain objects are merged key by key. `Date`, class instances and every other
 *   non-plain value replace the old value as a whole.
 * - `undefined` in `newObj` means "no value provided" and is ignored — it never erases a key.
 *   Use `null` (or `useOldKeysIfNotPresentInNew: false`) when the intent is to clear a value.
 * - Neither input is mutated. The result is a new object; untouched nested values are shared
 *   by reference with the inputs.
 *
 * @template T - Shape the caller expects for the merged object
 * @param oldObj - Base object (never mutated)
 * @param newObj - Object carrying the changes (never mutated)
 * @param policy - Merge policy; both flags default to `true`
 * @returns A new merged object
 *
 * @example
 * ```typescript
 * mergeObjectChanges(
 *   { name: 'sensor', config: { retries: 3, timeout: 10 }, tags: ['a', 'b'] },
 *   { config: { retries: 5 }, tags: ['c'] }
 * );
 * // → { name: 'sensor', config: { retries: 5, timeout: 10 }, tags: ['c'] }
 * ```
 *
 * @example
 * ```typescript
 * // Strict PATCH: only fields that already exist may be updated
 * mergeObjectChanges({ name: 'old' }, { name: 'new', hacker: true }, { addNewKeys: false });
 * // → { name: 'new' }
 * ```
 *
 * @example
 * ```typescript
 * // Full replacement semantics: what is omitted disappears
 * mergeObjectChanges(
 *   { name: 'old', legacy: true },
 *   { name: 'new' },
 *   { useOldKeysIfNotPresentInNew: false }
 * );
 * // → { name: 'new' }
 * ```
 */
export function mergeObjectChanges<T extends object = Record<string, unknown>>(
  oldObj: object,
  newObj: object,
  policy: MergeObjectChangesPolicy = {}
): T {
  const { useOldKeysIfNotPresentInNew = true, addNewKeys = true } = policy;

  return mergeRecords(
    oldObj as UnknownRecord,
    newObj as UnknownRecord,
    useOldKeysIfNotPresentInNew,
    addNewKeys
  ) as T;
}
