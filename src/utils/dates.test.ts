import { changeDate, formatDate, getDiffDays } from './dates.js';

describe('formatDate', () => {
  it('should use YYYY-MM-DD as the default format', () => {
    expect(formatDate('2024-05-09T13:07:04.090Z')).toBe('2024-05-09');
  });

  it('should support every documented token', () => {
    expect(formatDate('2024-05-09T13:07:04.090Z', 'YYYY YY MM DD HH mm ss SSS')).toBe(
      '2024 24 05 09 13 07 04 090'
    );
  });

  it('should zero pad every field', () => {
    expect(formatDate('2024-01-02T03:04:05.006Z', 'YYYY-MM-DDTHH:mm:ss.SSS')).toBe(
      '2024-01-02T03:04:05.006'
    );
  });

  it('should keep literal characters of the pattern', () => {
    expect(formatDate('2024-05-09T00:00:00Z', 'DD/MM/YYYY')).toBe('09/05/2024');
    expect(formatDate('2024-05-09T00:00:00Z', 'day DD')).toBe('day 09');
  });

  it('should accept a Date instance', () => {
    expect(formatDate(new Date('2024-05-09T13:07:04.090Z'), 'YYYY-MM-DD HH:mm')).toBe(
      '2024-05-09 13:07'
    );
  });

  it('should accept an epoch in milliseconds', () => {
    expect(formatDate(0, 'YYYY-MM-DDTHH:mm:ss.SSS')).toBe('1970-01-01T00:00:00.000');
  });

  it('should format in UTC regardless of the process time zone', () => {
    // 23:30 UTC is still the 9th in UTC even for time zones where it is already the 10th.
    expect(formatDate('2024-05-09T23:30:00Z')).toBe('2024-05-09');
  });

  it('should format with the local calendar when utc is false', () => {
    const date = new Date('2024-05-09T13:07:04.090Z');
    const expected = [
      String(date.getFullYear()).padStart(4, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');

    expect(formatDate(date, 'YYYY-MM-DD', { utc: false })).toBe(expected);
  });

  it('should not mutate the input date', () => {
    const date = new Date('2024-05-09T13:07:04.090Z');

    formatDate(date, 'YYYY');

    expect(date.toISOString()).toBe('2024-05-09T13:07:04.090Z');
  });

  it('should throw for an invalid date', () => {
    expect(() => formatDate('not-a-date')).toThrow(TypeError);
    expect(() => formatDate('not-a-date')).toThrow('Invalid date: not-a-date');
    expect(() => formatDate(new Date(NaN))).toThrow('Invalid date');
    expect(() => formatDate(NaN)).toThrow('Invalid date');
  });

  it('should return the pattern untouched when it has no token', () => {
    expect(formatDate('2024-05-09T00:00:00Z', 'no tokens here')).toBe('no tokens here');
  });
});

describe('changeDate', () => {
  it('should add days', () => {
    expect(changeDate('2024-05-09T00:00:00Z', { days: 7 }).toISOString()).toBe(
      '2024-05-16T00:00:00.000Z'
    );
  });

  it('should subtract with negative values', () => {
    expect(changeDate('2024-05-09T00:00:00Z', { days: -1 }).toISOString()).toBe(
      '2024-05-08T00:00:00.000Z'
    );
  });

  it('should cross a month boundary', () => {
    expect(changeDate('2024-05-31T00:00:00Z', { days: 1 }).toISOString()).toBe(
      '2024-06-01T00:00:00.000Z'
    );
  });

  it('should cross a year boundary', () => {
    expect(changeDate('2023-12-31T23:00:00Z', { hours: 2 }).toISOString()).toBe(
      '2024-01-01T01:00:00.000Z'
    );
  });

  it('should add months keeping the day when it exists in the target month', () => {
    expect(changeDate('2024-05-09T10:00:00Z', { months: 1 }).toISOString()).toBe(
      '2024-06-09T10:00:00.000Z'
    );
  });

  it('should clamp the day to the last day of the target month', () => {
    expect(changeDate('2024-01-31T00:00:00Z', { months: 1 }).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z'
    );
    expect(changeDate('2023-01-31T00:00:00Z', { months: 1 }).toISOString()).toBe(
      '2023-02-28T00:00:00.000Z'
    );
    expect(changeDate('2024-05-31T00:00:00Z', { months: -1 }).toISOString()).toBe(
      '2024-04-30T00:00:00.000Z'
    );
  });

  it('should roll the year when the month shift overflows', () => {
    expect(changeDate('2024-11-15T00:00:00Z', { months: 3 }).toISOString()).toBe(
      '2025-02-15T00:00:00.000Z'
    );
    expect(changeDate('2024-02-15T00:00:00Z', { months: -3 }).toISOString()).toBe(
      '2023-11-15T00:00:00.000Z'
    );
  });

  it('should add years and clamp February 29th', () => {
    expect(changeDate('2024-02-29T00:00:00Z', { years: 1 }).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z'
    );
    expect(changeDate('2024-02-29T00:00:00Z', { years: 4 }).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z'
    );
  });

  it('should apply time units', () => {
    expect(
      changeDate('2024-05-09T00:00:00.000Z', {
        hours: 1,
        minutes: 2,
        seconds: 3,
        milliseconds: 4,
      }).toISOString()
    ).toBe('2024-05-09T01:02:03.004Z');
  });

  it('should combine calendar and time units', () => {
    expect(
      changeDate('2024-01-31T12:00:00Z', { years: 1, months: 1, days: 1, hours: -12 }).toISOString()
    ).toBe('2025-03-01T00:00:00.000Z');
  });

  it('should return an equal date when there is no change', () => {
    expect(changeDate('2024-05-09T10:11:12.131Z', {}).toISOString()).toBe(
      '2024-05-09T10:11:12.131Z'
    );
    expect(changeDate('2024-05-09T10:11:12.131Z').toISOString()).toBe('2024-05-09T10:11:12.131Z');
  });

  it('should keep the time of day when shifting days across a DST boundary', () => {
    // UTC arithmetic: exactly 24h per day, no daylight saving surprise.
    expect(changeDate('2024-03-10T12:00:00Z', { days: 1 }).toISOString()).toBe(
      '2024-03-11T12:00:00.000Z'
    );
  });

  it('should not mutate the input date', () => {
    const date = new Date('2024-05-09T00:00:00Z');

    const result = changeDate(date, { days: 10, months: 2 });

    expect(date.toISOString()).toBe('2024-05-09T00:00:00.000Z');
    expect(result).not.toBe(date);
  });

  it('should accept an epoch in milliseconds', () => {
    expect(changeDate(0, { days: 1 }).toISOString()).toBe('1970-01-02T00:00:00.000Z');
  });

  it('should throw for an invalid date', () => {
    expect(() => changeDate('nope', { days: 1 })).toThrow(TypeError);
  });
});

describe('getDiffDays', () => {
  it('should count whole days between two dates', () => {
    expect(getDiffDays('2024-05-01', '2024-05-10')).toBe(9);
  });

  it('should be signed', () => {
    expect(getDiffDays('2024-05-10', '2024-05-01')).toBe(-9);
  });

  it('should return zero for the same day', () => {
    expect(getDiffDays('2024-05-09T00:00:00Z', '2024-05-09T23:59:59Z')).toBe(0);
  });

  it('should ignore the time of day and count calendar days', () => {
    expect(getDiffDays('2024-05-09T23:59:59Z', '2024-05-10T00:00:01Z')).toBe(1);
  });

  it('should cross months and years', () => {
    expect(getDiffDays('2024-01-31', '2024-02-01')).toBe(1);
    expect(getDiffDays('2023-12-31', '2024-01-01')).toBe(1);
  });

  it('should count a leap year correctly', () => {
    expect(getDiffDays('2024-01-01', '2025-01-01')).toBe(366);
    expect(getDiffDays('2023-01-01', '2024-01-01')).toBe(365);
  });

  it('should not be affected by daylight saving transitions', () => {
    expect(getDiffDays('2024-03-01T00:00:00Z', '2024-04-01T00:00:00Z')).toBe(31);
  });

  it('should accept Date instances and epochs', () => {
    expect(getDiffDays(new Date('2024-05-01T00:00:00Z'), new Date('2024-05-03T00:00:00Z'))).toBe(2);
    expect(getDiffDays(0, 86_400_000)).toBe(1);
  });

  it('should not mutate the input dates', () => {
    const start = new Date('2024-05-01T10:00:00Z');
    const end = new Date('2024-05-03T20:00:00Z');

    getDiffDays(start, end);

    expect(start.toISOString()).toBe('2024-05-01T10:00:00.000Z');
    expect(end.toISOString()).toBe('2024-05-03T20:00:00.000Z');
  });

  it('should throw for an invalid date', () => {
    expect(() => getDiffDays('nope', '2024-05-01')).toThrow(TypeError);
    expect(() => getDiffDays('2024-05-01', 'nope')).toThrow('Invalid date: nope');
  });
});
