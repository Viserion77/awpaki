import {
  trimmedString,
  trimmedLowerString,
  alphanumericId,
  positiveInteger,
  limitedInteger,
  urlEncodedJson,
  jsonString,
  validEmail,
  createEnum,
  stringArray,
  stringToBoolean,
  isoDateString,
  optionalTrimmedString,
  optionalInteger,
} from './decoders';

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

  describe('validEmail', () => {
    it('should accept valid email', () => {
      expect(validEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(validEmail('user@domain.com')).toBe('user@domain.com');
      expect(validEmail('first.last@company.co.uk')).toBe('first.last@company.co.uk');
    });

    it('should throw error for invalid email', () => {
      expect(() => validEmail('not-an-email')).toThrow('Email must have a valid format');
      expect(() => validEmail('missing@domain')).toThrow('Email must have a valid format');
      expect(() => validEmail('@domain.com')).toThrow('Email must have a valid format');
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
  });
});
