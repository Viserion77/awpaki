/**
 * Pairs already under comparison, so that cyclic structures terminate.
 * A pair that is seen again while its own comparison is still running is
 * assumed equal — the surrounding comparison decides the final answer.
 */
type SeenPairs = Map<object, Set<object>>;

/**
 * Lists the own enumerable keys of an object, string and symbol alike.
 *
 * @param target - Object to inspect
 * @returns Own enumerable string and symbol keys
 */
function ownEnumerableKeys(target: object): (string | symbol)[] {
  const symbols = Object.getOwnPropertySymbols(target).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(target, symbol)
  );
  return [...Object.keys(target), ...symbols];
}

/**
 * Compares two `Map` instances entry by entry, in insertion order.
 *
 * @param a - First map
 * @param b - Second map
 * @param seen - Pairs already under comparison
 * @returns `true` when both maps hold deeply equal entries in the same order
 */
function areMapsEqual(
  a: Map<unknown, unknown>,
  b: Map<unknown, unknown>,
  seen: SeenPairs
): boolean {
  if (a.size !== b.size) return false;

  const entriesB = [...b.entries()];
  let index = 0;
  for (const [key, value] of a.entries()) {
    const [otherKey, otherValue] = entriesB[index];
    if (!compare(key, otherKey, seen)) return false;
    if (!compare(value, otherValue, seen)) return false;
    index += 1;
  }
  return true;
}

/**
 * Compares two `Set` instances value by value, in insertion order.
 *
 * @param a - First set
 * @param b - Second set
 * @param seen - Pairs already under comparison
 * @returns `true` when both sets hold deeply equal values in the same order
 */
function areSetsEqual(a: Set<unknown>, b: Set<unknown>, seen: SeenPairs): boolean {
  if (a.size !== b.size) return false;

  const valuesB = [...b.values()];
  let index = 0;
  for (const value of a.values()) {
    if (!compare(value, valuesB[index], seen)) return false;
    index += 1;
  }
  return true;
}

/**
 * Recursive deep comparison used by {@link isObjEqual}.
 *
 * @param a - First value
 * @param b - Second value
 * @param seen - Pairs already under comparison
 * @returns `true` when both values are deeply equal
 */
function compare(a: unknown, b: unknown, seen: SeenPairs): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // Primitives (and functions) already failed the Object.is check above.
    return false;
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  const visited = seen.get(a);
  if (visited?.has(b)) return true;
  if (visited) {
    visited.add(b);
  } else {
    seen.set(a, new Set([b]));
  }

  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Map && b instanceof Map) {
    return areMapsEqual(a, b, seen);
  }

  if (a instanceof Set && b instanceof Set) {
    return areSetsEqual(a, b, seen);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => compare(item, b[index], seen));
  }

  const keysA = ownEnumerableKeys(a);
  const keysB = ownEnumerableKeys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => {
    if (!Object.prototype.propertyIsEnumerable.call(b, key)) return false;
    return compare(
      (a as Record<string | symbol, unknown>)[key],
      (b as Record<string | symbol, unknown>)[key],
      seen
    );
  });
}

/**
 * Checks whether two values are deeply equal.
 *
 * Semantics:
 * - primitives are compared with `Object.is`, so `NaN` equals `NaN` while `0`
 *   and `-0` are different, and `null` is never equal to `undefined`;
 * - prototypes must match, so a plain object never equals an array, a class
 *   instance never equals a plain object with the same properties, and
 *   `Object.create(null)` never equals `{}`;
 * - `Date` values are compared by `getTime()` (two invalid dates are equal);
 * - `RegExp` values are compared by `source` and `flags`;
 * - `Map` and `Set` are compared by size and by deeply equal entries **in
 *   insertion order**;
 * - objects are compared by their own enumerable keys, strings and symbols
 *   alike, so `{ a: undefined }` is not equal to `{}`;
 * - functions are compared by reference;
 * - cycles terminate: a pair of objects already being compared is treated as
 *   equal, so `a.self = a` equals `b.self = b`;
 * - it never throws — a throwing getter, an exotic proxy or a structure deep
 *   enough to blow the stack all resolve to `false`.
 *
 * @param a - First value, of any type
 * @param b - Second value, of any type
 * @returns `true` when both values are deeply equal, `false` otherwise
 *
 * @example
 * ```typescript
 * isObjEqual({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] }); // true
 * isObjEqual(new Date('2024-01-01'), new Date('2024-01-01')); // true
 * isObjEqual(NaN, NaN);                                       // true
 * ```
 *
 * @example
 * ```typescript
 * isObjEqual({ 0: 'a', length: 1 }, ['a']); // false — different prototypes
 * isObjEqual(null, undefined);              // false
 * isObjEqual({ a: undefined }, {});         // false — different key sets
 * ```
 */
export function isObjEqual(a: unknown, b: unknown): boolean {
  try {
    return compare(a, b, new Map());
  } catch {
    return false;
  }
}
