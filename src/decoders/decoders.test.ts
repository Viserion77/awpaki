import {
  trimmedString,
  trimmedLowerString,
  alphanumericId,
  parseIntOrNaN,
  positiveInteger,
  limitedInteger,
  urlEncodedJson,
  jsonString,
  emailString,
  validEmail,
  createEnum,
  stringArray,
  stringToBoolean,
  isoDateString,
  optionalTrimmedString,
  optionalInteger,
} from './decoders.js';

/**
 * Runs a decoder and records the outcome, so two decoders can be compared on both
 * the returned value and the thrown message.
 */
function capture(run: () => unknown): { value: unknown } | { error: string } {
  try {
    return { value: run() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

describe('decoders', () => {
  describe('trimmedString', () => {
    it('should trim and return valid string', () => {
      expect(trimmedString('  hello  ')).toBe('hello');
      expect(trimmedString('hello')).toBe('hello');
    });

    it('should throw error for empty string', () => {
      expect(() => trimmedString('')).toThrow('Value cannot be empty');
      expect(() => trimmedString('   ')).toThrow('Value cannot be empty');
    });

    it('should throw error for non-string', () => {
      expect(() => trimmedString(123)).toThrow('Value cannot be empty');
      expect(() => trimmedString(null)).toThrow('Value cannot be empty');
    });
  });

  describe('trimmedLowerString', () => {
    it('should trim and lowercase string', () => {
      expect(trimmedLowerString('  HELLO  ')).toBe('hello');
      expect(trimmedLowerString('Hello')).toBe('hello');
    });

    it('should throw error for empty string', () => {
      expect(() => trimmedLowerString('')).toThrow('Value cannot be empty');
    });
  });

  describe('alphanumericId', () => {
    it('should accept valid alphanumeric ID', () => {
      expect(alphanumericId('abc123-_')).toBe('abc123-_');
      expect(alphanumericId('TEST')).toBe('test');
      expect(alphanumericId('user-123')).toBe('user-123');
    });

    it('should throw error for invalid characters', () => {
      expect(() => alphanumericId('abc@123')).toThrow(
        'ID must contain only letters, numbers, hyphens, and underscores'
      );
      expect(() => alphanumericId('hello world')).toThrow();
    });
  });

  describe('parseIntOrNaN', () => {
    it('should parse numeric strings in base 10', () => {
      expect(parseIntOrNaN('123')).toBe(123);
      expect(parseIntOrNaN('-7')).toBe(-7);
      expect(parseIntOrNaN('0')).toBe(0);
      expect(parseIntOrNaN('  42  ')).toBe(42);
      expect(parseIntOrNaN('08')).toBe(8);
    });

    it('should stop at the first non numeric character, like parseInt', () => {
      expect(parseIntOrNaN('12px')).toBe(12);
      expect(parseIntOrNaN('3.9')).toBe(3);
    });

    it('should return numbers untouched, without truncating', () => {
      expect(parseIntOrNaN(456)).toBe(456);
      expect(parseIntOrNaN(1.5)).toBe(1.5);
      expect(parseIntOrNaN(-2.25)).toBe(-2.25);
      expect(parseIntOrNaN(Infinity)).toBe(Infinity);
    });

    it('should return NaN for non numeric strings', () => {
      expect(parseIntOrNaN('abc')).toBeNaN();
      expect(parseIntOrNaN('')).toBeNaN();
      expect(parseIntOrNaN('px12')).toBeNaN();
    });

    it('should return NaN for every other type', () => {
      expect(parseIntOrNaN(null)).toBeNaN();
      expect(parseIntOrNaN(undefined)).toBeNaN();
      expect(parseIntOrNaN(true)).toBeNaN();
      expect(parseIntOrNaN(false)).toBeNaN();
      expect(parseIntOrNaN({})).toBeNaN();
      expect(parseIntOrNaN([5])).toBeNaN();
      expect(parseIntOrNaN(10n)).toBeNaN();
      expect(parseIntOrNaN(NaN)).toBeNaN();
    });
  });

  describe('positiveInteger', () => {
    it('should convert string to positive integer', () => {
      expect(positiveInteger('123')).toBe(123);
      expect(positiveInteger(456)).toBe(456);
      expect(positiveInteger('1')).toBe(1);
    });

    it('should throw error for non-positive numbers', () => {
      expect(() => positiveInteger('0')).toThrow('Must be a positive number');
      expect(() => positiveInteger('-1')).toThrow('Must be a positive number');
      expect(() => positiveInteger(0)).toThrow('Must be a positive number');
    });

    it('should throw error for invalid input', () => {
      expect(() => positiveInteger('abc')).toThrow('Must be a positive number');
    });

    // Behaviour locked before the parseIntOrNaN extraction: it must stay identical.
    it('should throw error for non string, non number input', () => {
      expect(() => positiveInteger(true)).toThrow('Must be a positive number');
      expect(() => positiveInteger(null)).toThrow('Must be a positive number');
      expect(() => positiveInteger(undefined)).toThrow('Must be a positive number');
      expect(() => positiveInteger({})).toThrow('Must be a positive number');
      expect(() => positiveInteger(['1'])).toThrow('Must be a positive number');
      expect(() => positiveInteger(NaN)).toThrow('Must be a positive number');
    });

    it('should keep the historical parseInt tolerance', () => {
      expect(positiveInteger('12px')).toBe(12);
      expect(positiveInteger('3.9')).toBe(3);
    });

    it('should truncate a numeric input, so both encodings of a value agree', () => {
      expect(positiveInteger(1.5)).toBe(1);
      expect(positiveInteger(3.9)).toBe(positiveInteger('3.9'));
    });

    it('should reject a non-finite number instead of handing Infinity through', () => {
      expect(() => positiveInteger(Infinity)).toThrow('Must be a positive number');
      expect(() => positiveInteger(-Infinity)).toThrow('Must be a positive number');
    });
  });

  describe('limitedInteger', () => {
    it('should accept number within range', () => {
      const decoder = limitedInteger(1, 10);
      expect(decoder('5')).toBe(5);
      expect(decoder(7)).toBe(7);
      expect(decoder('1')).toBe(1);
      expect(decoder('10')).toBe(10);
    });

    it('should throw error for number outside range', () => {
      const decoder = limitedInteger(1, 10);
      expect(() => decoder('0')).toThrow('Must be a number between 1 and 10');
      expect(() => decoder('11')).toThrow('Must be a number between 1 and 10');
    });

    it('should use custom range', () => {
      const decoder = limitedInteger(10, 100);
      expect(decoder('50')).toBe(50);
      expect(() => decoder('9')).toThrow('Must be a number between 10 and 100');
    });

    it('should use default range', () => {
      const decoder = limitedInteger();
      expect(decoder('500')).toBe(500);
      expect(() => decoder('0')).toThrow('Must be a number between 1 and 1000');
      expect(() => decoder('1001')).toThrow('Must be a number between 1 and 1000');
    });

    // Behaviour locked before the parseIntOrNaN extraction: it must stay identical.
    it('should throw error for non string, non number input', () => {
      const decoder = limitedInteger(1, 10);
      expect(() => decoder(true)).toThrow('Must be a number between 1 and 10');
      expect(() => decoder(null)).toThrow('Must be a number between 1 and 10');
      expect(() => decoder(undefined)).toThrow('Must be a number between 1 and 10');
      expect(() => decoder({})).toThrow('Must be a number between 1 and 10');
      expect(() => decoder(['5'])).toThrow('Must be a number between 1 and 10');
      expect(() => decoder(NaN)).toThrow('Must be a number between 1 and 10');
      expect(() => decoder('abc')).toThrow('Must be a number between 1 and 10');
    });

    it('should keep the historical parseInt tolerance', () => {
      const decoder = limitedInteger(1, 10);
      expect(decoder('7items')).toBe(7);
    });

    it('should truncate before the range test, so the boundary stays reachable', () => {
      expect(limitedInteger(1, 10)(2.5)).toBe(2);
      expect(limitedInteger(1, 100)(100.9)).toBe(100);
    });

    it('should reject a non-finite number', () => {
      const decoder = limitedInteger(1, 10);
      expect(() => decoder(Infinity)).toThrow('Must be a number between 1 and 10');
    });

    it('should accept zero when the range allows it, unlike optionalInteger', () => {
      const decoder = limitedInteger(0, 10);
      expect(decoder(0)).toBe(0);
      expect(decoder('0')).toBe(0);
    });
  });

  describe('urlEncodedJson', () => {
    it('should decode URL encoded JSON', () => {
      const encoded = encodeURIComponent('{"key":"value"}');
      expect(urlEncodedJson(encoded)).toEqual({ key: 'value' });
    });

    it('should decode complex objects', () => {
      const obj = { name: 'John', age: 30, active: true };
      const encoded = encodeURIComponent(JSON.stringify(obj));
      expect(urlEncodedJson(encoded)).toEqual(obj);
    });

    it('should return null for empty value', () => {
      expect(urlEncodedJson('')).toBeNull();
      expect(urlEncodedJson(null)).toBeNull();
    });

    it('should throw error for invalid JSON', () => {
      expect(() => urlEncodedJson('invalid')).toThrow('Must be a valid URL-encoded JSON');
    });
  });

  describe('jsonString', () => {
    it('should parse valid JSON string', () => {
      expect(jsonString('{"key":"value"}')).toEqual({ key: 'value' });
      expect(jsonString('["a","b","c"]')).toEqual(['a', 'b', 'c']);
    });

    it('should return null for empty value', () => {
      expect(jsonString('')).toBeNull();
      expect(jsonString(null)).toBeNull();
    });

    it('should throw error for invalid JSON', () => {
      expect(() => jsonString('invalid')).toThrow('Must be a valid JSON string');
      expect(() => jsonString('{invalid}')).toThrow('Must be a valid JSON string');
    });
  });

  describe('emailString', () => {
    it('should accept valid email', () => {
      expect(emailString('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(emailString('user@domain.com')).toBe('user@domain.com');
      expect(emailString('first.last@company.co.uk')).toBe('first.last@company.co.uk');
    });

    it('should accept the RFC shapes the old regex rejected', () => {
      expect(emailString('user.name+tag@example.com')).toBe('user.name+tag@example.com');
      expect(emailString('"john doe"@example.com')).toBe('"john doe"@example.com');
      expect(emailString('user@[192.168.0.1]')).toBe('user@[192.168.0.1]');
    });

    it('should throw error for invalid email', () => {
      expect(() => emailString('not-an-email')).toThrow('Email must have a valid format');
      expect(() => emailString('missing@domain')).toThrow('Email must have a valid format');
      expect(() => emailString('@domain.com')).toThrow('Email must have a valid format');
    });

    // Stricter than the old /^[^\s@]+@[^\s@]+\.[^\s@]+$/: these used to be accepted.
    it('should now reject addresses the weak regex used to accept', () => {
      expect(() => emailString('a@b.c')).toThrow('Email must have a valid format');
      expect(() => emailString('user@example.i')).toThrow('Email must have a valid format');
      expect(() => emailString('user@example.c0m')).toThrow('Email must have a valid format');
      expect(() => emailString('user@-example.com')).toThrow('Email must have a valid format');
      expect(() => emailString('user@example-.com')).toThrow('Email must have a valid format');
      expect(() => emailString('user..name@example.com')).toThrow('Email must have a valid format');
      expect(() => emailString('.user@example.com')).toThrow('Email must have a valid format');
      expect(() => emailString('user.@example.com')).toThrow('Email must have a valid format');
      expect(() => emailString('user@example..com')).toThrow('Email must have a valid format');
    });

    it('should reject addresses beyond the RFC length limits', () => {
      const longLocal = `${'a'.repeat(65)}@example.com`;
      expect(() => emailString(longLocal)).toThrow('Email must have a valid format');

      // Every label is legal on its own; only the total length is over 254.
      const label = 'b'.repeat(60);
      const longAddress = `${'a'.repeat(64)}@${label}.${label}.${label}.${label}.com`;
      expect(longAddress.length).toBeGreaterThan(254);
      expect(() => emailString(longAddress)).toThrow('Email must have a valid format');
      expect(emailString(`a@${label}.${label}.${label}.${label}.com`)).toContain('@');
    });

    it('should reject untrimmed values, it never trims', () => {
      expect(() => emailString(' user@example.com')).toThrow('Email must have a valid format');
      expect(() => emailString('user@example.com ')).toThrow('Email must have a valid format');
    });

    it('should throw error for non-string input', () => {
      expect(() => emailString(null)).toThrow('Email must have a valid format');
      expect(() => emailString(undefined)).toThrow('Email must have a valid format');
      expect(() => emailString(123)).toThrow('Email must have a valid format');
      expect(() => emailString({})).toThrow('Email must have a valid format');
      expect(() => emailString(['user@example.com'])).toThrow('Email must have a valid format');
    });
  });

  describe('validEmail (deprecated alias)', () => {
    it('should still be exported and keep the documented behaviour', () => {
      expect(validEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(validEmail('user@domain.com')).toBe('user@domain.com');
      expect(validEmail('first.last@company.co.uk')).toBe('first.last@company.co.uk');
    });

    it('should throw error for invalid email', () => {
      expect(() => validEmail('not-an-email')).toThrow('Email must have a valid format');
      expect(() => validEmail('missing@domain')).toThrow('Email must have a valid format');
      expect(() => validEmail('@domain.com')).toThrow('Email must have a valid format');
    });

    it('should be strict like emailString, so a@b.c now throws', () => {
      expect(() => validEmail('a@b.c')).toThrow('Email must have a valid format');
    });

    it('should behave exactly like emailString for every sample', () => {
      const samples: unknown[] = [
        'TEST@EXAMPLE.COM',
        'user.name+tag@example.com',
        '"john doe"@example.com',
        'user@[192.168.0.1]',
        'a@b.c',
        'not-an-email',
        ' user@example.com',
        null,
        123,
      ];

      samples.forEach((sample) => {
        const alias = capture(() => validEmail(sample));
        const canonical = capture(() => emailString(sample));
        expect(alias).toEqual(canonical);
      });
    });
  });

  describe('createEnum', () => {
    it('should validate against enum values', () => {
      const statusDecoder = createEnum(['active', 'inactive', 'pending']);
      expect(statusDecoder('active')).toBe('active');
      expect(statusDecoder('INACTIVE')).toBe('inactive');
    });

    it('should throw error for invalid enum value', () => {
      const statusDecoder = createEnum(['active', 'inactive']);
      expect(() => statusDecoder('deleted')).toThrow('Must be one of: active, inactive');
    });

    it('should accept an allow list that is not already lower-cased', () => {
      const statusDecoder = createEnum(['ACTIVE', 'Inactive']);
      expect(statusDecoder('ACTIVE')).toBe('active');
      expect(statusDecoder('inactive')).toBe('inactive');
    });

    it('should list the values as declared, not as normalized', () => {
      const statusDecoder = createEnum(['ACTIVE', 'Inactive']);
      expect(() => statusDecoder('deleted')).toThrow('Must be one of: ACTIVE, Inactive');
    });
  });

  describe('stringArray', () => {
    it('should filter valid strings', () => {
      expect(stringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
      expect(stringArray(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
    });

    it('should return empty array for non-array', () => {
      expect(stringArray('not-array')).toEqual([]);
      expect(stringArray(null)).toEqual([]);
      expect(stringArray(123)).toEqual([]);
    });

    it('should filter non-string items', () => {
      expect(stringArray(['a', 123, 'b', null, 'c'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('stringToBoolean', () => {
    it('should convert true values', () => {
      expect(stringToBoolean('true')).toBe(true);
      expect(stringToBoolean('TRUE')).toBe(true);
      expect(stringToBoolean('1')).toBe(true);
      expect(stringToBoolean('yes')).toBe(true);
      expect(stringToBoolean('on')).toBe(true);
      expect(stringToBoolean(true)).toBe(true);
    });

    it('should convert false values', () => {
      expect(stringToBoolean('false')).toBe(false);
      expect(stringToBoolean('FALSE')).toBe(false);
      expect(stringToBoolean('0')).toBe(false);
      expect(stringToBoolean('no')).toBe(false);
      expect(stringToBoolean('off')).toBe(false);
      expect(stringToBoolean(false)).toBe(false);
    });

    it('should throw error for invalid boolean', () => {
      expect(() => stringToBoolean('maybe')).toThrow(
        'Must be a valid boolean value (true/false, 1/0, yes/no, on/off)'
      );
      expect(() => stringToBoolean('invalid')).toThrow();
    });
  });

  describe('isoDateString', () => {
    it('should validate and normalize ISO date', () => {
      const result = isoDateString('2023-01-01T10:00:00Z');
      expect(result).toBe('2023-01-01T10:00:00.000Z');
    });

    it('should accept various date formats', () => {
      expect(isoDateString('2023-01-01')).toContain('2023-01-01');
      expect(isoDateString('2023-01-01T10:00:00')).toContain('2023-01-01');
    });

    it('should throw error for invalid date', () => {
      expect(() => isoDateString('not-a-date')).toThrow('Date must be in valid ISO format');
      expect(() => isoDateString('2023-13-45')).toThrow('Date must be in valid ISO format');
    });

    it('should throw error for non-string', () => {
      expect(() => isoDateString(123)).toThrow('Date must be a string');
    });
  });

  describe('optionalTrimmedString', () => {
    it('should trim valid strings', () => {
      const decoder = optionalTrimmedString();
      expect(decoder('  hello  ')).toBe('hello');
    });

    it('should return default for non-string', () => {
      const decoder = optionalTrimmedString('default');
      expect(decoder(null)).toBe('default');
      expect(decoder(undefined)).toBe('default');
      expect(decoder(123)).toBe('default');
    });

    it('should use empty string as default', () => {
      const decoder = optionalTrimmedString();
      expect(decoder(null)).toBe('');
    });
  });

  describe('optionalInteger', () => {
    it('should parse valid integers', () => {
      const decoder = optionalInteger();
      expect(decoder('123')).toBe(123);
      expect(decoder(456)).toBe(456);
    });

    it('should return default for invalid input', () => {
      const decoder = optionalInteger(10);
      expect(decoder('invalid')).toBe(10);
      expect(decoder(null)).toBe(10);
      expect(decoder('')).toBe(10);
    });

    it('should use zero as default', () => {
      const decoder = optionalInteger();
      expect(decoder('invalid')).toBe(0);
    });

    // Behaviour locked before the parseIntOrNaN extraction: the falsy early-return runs
    // BEFORE the coercion, so 0, '0'-like falsy values and '' differ from the other two
    // numeric decoders. Do not uniformise.
    it('should return the default for falsy input, including 0 and false', () => {
      const decoder = optionalInteger(10);
      expect(decoder(0)).toBe(10);
      expect(decoder('')).toBe(10);
      expect(decoder(false)).toBe(10);
      expect(decoder(NaN)).toBe(10);
      expect(decoder(undefined)).toBe(10);
      expect(decoder(null)).toBe(10);
    });

    it('should still parse the truthy string "0"', () => {
      const decoder = optionalInteger(10);
      expect(decoder('0')).toBe(0);
    });

    it('should return the default for truthy non numeric input', () => {
      const decoder = optionalInteger(10);
      expect(decoder(true)).toBe(10);
      expect(decoder({})).toBe(10);
      expect(decoder([])).toBe(10);
      expect(decoder(['5'])).toBe(10);
    });

    it('should keep the historical parseInt tolerance', () => {
      const decoder = optionalInteger(10);
      expect(decoder('12px')).toBe(12);
      expect(decoder(-3)).toBe(-3);
    });

    it('should truncate a numeric input, like the other integer decoders', () => {
      const decoder = optionalInteger(10);
      expect(decoder(1.5)).toBe(1);
      expect(decoder(-3.9)).toBe(-3);
    });
  });
});
