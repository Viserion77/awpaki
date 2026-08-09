import { lambdaClient } from './index';
import { InvokeCommand } from '@aws-sdk/client-lambda';

describe('lambdaClient', () => {
  it('should have execute method', () => {
    expect(lambdaClient).toHaveProperty('execute');
    expect(typeof lambdaClient.execute).toBe('function');
  });

  it('should have invokeLambda method', () => {
    expect(lambdaClient).toHaveProperty('invokeLambda');
    expect(typeof lambdaClient.invokeLambda).toBe('function');
  });

  it('should execute InvokeCommand without errors in structure', async () => {
    const command = new InvokeCommand({
      FunctionName: 'test-function',
      Payload: JSON.stringify({ key: 'value' }),
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(lambdaClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new InvokeCommand({
      FunctionName: 'test-function',
      Payload: JSON.stringify({ key: 'value' }),
    });

    await expect(lambdaClient.execute(command, { retries: 0, minTimeout: 500 })).rejects.toThrow();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports -- the client is built at import time */

interface FakeLambdaClient {
  config: Record<string, any>;
  destroyed: boolean;
}

interface MockedModule {
  lambdaClient: typeof import('./index').lambdaClient;
  /** Every LambdaClient built since the module was loaded — index 0 is the module client */
  clients: FakeLambdaClient[];
  /** Every InvokeCommand built by the module */
  commands: Array<{ input: Record<string, any> }>;
  send: jest.Mock;
  /** Serialized log lines produced during the test */
  logs: string[];
}

const CONTROLLED_ENV_VARS = [
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_LAMBDA',
  'AWS_LAMBDA_FUNCTION_NAME',
  '_X_AMZN_TRACE_ID',
  'STAGE',
  'NODE_ENV',
];

/**
 * Re-imports the module with the AWS SDK stubbed out, so both the configuration of every
 * client built and the payload of every command sent can be inspected.
 */
function loadWithMockedSdk(): MockedModule {
  const clients: FakeLambdaClient[] = [];
  const commands: Array<{ input: Record<string, any> }> = [];
  const sendMock = jest.fn();

  jest.doMock('@aws-sdk/client-lambda', () => ({
    LambdaClient: class {
      public config: Record<string, any>;
      public destroyed = false;
      public send = sendMock;

      constructor(config: Record<string, any>) {
        this.config = config;
        clients.push(this as unknown as FakeLambdaClient);
      }

      destroy(): void {
        this.destroyed = true;
      }
    },
    InvokeCommand: class {
      constructor(public input: Record<string, any>) {
        commands.push(this);
      }
    },
  }));

  // The module under test resolves its logger from the freshly reset registry, so the sink
  // has to be installed on that same copy.
  const logs: string[] = [];
  const logger = require('../../loggers/logger') as typeof import('../../loggers/logger');
  logger.setLogSink((line) => logs.push(line));

  const mod = require('./index') as typeof import('./index');

  return { lambdaClient: mod.lambdaClient, clients, commands, send: sendMock, logs };
}

/**
 * Encodes a value the way Lambda returns it: JSON text in a utf-8 Uint8Array.
 */
function jsonPayload(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/**
 * Encodes raw text the way Lambda returns it.
 */
function textPayload(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Parses the synthetic event of the last invoke.
 */
function lastEvent(mod: MockedModule): any {
  const last = mod.commands[mod.commands.length - 1];
  return JSON.parse(last.input.Payload as string);
}

describe('lambdaClient.invokeLambda', () => {
  const originalEnv = process.env;
  let consoleSpies: jest.SpyInstance[] = [];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    for (const name of CONTROLLED_ENV_VARS) {
      delete process.env[name];
    }

    process.env.AWS_REGION = 'us-east-1';
    process.env.STAGE = 'prod';

    consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {})
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) spy.mockRestore();
    jest.dontMock('@aws-sdk/client-lambda');
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('event building', () => {
    it('builds a payload format 1.0 event with multi value headers and query string', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({
        functionName: 'users-service-dev-getUser',
        httpMethod: 'post',
        path: 'users/42',
        resource: '/users/{id}',
        pathParameters: { id: 42 },
        stageVariables: { tenant: 'acme' },
        headers: { authorization: 'Bearer token', 'x-multi': ['a', 'b'] },
        queryStringParameters: { include: ['roles', 'groups'], page: 2 },
        body: { name: 'Ada' },
        authorizer: { claims: { sub: 'user-1' } },
      });

      const event = lastEvent(mod);

      expect(event.httpMethod).toBe('POST');
      expect(event.path).toBe('/users/42');
      expect(event.resource).toBe('/users/{id}');
      expect(event.pathParameters).toEqual({ id: '42' });
      expect(event.stageVariables).toEqual({ tenant: 'acme' });
      expect(event.body).toBe(JSON.stringify({ name: 'Ada' }));
      expect(event.isBase64Encoded).toBe(false);
      expect(event.version).toBeUndefined();

      // Multi value maps carry every value, single value maps carry the last one
      expect(event.multiValueHeaders['x-multi']).toEqual(['a', 'b']);
      expect(event.headers['x-multi']).toBe('b');
      expect(event.headers.authorization).toBe('Bearer token');
      expect(event.headers['content-type']).toBe('application/json');
      expect(event.multiValueQueryStringParameters).toEqual({
        include: ['roles', 'groups'],
        page: ['2'],
      });
      expect(event.queryStringParameters).toEqual({ include: 'groups', page: '2' });

      // requestContext complete enough for logApiGatewayEvent / extractEventParams
      expect(event.requestContext.stage).toBe('prod');
      expect(event.requestContext.httpMethod).toBe('POST');
      expect(event.requestContext.path).toBe('/prod/users/42');
      expect(event.requestContext.resourcePath).toBe('/users/{id}');
      expect(event.requestContext.protocol).toBe('HTTP/1.1');
      expect(typeof event.requestContext.requestId).toBe('string');
      expect(event.requestContext.requestId.length).toBeGreaterThan(0);
      expect(typeof event.requestContext.requestTimeEpoch).toBe('number');
      expect(event.requestContext.requestTime).toMatch(
        /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/
      );
      expect(event.requestContext.identity.sourceIp).toBe('127.0.0.1');
      expect(event.requestContext.identity.userAgent).toBe('awpaki/invokeLambda');
      expect(event.requestContext.identity.cognitoIdentityId).toBeNull();
      expect(event.requestContext.apiId).toBeTruthy();
      expect(event.requestContext.authorizer).toEqual({ claims: { sub: 'user-1' } });
    });

    it('uses null for the absent maps of a payload format 1.0 event', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      const event = lastEvent(mod);

      expect(event.httpMethod).toBe('GET');
      expect(event.path).toBe('/');
      expect(event.body).toBeNull();
      expect(event.queryStringParameters).toBeNull();
      expect(event.multiValueQueryStringParameters).toBeNull();
      expect(event.pathParameters).toBeNull();
      expect(event.stageVariables).toBeNull();
      expect(event.requestContext.authorizer).toBeNull();
      // No body, so no content type is guessed
      expect(event.headers['content-type']).toBeUndefined();
    });

    it('builds a payload format 2.0 event', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({
        functionName: 'orders-service-dev-createOrder',
        eventFormat: 'httpApiV2',
        httpMethod: 'post',
        path: '/orders',
        headers: { 'x-multi': ['a', 'b'] },
        queryStringParameters: { include: ['items', 'totals'], page: 2 },
        cookies: ['session=abc'],
        body: { sku: 'ABC' },
      });

      const event = lastEvent(mod);

      expect(event.version).toBe('2.0');
      expect(event.routeKey).toBe('POST /orders');
      expect(event.rawPath).toBe('/orders');
      expect(event.rawQueryString).toBe('include=items&include=totals&page=2');
      expect(event.cookies).toEqual(['session=abc']);
      expect(event.isBase64Encoded).toBe(false);
      expect(event.body).toBe(JSON.stringify({ sku: 'ABC' }));
      // v2 has no multi value maps: values are joined
      expect(event.headers['x-multi']).toBe('a, b');
      expect(event.queryStringParameters).toEqual({ include: 'items,totals', page: '2' });
      expect(event.multiValueHeaders).toBeUndefined();
      expect(event.multiValueQueryStringParameters).toBeUndefined();

      expect(event.requestContext.http).toEqual({
        method: 'POST',
        path: '/orders',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'awpaki/invokeLambda',
      });
      expect(event.requestContext.stage).toBe('prod');
      expect(event.requestContext.routeKey).toBe('POST /orders');
      expect(typeof event.requestContext.requestId).toBe('string');
      expect(typeof event.requestContext.timeEpoch).toBe('number');
      expect(event.requestContext.time).toMatch(
        /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/
      );
    });

    it('omits the absent maps of a payload format 2.0 event and honours routeKey', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({
        functionName: 'fn',
        eventFormat: 'httpApiV2',
        routeKey: '$default',
        authorizer: { jwt: { claims: { sub: 'user-1' } } },
        isBase64Encoded: true,
        body: 'cGluZw==',
      });

      const event = lastEvent(mod);

      expect(event.routeKey).toBe('$default');
      expect(event.requestContext.routeKey).toBe('$default');
      expect(event.rawQueryString).toBe('');
      expect(event.queryStringParameters).toBeUndefined();
      expect(event.pathParameters).toBeUndefined();
      expect(event.stageVariables).toBeUndefined();
      expect(event.isBase64Encoded).toBe(true);
      // A string body is sent untouched, without a guessed content type
      expect(event.body).toBe('cGluZw==');
      expect(event.headers['content-type']).toBeUndefined();
      expect(event.requestContext.authorizer).toEqual({ jwt: { claims: { sub: 'user-1' } } });
    });

    it('passes the invoke parameters to the InvokeCommand', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 202, Payload: undefined });

      await mod.lambdaClient.invokeLambda({
        functionName: 'fn',
        invocationType: 'Event',
        qualifier: 'live',
      });

      expect(mod.commands).toHaveLength(1);
      expect(mod.commands[0].input.FunctionName).toBe('fn');
      expect(mod.commands[0].input.InvocationType).toBe('Event');
      expect(mod.commands[0].input.Qualifier).toBe('live');
      expect(typeof mod.commands[0].input.Payload).toBe('string');
    });

    it('rejects an empty functionName without touching the SDK', async () => {
      const mod = loadWithMockedSdk();

      await expect(mod.lambdaClient.invokeLambda({ functionName: '  ' })).rejects.toMatchObject({
        name: 'BadRequest',
        statusCode: 400,
      });
      expect(mod.send).not.toHaveBeenCalled();
    });
  });

  describe('observability headers', () => {
    it('injects x-source-lambda and x-trace-id in a v1 invoke', async () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'caller-fn';
      process.env._X_AMZN_TRACE_ID = 'Root=1-abc;Parent=def;Sampled=1';

      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      const event = lastEvent(mod);

      expect(event.headers['x-source-lambda']).toBe('caller-fn');
      expect(event.headers['x-trace-id']).toBe('Root=1-abc;Parent=def;Sampled=1');
      expect(event.multiValueHeaders['x-source-lambda']).toEqual(['caller-fn']);
    });

    it('injects the observability headers in a v2 invoke', async () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'caller-fn';
      process.env._X_AMZN_TRACE_ID = 'Root=1-abc';

      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn', eventFormat: 'httpApiV2' });

      const event = lastEvent(mod);

      expect(event.headers['x-source-lambda']).toBe('caller-fn');
      expect(event.headers['x-trace-id']).toBe('Root=1-abc');
    });

    it('omits the observability headers when the runtime does not provide them', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      const event = lastEvent(mod);

      expect(event.headers['x-source-lambda']).toBeUndefined();
      expect(event.headers['x-trace-id']).toBeUndefined();
    });

    it('lets an explicit caller header override the injected one', async () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'caller-fn';

      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({
        functionName: 'fn',
        headers: { 'x-source-lambda': 'explicit' },
      });

      expect(lastEvent(mod).headers['x-source-lambda']).toBe('explicit');
    });
  });

  describe('payload decoding', () => {
    it('decodes an envelope whose body is JSON', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        ExecutedVersion: '7',
        Payload: jsonPayload({
          statusCode: 201,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'abc', total: 10 }),
        }),
      });

      const result = await mod.lambdaClient.invokeLambda<{ id: string; total: number }>({
        functionName: 'fn',
      });

      expect(result.statusCode).toBe(201);
      expect(result.headers).toEqual({ 'content-type': 'application/json' });
      expect(result.body).toEqual({ id: 'abc', total: 10 });
      expect(result.invocationStatusCode).toBe(200);
      expect(result.executedVersion).toBe('7');
      expect(result.payload).toMatchObject({ statusCode: 201 });
      expect(typeof result.rawPayload).toBe('string');
    });

    it('falls back to the raw text when the body is not JSON', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: jsonPayload({ statusCode: 200, body: 'plain text answer' }),
      });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('plain text answer');
    });

    it('falls back to the raw text when the envelope itself is not JSON', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: textPayload('not json at all') });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.statusCode).toBeUndefined();
      expect(result.headers).toBeUndefined();
      expect(result.body).toBe('not json at all');
      expect(result.payload).toBe('not json at all');
      expect(result.rawPayload).toBe('not json at all');
    });

    it('returns the whole answer when the function does not use an envelope', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ id: 1, ok: true }) });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.statusCode).toBeUndefined();
      expect(result.body).toEqual({ id: 1, ok: true });
    });

    it('returns a JSON answer that is not an object as is', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload([1, 2, 3]) });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.body).toEqual([1, 2, 3]);
    });

    it('accepts a string payload and a payload exposing transformToString', async () => {
      const mod = loadWithMockedSdk();

      mod.send.mockResolvedValueOnce({
        StatusCode: 200,
        Payload: JSON.stringify({ statusCode: 200, body: '{"ok":true}' }),
      });
      const fromString = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });
      expect(fromString.body).toEqual({ ok: true });

      mod.send.mockResolvedValueOnce({
        StatusCode: 200,
        Payload: { transformToString: () => '{"statusCode":200,"body":"{\\"ok\\":false}"}' },
      });
      const fromAdapter = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });
      expect(fromAdapter.body).toEqual({ ok: false });
    });

    it('returns an undefined body for an empty payload', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 202 });

      const result = await mod.lambdaClient.invokeLambda({
        functionName: 'fn',
        invocationType: 'Event',
      });

      expect(result.body).toBeUndefined();
      expect(result.payload).toBeUndefined();
      expect(result.rawPayload).toBe('');
      expect(result.invocationStatusCode).toBe(202);
    });

    it('never throws while decoding a payload it cannot read', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: {
          transformToString: () => {
            throw new Error('broken stream');
          },
        },
      });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.body).toBeUndefined();
      expect(result.rawPayload).toBe('');
    });
  });

  describe('error propagation', () => {
    it('throws when Lambda reports a FunctionError', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: jsonPayload({
          errorType: 'TypeError',
          errorMessage: 'cannot read property id of undefined',
          trace: ['at handler'],
        }),
      });

      await expect(mod.lambdaClient.invokeLambda({ functionName: 'fn' })).rejects.toMatchObject({
        name: 'BadGateway',
        statusCode: 502,
        message: expect.stringContaining('cannot read property id of undefined'),
        data: {
          functionName: 'fn',
          functionError: 'Unhandled',
          errorType: 'TypeError',
          trace: ['at handler'],
        },
      });

      // A function error is not a transport failure: it must not be retried
      expect(mod.send).toHaveBeenCalledTimes(1);
    });

    it('throws on a FunctionError even when the payload cannot be decoded', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        FunctionError: 'Handled',
        Payload: textPayload('kaboom'),
      });

      await expect(mod.lambdaClient.invokeLambda({ functionName: 'fn' })).rejects.toMatchObject({
        name: 'BadGateway',
        message: expect.stringContaining('kaboom'),
        data: { errorType: 'Handled' },
      });
    });

    it('returns the envelope of an error status by default', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: jsonPayload({ statusCode: 404, body: JSON.stringify({ message: 'no user' }) }),
      });

      const result = await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(result.statusCode).toBe(404);
      expect(result.body).toEqual({ message: 'no user' });
    });

    it('throws the matching HttpError when throwOnErrorStatus is set', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: jsonPayload({ statusCode: 404, body: JSON.stringify({ message: 'no user' }) }),
      });

      await expect(
        mod.lambdaClient.invokeLambda({ functionName: 'fn', throwOnErrorStatus: true })
      ).rejects.toMatchObject({ name: 'NotFound', statusCode: 404, message: 'no user' });
    });

    it('does not throw on a successful status when throwOnErrorStatus is set', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: jsonPayload({ statusCode: 204, body: '' }),
      });

      await expect(
        mod.lambdaClient.invokeLambda({ functionName: 'fn', throwOnErrorStatus: true })
      ).resolves.toMatchObject({ statusCode: 204 });
    });

    it('retries a transport failure and surfaces it when it never succeeds', async () => {
      const mod = loadWithMockedSdk();
      mod.send
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      const result = await mod.lambdaClient.invokeLambda({
        functionName: 'fn',
        retryOptions: { retries: 2, minTimeout: 1, maxTimeout: 5 },
      });

      expect(result.body).toEqual({ ok: true });
      expect(mod.send).toHaveBeenCalledTimes(2);

      mod.send.mockReset();
      mod.send.mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        mod.lambdaClient.invokeLambda({ functionName: 'fn', retryOptions: { retries: 0 } })
      ).rejects.toThrow('ECONNRESET');
    });
  });

  describe('cross-account credentials', () => {
    it('creates an ephemeral client reusing the resolved region and endpoint', async () => {
      process.env.AWS_ENDPOINT_URL_LAMBDA = 'http://lambda.local';

      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      const credentials = {
        accessKeyId: 'AKIA-partner',
        secretAccessKey: 'secret',
        sessionToken: 'token',
      };

      await mod.lambdaClient.invokeLambda({ functionName: 'partner-fn', credentials });

      expect(mod.clients).toHaveLength(2);
      expect(mod.clients[0].config).toEqual({
        region: 'us-east-1',
        endpoint: 'http://lambda.local',
      });
      expect(mod.clients[1].config).toEqual({
        region: 'us-east-1',
        endpoint: 'http://lambda.local',
        credentials,
      });
      // Ephemeral really means ephemeral
      expect(mod.clients[1].destroyed).toBe(true);
      expect(mod.clients[0].destroyed).toBe(false);
    });

    it('honours a region override on the ephemeral client', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn', region: 'sa-east-1' });

      expect(mod.clients).toHaveLength(2);
      expect(mod.clients[1].config.region).toBe('sa-east-1');
      expect(mod.clients[1].config.credentials).toBeUndefined();
    });

    it('destroys the ephemeral client even when the invoke fails', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockRejectedValue(new Error('denied'));

      await expect(
        mod.lambdaClient.invokeLambda({
          functionName: 'fn',
          credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
          retryOptions: { retries: 0 },
        })
      ).rejects.toThrow('denied');

      expect(mod.clients[1].destroyed).toBe(true);
    });

    it('keeps using the shared module client when no credentials are given', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({ StatusCode: 200, Payload: jsonPayload({ ok: true }) });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      expect(mod.clients).toHaveLength(1);
      expect(mod.clients[0].destroyed).toBe(false);
    });
  });

  describe('logging', () => {
    it('logs through the awpaki logger and never through console', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        Payload: jsonPayload({ statusCode: 200, body: '{"ok":true}' }),
      });

      await mod.lambdaClient.invokeLambda({ functionName: 'fn' });

      const info = mod.logs.map((line) => JSON.parse(line)).find((log) => log.level === 'INFO');

      expect(info).toMatchObject({ functionName: 'fn', statusCode: 200, eventFormat: 'rest' });
      expect(typeof info.durationMs).toBe('number');

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it('logs the function error through the logger, not through console', async () => {
      const mod = loadWithMockedSdk();
      mod.send.mockResolvedValue({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: jsonPayload({ errorType: 'Error', errorMessage: 'boom' }),
      });

      await expect(mod.lambdaClient.invokeLambda({ functionName: 'fn' })).rejects.toThrow();

      const error = mod.logs.map((line) => JSON.parse(line)).find((log) => log.level === 'ERROR');

      expect(error).toMatchObject({ functionName: 'fn', functionError: 'Unhandled' });

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });
});
