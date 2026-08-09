/**
 * Date utilities with **no external dependency** — no `moment`, no `date-fns`, no `dayjs`.
 *
 * Every function works in **UTC by default**. That is deliberate: Lambda runs with `TZ=UTC`,
 * DynamoDB/S3/CloudWatch timestamps are UTC, and a formatter whose output depends on the
 * machine's time zone produces tests that pass locally and fail in CI. {@link formatDate}
 * accepts `{ utc: false }` for the cases where the local calendar really is what matters.
 *
 * @module utils/dates
 */

/**
 * Anything accepted where a date is expected: a `Date`, an epoch in milliseconds or a string
 * parseable by the `Date` constructor (ISO 8601 is the safe choice).
 */
export type DateInput = Date | string | number;

/**
 * Amount to add to (positive) or subtract from (negative) a date in {@link changeDate}.
 */
export interface DateChanges {
  /** Calendar years */
  years?: number;
  /** Calendar months */
  months?: number;
  /** Calendar days */
  days?: number;
  /** Hours */
  hours?: number;
  /** Minutes */
  minutes?: number;
  /** Seconds */
  seconds?: number;
  /** Milliseconds */
  milliseconds?: number;
}

/**
 * Options of {@link formatDate}.
 */
export interface FormatDateOptions {
  /**
   * Read the calendar fields in UTC. Set to `false` to format using the local time zone of the
   * running process.
   *
   * @defaultValue true
   */
  utc?: boolean;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Normalizes any {@link DateInput} into a fresh, valid `Date`.
 *
 * A copy is always returned, so callers can never mutate the `Date` they passed in.
 *
 * @param value - Date, epoch in milliseconds or parseable date string
 * @returns A new `Date` instance
 * @throws {TypeError} When the value cannot be parsed into a valid date
 */
function toDate(value: DateInput): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid date: ${String(value)}`);
  }

  return date;
}

/**
 * Number of days in the UTC month of a given year.
 *
 * @param year - Full year (e.g. `2024`)
 * @param monthIndex - Zero-based month index (`0` = January)
 * @returns The last day number of that month (`28` to `31`)
 */
function lastDayOfUtcMonth(year: number, monthIndex: number): number {
  const probe = new Date(0);
  // Day `0` of the next month is the last day of the requested one.
  probe.setUTCFullYear(year, monthIndex + 1, 0);
  return probe.getUTCDate();
}

/**
 * Formats a date using `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` and `SSS` tokens.
 *
 * Supported tokens (everything else in the pattern is copied verbatim):
 *
 * | Token | Meaning                    | Example |
 * | ----- | -------------------------- | ------- |
 * | `YYYY`| Full year                  | `2024`  |
 * | `YY`  | Two-digit year             | `24`    |
 * | `MM`  | Month, zero padded         | `05`    |
 * | `DD`  | Day of month, zero padded  | `09`    |
 * | `HH`  | Hours (24h), zero padded   | `13`    |
 * | `mm`  | Minutes, zero padded       | `07`    |
 * | `ss`  | Seconds, zero padded       | `04`    |
 * | `SSS` | Milliseconds, zero padded  | `090`   |
 *
 * @param date - Date, epoch in milliseconds or parseable date string
 * @param format - Pattern; defaults to `'YYYY-MM-DD'`
 * @param options - Formatting options; UTC by default
 * @returns The formatted string
 * @throws {TypeError} When the date is invalid
 *
 * @example
 * ```typescript
 * formatDate('2024-05-09T13:07:04.090Z');                          // → '2024-05-09'
 * formatDate('2024-05-09T13:07:04.090Z', 'DD/MM/YYYY HH:mm:ss');   // → '09/05/2024 13:07:04'
 * formatDate(new Date(0), 'YYYY-MM-DDTHH:mm:ss.SSS');              // → '1970-01-01T00:00:00.000'
 * ```
 *
 * @example
 * ```typescript
 * // Same instant rendered with the local calendar of the process
 * formatDate('2024-05-09T23:30:00Z', 'YYYY-MM-DD', { utc: false });
 * ```
 */
export function formatDate(
  date: DateInput,
  format = 'YYYY-MM-DD',
  options: FormatDateOptions = {}
): string {
  const { utc = true } = options;
  const value = toDate(date);

  const year = utc ? value.getUTCFullYear() : value.getFullYear();
  const month = (utc ? value.getUTCMonth() : value.getMonth()) + 1;
  const day = utc ? value.getUTCDate() : value.getDate();
  const hours = utc ? value.getUTCHours() : value.getHours();
  const minutes = utc ? value.getUTCMinutes() : value.getMinutes();
  const seconds = utc ? value.getUTCSeconds() : value.getSeconds();
  const milliseconds = utc ? value.getUTCMilliseconds() : value.getMilliseconds();

  const pad = (input: number, length = 2): string => String(input).padStart(length, '0');

  const tokens: Record<string, string> = {
    YYYY: pad(year, 4),
    YY: pad(year, 4).slice(-2),
    MM: pad(month),
    DD: pad(day),
    HH: pad(hours),
    mm: pad(minutes),
    ss: pad(seconds),
    SSS: pad(milliseconds, 3),
  };

  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS/g, (token) => tokens[token]);
}

/**
 * Returns a new date shifted by the requested amount of time.
 *
 * Positive values move forward, negative values move backward, and the input is never
 * mutated. All arithmetic happens **in UTC**, so a `days` shift is always an exact multiple of
 * 24 hours and never gets bent by a daylight saving transition.
 *
 * Year and month shifts are **clamped to the end of the target month**: adding one month to
 * `2024-01-31` yields `2024-02-29`, not `2024-03-02` as the raw `Date` arithmetic would.
 * Larger units are applied first (years/months, then days, then time), which is what makes
 * the clamping predictable.
 *
 * @param date - Date, epoch in milliseconds or parseable date string
 * @param changes - Amounts to add; omitted fields count as `0`
 * @returns A new `Date` instance
 * @throws {TypeError} When the date is invalid
 *
 * @example
 * ```typescript
 * changeDate('2024-05-09T00:00:00Z', { days: 7 });    // → 2024-05-16T00:00:00.000Z
 * changeDate('2024-05-09T00:00:00Z', { days: -1 });   // → 2024-05-08T00:00:00.000Z
 * changeDate('2024-01-31T00:00:00Z', { months: 1 });  // → 2024-02-29T00:00:00.000Z (clamped)
 * ```
 *
 * @example
 * ```typescript
 * // TTL 30 days ahead, as the epoch in seconds DynamoDB expects
 * const ttl = Math.floor(changeDate(new Date(), { days: 30 }).getTime() / 1000);
 * ```
 */
export function changeDate(date: DateInput, changes: DateChanges = {}): Date {
  const result = toDate(date);
  const {
    years = 0,
    months = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    milliseconds = 0,
  } = changes;

  if (years !== 0 || months !== 0) {
    const dayOfMonth = result.getUTCDate();
    const targetMonthIndex = result.getUTCMonth() + months + years * 12;

    // Park on day 1 so the month shift can never roll over into the next month.
    result.setUTCDate(1);
    result.setUTCMonth(targetMonthIndex);
    result.setUTCDate(
      Math.min(dayOfMonth, lastDayOfUtcMonth(result.getUTCFullYear(), result.getUTCMonth()))
    );
  }

  if (days !== 0) {
    result.setUTCDate(result.getUTCDate() + days);
  }

  const timeShift = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;

  if (timeShift !== 0) {
    result.setTime(result.getTime() + timeShift);
  }

  return result;
}

/**
 * Whole days between two dates, counted on the **UTC calendar**.
 *
 * Both dates are collapsed to UTC midnight before the subtraction, so the time of day never
 * interferes: from `2024-05-09T23:59Z` to `2024-05-10T00:01Z` the answer is `1` day, the same
 * answer a human gives when looking at a calendar. The result is signed — negative when
 * `endDate` comes before `startDate` — and always an integer.
 *
 * For elapsed time (a duration, not a calendar distance) subtract the timestamps directly:
 * `end.getTime() - start.getTime()`.
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Signed number of whole days from `startDate` to `endDate`
 * @throws {TypeError} When either date is invalid
 *
 * @example
 * ```typescript
 * getDiffDays('2024-05-01', '2024-05-10');                     // → 9
 * getDiffDays('2024-05-10', '2024-05-01');                     // → -9
 * getDiffDays('2024-05-09T23:59:59Z', '2024-05-10T00:00:01Z'); // → 1
 * ```
 *
 * @example
 * ```typescript
 * // Is the token older than 30 days?
 * const expired = getDiffDays(issuedAt, new Date()) > 30;
 * ```
 */
export function getDiffDays(startDate: DateInput, endDate: DateInput): number {
  // `toDate` already returned copies, so collapsing them to midnight mutates nothing external.
  const start = toDate(startDate);
  const end = toDate(endDate);

  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  return Math.round((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY);
}
