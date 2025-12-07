import { APIGatewayProxyEvent } from 'aws-lambda';
import { extractEventParams, EventSchema } from './extractEventParams';
import { Unauthorized, UnprocessableEntity } from '../errors';

const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/test',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: 'test',
    apiId: 'test',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path: '/test',
    stage: 'test',
    requestId: 'test',
    requestTimeEpoch: 0,
    requestTime: '',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '',
      user: null,
      userAgent: null,
      userArn: null,
    },
    resourceId: '',
    resourcePath: '',
  },
  resource: '',
  ...overrides,
});

describe('extractEventParams', () => {
  describe('pathParameters extraction', () => {
    it('should extract required path parameters', () => {
      const schema: EventSchema = {
        pathParameters: {
          id: {
            label: 'User ID',
            required: true,
            expectedType: 'string',
          },
        },
      };

      const event = createMockEvent({
        pathParameters: { id: '123' },
      });

      const result = extractEventParams<{ id: string }>(schema, event);
      expect(result.id).toBe('123');
    });

    it('should throw UnprocessableEntity when required parameter is missing', () => {
      const schema: EventSchema = {
        pathParameters: {
          id: {
            label: 'User ID',
            required: true,
            notFoundError: 'ID is required',
          },
        },
      };

      const event = createMockEvent();

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(UnprocessableEntity);
      
      try {
        extractEventParams(schema, event);
      } catch (error) {
        if (error instanceof UnprocessableEntity) {
          expect(error.errors).toEqual({ 'pathParameters.id': 'ID is required' });
        }
      }
    });

    it('should use default value when parameter is missing', () => {
      const schema: EventSchema = {
        pathParameters: {
          version: {
            label: 'Version',
            default: 'v1',
          },
        },
      };

      const event = createMockEvent();

      const result = extractEventParams<{ version: string }>(schema, event);
      expect(result.version).toBe('v1');
    });

    it('should accept optional parameter without value', () => {
      const schema: EventSchema = {
        pathParameters: {
          id: {
            label: 'ID',
            required: false,
            expectedType: 'string',
          },
        },
      };

      const event = createMockEvent();

      const result = extractEventParams<{ id?: string }>(schema, event);
      expect(result.id).toBeUndefined();
    });
  });

  describe('body extraction', () => {
    it('should parse and extract from JSON body', () => {
      const schema: EventSchema = {
        body: {
          email: {
            label: 'Email',
            required: true,
            expectedType: 'string',
          },
          age: {
            label: 'Age',
            expectedType: 'number',
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({ email: 'test@example.com', age: 25 }),
      });

      const result = extractEventParams<{ email: string; age: number }>(schema, event);
      expect(result.email).toBe('test@example.com');
      expect(result.age).toBe(25);
    });

    it('should throw UnprocessableEntity for invalid JSON body', () => {
      const schema: EventSchema = {
        body: {
          email: {
            label: 'Email',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        body: 'invalid json',
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(UnprocessableEntity);
    });
  });

  describe('queryStringParameters extraction', () => {
    it('should extract query string parameters', () => {
      const schema: EventSchema = {
        queryStringParameters: {
          page: {
            label: 'Page',
            expectedType: 'string',
            default: '1',
          },
          limit: {
            label: 'Limit',
            expectedType: 'string',
          },
        },
      };

      const event = createMockEvent({
        queryStringParameters: { limit: '10' },
      });

      const result = extractEventParams<{ page: string; limit: string }>(schema, event);
      expect(result.page).toBe('1');
      expect(result.limit).toBe('10');
    });
  });

  describe('headers extraction', () => {
    it('should extract headers', () => {
      const schema: EventSchema = {
        headers: {
          'content-type': {
            label: 'Content-Type',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        headers: { 'content-type': 'application/json' },
      });

      const result = extractEventParams<{ 'content-type': string }>(schema, event);
      expect(result['content-type']).toBe('application/json');
    });

    it('should support case-insensitive header matching', () => {
      const schema: EventSchema = {
        headers: {
          authorization: {
            label: 'Authorization',
            required: true,
            caseInsensitive: true,
          },
        },
      };

      const event = createMockEvent({
        headers: { Authorization: 'Bearer token123' },
      });

      const result = extractEventParams<{ authorization: string }>(schema, event);
      expect(result.authorization).toBe('Bearer token123');
    });

    it('should throw Unauthorized for missing auth header with 401 status', () => {
      const schema: EventSchema = {
        headers: {
          authorization: {
            label: 'Authorization',
            required: true,
            statusCodeError: 401,
            notFoundError: 'Authorization required',
          },
        },
      };

      const event = createMockEvent();

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(Unauthorized);
    });
  });

  describe('type validation', () => {
    it('should validate string type', () => {
      const schema: EventSchema = {
        pathParameters: {
          id: {
            label: 'ID',
            expectedType: 'string',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        pathParameters: { id: '123' },
      });

      const result = extractEventParams(schema, event);
      expect(typeof result.id).toBe('string');
    });

    it('should validate number type', () => {
      const schema: EventSchema = {
        body: {
          age: {
            label: 'Age',
            expectedType: 'number',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({ age: 25 }),
      });

      const result = extractEventParams(schema, event);
      expect(typeof result.age).toBe('number');
    });

    it('should validate array type', () => {
      const schema: EventSchema = {
        body: {
          tags: {
            label: 'Tags',
            expectedType: 'array',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({ tags: ['tag1', 'tag2'] }),
      });

      const result = extractEventParams(schema, event);
      expect(Array.isArray(result.tags)).toBe(true);
    });

    it('should throw UnprocessableEntity for wrong type', () => {
      const schema: EventSchema = {
        body: {
          age: {
            label: 'Age',
            expectedType: 'number',
            required: true,
            wrongTypeMessage: 'Age must be a number',
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({ age: 'not a number' }),
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow('Age must be a number');
    });
  });

  describe('custom decoder', () => {
    it('should apply decoder function', () => {
      const schema: EventSchema = {
        queryStringParameters: {
          date: {
            label: 'Date',
            required: true,
            decoder: (value) => new Date(value as string),
          },
        },
      };

      const event = createMockEvent({
        queryStringParameters: { date: '2025-12-07' },
      });

      const result = extractEventParams<{ date: Date }>(schema, event);
      expect(result.date).toBeInstanceOf(Date);
      expect(result.date.getFullYear()).toBe(2025);
    });

    it('should throw UnprocessableEntity when decoder fails', () => {
      const schema: EventSchema = {
        queryStringParameters: {
          number: {
            label: 'Number',
            required: true,
            decoder: (value) => {
              const num = parseInt(value as string, 10);
              if (isNaN(num)) throw new Error('Invalid number');
              return num;
            },
          },
        },
      };

      const event = createMockEvent({
        queryStringParameters: { number: 'invalid' },
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(UnprocessableEntity);
    });
  });

  describe('multiple errors', () => {
    it('should collect multiple validation errors', () => {
      const schema: EventSchema = {
        body: {
          email: {
            label: 'Email',
            required: true,
            notFoundError: 'Email is required',
          },
          age: {
            label: 'Age',
            required: true,
            notFoundError: 'Age is required',
          },
          name: {
            label: 'Name',
            required: true,
            notFoundError: 'Name is required',
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({}),
      });

      try {
        extractEventParams(schema, event);
      } catch (error) {
        if (error instanceof UnprocessableEntity) {
          expect(error.errors).toEqual({
            'body.email': 'Email is required',
            'body.age': 'Age is required',
            'body.name': 'Name is required',
          });
        }
      }
    });
  });

  describe('nested schema', () => {
    it('should handle nested schema objects', () => {
      const schema: EventSchema = {
        body: {
          user: {
            email: {
              label: 'Email',
              required: true,
              expectedType: 'string',
            },
            age: {
              label: 'Age',
              expectedType: 'number',
            },
          },
        },
      };

      const event = createMockEvent({
        body: JSON.stringify({ user: { email: 'test@example.com', age: 25 } }),
      });

      const result = extractEventParams<{ email: string; age: number }>(schema, event);
      expect(result.email).toBe('test@example.com');
      expect(result.age).toBe(25);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed parameter sources', () => {
      const schema: EventSchema = {
        pathParameters: {
          id: {
            label: 'User ID',
            required: true,
          },
        },
        queryStringParameters: {
          include: {
            label: 'Include',
            default: 'all',
          },
        },
        body: {
          name: {
            label: 'Name',
            required: true,
          },
        },
      };

      const event = createMockEvent({
        pathParameters: { id: '123' },
        queryStringParameters: { include: 'posts' },
        body: JSON.stringify({ name: 'John' }),
      });

      const result = extractEventParams<{
        id: string;
        include: string;
        name: string;
      }>(schema, event);

      expect(result.id).toBe('123');
      expect(result.include).toBe('posts');
      expect(result.name).toBe('John');
    });
  });
});
