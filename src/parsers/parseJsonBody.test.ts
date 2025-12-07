import { parseJsonBody } from './parseJsonBody';

describe('parseJsonBody', () => {
  describe('successful parsing', () => {
    it('should parse a simple object', () => {
      const jsonString = '{"name": "John Doe", "age": 30}';
      interface User {
        name: string;
        age: number;
      }
      
      const result = parseJsonBody<User>(jsonString);
      
      expect(result).toEqual({ name: 'John Doe', age: 30 });
      expect(result.name).toBe('John Doe');
      expect(result.age).toBe(30);
    });

    it('should parse an array', () => {
      const arrayString = '[1, 2, 3, 4, 5]';
      
      const result = parseJsonBody<number[]>(arrayString);
      
      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
    });

    it('should parse nested objects', () => {
      const nestedJson = '{"user": {"name": "Jane", "address": {"city": "NYC"}}}';
      interface NestedData {
        user: {
          name: string;
          address: {
            city: string;
          };
        };
      }
      
      const result = parseJsonBody<NestedData>(nestedJson);
      
      expect(result.user.name).toBe('Jane');
      expect(result.user.address.city).toBe('NYC');
    });

    it('should parse boolean values', () => {
      const boolJson = '{"active": true, "deleted": false}';
      
      const result = parseJsonBody<{ active: boolean; deleted: boolean }>(boolJson);
      
      expect(result.active).toBe(true);
      expect(result.deleted).toBe(false);
    });

    it('should parse null values', () => {
      const nullJson = '{"value": null}';
      
      const result = parseJsonBody<{ value: null }>(nullJson);
      
      expect(result.value).toBeNull();
    });

    it('should parse numbers including floats', () => {
      const numberJson = '{"integer": 42, "float": 3.14, "negative": -10}';
      
      const result = parseJsonBody<{ integer: number; float: number; negative: number }>(numberJson);
      
      expect(result.integer).toBe(42);
      expect(result.float).toBe(3.14);
      expect(result.negative).toBe(-10);
    });

    it('should parse empty object', () => {
      const emptyJson = '{}';
      
      const result = parseJsonBody<object>(emptyJson);
      
      expect(result).toEqual({});
    });

    it('should parse empty array', () => {
      const emptyArrayJson = '[]';
      
      const result = parseJsonBody<any[]>(emptyArrayJson);
      
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid JSON', () => {
      const invalidJson = 'invalid json';
      
      expect(() => parseJsonBody<object>(invalidJson)).toThrow('Failed to parse JSON body');
    });

    it('should throw error for incomplete JSON object', () => {
      const incompleteJson = '{"name": "John"';
      
      expect(() => parseJsonBody<object>(incompleteJson)).toThrow('Failed to parse JSON body');
    });

    it('should throw error for incomplete JSON array', () => {
      const incompleteArray = '[1, 2, 3';
      
      expect(() => parseJsonBody<number[]>(incompleteArray)).toThrow('Failed to parse JSON body');
    });

    it('should throw error for malformed JSON with trailing comma', () => {
      const trailingComma = '{"name": "John",}';
      
      expect(() => parseJsonBody<object>(trailingComma)).toThrow('Failed to parse JSON body');
    });

    it('should throw error for single quotes instead of double quotes', () => {
      const singleQuotes = "{'name': 'John'}";
      
      expect(() => parseJsonBody<object>(singleQuotes)).toThrow('Failed to parse JSON body');
    });

    it('should throw error for empty string', () => {
      const emptyString = '';
      
      expect(() => parseJsonBody<object>(emptyString)).toThrow('Failed to parse JSON body');
    });

    it('should throw error with descriptive message', () => {
      const invalidJson = 'not json at all';
      
      expect(() => parseJsonBody<object>(invalidJson)).toThrow(/Failed to parse JSON body:/);
    });
  });

  describe('type handling', () => {
    it('should work with complex types', () => {
      interface ComplexType {
        id: string;
        metadata: {
          tags: string[];
          count: number;
        };
        active: boolean;
      }
      
      const complexJson = '{"id": "123", "metadata": {"tags": ["a", "b"], "count": 2}, "active": true}';
      
      const result = parseJsonBody<ComplexType>(complexJson);
      
      expect(result.id).toBe('123');
      expect(result.metadata.tags).toEqual(['a', 'b']);
      expect(result.metadata.count).toBe(2);
      expect(result.active).toBe(true);
    });

    it('should preserve string type', () => {
      const stringJson = '"just a string"';
      
      const result = parseJsonBody<string>(stringJson);
      
      expect(typeof result).toBe('string');
      expect(result).toBe('just a string');
    });

    it('should preserve number type', () => {
      const numberJson = '42';
      
      const result = parseJsonBody<number>(numberJson);
      
      expect(typeof result).toBe('number');
      expect(result).toBe(42);
    });
  });
});
