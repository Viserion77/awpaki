/**
 * Common decoder functions for parameter validation and transformation
 * 
 * Decoders are used with extractEventParams to validate and transform parameter values.
 * They throw errors when validation fails, which are automatically collected and returned
 * as structured error responses.
 * 
 * @module decoders
 */

/**
 * Removes whitespace and validates non-empty string
 * 
 * @param value - Input value to validate
 * @returns Trimmed string
 * @throws Error if empty or not a string
 * 
 * @example
 * ```typescript
 * const schema = {
 *   body: {
 *     name: {
 *       label: 'Name',
 *       required: true,
 *       decoder: trimmedString
 *     }
 *   }
 * };
 * // Input: "  hello  " → Output: "hello"
 * ```
 */
export function trimmedString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Value cannot be empty');
  }
  return value.trim();
}

/**
 * Trims and converts string to lowercase
 * 
 * @param value - Input value to validate
 * @returns Trimmed and lowercased string
 * @throws Error if empty or not a string
 * 
 * @example
 * ```typescript
 * decoder: trimmedLowerString
 * // Input: "  HELLO  " → Output: "hello"
 * ```
 */
export function trimmedLowerString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Value cannot be empty');
  }
  return value.trim().toLowerCase();
}

/**
 * Validates alphanumeric ID with hyphens and underscores
 * Converts to lowercase
 * 
 * @param value - Input value to validate
 * @returns Lowercased alphanumeric ID
 * @throws Error if contains invalid characters
 * 
 * @example
 * ```typescript
 * decoder: alphanumericId
 * // Input: "ABC-123_test" → Output: "abc-123_test"
 * // Invalid: "abc@123" → throws error
 * ```
 */
export function alphanumericId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(value)) {
    throw new Error('ID must contain only letters, numbers, hyphens, and underscores');
  }
  return value.toLowerCase();
}

/**
 * Converts value to positive integer (>= 1)
 * 
 * @param value - Input value (string or number)
 * @returns Positive integer
 * @throws Error if not a positive number
 * 
 * @example
 * ```typescript
 * decoder: positiveInteger
 * // Input: "123" → Output: 123
 * // Input: 456 → Output: 456
 * // Invalid: "0" → throws error
 * // Invalid: "-1" → throws error
 * ```
 */
export function positiveInteger(value: unknown): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (typeof num !== 'number' || isNaN(num) || num < 1) {
    throw new Error('Must be a positive number');
  }
  return num;
}

/**
 * Creates an integer validator within a specified range
 * 
 * @param min - Minimum value (inclusive, default: 1)
 * @param max - Maximum value (inclusive, default: 1000)
 * @returns Decoder function that validates the range
 * 
 * @example
 * ```typescript
 * const schema = {
 *   queryStringParameters: {
 *     limit: {
 *       label: 'Page Limit',
 *       decoder: limitedInteger(1, 100)
 *     }
 *   }
 * };
 * // Input: "50" → Output: 50
 * // Invalid: "101" → throws error
 * ```
 */
export function limitedInteger(min = 1, max = 1000): (value: unknown) => number {
  return function validateLimitedInteger(value: unknown): number {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (typeof num !== 'number' || isNaN(num) || num < min || num > max) {
      throw new Error(`Must be a number between ${min} and ${max}`);
    }
    return num;
  };
}

/**
 * Decodes URL-encoded JSON string
 * 
 * @param value - URL-encoded JSON string
 * @returns Parsed object or null if empty
 * @throws Error if invalid JSON
 * 
 * @example
 * ```typescript
 * decoder: urlEncodedJson
 * // Input: "%7B%22key%22%3A%22value%22%7D" → Output: {key: "value"}
 * ```
 */
export function urlEncodedJson(value: unknown): unknown {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    throw new Error('Must be a valid URL-encoded JSON');
  }
}

/**
 * Parses JSON string
 * 
 * @param value - JSON string
 * @returns Parsed object or null if empty
 * @throws Error if invalid JSON
 * 
 * @example
 * ```typescript
 * decoder: jsonString
 * // Input: '{"key":"value"}' → Output: {key: "value"}
 * ```
 */
export function jsonString(value: unknown): unknown {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Must be a valid JSON string');
  }
}

