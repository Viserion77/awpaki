import { BadRequest } from '../errors/index.js';

/**
 * Options of {@link parseJsonBody}.
 *
 * @template T - The expected type of the parsed object
 */
export interface ParseJsonBodyOptions<T> {
  /**
   * Value returned when the body is null, undefined or blank. Providing it is what makes
   * the body optional — without it, an absent body is a `BadRequest`, because the common
   * case is a route that requires one and would otherwise fail later on a property read.
   */
  defaultValue?: T;
}

/**
 * Parses a JSON stringified body and returns the parsed object.
 *
 * The failure message deliberately does **not** include the parser's own message. V8 quotes
 * a fragment of the offending input in it (`Unexpected token } in JSON at position 42`), and
 * this error is thrown with a status that reaches the client, so the fragment would be
 * echoed back to whoever sent it. The body is already available to whoever is debugging,
 * in the entry log.
 *
 * @template T - The expected type of the parsed object
 * @param {string | null | undefined} body - The stringified JSON body to parse
 * @param {ParseJsonBodyOptions<T>} options - Optional configuration
 * @returns {T} The parsed object of type T
 * @throws {BadRequest} When the body is not a valid JSON string or is empty (unless defaultValue is provided)
 *
 * @example
 * ```typescript
 * interface User {
 *   name: string;
 *   age: number;
 * }
 *
 * const jsonString = '{"name": "John Doe", "age": 30}';
 * const user = parseJsonBody<User>(jsonString);
 * console.log(user.name); // "John Doe"
 * console.log(user.age);  // 30
 * ```
 *
 * @example
 * ```typescript
 * // Parse an array
 * const arrayString = '[1, 2, 3, 4, 5]';
 * const numbers = parseJsonBody<number[]>(arrayString);
 * console.log(numbers); // [1, 2, 3, 4, 5]
 * ```
 *
 * @example
 * ```typescript
 * // Handle null/undefined with default value (makes body optional)
 * const result = parseJsonBody<object>(null, { defaultValue: {} });
 * console.log(result); // {}
 * ```
 *
 * @example
 * ```typescript
 * // By default, empty body throws error
 * try {
 *   parseJsonBody<object>('');
 * } catch (error) {
 *   console.error('Body is required by default');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Handle errors with HTTP status
 * try {
 *   const invalid = parseJsonBody<object>('invalid json');
 * } catch (error) {
 *   if (error instanceof BadRequest) {
 *     return error.toApiGatewayResponse();
 *   }
 * }
 * ```
 */
export function parseJsonBody<T>(
  body: string | null | undefined,
  options?: ParseJsonBodyOptions<T>
): T {
  const { defaultValue } = options || {};

  // Check if body is empty (null, undefined, or empty string)
  if (body === null || body === undefined || body.trim() === '') {
    // If defaultValue is provided, body is optional
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    // Otherwise, body is required and we throw an error
    throw new BadRequest('Request body is required');
  }

  try {
    const parsed = JSON.parse(body);
    return parsed as T;
  } catch (error) {
    // The parser's own error travels as `cause`, which the log serializer copies explicitly
    // and no response builder reads — the diagnostic survives without the payload fragment
    // in its message being echoed back to the caller.
    throw new BadRequest('Invalid JSON format', undefined, undefined, { cause: error });
  }
}
