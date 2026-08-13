import { isValidName } from '../isValidName/index.js';

/**
 * Checks whether a value is a full name: at least two words, each one valid
 * according to {@link isValidName}.
 *
 * Words are split on any run of whitespace, so extra spaces between words (and
 * around the value) do not make an otherwise valid name invalid. Every word
 * must be a valid name word, which means a single invalid one — a digit, an
 * initial written as `'J.'` — rejects the whole value.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a full name with two or more valid words,
 * `false` otherwise
 *
 * @example
 * ```typescript
 * isValidFullName('José da Silva');       // true
 * isValidFullName('Anne-Marie O’Brien');  // true
 * isValidFullName('  Ana   Maria  ');     // true — extra whitespace is ignored
 * ```
 *
 * @example
 * ```typescript
 * isValidFullName('Madonna');      // false — a single word
 * isValidFullName('John Doe 2nd'); // false — one invalid word
 * isValidFullName('J. Doe');       // false — abbreviations are not name words
 * isValidFullName({});             // false — non-string input never throws
 * ```
 */
export function isValidFullName(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const words = value.split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 2) return false;

  return words.every((word) => isValidName(word));
}
