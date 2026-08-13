/**
 * UUIDv7 generation (RFC 9562 §5.7), with an optional monotonic variant.
 *
 * A v7 id carries a 48-bit Unix millisecond timestamp in its most significant bits, so ids
 * sort by creation time as plain strings — which is what makes it the right key for a
 * DynamoDB sort key, an S3 prefix or a log correlation id, where a v4 forces a separate
 * timestamp attribute and an index to go with it.
 *
 * This is the one deliberately impure module under `utils/`: it reads the clock and a CSPRNG.
 * It lives here anyway because it is a value producer with no AWS dependency, and the
 * alternative was every service copying the bit layout.
 *
 * @module utils/uuidv7
 */

import { randomBytes } from 'node:crypto';

/** Milliseconds of the last id produced by {@link monotonicUuidv7}. */
let lastTimestampMs = -1;

/**
 * Counter occupying `rand_a`, incremented for ids minted within the same millisecond.
 *
 * Seeded with 11 random bits rather than 12 (RFC 9562 §6.2, "fixed-length dedicated counter
 * bits"): starting below half the range guarantees at least 2048 increments before the
 * counter can overflow, so a burst inside one millisecond cannot silently wrap and produce a
 * lower id than the one before it.
 */
let counter = 0;

/**
 * Writes the shared v7 layout into a 16-byte buffer and formats it.
 *
 * Layout, from the most significant bit: 48-bit `unix_ts_ms`, 4-bit version (`0111`), 12-bit
 * `rand_a`, 2-bit variant (`10`), 62-bit `rand_b`. The version and variant nibbles are
 * written **after** the random fill, since the fill would otherwise overwrite them.
 *
 * @param timestampMs - Milliseconds since the Unix epoch
 * @param randA - Twelve bits placed in `rand_a`
 * @returns The formatted UUID
 */
function formatUuidv7(timestampMs: number, randA: number): string {
  // `Buffer`, not `Uint8Array`: `writeUIntBE` is what writes a 48-bit big-endian integer in
  // one call, and getting the byte order wrong here produces a valid-looking UUIDv7 that
  // merely sorts wrong — the exact defect this module exists to avoid.
  const bytes = Buffer.alloc(16);

  bytes.writeUIntBE(timestampMs, 0, 6);

  const random = randomBytes(10);
  random.copy(bytes, 6);

  bytes[6] = 0x70 | ((randA >>> 8) & 0x0f);
  bytes[7] = randA & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generates a UUIDv7: time-ordered, and random within a millisecond.
 *
 * Two ids minted in the same millisecond sort arbitrarily against each other. Use
 * {@link monotonicUuidv7} when that matters.
 *
 * @returns A UUIDv7 string
 *
 * @example
 * ```typescript
 * import { uuidv7 } from 'awpaki/utils';
 *
 * await dynamodbClient.execute(
 *   new PutCommand({ TableName: 'Events', Item: { pk: tenantId, sk: uuidv7() } })
 * );
 * ```
 */
export function uuidv7(): string {
  return formatUuidv7(Date.now(), randomBytes(2).readUInt16BE(0) & 0x0fff);
}

/**
 * Generates a UUIDv7 that never goes backwards within the process.
 *
 * Ids minted in the same millisecond increment a counter held in `rand_a`, so they sort in
 * creation order. When the counter saturates the generator borrows the next millisecond
 * instead of wrapping, and a clock that steps backwards (NTP correction, a resumed container)
 * is ignored in favour of the last timestamp used — an id is never re-issued below one that
 * already exists.
 *
 * Monotonicity is **per process**: two warm Lambda containers minting in the same millisecond
 * have independent counters, so this orders a single writer, not a fleet. That matters
 * directly if the id doubles as an idempotency key.
 *
 * @returns A UUIDv7 string, strictly greater than the previous one from this process
 *
 * @example
 * ```typescript
 * import { monotonicUuidv7 } from 'awpaki/utils';
 *
 * const ids = [monotonicUuidv7(), monotonicUuidv7(), monotonicUuidv7()];
 * // ids.slice().sort() === ids, even inside one millisecond
 * ```
 */
export function monotonicUuidv7(): string {
  const now = Date.now();

  if (now > lastTimestampMs) {
    lastTimestampMs = now;
    counter = randomBytes(2).readUInt16BE(0) & 0x07ff;
  } else {
    counter += 1;

    // Borrowing a millisecond keeps the ordering promise: the ids stay ahead of real time
    // for a moment, which is invisible, whereas wrapping the counter would produce an id
    // that sorts before its predecessor.
    if (counter > 0x0fff) {
      lastTimestampMs += 1;
      counter = randomBytes(2).readUInt16BE(0) & 0x07ff;
    }
  }

  return formatUuidv7(lastTimestampMs, counter);
}
