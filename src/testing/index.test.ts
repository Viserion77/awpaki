import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { HttpError } from '../errors';
import { extractEventParams, ParameterType } from '../extractors';
import { logApiGatewayEvent, logApiGatewayEventV2 } from '../loggers';
import * as testing from './index';
import { createMockContext, createMockEventV1, createMockEventV2, createMockFetch } from './index';

describe('testing barrel', () => {
  it('exports the four builders', () => {
    expect(typeof testing.createMockEventV1).toBe('function');
    expect(typeof testing.createMockEventV2).toBe('function');
    expect(typeof testing.createMockFetch).toBe('function');
    expect(typeof testing.createMockContext).toBe('function');
  });

  it('exports the default values used by the builders', () => {
    expect(testing.MOCK_ACCOUNT_ID).toBe('123456789012');
    expect(testing.MOCK_API_ID).toBe(createMockEventV1().requestContext.apiId);
    expect(testing.MOCK_STAGE).toBe(createMockEventV1().requestContext.stage);
    expect(testing.MOCK_REQUEST_ID).toBe(createMockEventV1().requestContext.requestId);
    expect(testing.MOCK_SOURCE_IP).toBe(createMockEventV1().requestContext.identity.sourceIp);
    expect(testing.MOCK_USER_AGENT).toBe(createMockEventV1().requestContext.identity.userAgent);
    expect(testing.MOCK_REGION).toBe('us-east-1');
    expect(testing.MOCK_RESOURCE_ID).toBe(createMockEventV1().requestContext.resourceId);
    expect(testing.MOCK_EXTENDED_REQUEST_ID).toBe(
      createMockEventV1().requestContext.extendedRequestId
    );
    expect(testing.MOCK_FUNCTION_NAME).toBe(createMockContext().functionName);
    expect(testing.MOCK_AWS_REQUEST_ID).toBe(createMockContext().awsRequestId);
    expect(testing.MOCK_CONTEXT_REGION).toBe('us-east-1');
    expect(testing.MOCK_CONTEXT_ACCOUNT_ID).toBe('123456789012');
    expect(testing.MOCK_REMAINING_TIME_IN_MILLIS).toBe(
      createMockContext().getRemainingTimeInMillis()
    );
  });
});

/**
 * The point of these builders is to feed the library's own helpers. A mock that
 * `extractEventParams` or the API Gateway loggers cannot consume would be useless, so the
 * suite runs the real functions — not doubles — against the generated events.
 */
