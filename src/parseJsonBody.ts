/**
 * Parses a JSON stringified body and returns the parsed object.
 * 
 * @template T - The expected type of the parsed object
 * @param {string} body - The stringified JSON body to parse
 * @returns {T} The parsed object of type T
 * @throws {Error} When the body is not a valid JSON string
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
 * // Handle errors
 * try {
 *   const invalid = parseJsonBody<object>('invalid json');
 * } catch (error) {
 *   console.error('Failed to parse JSON:', error.message);
 * }
 * ```
 */
export function parseJsonBody<T>(body: string): T {
  try {
    const parsed = JSON.parse(body);
    return parsed as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse JSON body: ${error.message}`);
    }
    throw new Error('Failed to parse JSON body: Unknown error');
  }
}
