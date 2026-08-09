import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createApiGatewayHandlerV2 } from './createApiGatewayHandlerV2';
import type {
  ApiGatewayHandlerV2Input,
  CreateApiGatewayHandlerV2Options,
} from './createApiGatewayHandlerV2';
import { resetHandlerLogCollector, setHandlerLogCollector } from './logCollector';
import { Conflict, Forbidden, HttpStatus, NotFound, Unauthorized } from '../errors';
import { ParameterType } from '../extractors';
import { resetLogger, setLogger } from '../loggers';

type LogCall = [any, string | undefined];

let infoOutput: LogCall[] = [];
let errorOutput: LogCall[] = [];

beforeEach(() => {
  infoOutput = [];
  errorOutput = [];

  setLogger({
    info: jest.fn((obj: unknown, msg?: string) => {
      infoOutput.push([obj, msg]);
    }),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn((obj: unknown, msg?: string) => {
      errorOutput.push([obj, msg]);
    }),
  });
});

afterEach(() => {
  resetLogger();
  resetHandlerLogCollector();
});

const createMockContext = (): Context =>
  ({
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'request-id-1',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2026/08/08/[$LATEST]abcdef',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  }) as Context;

const createMockEvent = (overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /users',
    rawPath: '/users',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api-id.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'api-id',
      http: {
        method: 'POST',
        path: '/users',
        protocol: 'HTTP/1.1',
        sourceIp: '192.0.2.1',
        userAgent: 'jest',
      },
      requestId: 'api-request-id',
      routeKey: 'POST /users',
      stage: 'dev',
      time: '08/Aug/2026:12:00:00 +0000',
      timeEpoch: 1754654400000,
    },
    isBase64Encoded: false,
    ...overrides,
  }) as APIGatewayProxyEventV2;

const nameSchema = {
  body: {
    name: { label: 'Name', required: true, expectedType: ParameterType.STRING },
  },
};

