import { isValidName } from './index';

describe('isValidName', () => {
  it('should accept single words made of letters', () => {
    expect(isValidName('John')).toBe(true);
    expect(isValidName('maria')).toBe(true);
    expect(isValidName('SILVA')).toBe(true);
    expect(isValidName('J')).toBe(true);
  });

  it('should accept accented and non-latin letters', () => {
    expect(isValidName('José')).toBe(true);
    expect(isValidName('Ângela')).toBe(true);
    expect(isValidName('Müller')).toBe(true);
    expect(isValidName('Conceição')).toBe(true);
    expect(isValidName('Ελένη')).toBe(true);
    // Decomposed form: 'Jose' + combining acute accent (U+0301).
    expect(isValidName('José')).toBe(true);
  });

  it('should accept internal hyphens and apostrophes', () => {
    expect(isValidName('Anne-Marie')).toBe(true);
    expect(isValidName("O'Brien")).toBe(true);
    expect(isValidName('D’Ávila')).toBe(true);
    expect(isValidName('Saint-Jean-Baptiste')).toBe(true);
  });

  it('should reject misplaced or repeated separators', () => {
    expect(isValidName('-John')).toBe(false);
    expect(isValidName('John-')).toBe(false);
    expect(isValidName("'John")).toBe(false);
    expect(isValidName('Anne--Marie')).toBe(false);
    expect(isValidName("O'-Brien")).toBe(false);
    expect(isValidName('-')).toBe(false);
  });

  it('should reject digits and other punctuation', () => {
    expect(isValidName('John3')).toBe(false);
    expect(isValidName('123')).toBe(false);
    expect(isValidName('John_Doe')).toBe(false);
    expect(isValidName('John.')).toBe(false);
    expect(isValidName('J.')).toBe(false);
    expect(isValidName('John@doe')).toBe(false);
  });

  it('should reject anything with whitespace, including empty input', () => {
    expect(isValidName('John Doe')).toBe(false);
    expect(isValidName(' John')).toBe(false);
    expect(isValidName('John ')).toBe(false);
    expect(isValidName('John\tDoe')).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(isValidName('   ')).toBe(false);
  });

  it('should reject non-string values without throwing', () => {
    expect(isValidName(null)).toBe(false);
    expect(isValidName(undefined)).toBe(false);
    expect(isValidName(42)).toBe(false);
    expect(isValidName({ name: 'John' })).toBe(false);
    expect(isValidName(['John'])).toBe(false);
    expect(isValidName(false)).toBe(false);
  });
});