describe('interoperability with the library', () => {
  const schema = {
    pathParameters: {
      id: { label: 'User ID', required: true, expectedType: ParameterType.STRING },
    },
    queryStringParameters: {
      page: { label: 'Page', expectedType: ParameterType.STRING, default: '1' },
    },
    headers: {
      authorization: { label: 'Authorization', required: true, caseInsensitive: true },
    },
    body: {
      email: { label: 'Email', required: true, expectedType: ParameterType.STRING },
      tags: { label: 'Tags', expectedType: ParameterType.ARRAY },
    },
  };

  interface Params {
    id: string;
    page: string;
    authorization: string;
    email: string;
    tags: string[];
  }

  const description = {
    method: 'post',
    path: '/users/:id',
    pathParameters: { id: '42' },
    query: { page: '3' },
    headers: { Authorization: 'Bearer token' },
    body: { email: 'ada@example.com', tags: ['admin'] },
  };

  describe('extractEventParams', () => {
    it('extracts every described field from a payload 1.0 event', () => {
      const event = createMockEventV1(description);

      const params = extractEventParams<Params>(schema, event);

      expect(params).toEqual({
        id: '42',
        page: '3',
        authorization: 'Bearer token',
        email: 'ada@example.com',
        tags: ['admin'],
      });
    });

    // `APIGatewayProxyEventV2` is now part of `LambdaEventLike`, so a payload 2.0 event is
    // passed straight through: no cast, which is what makes this a real type-level guard.
    it('extracts every described field from a payload 2.0 event', () => {
      const event = createMockEventV2(description);

      const params = extractEventParams<Params>(schema, event);

      expect(params).toEqual({
        id: '42',
        page: '3',
        authorization: 'Bearer token',
        email: 'ada@example.com',
        tags: ['admin'],
      });
    });

    it('applies the schema default when the mock leaves the parameter out', () => {
      const event = createMockEventV1({ ...description, query: {} });

      expect(extractEventParams<Params>(schema, event).page).toBe('1');
    });

    it('fails the way the library intends when the mock omits a required field', () => {
      const event = createMockEventV1({ ...description, headers: {} });

      expect(() => extractEventParams<Params>(schema, event)).toThrow(HttpError);
      expect(() => extractEventParams<Params>(schema, event)).toThrow('Authorization is required');

      try {
        extractEventParams<Params>(schema, event);
        throw new Error('extractEventParams should have thrown');
      } catch (error) {
        expect((error as HttpError).statusCode).toBe(422);
      }
    });

    it('rejects a malformed body, proving the mock delivers it as a raw string', () => {
      const event = createMockEventV1({ ...description, body: 'not json' });
      const bodySchema = { body: { email: { label: 'Email', required: true } } };

      expect(typeof event.body).toBe('string');
      expect(() => extractEventParams(bodySchema, event)).toThrow('Invalid JSON in request body');
    });

    it('yields identical parameters for both formats of the same call', () => {
      const { v1, v2 } = createMockFetch(description);

      const fromV1 = extractEventParams<Params>(schema, v1);
      const fromV2 = extractEventParams<Params>(schema, v2);

      expect(fromV1).toEqual(fromV2);
    });
  });

  describe('logApiGatewayEvent / logApiGatewayEventV2', () => {
    let lines: string[];
    let writeSpy: jest.SpyInstance;

    beforeEach(() => {
      lines = [];
      writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: Uint8Array | string): boolean => {
          lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          return true;
        });
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    const records = (): Record<string, unknown>[] =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>);

    it('logs a payload 1.0 event without touching a missing field', () => {
      const event: APIGatewayProxyEvent = createMockEventV1(description);
      const context: Context = createMockContext({ functionName: 'users-api' });

      expect(() => logApiGatewayEvent(event, context)).not.toThrow();

      const [entry, headers] = records();
      expect(entry).toMatchObject({
        functionName: 'users-api',
        httpMethod: 'POST',
        path: '/users/42',
        resource: '/users/{id}',
        stage: 'dev',
        sourceIp: '127.0.0.1',
        apiId: event.requestContext.apiId,
        requestId: context.awsRequestId,
      });
      expect(entry.requestTimeEpoch).toBe(event.requestContext.requestTimeEpoch);
      expect(entry.msg).toBe(`Entry API Gateway users-api:${event.requestContext.requestId}`);
      expect(headers).toMatchObject({ Authorization: 'Bearer token' });
    });

    it('logs a payload 2.0 event without touching a missing field', () => {
      const event: APIGatewayProxyEventV2 = createMockEventV2(description);
      const context: Context = createMockContext({ functionName: 'users-api' });

      expect(() => logApiGatewayEventV2(event, context)).not.toThrow();

      const [entry, headers] = records();
      expect(entry).toMatchObject({
        functionName: 'users-api',
        httpMethod: 'POST',
        path: '/users/42',
        routeKey: 'POST /users/{id}',
        stage: 'dev',
        sourceIp: '127.0.0.1',
        apiId: event.requestContext.apiId,
      });
      expect(entry.requestTimeEpoch).toBe(event.requestContext.timeEpoch);
      expect(headers).toMatchObject({ authorization: 'Bearer token' });
    });

    it('logs both formats of the same call with the same identifying fields', () => {
      const { v1, v2 } = createMockFetch(description);
      const context = createMockContext();

      logApiGatewayEvent(v1, context);
      logApiGatewayEventV2(v2, context);

      const [entryV1, , entryV2] = records();
      expect(entryV1.httpMethod).toBe(entryV2.httpMethod);
      expect(entryV1.path).toBe(entryV2.path);
      expect(entryV1.stage).toBe(entryV2.stage);
      expect(entryV1.sourceIp).toBe(entryV2.sourceIp);
      expect(entryV1.userAgent).toBe(entryV2.userAgent);
      expect(entryV1.requestTimeEpoch).toBe(entryV2.requestTimeEpoch);
    });

    it('logs the bare default events, which carry no query or path parameter', () => {
      const context = createMockContext();

      expect(() => logApiGatewayEvent(createMockEventV1(), context)).not.toThrow();
      expect(() => logApiGatewayEventV2(createMockEventV2(), context)).not.toThrow();
      expect(records()).toHaveLength(4);
    });
  });

  describe('createMockContext with a handler that watches its time budget', () => {
    /** Mirrors what a runtime log collector does before deciding to flush. */
    const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<string> => {
      const params = extractEventParams<{ id: string }>(
        { pathParameters: { id: { label: 'User ID', required: true } } },
        event
      );

      return context.getRemainingTimeInMillis() < 1_000 ? 'flush' : `ok:${params.id}`;
    };

    it('lets the test drive the branch it wants', async () => {
      const event = createMockEventV1({ path: '/users/:id', pathParameters: { id: '42' } });

      await expect(handler(event, createMockContext())).resolves.toBe('ok:42');
      await expect(
        handler(event, createMockContext({ getRemainingTimeInMillis: 500 }))
      ).resolves.toBe('flush');
    });
  });
});
