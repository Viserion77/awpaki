/**
 * A single word: letter runs (accents and combining marks included) joined by
 * single hyphens or apostrophes, which may never start or end the word.
 */
const NAME_WORD = /^\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*$/u;

/**
 * Checks whether a value is a single valid name word.
 *
 * Accepts letters from any alphabet, accented or combining (`'José'`,
 * `'Müller'`, `'Ângela'`), plus hyphens and apostrophes — straight or
 * typographic — as internal separators (`'Anne-Marie'`, `"O'Brien"`,
 * `'D’Ávila'`).
 *
 * Rejects: non-strings, the empty string, digits, underscores, punctuation
 * other than the two separators, a leading or trailing separator, two adjacent
 * separators, and anything with whitespace in it — including surrounding
 * whitespace, since the value is validated as-is and never trimmed. Use
 * {@link isValidFullName} for names made of several words.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a single valid name word, `false` otherwise
 *
 * @example
 * ```typescript
 * isValidName('José');       // true
 * isValidName('Anne-Marie'); // true
 * isValidName("O'Brien");    // true
 * ```
 *
 * @example
 * ```typescript
 * isValidName('John Doe'); // false — two words
 * isValidName('John3');    // false — digits
 * isValidName('-John');    // false — leading separator
 * isValidName(42);         // false — non-string input never throws
 * ```
 */
export function isValidName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;

  return NAME_WORD.test(value);
}