/**
 * Validates and normalizes email address
 * Converts to lowercase
 * 
 * @param value - Email address to validate
 * @returns Lowercased email address
 * @throws Error if invalid email format
 * 
 * @example
 * ```typescript
 * decoder: validEmail
 * // Input: "USER@EXAMPLE.COM" → Output: "user@example.com"
 * // Invalid: "not-an-email" → throws error
 * ```
 */
export function validEmail(value: unknown): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof value !== 'string' || !emailRegex.test(value)) {
    throw new Error('Email must have a valid format');
  }
  return value.toLowerCase();
}

/**
 * Creates a custom enum validator
 * 
 * @param validValues - Array of valid enum values (case-insensitive)
 * @returns Decoder function that validates against the enum
 * 
 * @example
 * ```typescript
 * const schema = {
 *   queryStringParameters: {
 *     status: {
 *       label: 'Status',
 *       decoder: createEnum(['active', 'inactive', 'pending'])
 *     }
 *   }
 * };
 * // Input: "ACTIVE" → Output: "active"
 * // Invalid: "deleted" → throws error
 * ```
 */
export function createEnum(validValues: string[]): (value: unknown) => string {
  return function validateEnum(value: unknown): string {
    if (typeof value !== 'string' || !validValues.includes(value.toLowerCase())) {
      throw new Error(`Must be one of: ${validValues.join(', ')}`);
    }
    return value.toLowerCase();
  };
}

/**
 * Filters array to valid non-empty strings
 * Removes empty strings and whitespace-only strings
 * 
 * @param value - Array to filter
 * @returns Filtered array of non-empty strings, or empty array if input is not an array
 * 
 * @example
 * ```typescript
 * decoder: stringArray
 * // Input: ["a", "", "  ", "b"] → Output: ["a", "b"]
 * // Input: "not-array" → Output: []
 * ```
 */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Converts various formats to boolean
 * 
 * @param value - Value to convert
 * @returns Boolean value
 * @throws Error if not a valid boolean format
 * 
 * @example
 * ```typescript
 * decoder: stringToBoolean
 * // Input: "true" | "1" | "yes" | "on" → Output: true
 * // Input: "false" | "0" | "no" | "off" → Output: false
 * // Invalid: "maybe" → throws error
 * ```
 */
export function stringToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lower)) return true;
    if (['false', '0', 'no', 'off'].includes(lower)) return false;
  }
  throw new Error('Must be a valid boolean value (true/false, 1/0, yes/no, on/off)');
}

/**
 * Validates and normalizes ISO date string
 * 
 * @param value - Date string to validate
 * @returns ISO 8601 formatted date string
 * @throws Error if invalid date format
 * 
 * @example
 * ```typescript
 * decoder: isoDateString
 * // Input: "2023-01-01T10:00:00Z" → Output: "2023-01-01T10:00:00.000Z"
 * // Invalid: "not-a-date" → throws error
 * ```
 */
export function isoDateString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Date must be a string');
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Date must be in valid ISO format');
  }
  return date.toISOString();
}

/**
 * Creates an optional trimmed string decoder with default value
 * 
 * @param defaultValue - Default value if input is not a string (default: '')
 * @returns Decoder function that trims strings or returns default
 * 
 * @example
 * ```typescript
 * const schema = {
 *   queryStringParameters: {
 *     search: {
 *       label: 'Search',
 *       decoder: optionalTrimmedString('')
 *     }
 *   }
 * };
 * // Input: "  hello  " → Output: "hello"
 * // Input: null → Output: ""
 * ```
 */
export function optionalTrimmedString(defaultValue = ''): (value: unknown) => string {
  return function decodeOptionalString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : defaultValue;
  };
}

/**
 * Creates an optional integer decoder with default value
 * 
 * @param defaultValue - Default value if parsing fails (default: 0)
 * @returns Decoder function that parses integers or returns default
 * 
 * @example
 * ```typescript
 * const schema = {
 *   queryStringParameters: {
 *     page: {
 *       label: 'Page',
 *       decoder: optionalInteger(1)
 *     }
 *   }
 * };
 * // Input: "123" → Output: 123
 * // Input: "invalid" → Output: 1
 * ```
 */
export function optionalInteger(defaultValue = 0): (value: unknown) => number {
  return function decodeOptionalInteger(value: unknown): number {
    if (!value) return defaultValue;
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    return typeof num === 'number' && !isNaN(num) ? num : defaultValue;
  };
}
