/**
 * Permission bitmask engine — the arithmetic only, no catalog of groups.
 *
 * A bitmask packs an unbounded set of boolean permissions into a single scalar: flag `n` is
 * the bit at position `n`. Checking a permission becomes one AND, granting becomes one OR, and
 * an authorizer can carry the whole permission set in a JWT claim or in a single DynamoDB
 * attribute instead of a list that grows forever.
 *
 * ## Why `bigint` internally
 *
 * JavaScript's bitwise operators coerce their operands to **32-bit signed integers**. The
 * naive implementation silently wraps around as soon as the 32nd flag is created:
 *
 * ```javascript
 * 1 << 31; // -2147483648  (sign bit)
 * 1 << 32; // 1            (flag 32 collides with flag 0)
 * 1 << 60; // 268435456    (flag 60 collides with flag 28)
 * ```
 *
 * Dropping the operators and doing `2 ** n` with `number` only moves the wall: `number` holds
 * integers exactly up to `2 ** 53 - 1`, so masks touching bit 53 and beyond start rounding —
 * and rounding a permission mask means granting or revoking access at random.
 *
 * `bigint` has neither limit: it is arbitrary precision and its bitwise operators do not
 * truncate. Every function here computes on `bigint`.
 *
 * ## Why a decimal **string** at the borders
 *
 * `bigint` must not leak out of this module: `JSON.stringify({ mask: 1n })` throws
 * `TypeError: Do not know how to serialize a BigInt`, and most DB drivers, the AWS SDK
 * marshaller and every `JSON.parse` on the client side do not know the type either. So the
 * mask crosses the API/database border as a **decimal string** (`'1152921504606846976'`),
 * which is exact for any size, sorts and compares as an opaque token, and is accepted
 * everywhere. Every function accepts a string (or a `bigint`, for callers already holding one)
 * and every function that produces a mask returns a string.
 *
 * `number` is deliberately **rejected** at runtime: accepting it would reintroduce the
 * precision loss this module exists to avoid.
 *
 * ## What is not here
 *
 * No registry of groups (`ACCESS_GROUPS`, `ACCESS_GROUP_BITS`). Which bit means "can publish"
 * is product catalog, not a reusable pattern — declare that mapping in your own application
 * and pass bit positions in.
 *
 * @module utils/permissionsBitmask
 */

/**
 * A bitmask at an API border: a non-negative decimal string, or a `bigint` for callers that
 * already computed one.
 */
export type BitmaskInput = string | bigint;

/**
 * Highest accepted bit position (inclusive), i.e. 1024 distinct flags.
 *
 * The cap exists so a bogus input such as `hasFlag(mask, 1e9)` fails fast instead of asking
 * the engine to build a mask with a billion bits.
 */
export const MAX_FLAG_BIT = 1023;

const DECIMAL_ONLY = /^\d+$/;

/**
 * Parses a {@link BitmaskInput} into a `bigint`.
 *
 * @param mask - Decimal string or `bigint` mask
 * @returns The mask as a `bigint`
 * @throws {TypeError} When the value is not a decimal string nor a `bigint`
 * @throws {RangeError} When the mask is negative
 */
function parseMask(mask: BitmaskInput): bigint {
  if (typeof mask === 'bigint') {
    if (mask < 0n) {
      throw new RangeError('Bitmask must not be negative');
    }
    return mask;
  }

  if (typeof mask !== 'string') {
    throw new TypeError(
      `Invalid bitmask: expected a decimal string or a bigint, received ${typeof mask}. ` +
        'Numbers are rejected because they lose precision above 2 ** 53 - 1.'
    );
  }

  const normalized = mask.trim();

  if (!DECIMAL_ONLY.test(normalized)) {
    throw new TypeError(
      `Invalid bitmask "${mask}": expected a non-negative decimal string such as "12".`
    );
  }

  return BigInt(normalized);
}

/**
 * Validates a bit position and returns the `bigint` with only that bit set.
 *
 * @param bit - Zero-based bit position
 * @returns `1n << BigInt(bit)`
 * @throws {TypeError} When the position is not an integer number
 * @throws {RangeError} When the position is negative or above {@link MAX_FLAG_BIT}
 */
function bitValue(bit: number): bigint {
  if (typeof bit !== 'number' || !Number.isInteger(bit)) {
    throw new TypeError(`Invalid flag bit: expected an integer, received ${String(bit)}`);
  }

  if (bit < 0 || bit > MAX_FLAG_BIT) {
    throw new RangeError(`Invalid flag bit ${bit}: expected a value between 0 and ${MAX_FLAG_BIT}`);
  }

  return 1n << BigInt(bit);
}

/**
 * Combines one or many bit positions into a single `bigint`.
 *
 * @param bits - One bit position or a list of them
 * @returns The `bigint` with all those bits set
 */