describe('createApiGatewayHandlerV2', () => {
  describe('happy path', () => {
    it('logs the entry, extracts params, runs execute and serializes the response', async () => {
      const execute = jest.fn(({ params }: { params: { name: string } }) => ({
        body: { greeting: `hello ${params.name}` },
      }));

      const handler = createApiGatewayHandlerV2<{ name: string }>({
        schema: nameSchema,
        execute,
      });

      const event = createMockEvent({ body: JSON.stringify({ name: 'ana' }) });
      const context = createMockContext();
      const response = await handler(event, context);

      expect(infoOutput[0][1]).toBe('Entry API Gateway V2 test-function:api-request-id');
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0]).toMatchObject({ params: { name: 'ana' }, event, context });
      expect(response).toEqual({
        statusCode: HttpStatus.OK,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ greeting: 'hello ana' }),
      });
    });

    it('works without a schema, handing an empty params object to execute', async () => {
      const execute = jest.fn((input: ApiGatewayHandlerV2Input<Record<string, unknown>>) => ({
        body: { ok: true, params: input.params },
      }));
      const handler = createApiGatewayHandlerV2({ execute });

      const response = await handler(createMockEvent(), createMockContext());

      expect(execute.mock.calls[0][0].params).toEqual({});
      expect(response.statusCode).toBe(HttpStatus.OK);
    });

    it('honours the status code from the result and from the factory default', async () => {
      const created = await createApiGatewayHandlerV2({
        execute: () => ({ statusCode: HttpStatus.CREATED, body: { id: '1' } }),
      })(createMockEvent(), createMockContext());

      const accepted = await createApiGatewayHandlerV2({
        statusCode: HttpStatus.ACCEPTED,
        execute: () => ({ body: { id: '1' } }),
      })(createMockEvent(), createMockContext());

      expect(created.statusCode).toBe(HttpStatus.CREATED);
      expect(accepted.statusCode).toBe(HttpStatus.ACCEPTED);
    });

    it('passes a string body through without re-serializing it', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => ({ body: 'id,name\n1,ana', headers: { 'content-type': 'text/csv' } }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.body).toBe('id,name\n1,ana');
      expect(response.headers).toEqual({ 'content-type': 'text/csv' });
    });

    it('forwards cookies and isBase64Encoded when the result sets them', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => ({
          body: 'AAECAw==',
          cookies: ['session=abc; HttpOnly'],
          isBase64Encoded: true,
        }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.cookies).toEqual(['session=abc; HttpOnly']);
      expect(response.isBase64Encoded).toBe(true);
    });

    it('awaits an async execute', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: async () => {
          await Promise.resolve();
          return { body: { done: true } };
        },
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.body).toBe(JSON.stringify({ done: true }));
    });

    it('serializes an unserializable body as an empty string instead of dropping the field', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => ({ body: () => 'not serializable' }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.body).toBe('');
      expect(response.statusCode).toBe(HttpStatus.OK);
    });
  });

  describe('204 No Content', () => {
    it('answers 204 without body and without Content-Type when execute returns nothing', async () => {
      const handler = createApiGatewayHandlerV2({
        schema: nameSchema,
        execute: jest.fn(),
      });

      const response = await handler(
        createMockEvent({ body: JSON.stringify({ name: 'ana' }) }),
        createMockContext()
      );

      expect(response).toEqual({ statusCode: HttpStatus.NO_CONTENT });
      expect(response.headers).toBeUndefined();
      expect(response).not.toHaveProperty('body');
    });

    it('answers 204 when the result has no body, keeping extra headers and cookies', async () => {
      const handler = createApiGatewayHandlerV2({
        headers: { 'x-trace-id': 'trace-1' },
        execute: () => ({ cookies: ['session=; Max-Age=0'] }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.NO_CONTENT);
      expect(response.headers).toEqual({ 'x-trace-id': 'trace-1' });
      expect(response.headers).not.toHaveProperty('Content-Type');
      expect(response.cookies).toEqual(['session=; Max-Age=0']);
    });

    it('keeps an explicit status code even when there is no body', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => ({ statusCode: HttpStatus.ACCEPTED }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(response).not.toHaveProperty('body');
    });
  });

  describe('headers', () => {
    it('lets factory headers override the Content-Type default with a single key', async () => {
      const handler = createApiGatewayHandlerV2({
        headers: { 'content-type': 'application/vnd.api+json', 'x-api-version': '2' },
        execute: () => ({ body: { ok: true } }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.headers).toEqual({
        'content-type': 'application/vnd.api+json',
        'x-api-version': '2',
      });
    });

    it('lets result headers override factory headers, matching names case-insensitively', async () => {
      const handler = createApiGatewayHandlerV2({
        headers: { 'X-Trace-Id': 'from-factory', 'cache-control': 'no-store' },
        execute: () => ({ body: { ok: true }, headers: { 'x-trace-id': 'from-result' } }),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'cache-control': 'no-store',
        'x-trace-id': 'from-result',
      });
      expect(Object.keys(response.headers ?? {})).toHaveLength(3);
    });
  });

  describe('error handling', () => {
    it('turns a schema violation into 422 without calling execute', async () => {
      const execute = jest.fn();
      const handler = createApiGatewayHandlerV2({ schema: nameSchema, execute });

      const response = await handler(
        createMockEvent({ body: JSON.stringify({}) }),
        createMockContext()
      );

      expect(response.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(JSON.parse(response.body as string).message).toBe('Name is required');
      expect(execute).not.toHaveBeenCalled();
      // The entry log still ran: it is the first step of the pipeline.
      expect(infoOutput).toHaveLength(1);
    });

    it('turns a wrong parameter type into 422', async () => {
      const handler = createApiGatewayHandlerV2({ schema: nameSchema, execute: jest.fn() });

      const response = await handler(
        createMockEvent({ body: JSON.stringify({ name: 42 }) }),
        createMockContext()
      );

      expect(response.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(JSON.parse(response.body as string).message).toBe('Name must be of type string');
    });

    it('turns an invalid JSON body into 400', async () => {
      const handler = createApiGatewayHandlerV2({ schema: nameSchema, execute: jest.fn() });

      const response = await handler(createMockEvent({ body: '{ not json' }), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('maps a business HttpError to its own status code', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => {
          throw new NotFound('User not found', { userId: '42' });
        },
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(JSON.parse(response.body as string)).toMatchObject({
        message: 'User not found',
        data: { userId: '42' },
      });
      expect(errorOutput[0][1]).toBe('API Gateway V2 HttpError');
    });

    it('maps a rejected promise carrying an HttpError', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: async () => {
          await Promise.resolve();
          throw new Conflict('Email already exists');
        },
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('re-throws non-HttpError so the invocation fails with 5xx', async () => {
      const handler = createApiGatewayHandlerV2({
        execute: () => {
          throw new TypeError('boom');
        },
      });

      await expect(handler(createMockEvent(), createMockContext())).rejects.toThrow('boom');
      expect(errorOutput[0][1]).toBe('API Gateway V2 Unknown Error');
    });

    it('rejects at creation time when execute is not a function', () => {
      expect(() =>
        createApiGatewayHandlerV2(
          {} as unknown as CreateApiGatewayHandlerV2Options<Record<string, unknown>, unknown>
        )
      ).toThrow(TypeError);
    });
  });

  describe('authorize hook', () => {
    it('receives the same input as execute and runs before it', async () => {
      const calls: string[] = [];
      const authorize = jest.fn((_input: ApiGatewayHandlerV2Input<{ name: string }>) => {
        calls.push('authorize');
      });
      const execute = jest.fn(() => {
        calls.push('execute');
        return { body: { ok: true } };
      });

      const handler = createApiGatewayHandlerV2<{ name: string }>({
        schema: nameSchema,
        authorize,
        execute,
      });

      const event = createMockEvent({ body: JSON.stringify({ name: 'ana' }) });
      await handler(event, createMockContext());

      expect(calls).toEqual(['authorize', 'execute']);
      expect(authorize.mock.calls[0][0]).toMatchObject({ params: { name: 'ana' }, event });
    });

    it('turns a thrown Unauthorized into 401 and never calls execute', async () => {
      const execute = jest.fn();
      const handler = createApiGatewayHandlerV2({
        authorize: () => {
          throw new Unauthorized('Token expired');
        },
        execute,
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(JSON.parse(response.body as string).message).toBe('Token expired');
      expect(execute).not.toHaveBeenCalled();
    });

    it('awaits an async authorize and turns a rejected Forbidden into 403', async () => {
      const handler = createApiGatewayHandlerV2({
        authorize: async () => {
          await Promise.resolve();
          throw new Forbidden('Insufficient permissions');
        },
        execute: jest.fn(),
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('checkApiKey gate — presence detection, never truthiness', () => {
    const withKeyHeader = (key?: string): APIGatewayProxyEventV2 =>
      createMockEvent({ headers: key === undefined ? {} : { 'x-api-key': key } });

    it('is disabled when the property is absent from the options object', async () => {
      const options = { execute: jest.fn(() => ({ body: { ok: true } })) };

      // The regression this guards: the gate reads the property, not its value.
      expect('checkApiKey' in options).toBe(false);

      const response = await createApiGatewayHandlerV2(options)(
        withKeyHeader(),
        createMockContext()
      );

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(options.execute).toHaveBeenCalledTimes(1);
    });

    it('accepts a request whose key matches the configured one', async () => {
      const execute = jest.fn(() => ({ body: { ok: true } }));
      const handler = createApiGatewayHandlerV2({ checkApiKey: 'secret-key', execute });

      const response = await handler(withKeyHeader('secret-key'), createMockContext());

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('answers 401 when the key does not match or is missing', async () => {
      const execute = jest.fn();
      const handler = createApiGatewayHandlerV2({ checkApiKey: 'secret-key', execute });

      const wrong = await handler(withKeyHeader('nope'), createMockContext());
      const missing = await handler(withKeyHeader(), createMockContext());
      const noHeaders = await handler(
        createMockEvent({ headers: undefined as unknown as APIGatewayProxyEventV2['headers'] }),
        createMockContext()
      );

      expect(wrong.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(missing.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(noHeaders.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(JSON.parse(wrong.body as string).message).toBe('Invalid API key');
      expect(execute).not.toHaveBeenCalled();
    });

    it('matches the key header case-insensitively and honours apiKeyHeader', async () => {
      const upperCased = await createApiGatewayHandlerV2({
        checkApiKey: 'secret-key',
        execute: () => ({ body: { ok: true } }),
      })(createMockEvent({ headers: { 'X-Api-Key': 'secret-key' } }), createMockContext());

      const customHeader = await createApiGatewayHandlerV2({
        checkApiKey: 'secret-key',
        apiKeyHeader: 'authorization',
        execute: () => ({ body: { ok: true } }),
      })(createMockEvent({ headers: { Authorization: 'secret-key' } }), createMockContext());

      expect(upperCased.statusCode).toBe(HttpStatus.OK);
      expect(customHeader.statusCode).toBe(HttpStatus.OK);
    });

    it('fails loudly when the property is present but holds undefined', async () => {
      const execute = jest.fn();
      const options = { checkApiKey: undefined, execute };

      expect('checkApiKey' in options).toBe(true);

      const handler = createApiGatewayHandlerV2(options);

      // Never a silent pass: an undefined secret is a misconfiguration, and a
      // non-HttpError propagates so API Gateway answers 5xx.
      await expect(handler(withKeyHeader('secret-key'), createMockContext())).rejects.toThrow(
        /'checkApiKey' was provided but holds undefined/
      );
      expect(execute).not.toHaveBeenCalled();
      expect(errorOutput[0][1]).toBe('API Gateway V2 Unknown Error');
    });

    it('fails loudly when the configured key comes from an unset environment variable', async () => {
      const previous = process.env.HANDLER_TEST_API_KEY;
      delete process.env.HANDLER_TEST_API_KEY;

      const execute = jest.fn();
      const handler = createApiGatewayHandlerV2({
        checkApiKey: process.env.HANDLER_TEST_API_KEY,
        execute,
      });

      await expect(handler(withKeyHeader('anything'), createMockContext())).rejects.toThrow(
        /misconfiguration/
      );
      expect(execute).not.toHaveBeenCalled();

      if (previous !== undefined) process.env.HANDLER_TEST_API_KEY = previous;
    });

    it('fails loudly when the configured key is empty or blank', async () => {
      const empty = createApiGatewayHandlerV2({ checkApiKey: '', execute: jest.fn() });
      const blank = createApiGatewayHandlerV2({ checkApiKey: '   ', execute: jest.fn() });

      await expect(empty(withKeyHeader(''), createMockContext())).rejects.toThrow(/checkApiKey/);
      await expect(blank(withKeyHeader('   '), createMockContext())).rejects.toThrow(/checkApiKey/);
    });

    it('fails loudly when the configured key is not a string at all', async () => {
      const handler = createApiGatewayHandlerV2({
        checkApiKey: 12345 as unknown as string,
        execute: jest.fn(),
      });

      await expect(handler(withKeyHeader('12345'), createMockContext())).rejects.toThrow(
        /'checkApiKey' was provided but holds 12345/
      );
    });

    it('runs after the schema, so an invalid request is reported as 422', async () => {
      const handler = createApiGatewayHandlerV2({
        schema: nameSchema,
        checkApiKey: 'secret-key',
        execute: jest.fn(),
      });

      const response = await handler(
        createMockEvent({ headers: {}, body: JSON.stringify({}) }),
        createMockContext()
      );

      expect(response.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('log collector seam', () => {
    it('wraps the handler with the globally registered collector', async () => {
      const order: string[] = [];
      setHandlerLogCollector((inner) => async (event, context) => {
        order.push('collector:before');
        const result = await inner(event, context);
        order.push('collector:after');
        return result;
      });

      const handler = createApiGatewayHandlerV2({
        execute: () => {
          order.push('execute');
          return { body: { ok: true } };
        },
      });

      const response = await handler(createMockEvent(), createMockContext());

      expect(order).toEqual(['collector:before', 'execute', 'collector:after']);
      expect(response.statusCode).toBe(HttpStatus.OK);
    });

    it('prefers the per-handler collector over the global one', async () => {
      const used: string[] = [];
      setHandlerLogCollector((inner) => (event, context) => {
        used.push('global');
        return inner(event, context);
      });

      const handler = createApiGatewayHandlerV2({
        logCollector: (inner) => (event, context) => {
          used.push('per-handler');
          return inner(event, context);
        },
        execute: () => ({ body: { ok: true } }),
      });

      await handler(createMockEvent(), createMockContext());

      expect(used).toEqual(['per-handler']);
    });
  });
});
