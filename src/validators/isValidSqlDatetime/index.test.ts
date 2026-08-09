import { isValidSqlDatetime } from './index';

describe('isValidSqlDatetime', () => {
  it('should accept well-formed datetimes', () => {
    expect(isValidSqlDatetime('2024-01-01 00:00:00')).toBe(true);
    expect(isValidSqlDatetime('1999-12-31 23:59:59')).toBe(true);
    expect(isValidSqlDatetime('2023-06-15 12:30:45')).toBe(true);
    expect(isValidSqlDatetime('2024-02-29 08:05:09')).toBe(true);
  });

  it('should accept optional fractional seconds of up to six digits', () => {
    expect(isValidSqlDatetime('2024-01-01 00:00:00.1')).toBe(true);
    expect(isValidSqlDatetime('2024-01-01 00:00:00.123')).toBe(true);
    expect(isValidSqlDatetime('2024-01-01 00:00:00.123456')).toBe(true);
    expect(isValidSqlDatetime('2024-01-01 00:00:00.1234567')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01 00:00:00.')).toBe(false);
  });

  it('should reject dates that do not exist', () => {
    expect(isValidSqlDatetime('2023-02-30 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2023-02-29 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2100-02-29 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-04-31 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-13-01 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-00-10 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-01-00 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('0000-00-00 00:00:00')).toBe(false);
  });

  it('should handle the century leap-year rule', () => {
    expect(isValidSqlDatetime('2000-02-29 00:00:00')).toBe(true);
    expect(isValidSqlDatetime('1900-02-29 00:00:00')).toBe(false);
  });

  it('should reject out-of-range times', () => {
    expect(isValidSqlDatetime('2024-01-01 24:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01 00:60:00')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01 00:00:60')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01 23:59:59')).toBe(true);
  });

  it('should reject other datetime formats', () => {
    expect(isValidSqlDatetime('2024-01-01T00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01T00:00:00Z')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01 00:00:00+00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-1-1 0:00:00')).toBe(false);
    expect(isValidSqlDatetime('01/01/2024 00:00:00')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01')).toBe(false);
    expect(isValidSqlDatetime('2024-01-01  00:00:00')).toBe(false);
    expect(isValidSqlDatetime(' 2024-01-01 00:00:00 ')).toBe(false);
    expect(isValidSqlDatetime('')).toBe(false);
  });

  it('should reject non-string values without throwing', () => {
    expect(isValidSqlDatetime(null)).toBe(false);
    expect(isValidSqlDatetime(undefined)).toBe(false);
    expect(isValidSqlDatetime(1704067200000)).toBe(false);
    expect(isValidSqlDatetime(new Date('2024-01-01T00:00:00Z'))).toBe(false);
    expect(isValidSqlDatetime({ date: '2024-01-01 00:00:00' })).toBe(false);
    expect(isValidSqlDatetime(['2024-01-01 00:00:00'])).toBe(false);
  });
});
