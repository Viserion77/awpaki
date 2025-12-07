import { BadRequest } from '../errors';

/**
 * Parses a JSON stringified body and returns the parsed object.
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
 *     return error.toLambdaResponse();
 *   }
 * }
 * ```
 */
export interface ParseJsonBodyOptions<T> {
  /**
   * Default value to return if body is null, undefined, or empty string.
   * When provided, makes the body optional (won't throw error if empty).
   */
  defaultValue?: T;
}

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
    if (error instanceof Error) {
      throw new BadRequest(`Invalid JSON format: ${error.message}`);
    }
    throw new BadRequest('Invalid JSON format');
  }
}
