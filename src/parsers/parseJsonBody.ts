import { BadRequestError } from '../errors';

/**
 * Parses a JSON stringified body and returns the parsed object.
 * 
 * @template T - The expected type of the parsed object
 * @param {string | null | undefined} body - The stringified JSON body to parse
 * @param {ParseJsonBodyOptions<T>} options - Optional configuration
 * @returns {T} The parsed object of type T
 * @throws {BadRequestError} When the body is not a valid JSON string or is empty (unless defaultValue is provided)
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
 * // Handle null/undefined with default value
 * const result = parseJsonBody<object>(null, { defaultValue: {} });
 * console.log(result); // {}
 * ```
 * 
 * @example
 * ```typescript
 * // Require non-empty body
 * try {
 *   parseJsonBody<object>('', { required: true });
 * } catch (error) {
 *   console.error('Body is required');
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Handle errors with HTTP status
 * try {
 *   const invalid = parseJsonBody<object>('invalid json');
 * } catch (error) {
 *   if (error instanceof BadRequestError) {
 *     return error.toLambdaResponse();
 *   }
 * }
 * ```
 */
export interface ParseJsonBodyOptions<T> {
  /**
   * Default value to return if body is null, undefined, or empty string
   */
  defaultValue?: T;
  
  /**
   * If true, throws error when body is empty. If false and no defaultValue, returns empty object
   * @default false
   */
  required?: boolean;
}

export function parseJsonBody<T>(
  body: string | null | undefined,
  options?: ParseJsonBodyOptions<T>
): T {
  const { defaultValue, required = false } = options || {};

  // Check if body is empty (null, undefined, or empty string)
  if (body === null || body === undefined || body.trim() === '') {
    if (required) {
      throw new BadRequestError('Request body is required');
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    // Return empty object as default behavior (like FieldVox)
    return {} as T;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new BadRequestError(`Invalid JSON format: ${error.message}`);
    }
    throw new BadRequestError('Invalid JSON format');
  }
}
