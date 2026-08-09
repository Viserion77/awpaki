import type { Context } from 'aws-lambda';
import { createInvokeHandler, normalizeInvokePayload } from './createInvokeHandler';
import type { CreateInvokeHandlerOptions, InvokeHandlerInput } from './createInvokeHandler';
import { resetHandlerLogCollector, setHandlerLogCollector } from './logCollector';
import { BadRequest, Forbidden, HttpStatus, NotFound } from '../errors';
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
    functionName: 'invoke-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:invoke-function',
    memoryLimitInMB: '128',
    awsRequestId: 'request-id-1',
    logGroupName: '/aws/lambda/invoke-function',
    logStreamName: '2026/08/08/[$LATEST]abcdef',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  }) as Context;

const userIdSchema = {
  userId: { label: 'User ID', required: true, expectedType: ParameterType.STRING },
};

describe('normalizeInvokePayload', () => {
  it('keeps a flat payload as is', () => {
    expect(normalizeInvokePayload({ userId: '1', page: 2 })).toEqual({ userId: '1', page: 2 });
  });

  it('parses a stringified body and lifts its fields to the root', () => {
    expect(normalizeInvokePayload({ body: '{"userId":"1"}', stage: 'dev' })).toEqual({
      stage: 'dev',
      userId: '1',
      body: { userId: '1' },
    });
  });

  it('accepts a body that is already an object', () => {
    expect(normalizeInvokePayload({ body: { userId: '1' } })).toEqual({
      userId: '1',
      body: { userId: '1' },
    });
  });

  it('parses a payload delivered as a JSON string', () => {
    expect(normalizeInvokePayload('{"userId":"1"}')).toEqual({ userId: '1' });
  });

  it('treats null, undefined and blank strings as an empty payload', () => {
    expect(normalizeInvokePayload(null)).toEqual({});
    expect(normalizeInvokePayload(undefined)).toEqual({});
    expect(normalizeInvokePayload('   ')).toEqual({});
  });

  it('keeps a non-object body under `body` only, never spread into numeric keys', () => {
    expect(normalizeInvokePayload({ body: '[1,2,3]' })).toEqual({ body: [1, 2, 3] });
    expect(normalizeInvokePayload({ body: 7 })).toEqual({ body: 7 });
    expect(normalizeInvokePayload({ body: null })).toEqual({ body: null });
    expect(normalizeInvokePayload({ body: '' })).toEqual({ body: undefined });
  });

  it('lets body fields win over root fields of the same name', () => {
    expect(normalizeInvokePayload({ userId: 'root', body: '{"userId":"body"}' })).toMatchObject({
      userId: 'body',
    });
  });

  it('rejects a payload that is not a JSON object', () => {
    expect(() => normalizeInvokePayload([1, 2])).toThrow(BadRequest);
    expect(() => normalizeInvokePayload(42)).toThrow('Invoke payload must be a JSON object');
    expect(() => normalizeInvokePayload(true)).toThrow(BadRequest);
  });

  it('rejects invalid JSON in the payload and in the body', () => {
    expect(() => normalizeInvokePayload('{ not json')).toThrow(/Invalid JSON in invoke payload:/);
    expect(() => normalizeInvokePayload({ body: '{ not json' })).toThrow(
      /Invalid JSON in invoke payload body:/
    );
  });
});

