import { APIGatewayProxyEvent, AppSyncResolverEvent } from 'aws-lambda';
import { extractEventParams, EventSchema, ParameterType } from './extractEventParams';
import { Unauthorized, UnprocessableEntity, BadRequest, HttpStatus } from '../errors';

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
            expectedType: ParameterType.STRING,
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
          expect(error.data?.errors).toEqual({ 'pathParameters.id': [HttpStatus.UNPROCESSABLE_ENTITY, 'ID is required'] });
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
            expectedType: ParameterType.STRING,
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
            expectedType: ParameterType.STRING,
          },
          age: {
            label: 'Age',
            expectedType: ParameterType.NUMBER,
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

    it('should throw BadRequest for invalid JSON body', () => {
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
      }).toThrow(BadRequest);
    });
  });

  describe('queryStringParameters extraction', () => {
    it('should extract query string parameters', () => {
      const schema: EventSchema = {
        queryStringParameters: {
          page: {
            label: 'Page',
            expectedType: ParameterType.STRING,
            default: '1',
          },
          limit: {
            label: 'Limit',
            expectedType: ParameterType.STRING,
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
            statusCodeError: HttpStatus.UNAUTHORIZED,
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
            expectedType: ParameterType.STRING,
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
            expectedType: ParameterType.NUMBER,
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
            expectedType: ParameterType.ARRAY,
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
            expectedType: ParameterType.NUMBER,
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
          expect(error.data?.errors).toEqual({
            'body.email': [HttpStatus.UNPROCESSABLE_ENTITY, 'Email is required'],
            'body.age': [HttpStatus.UNPROCESSABLE_ENTITY, 'Age is required'],
            'body.name': [HttpStatus.UNPROCESSABLE_ENTITY, 'Name is required'],
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
              expectedType: ParameterType.STRING,
            },
            age: {
              label: 'Age',
              expectedType: ParameterType.NUMBER,
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

  describe('AppSync event extraction', () => {
    const createMockAppSyncEvent = <TArgs = Record<string, any>>(
      overrides: Partial<AppSyncResolverEvent<TArgs>> = {}
    ): AppSyncResolverEvent<TArgs> => ({
      arguments: {} as TArgs,
      identity: null,
      source: null,
      request: {
        headers: {},
        domainName: null,
      },
      info: {
        fieldName: 'getUser',
        parentTypeName: 'Query',
        selectionSetList: [],
        selectionSetGraphQL: '',
        variables: {},
      },
      prev: null,
      stash: {},
      ...overrides,
    });

    it('should extract arguments from AppSync event', () => {
      const schema: EventSchema = {
        arguments: {
          id: {
            label: 'User ID',
            required: true,
            expectedType: ParameterType.STRING,
          },
        },
      };

      const event = createMockAppSyncEvent({
        arguments: { id: 'user-123' },
      });

      const result = extractEventParams<{ id: string }>(schema, event);
      expect(result.id).toBe('user-123');
    });

    it('should extract identity.sub from AppSync event', () => {
      const schema: EventSchema = {
        identity: {
          sub: {
            label: 'User Sub',
            required: true,
            expectedType: ParameterType.STRING,
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: {
          sub: 'cognito-user-123',
          issuer: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
          username: 'testuser',
          claims: {},
          sourceIp: ['127.0.0.1'],
          defaultAuthStrategy: 'ALLOW',
        } as any,
      });

      const result = extractEventParams<{ sub: string }>(schema, event);
      expect(result.sub).toBe('cognito-user-123');
    });

    it('should extract nested identity.claims from AppSync event', () => {
      const schema: EventSchema = {
        identity: {
          sub: {
            label: 'User Sub',
            required: true,
          },
          claims: {
            email: {
              label: 'Email from claims',
              required: true,
              expectedType: ParameterType.STRING,
            },
            'custom:role': {
              label: 'Custom Role',
              required: false,
              default: 'user',
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: {
          sub: 'cognito-user-123',
          issuer: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
          username: 'testuser',
          claims: {
            email: 'user@example.com',
          },
          sourceIp: ['127.0.0.1'],
          defaultAuthStrategy: 'ALLOW',
        } as any,
      });

      const result = extractEventParams<{ 
        sub: string; 
        email: string; 
        'custom:role': string;
      }>(schema, event);
      
      expect(result.sub).toBe('cognito-user-123');
      expect(result.email).toBe('user@example.com');
      expect(result['custom:role']).toBe('user');
    });

    it('should throw error when required identity field is missing', () => {
      const schema: EventSchema = {
        identity: {
          sub: {
            label: 'User Sub',
            required: true,
            statusCodeError: HttpStatus.UNAUTHORIZED,
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: null,
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(Unauthorized);
    });

    it('should throw error when required claim is missing', () => {
      const schema: EventSchema = {
        identity: {
          claims: {
            email: {
              label: 'Email',
              required: true,
              statusCodeError: HttpStatus.UNAUTHORIZED,
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: {
          sub: 'user-123',
          claims: {},
        } as any,
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(Unauthorized);
    });

    it('should extract source from AppSync field resolver', () => {
      const schema: EventSchema = {
        source: {
          authorId: {
            label: 'Author ID',
            required: true,
            expectedType: ParameterType.STRING,
          },
        },
      };

      const event = createMockAppSyncEvent({
        source: { id: 'post-123', title: 'Test Post', authorId: 'author-456' } as any,
      });

      const result = extractEventParams<{ authorId: string }>(schema, event);
      expect(result.authorId).toBe('author-456');
    });

    it('should combine arguments and identity extraction', () => {
      const schema: EventSchema = {
        arguments: {
          id: {
            label: 'User ID',
            required: true,
          },
        },
        identity: {
          sub: {
            label: 'Caller Sub',
            required: true,
          },
          claims: {
            email: {
              label: 'Caller Email',
              required: true,
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        arguments: { id: 'target-user-123' },
        identity: {
          sub: 'caller-456',
          claims: { email: 'caller@example.com' },
        } as any,
      });

      const result = extractEventParams<{
        id: string;
        sub: string;
        email: string;
      }>(schema, event);

      expect(result.id).toBe('target-user-123');
      expect(result.sub).toBe('caller-456');
      expect(result.email).toBe('caller@example.com');
    });

    it('should apply decoder to identity claims', () => {
      const schema: EventSchema = {
        identity: {
          claims: {
            email: {
              label: 'Email',
              required: true,
              decoder: (value) => (value as string).toLowerCase(),
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: {
          sub: 'user-123',
          claims: { email: 'USER@EXAMPLE.COM' },
        } as any,
      });

      const result = extractEventParams<{ email: string }>(schema, event);
      expect(result.email).toBe('user@example.com');
    });

    it('should validate type in identity claims', () => {
      const schema: EventSchema = {
        identity: {
          claims: {
            age: {
              label: 'Age',
              required: true,
              expectedType: ParameterType.NUMBER,
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        identity: {
          sub: 'user-123',
          claims: { age: 'not-a-number' },
        } as any,
      });

      expect(() => {
        extractEventParams(schema, event);
      }).toThrow(UnprocessableEntity);
    });

    it('should extract request headers', () => {
      const schema: EventSchema = {
        request: {
          headers: {
            authorization: {
              label: 'Authorization',
              required: true,
              caseInsensitive: true,
            },
          },
        },
      };

      const event = createMockAppSyncEvent({
        request: {
          headers: { Authorization: 'Bearer token123' },
          domainName: null,
        },
      });

      const result = extractEventParams<{ authorization: string }>(schema, event);
      expect(result.authorization).toBe('Bearer token123');
    });
  });
});
