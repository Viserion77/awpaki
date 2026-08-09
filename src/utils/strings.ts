/**
 * Pure string utilities — no dependencies, no I/O, no mutation.
 *
 * @module utils/strings
 */

/**
 * Converts a `kebab-case` string to `camelCase`.
 *
 * The everyday use is normalizing keys that arrive in kebab-case — HTTP headers
 * (`x-trace-id`), tags, SSM parameter names — into the identifier style of the codebase.
 *
 * Only the separator handling changes: characters that are not preceded by a hyphen keep
 * their original case, so `API-key` becomes `APIKey`, not `apiKey`. Leading and trailing
 * hyphens are dropped, and runs of hyphens count as a single separator.
 *
 * @param value - String in kebab-case
 * @returns The camelCase version, or an empty string for an empty input
 *
 * @example
 * ```typescript
 * kebabCaseToCamelCase('my-var-name'); // → 'myVarName'
 * kebabCaseToCamelCase('x-trace-id');  // → 'xTraceId'
 * kebabCaseToCamelCase('single');      // → 'single'
 * ```
 */
export function kebabCaseToCamelCase(value: string): string {
  if (value.length === 0) {
    return '';
  }

  return value
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-+(.)/g, (_match, character: string) => character.toUpperCase());
}

/**
 * Uppercases the first character of a string and leaves the rest untouched.
 *
 * Nothing else is normalized — `capitalizeFirstLetter('jOHN')` returns `'JOHN'`. Chain with
 * `toLowerCase()` first when the intent is title casing.
 *
 * @param value - String to capitalize
 * @returns The string with its first character uppercased, or an empty string for an empty input
 *
 * @example
 * ```typescript
 * capitalizeFirstLetter('hello world'); // → 'Hello world'
 * capitalizeFirstLetter('ana');         // → 'Ana'
 * capitalizeFirstLetter('');            // → ''
 * ```
 */
export function capitalizeFirstLetter(value: string): string {
  if (value.length === 0) {
    return '';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Keeps only the digits `0-9` of a value.
 *
 * The classic use is normalizing documents and phone numbers that arrive formatted from a
 * form before they are used as a partition key or as an external API argument.
 *
 * Numbers are accepted for convenience and `null`/`undefined` return an empty string, so the
 * function can be applied straight to an optional field. Note that the sign, the decimal
 * separator and the exponent of a number are also stripped: `onlyDigits(-1.5)` is `'15'`.
 *
 * @param value - String or number to normalize
 * @returns A string containing only digits, possibly empty
 *
 * @example
 * ```typescript
 * onlyDigits('(11) 98765-4321'); // → '11987654321'
 * onlyDigits('123.456.789-00');  // → '12345678900'
 * onlyDigits(undefined);         // → ''
 * ```
 */
export function onlyDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\D/g, '');
}

/**
 * Removes diacritics and special characters, keeping letters, digits and whitespace.
 *
 * Accented characters are folded to their base form (`á` → `a`, `ç` → `c`) via Unicode NFD
 * normalization, then everything outside `[A-Za-z0-9]` and whitespace is dropped. Handy to
 * build slugs, search keys and S3 object keys out of free text.
 *
 * Whitespace is preserved as-is (it is not collapsed nor trimmed) — compose with `trim()` or
 * a `replace(/\s+/g, '-')` when a slug is what you need.
 *
 * @param value - Text to normalize
 * @returns The text without diacritics and without special characters
 *
 * @example
 * ```typescript
 * removeSpecialCharacters('Ação & Reação!'); // → 'Acao  Reacao'
 * removeSpecialCharacters('user@example.com'); // → 'userexamplecom'
 * ```
 *
 * @example
 * ```typescript
 * // Building a slug
 * removeSpecialCharacters('Relatório Final (2024)').trim().replace(/\s+/g, '-').toLowerCase();
 * // → 'relatorio-final-2024'
 * ```
 */
export function removeSpecialCharacters(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '');
}

/**
 * Splits a string into a trimmed array, dropping empty entries.
 *
 * Made for the comma separated lists that show up in environment variables and query strings
 * (`ALLOWED_ORIGINS`, `?ids=1,2,3`), where trailing separators and stray spaces are the norm.
 *
 * `null`, `undefined` and blank strings return an empty array, so the result is always safe
 * to iterate.
 *
 * @param value - String to split
 * @param separator - Separator; defaults to `','`
 * @returns Array of trimmed, non-empty parts
 *
 * @example
 * ```typescript
 * stringToArray('a, b , c');   // → ['a', 'b', 'c']
 * stringToArray('a,,b,');      // → ['a', 'b']
 * stringToArray(undefined);    // → []
 * stringToArray('a|b', '|');   // → ['a', 'b']
 * ```
 *
 * @example
 * ```typescript
 * const allowedOrigins = stringToArray(process.env.ALLOWED_ORIGINS);
 * ```
 */
export function stringToArray(
  value: string | null | undefined,
  separator: string | RegExp = ','
): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
