import { isEmail } from './index.js';

describe('isEmail', () => {
  it('should accept common valid addresses', () => {
    expect(isEmail('user@example.com')).toBe(true);
    expect(isEmail('user.name+tag@sub.example.co.uk')).toBe(true);
    expect(isEmail("o'brien!#$%&*+-/=?^_`{|}~@example.com")).toBe(true);
    expect(isEmail('USER@EXAMPLE.COM')).toBe(true);
    expect(isEmail('a@b-c.io')).toBe(true);
  });

  it('should accept quoted local parts', () => {
    expect(isEmail('"john doe"@example.com')).toBe(true);
    expect(isEmail('"user@internal"@example.com')).toBe(true);
    expect(isEmail('"escaped \\" quote"@example.com')).toBe(true);
  });

  it('should reject malformed quoted local parts', () => {
    expect(isEmail('"unterminated@example.com')).toBe(false);
    expect(isEmail('"quoted"extra@example.com')).toBe(false);
    expect(isEmail('"line\nbreak"@example.com')).toBe(false);
  });

  it('should accept address literals', () => {
    expect(isEmail('user@[192.168.0.1]')).toBe(true);
    expect(isEmail('user@[IPv6:2001:db8::1]')).toBe(true);
    expect(isEmail('user@[IPv6:::1]')).toBe(true);
    expect(isEmail('user@[IPv6:::ffff:192.168.0.1]')).toBe(true);
    expect(isEmail('user@[IPv6:1:2:3:4:5:6:7:8]')).toBe(true);
  });

  it('should reject malformed address literals', () => {
    expect(isEmail('user@[256.0.0.1]')).toBe(false);
    expect(isEmail('user@[192.168.0]')).toBe(false);
    expect(isEmail('user@[IPv6:2001:db8::1::2]')).toBe(false);
    expect(isEmail('user@[IPv6:1:2:3:4:5:6:7:8:9]')).toBe(false);
    expect(isEmail('user@[IPv6:12345::1]')).toBe(false);
    expect(isEmail('user@[IPv6:]')).toBe(false);
    expect(isEmail('user@[example.com]')).toBe(false);
    expect(isEmail('user@192.168.0.1')).toBe(false);
  });

  it('should reject the weak-regex leftovers the old validation accepted', () => {
    expect(isEmail('a@b.c')).toBe(false);
    expect(isEmail('user@example.c')).toBe(false);
    expect(isEmail('user@example.c0m')).toBe(false);
  });

  it('should reject structurally invalid addresses', () => {
    expect(isEmail('user@example')).toBe(false);
    expect(isEmail('userexample.com')).toBe(false);
    expect(isEmail('@example.com')).toBe(false);
    expect(isEmail('user@')).toBe(false);
    expect(isEmail('user@@example.com')).toBe(false);
    expect(isEmail('user@exam ple.com')).toBe(false);
    expect(isEmail('')).toBe(false);
  });

  it('should reject dot placement errors', () => {
    expect(isEmail('.user@example.com')).toBe(false);
    expect(isEmail('user.@example.com')).toBe(false);
    expect(isEmail('us..er@example.com')).toBe(false);
    expect(isEmail('user@example..com')).toBe(false);
    expect(isEmail('user@.example.com')).toBe(false);
    expect(isEmail('user@example.com.')).toBe(false);
  });

  it('should reject invalid domain labels', () => {
    expect(isEmail('user@-example.com')).toBe(false);
    expect(isEmail('user@example-.com')).toBe(false);
    expect(isEmail(`user@${'a'.repeat(64)}.com`)).toBe(false);
    expect(isEmail(`user@${'a'.repeat(63)}.com`)).toBe(true);
  });

  it('should enforce RFC length limits', () => {
    const localOf64 = 'a'.repeat(64);
    expect(isEmail(`${localOf64}@example.com`)).toBe(true);
    expect(isEmail(`${'a'.repeat(65)}@example.com`)).toBe(false);

    // 64 + 1 + 189 = 254 characters, split into labels of at most 63.
    const label = 'b'.repeat(61);
    const domainOf189 = `${label}.${label}.${label}.com`;
    expect(`${localOf64}@${domainOf189}`).toHaveLength(254);
    expect(isEmail(`${localOf64}@${domainOf189}`)).toBe(true);
    expect(isEmail(`${localOf64}@b${domainOf189}`)).toBe(false);
  });

  it('should reject surrounding whitespace instead of trimming it', () => {
    expect(isEmail(' user@example.com')).toBe(false);
    expect(isEmail('user@example.com ')).toBe(false);
    expect(isEmail('user@example.com\n')).toBe(false);
  });

  it('should reject non-string values without throwing', () => {
    expect(isEmail(null)).toBe(false);
    expect(isEmail(undefined)).toBe(false);
    expect(isEmail(123)).toBe(false);
    expect(isEmail({ email: 'user@example.com' })).toBe(false);
    expect(isEmail(['user@example.com'])).toBe(false);
    expect(isEmail(true)).toBe(false);
    expect(isEmail(Symbol('user@example.com'))).toBe(false);
  });
});