function bitsValue(bits: number | readonly number[]): bigint {
  const list: readonly number[] = Array.isArray(bits) ? bits : [bits as number];

  return list.reduce<bigint>((accumulator, bit) => accumulator | bitValue(bit), 0n);
}

/**
 * Builds a bitmask from a list of bit positions.
 *
 * @param bits - Zero-based bit positions to set; duplicates are harmless
 * @returns The mask as a decimal string (`'0'` for an empty list)
 * @throws {TypeError} When a bit position is not an integer
 * @throws {RangeError} When a bit position is negative or above {@link MAX_FLAG_BIT}
 *
 * @example
 * ```typescript
 * encodeFlags([0, 1, 3]); // → '11'   (1 + 2 + 8)
 * encodeFlags([]);        // → '0'
 * ```
 *
 * @example
 * ```typescript
 * // Bit 60 is exact — `1 << 60` would have silently produced flag 28 instead
 * encodeFlags([60]); // → '1152921504606846976'
 * ```
 */
export function encodeFlags(bits: readonly number[]): string {
  return bitsValue(bits).toString(10);
}

/**
 * Lists the bit positions set in a bitmask.
 *
 * The inverse of {@link encodeFlags}: pair it with your own catalog to turn the mask back into
 * group names.
 *
 * @param mask - Mask as a decimal string or `bigint`
 * @returns Ascending list of the bit positions that are set
 * @throws {TypeError} When the mask is not a decimal string nor a `bigint`
 * @throws {RangeError} When the mask is negative
 *
 * @example
 * ```typescript
 * decodeFlags('11');  // → [0, 1, 3]
 * decodeFlags('0');   // → []
 * decodeFlags('1152921504606846976'); // → [60]
 * ```
 *
 * @example
 * ```typescript
 * const GROUP_BITS = { admin: 0, publisher: 1, auditor: 60 } as const;
 * const bits = new Set(decodeFlags(user.permissionsMask));
 * const groups = Object.keys(GROUP_BITS).filter((name) => bits.has(GROUP_BITS[name]));
 * ```
 */
export function decodeFlags(mask: BitmaskInput): number[] {
  let remaining = parseMask(mask);
  const bits: number[] = [];
  let position = 0;

  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      bits.push(position);
    }
    remaining >>= 1n;
    position += 1;
  }

  return bits;
}

/**
 * Checks whether a bit is set in a bitmask.
 *
 * @param mask - Mask as a decimal string or `bigint`
 * @param bit - Zero-based bit position to test
 * @returns `true` when the flag is present
 * @throws {TypeError} When the mask or the bit position has the wrong type
 * @throws {RangeError} When the mask is negative or the bit is out of range
 *
 * @example
 * ```typescript
 * hasFlag('11', 1); // → true
 * hasFlag('11', 2); // → false
 * ```
 *
 * @example
 * ```typescript
 * // Authorizer guard
 * if (!hasFlag(claims.permissionsMask, GROUP_BITS.publisher)) {
 *   throw new Forbidden('Missing publisher permission');
 * }
 * ```
 */
export function hasFlag(mask: BitmaskInput, bit: number): boolean {
  const value = bitValue(bit);

  return (parseMask(mask) & value) === value;
}

/**
 * Returns a new mask with the given bits set.
 *
 * Idempotent: setting a bit that is already set returns an equal mask. The input mask is never
 * modified — masks are values here, not mutable state.
 *
 * @param mask - Mask as a decimal string or `bigint`
 * @param bits - One bit position or a list of them
 * @returns The resulting mask as a decimal string
 * @throws {TypeError} When the mask or a bit position has the wrong type
 * @throws {RangeError} When the mask is negative or a bit is out of range
 *
 * @example
 * ```typescript
 * addFlags('0', [0, 1]);  // → '3'
 * addFlags('3', 3);       // → '11'
 * addFlags('11', 3);      // → '11'  (already set)
 * ```
 */
export function addFlags(mask: BitmaskInput, bits: number | readonly number[]): string {
  return (parseMask(mask) | bitsValue(bits)).toString(10);
}

/**
 * Returns a new mask without the given bit (or bits).
 *
 * Idempotent: removing a bit that is not set returns an equal mask.
 *
 * @param mask - Mask as a decimal string or `bigint`
 * @param bits - Bit position to clear, or a list of positions for a batch revoke
 * @returns The resulting mask as a decimal string
 * @throws {TypeError} When the mask or a bit position has the wrong type
 * @throws {RangeError} When the mask is negative or a bit is out of range
 *
 * @example
 * ```typescript
 * removeFlag('11', 3);      // → '3'
 * removeFlag('11', 2);      // → '11' (was not set)
 * removeFlag('11', [0, 1]); // → '8'
 * ```
 */
export function removeFlag(mask: BitmaskInput, bits: number | readonly number[]): string {
  return (parseMask(mask) & ~bitsValue(bits)).toString(10);
}
