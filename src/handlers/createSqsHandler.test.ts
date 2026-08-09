import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { createSqsHandler } from './createSqsHandler';
import type { CreateSqsHandlerOptions, SqsHandlerInput } from './createSqsHandler';
import { resetHandlerLogCollector, setHandlerLogCollector } from './logCollector';
import { NotFound } from '../errors';
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
    functionName: 'sqs-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:sqs-function',
    memoryLimitInMB: '128',
    awsRequestId: 'request-id-1',
    logGroupName: '/aws/lambda/sqs-function',
    logStreamName: '2026/08/08/[$LATEST]abcdef',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  }) as Context;

const createMockRecord = (messageId: string, body: string): SQSRecord =>
  ({
    messageId,
    receiptHandle: `receipt-${messageId}`,
    body,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '1754654400000',
      SenderId: 'AIDAIENQZJOLO23YVJ4VO',
      ApproximateFirstReceiveTimestamp: '1754654400001',
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:orders',
    awsRegion: 'us-east-1',
  }) as unknown as SQSRecord;

const createMockEvent = (records: SQSRecord[]): SQSEvent => ({ Records: records });

const orderSchema = {
  body: {
    orderId: { label: 'Order ID', required: true, expectedType: ParameterType.STRING },
  },
};

describe('createSqsHandler', () => {
  it('processes every record and reports no failures on the happy path', async () => {
    const execute = jest.fn((_input: SqsHandlerInput<{ orderId: string }>) => undefined);
    const handler = createSqsHandler<{ orderId: string }>({ schema: orderSchema, execute });

    const event = createMockEvent([
      createMockRecord('msg-1', JSON.stringify({ orderId: 'a' })),
      createMockRecord('msg-2', JSON.stringify({ orderId: 'b' })),
    ]);
    const context = createMockContext();
    const response = await handler(event, context);

    expect(response).toEqual({ batchItemFailures: [] });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toMatchObject({
      params: { orderId: 'a' },
      body: { orderId: 'a' },
      event,
      context,
    });
    expect(execute.mock.calls[0][0].record.messageId).toBe('msg-1');
    expect(infoOutput[0][1]).toBe('Entry SQS Event sqs-function:request-id-1');
  });

  it('processes records sequentially, in delivery order', async () => {
    const seen: string[] = [];
    const handler = createSqsHandler({
      execute: async ({ record }) => {
        await new Promise((resolve) => setTimeout(resolve, record.messageId === 'msg-1' ? 5 : 0));
        seen.push(record.messageId);
      },
    });

    await handler(
      createMockEvent([
        createMockRecord('msg-1', '{}'),
        createMockRecord('msg-2', '{}'),
        createMockRecord('msg-3', '{}'),
      ]),
      createMockContext()
    );

    expect(seen).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('returns an empty partial batch response for an empty batch', async () => {
    const execute = jest.fn();
    const handler = createSqsHandler({ execute });

    const response = await handler(createMockEvent([]), createMockContext());

    expect(response).toEqual({ batchItemFailures: [] });
    expect(execute).not.toHaveBeenCalled();
  });

  describe('partial batch response', () => {
    it('fails only the record whose body is not valid JSON', async () => {
      const execute = jest.fn();
      const handler = createSqsHandler<{ orderId: string }>({ schema: orderSchema, execute });

      const response = await handler(
        createMockEvent([
          createMockRecord('msg-good', JSON.stringify({ orderId: 'a' })),
          createMockRecord('msg-bad', 'not json at all'),
          createMockRecord('msg-good-2', JSON.stringify({ orderId: 'c' })),
        ]),
        createMockContext()
      );

      expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-bad' }] });
      expect(execute).toHaveBeenCalledTimes(2);
      expect(errorOutput[0][0]).toMatchObject({ messageId: 'msg-bad' });
      expect(errorOutput[0][1]).toBe('SQS Record failed sqs-function:msg-bad');
    });

    it('fails only the record that violates the schema', async () => {
      const execute = jest.fn();
      const handler = createSqsHandler<{ orderId: string }>({ schema: orderSchema, execute });

      const response = await handler(
        createMockEvent([
          createMockRecord('msg-1', JSON.stringify({ orderId: 'a' })),
          createMockRecord('msg-2', JSON.stringify({ nope: true })),
          createMockRecord('msg-3', JSON.stringify({ orderId: 42 })),
        ]),
        createMockContext()
      );

      expect(response).toEqual({
        batchItemFailures: [{ itemIdentifier: 'msg-2' }, { itemIdentifier: 'msg-3' }],
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not let a record thrown from execute abort the ones that follow', async () => {
      const processed: string[] = [];
      const handler = createSqsHandler({
        execute: ({ record }) => {
          if (record.messageId === 'msg-2') throw new NotFound('Order not found');
          processed.push(record.messageId);
        },
      });

      const response = await handler(
        createMockEvent([
          createMockRecord('msg-1', '{}'),
          createMockRecord('msg-2', '{}'),
          createMockRecord('msg-3', '{}'),
        ]),
        createMockContext()
      );

      expect(processed).toEqual(['msg-1', 'msg-3']);
      expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-2' }] });
    });

    it('catches non-HttpError failures too, instead of failing the whole batch', async () => {
      const handler = createSqsHandler({
        execute: async ({ record }) => {
          if (record.messageId === 'msg-2') throw new TypeError('boom');
          await Promise.resolve();
        },
      });

      const response = await handler(
        createMockEvent([createMockRecord('msg-1', '{}'), createMockRecord('msg-2', '{}')]),
        createMockContext()
      );

      expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-2' }] });
      expect(errorOutput[0][0].err).toBeInstanceOf(TypeError);
    });

    it('reports every failed record when the whole batch is bad', async () => {
      const handler = createSqsHandler({
        execute: () => {
          throw new Error('always fails');
        },
      });

      const response = await handler(
        createMockEvent([createMockRecord('msg-1', '{}'), createMockRecord('msg-2', '{}')]),
        createMockContext()
      );

      expect(response).toEqual({
        batchItemFailures: [{ itemIdentifier: 'msg-1' }, { itemIdentifier: 'msg-2' }],
      });
    });
  });

  describe('body parsing', () => {
    it('hands the raw string body to execute when parseBody is false', async () => {
      const execute = jest.fn((_input: SqsHandlerInput<Record<string, unknown>>) => undefined);
      const handler = createSqsHandler({ parseBody: false, execute });

      const response = await handler(
        createMockEvent([createMockRecord('msg-1', 'plain text payload')]),
        createMockContext()
      );

      expect(response).toEqual({ batchItemFailures: [] });
      expect(execute.mock.calls[0][0].body).toBe('plain text payload');
      expect(execute.mock.calls[0][0].record.body).toBe('plain text payload');
    });

    it('exposes the unparsed text to the schema as rawBody when parseBody is false', async () => {
      const handler = createSqsHandler<{ rawBody: string }>({
        parseBody: false,
        schema: {
          rawBody: { label: 'Raw body', required: true, expectedType: ParameterType.STRING },
        },
        execute: ({ params }) => {
          expect(params.rawBody).toBe('plain text payload');
        },
      });

      const response = await handler(
        createMockEvent([createMockRecord('msg-1', 'plain text payload')]),
        createMockContext()
      );

      expect(response).toEqual({ batchItemFailures: [] });
    });

    it('exposes record fields to the schema alongside the parsed body', async () => {
      const handler = createSqsHandler<{ orderId: string; messageId: string }>({
        schema: {
          ...orderSchema,
          messageId: { label: 'Message ID', required: true, expectedType: ParameterType.STRING },
        },
        execute: ({ params }) => {
          expect(params).toEqual({ orderId: 'a', messageId: 'msg-1' });
        },
      });

      const response = await handler(
        createMockEvent([createMockRecord('msg-1', JSON.stringify({ orderId: 'a' }))]),
        createMockContext()
      );

      expect(response).toEqual({ batchItemFailures: [] });
    });
  });

  it('rejects at creation time when execute is not a function', () => {
    expect(() =>
      createSqsHandler({} as unknown as CreateSqsHandlerOptions<Record<string, unknown>>)
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

    const handler = createSqsHandler({
      execute: () => {
        order.push('execute');
      },
    });

    await handler(createMockEvent([createMockRecord('msg-1', '{}')]), createMockContext());

    expect(order).toEqual(['collector:before', 'execute', 'collector:after']);
  });
});
