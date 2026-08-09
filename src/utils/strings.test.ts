import {
  capitalizeFirstLetter,
  kebabCaseToCamelCase,
  onlyDigits,
  removeSpecialCharacters,
  stringToArray,
} from './strings';

describe('kebabCaseToCamelCase', () => {
  it('should convert kebab-case to camelCase', () => {
    expect(kebabCaseToCamelCase('my-var-name')).toBe('myVarName');
    expect(kebabCaseToCamelCase('x-trace-id')).toBe('xTraceId');
  });

  it('should return a string without hyphens untouched', () => {
    expect(kebabCaseToCamelCase('single')).toBe('single');
    expect(kebabCaseToCamelCase('alreadyCamel')).toBe('alreadyCamel');
  });

  it('should handle an empty string', () => {
    expect(kebabCaseToCamelCase('')).toBe('');
  });

  it('should drop leading and trailing hyphens', () => {
    expect(kebabCaseToCamelCase('-leading')).toBe('leading');
    expect(kebabCaseToCamelCase('trailing-')).toBe('trailing');
    expect(kebabCaseToCamelCase('--both--')).toBe('both');
  });

  it('should treat a run of hyphens as a single separator', () => {
    expect(kebabCaseToCamelCase('a--b')).toBe('aB');
    expect(kebabCaseToCamelCase('a---b-c')).toBe('aBC');
  });

  it('should return an empty string when the input is only hyphens', () => {
    expect(kebabCaseToCamelCase('---')).toBe('');
  });

  it('should keep the original case of characters that are not separators', () => {
    expect(kebabCaseToCamelCase('API-key')).toBe('APIKey');
  });

  it('should handle digits after a separator', () => {
    expect(kebabCaseToCamelCase('v-2-api')).toBe('v2Api');
  });
});

describe('capitalizeFirstLetter', () => {
  it('should uppercase the first character', () => {
    expect(capitalizeFirstLetter('hello world')).toBe('Hello world');
    expect(capitalizeFirstLetter('ana')).toBe('Ana');
  });

  it('should keep the rest of the string untouched', () => {
    expect(capitalizeFirstLetter('jOHN')).toBe('JOHN');
  });

  it('should handle an empty string', () => {
    expect(capitalizeFirstLetter('')).toBe('');
  });

  it('should handle a single character', () => {
    expect(capitalizeFirstLetter('a')).toBe('A');
  });

  it('should return a string starting with a non-letter untouched', () => {
    expect(capitalizeFirstLetter('1st place')).toBe('1st place');
    expect(capitalizeFirstLetter(' leading space')).toBe(' leading space');
  });

  it('should handle accented characters', () => {
    expect(capitalizeFirstLetter('ação')).toBe('Ação');
  });
});

describe('onlyDigits', () => {
  it('should keep only digits', () => {
    expect(onlyDigits('(11) 98765-4321')).toBe('11987654321');
    expect(onlyDigits('123.456.789-00')).toBe('12345678900');
  });

  it('should return an empty string when there is no digit', () => {
    expect(onlyDigits('abc')).toBe('');
    expect(onlyDigits('')).toBe('');
  });

  it('should return an empty string for null and undefined', () => {
    expect(onlyDigits(null)).toBe('');
    expect(onlyDigits(undefined)).toBe('');
  });

  it('should accept numbers', () => {
    expect(onlyDigits(12345)).toBe('12345');
    expect(onlyDigits(0)).toBe('0');
  });

  it('should strip the sign and the decimal separator of a number', () => {
    expect(onlyDigits(-1.5)).toBe('15');
  });

  it('should keep a string already made of digits', () => {
    expect(onlyDigits('11987654321')).toBe('11987654321');
  });
});

describe('removeSpecialCharacters', () => {
  it('should remove diacritics', () => {
    expect(removeSpecialCharacters('ação')).toBe('acao');
    expect(removeSpecialCharacters('José Antônio')).toBe('Jose Antonio');
  });

  it('should remove special characters and keep whitespace', () => {
    expect(removeSpecialCharacters('Ação & Reação!')).toBe('Acao  Reacao');
    expect(removeSpecialCharacters('user@example.com')).toBe('userexamplecom');
  });

  it('should keep letters and digits', () => {
    expect(removeSpecialCharacters('abc123')).toBe('abc123');
  });

  it('should handle an empty string', () => {
    expect(removeSpecialCharacters('')).toBe('');
  });

  it('should return an empty string when everything is special', () => {
    expect(removeSpecialCharacters('!@#$%^&*()')).toBe('');
  });

  it('should not collapse nor trim whitespace', () => {
    expect(removeSpecialCharacters('  a  b  ')).toBe('  a  b  ');
  });

  it('should support the slug composition documented in the JSDoc', () => {
    const slug = removeSpecialCharacters('Relatório Final (2024)')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();

    expect(slug).toBe('relatorio-final-2024');
  });
});

describe('stringToArray', () => {
  it('should split on commas and trim the parts', () => {
    expect(stringToArray('a, b , c')).toEqual(['a', 'b', 'c']);
  });

  it('should drop empty parts', () => {
    expect(stringToArray('a,,b,')).toEqual(['a', 'b']);
    expect(stringToArray('a, ,b')).toEqual(['a', 'b']);
  });

  it('should return an empty array for empty and blank strings', () => {
    expect(stringToArray('')).toEqual([]);
    expect(stringToArray('   ')).toEqual([]);
    expect(stringToArray(',,,')).toEqual([]);
  });

  it('should return an empty array for null and undefined', () => {
    expect(stringToArray(null)).toEqual([]);
    expect(stringToArray(undefined)).toEqual([]);
  });

  it('should return a single item when there is no separator in the string', () => {
    expect(stringToArray('single')).toEqual(['single']);
  });

  it('should accept a custom string separator', () => {
    expect(stringToArray('a|b|c', '|')).toEqual(['a', 'b', 'c']);
    expect(stringToArray('a; b', ';')).toEqual(['a', 'b']);
  });

  it('should accept a regular expression separator', () => {
    expect(stringToArray('a1b2c', /\d/)).toEqual(['a', 'b', 'c']);
  });

  it('should always return a new array', () => {
    expect(stringToArray('a')).not.toBe(stringToArray('a'));
  });
});