describe('createInvokeHandler', () => {
  describe('payload normalization', () => {
    it('accepts the flat shape', async () => {
      const execute = jest.fn((input: InvokeHandlerInput<{ userId: string }>) => ({
        userId: input.params.userId,
      }));
      const handler = createInvokeHandler<{ userId: string }, { userId: string }>({
        schema: userIdSchema,
        execute,
      });

      const result = await handler({ userId: '1' }, createMockContext());

      expect(result).toEqual({ userId: '1' });
      expect(execute.mock.calls[0][0].payload).toEqual({ userId: '1' });
      expect(execute.mock.calls[0][0].rawPayload).toEqual({ userId: '1' });
    });

    it('accepts the { body: "<json>" } envelope with the very same schema', async () => {
      const handler = createInvokeHandler<{ userId: string }, { userId: string }>({
        schema: userIdSchema,
        execute: ({ params }) => ({ userId: params.userId }),
      });

      const result = await handler({ body: JSON.stringify({ userId: '1' }) }, createMockContext());

      expect(result).toEqual({ userId: '1' });
    });

    it('also serves a schema written against the body', async () => {
      const handler = createInvokeHandler<{ userId: string }, { userId: string }>({
        schema: { body: userIdSchema },
        execute: ({ params }) => ({ userId: params.userId }),
      });

      const fromEnvelope = await handler(
        { body: JSON.stringify({ userId: '1' }) },
        createMockContext()
      );
      const fromFlat = await handler({ body: { userId: '2' } }, createMockContext());

      expect(fromEnvelope).toEqual({ userId: '1' });
      expect(fromFlat).toEqual({ userId: '2' });
    });

    it('accepts a payload delivered as a JSON string', async () => {
      const handler = createInvokeHandler<{ userId: string }, { userId: string }>({
        schema: userIdSchema,
        execute: ({ params }) => ({ userId: params.userId }),
      });

      const result = await handler(JSON.stringify({ userId: '9' }), createMockContext());

      expect(result).toEqual({ userId: '9' });
    });

    it('reports a malformed payload as a 400 envelope', async () => {
      const execute = jest.fn();
      const handler = createInvokeHandler({ schema: userIdSchema, execute });

      const result = await handler('{ not json', createMockContext());

      expect(result).toMatchObject({
        error: 'BadRequest',
        statusCode: HttpStatus.BAD_REQUEST,
      });
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('pipeline', () => {
    it('logs the entry with the payload keys', async () => {
      const handler = createInvokeHandler({
        execute: () => ({ ok: true }),
        logConfig: { additionalData: { tenant: 'acme' } },
      });

      await handler({ userId: '1', page: 2 }, createMockContext());

      expect(infoOutput[0][1]).toBe('Entry Invoke invoke-function:request-id-1');
      expect(infoOutput[0][0]).toMatchObject({
        requestId: 'request-id-1',
        functionName: 'invoke-function',
        payloadKeys: ['userId', 'page'],
        tenant: 'acme',
      });
    });

    it('returns whatever execute returns, without serializing it', async () => {
      const handler = createInvokeHandler({
        execute: async () => {
          await Promise.resolve();
          return { nested: { count: 1 }, list: [1, 2] };
        },
      });

      const result = await handler({}, createMockContext());

      expect(result).toEqual({ nested: { count: 1 }, list: [1, 2] });
      expect(typeof result).toBe('object');
    });

    it('works without a schema', async () => {
      const handler = createInvokeHandler({
        execute: ({ params, payload }) => ({ params, payload }),
      });

      const result = await handler({ anything: true }, createMockContext());

      expect(result).toEqual({ params: {}, payload: { anything: true } });
    });

    it('turns a schema violation into a 422 envelope', async () => {
      const execute = jest.fn();
      const handler = createInvokeHandler({ schema: userIdSchema, execute });

      const result = await handler({}, createMockContext());

      expect(result).toEqual({
        error: 'UnprocessableEntity',
        message: 'User ID is required',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        data: { errors: { userId: [HttpStatus.UNPROCESSABLE_ENTITY, 'User ID is required'] } },
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it('maps a business HttpError to its own status code', async () => {
      const handler = createInvokeHandler({
        execute: () => {
          throw new NotFound('User not found');
        },
      });

      const result = await handler({}, createMockContext());

      expect(result).toMatchObject({ error: 'NotFound', statusCode: HttpStatus.NOT_FOUND });
      expect(errorOutput[0][1]).toBe('Lambda HttpError');
    });

    it('re-throws non-HttpError so Lambda can retry', async () => {
      const handler = createInvokeHandler({
        execute: () => {
          throw new TypeError('boom');
        },
      });

      await expect(handler({}, createMockContext())).rejects.toThrow('boom');
      expect(errorOutput[0][1]).toBe('Lambda Unknown Error');
    });

    it('runs authorize before execute and maps a rejection', async () => {
      const order: string[] = [];
      const execute = jest.fn(() => {
        order.push('execute');
        return { ok: true };
      });

      const allowed = createInvokeHandler({
        authorize: () => {
          order.push('authorize');
        },
        execute,
      });
      const denied = createInvokeHandler({
        authorize: async () => {
          await Promise.resolve();
          throw new Forbidden('Not allowed');
        },
        execute,
      });

      await allowed({}, createMockContext());
      const result = await denied({}, createMockContext());

      expect(order).toEqual(['authorize', 'execute']);
      expect(result).toMatchObject({ error: 'Forbidden', statusCode: HttpStatus.FORBIDDEN });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects at creation time when execute is not a function', () => {
      expect(() =>
        createInvokeHandler(
          {} as unknown as CreateInvokeHandlerOptions<Record<string, unknown>, unknown>
        )
      ).toThrow(TypeError);
    });

    it('runs inside the registered log collector', async () => {
      const order: string[] = [];
      setHandlerLogCollector((inner) => async (event, context) => {
        order.push('collector:before');
        const result = await inner(event, context);
        order.push('collector:after');
        return result;
      });

      const handler = createInvokeHandler({
        execute: () => {
          order.push('execute');
          return { ok: true };
        },
      });

      await handler({}, createMockContext());

      expect(order).toEqual(['collector:before', 'execute', 'collector:after']);
    });
  });
});
