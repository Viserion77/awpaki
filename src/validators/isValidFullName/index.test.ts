import { isValidFullName } from './index';

describe('isValidFullName', () => {
  it('should accept names with two or more valid words', () => {
    expect(isValidFullName('John Doe')).toBe(true);
    expect(isValidFullName('José da Silva')).toBe(true);
    expect(isValidFullName('Maria Conceição de Souza Lima')).toBe(true);
    expect(isValidFullName('Anne-Marie O’Brien')).toBe(true);
  });

  it('should ignore extra and surrounding whitespace between words', () => {
    expect(isValidFullName('  Ana   Maria  ')).toBe(true);
    expect(isValidFullName('Ana\tMaria')).toBe(true);
    expect(isValidFullName('Ana\nMaria')).toBe(true);
  });

  it('should reject values with fewer than two words', () => {
    expect(isValidFullName('Madonna')).toBe(false);
    expect(isValidFullName('  Madonna  ')).toBe(false);
    expect(isValidFullName('')).toBe(false);
    expect(isValidFullName('   ')).toBe(false);
  });

  it('should reject when any single word is invalid', () => {
    expect(isValidFullName('John Doe 2nd')).toBe(false);
    expect(isValidFullName('J. Doe')).toBe(false);
    expect(isValidFullName('John Doe!')).toBe(false);
    expect(isValidFullName('John -Doe')).toBe(false);
    expect(isValidFullName('123 456')).toBe(false);
  });

  it('should reject non-string values without throwing', () => {
    expect(isValidFullName(null)).toBe(false);
    expect(isValidFullName(undefined)).toBe(false);
    expect(isValidFullName(42)).toBe(false);
    expect(isValidFullName({ name: 'John Doe' })).toBe(false);
    expect(isValidFullName(['John', 'Doe'])).toBe(false);
    expect(isValidFullName(true)).toBe(false);
  });
});
