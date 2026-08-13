/**
 * Adapter turning a sanitizer into a schema decoder.
 *
 * A sanitizer has the contract `(raw: unknown) => T | undefined`, where `undefined` means
 * "this input is not usable" and the caller decides what that costs. It is a pleasant shape to
 * write and to compose — but plugging one straight into a schema as a `decoder` is a trap:
 * `extractEventParams` assigns whatever a decoder returns, so a rejected value arrives at the
 * handler as `params.x === undefined`, with a 200 and no error, after `required` has already
 * passed. This adapter turns the `undefined` back into the failure the schema knows how to
 * report, where the field's own `statusCodeError` and `wrongTypeMessage` decide the answer.
 *
 * @module decoders/fromSanitizer
 */

/**
 * A function that normalizes an input or rejects it by returning `undefined`.
 *
 * @template T - Type produced when the input is usable
 */
export type Sanitizer<T> = (raw: unknown) => T | undefined;

/**
 * Wraps a sanitizer so a rejected value becomes a schema validation failure.
 *
 * @template T - Type produced by the sanitizer
 * @param sanitize - The sanitizer to adapt
 * @param message - Message of the thrown error. The schema's `wrongTypeMessage` wins over it,
 *                  so this is only what a direct caller sees
 * @returns A decoder usable as `ParameterConfig.decoder`
 * @throws TypeError when `sanitize` is not a function
 *
 * @example
 * ```typescript
 * import { fromSanitizer } from 'awpaki/decoders';
 *
 * const sanitizeSlug = (raw: unknown): string | undefined => {
 *   const slug = String(raw ?? '').trim().toLowerCase();
 *   return /^[a-z0-9-]{3,60}$/.test(slug) ? slug : undefined;
 * };
 *
 * const schema = {
 *   pathParameters: {
 *     slug: {
 *       label: 'Slug',
 *       required: true,
 *       decoder: fromSanitizer(sanitizeSlug),
 *       statusCodeError: HttpStatus.BAD_REQUEST,
 *     },
 *   },
 * };
 * ```
 */
export function fromSanitizer<T>(
  sanitize: Sanitizer<T>,
  message = 'Invalid value'
): (value: unknown) => T {
  if (typeof sanitize !== 'function') {
    throw new TypeError('fromSanitizer expects a sanitizer function');
  }

  return function decodeSanitized(value: unknown): T {
    const sanitized = sanitize(value);

    if (sanitized === undefined) {
      throw new Error(message);
    }

    return sanitized;
  };
}
