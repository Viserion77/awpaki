/** `YYYY-MM-DD HH:MM:SS` with an optional fraction of up to six digits. */
const SQL_DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

/**
 * Days in each month, index 0 = January. February is resolved by the caller.
 */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Tells whether a year is a leap year in the proleptic Gregorian calendar.
 *
 * @param year - Four digit year
 * @returns `true` when February has 29 days that year
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Checks whether a value is a SQL `DATETIME` literal that denotes a real
 * calendar date and time.
 *
 * Accepts `'YYYY-MM-DD HH:MM:SS'` with an optional fractional part of one to
 * six digits (`'2024-02-29 23:59:59.123456'`). The calendar is checked, so
 * `'2023-02-30 00:00:00'` and `'2023-02-29 00:00:00'` are rejected while
 * `'2024-02-29 00:00:00'` is accepted.
 *
 * Rejects: non-strings, the ISO `T` separator, timezone suffixes such as `Z`
 * or `+00:00`, unpadded components (`'2024-1-5 1:00:00'`), the MySQL zero date
 * `'0000-00-00 00:00:00'`, hours above 23, minutes or seconds above 59, and
 * surrounding whitespace — the value is validated as-is, it is never trimmed.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a valid SQL datetime literal, `false` otherwise
 *
 * @example
 * ```typescript
 * isValidSqlDatetime('2024-02-29 23:59:59');        // true
 * isValidSqlDatetime('2024-01-31 00:00:00.123');    // true
 * ```
 *
 * @example
 * ```typescript
 * isValidSqlDatetime('2023-02-30 00:00:00'); // false — February has no 30th
 * isValidSqlDatetime('2024-01-01T00:00:00'); // false — ISO separator
 * isValidSqlDatetime('2024-01-01 24:00:00'); // false — hour out of range
 * isValidSqlDatetime(1704067200000);         // false — non-string input never throws
 * ```
 */
export function isValidSqlDatetime(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const match = SQL_DATETIME.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);

  if (year < 1) return false;
  if (month < 1 || month > 12) return false;
  if (hours > 23 || minutes > 59 || seconds > 59) return false;

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return false;

  return true;
}
