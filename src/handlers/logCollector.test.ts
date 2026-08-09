import type { Context } from 'aws-lambda';
import {
  applyLogCollector,
  getHandlerLogCollector,
  resetHandlerLogCollector,
  setHandlerLogCollector,
} from './logCollector';
import type { HandlerWrapper } from './logCollector';
import { createApiGatewayHandlerV2 } from './createApiGatewayHandlerV2';
import { getLogger, resetLogSink, withRuntimeLogCollector } from '../loggers';
import { NotFound } from '../errors';
import { createMockContext as buildMockContext, createMockEventV2 } from '../testing';

afterEach(() => {
  resetHandlerLogCollector();
  resetLogSink();
});

const createMockContext = (): Context =>
  ({
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'collector-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:collector-function',
    memoryLimitInMB: '128',
    awsRequestId: 'request-id-1',
    logGroupName: '/aws/lambda/collector-function',
    logStreamName: '2026/08/08/[$LATEST]abcdef',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  }) as Context;

describe('handler log collector seam', () => {
  it('starts with no collector registered', () => {
    expect(getHandlerLogCollector()).toBeUndefined();
  });

  it('runs the handler untouched when nothing is registered', async () => {
    const handler = jest.fn(async (event: { id: string }, context: Context) => ({
      id: event.id,
      requestId: context.awsRequestId,
    }));

    const wrapped = applyLogCollector(handler);
    const result = await wrapped({ id: '1' }, createMockContext());

    expect(result).toEqual({ id: '1', requestId: 'request-id-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('registers, exposes and removes a collector', () => {
    const wrapper = jest.fn((inner) => inner);

    setHandlerLogCollector(wrapper);
    expect(getHandlerLogCollector()).toBe(wrapper);

    resetHandlerLogCollector();
    expect(getHandlerLogCollector()).toBeUndefined();
  });

  it('rejects a collector that is not a function', () => {
    expect(() =>
      setHandlerLogCollector('nope' as unknown as HandlerWrapper<unknown, unknown>)
    ).toThrow(TypeError);
    expect(() =>
      setHandlerLogCollector(undefined as unknown as HandlerWrapper<unknown, unknown>)
    ).toThrow('setHandlerLogCollector expects a function');
  });

  it('resolves the collector on every invocation, not when the handler is built', async () => {
    const seen: string[] = [];
    const handler = async (): Promise<string> => 'ok';
    const wrapped = applyLogCollector(handler);

    // Handlers are built at module scope, before the consumer bootstraps its logging.
    await wrapped(undefined, createMockContext());

    setHandlerLogCollector((inner) => async (event, context) => {
      seen.push('collector');
      return inner(event, context);
    });

    await wrapped(undefined, createMockContext());

    expect(seen).toEqual(['collector']);
  });

  it('gives the override precedence over the registered collector', async () => {
    const used: string[] = [];
    setHandlerLogCollector((inner) => (event: unknown, context: Context) => {
      used.push('global');
      return inner(event, context);
    });

    const wrapped = applyLogCollector(
      async () => 'ok',
      (inner) => (event, context) => {
        used.push('override');
        return inner(event, context);
      }
    );

    await expect(wrapped(undefined, createMockContext())).resolves.toBe('ok');
    expect(used).toEqual(['override']);
  });

  it('lets the collector observe the result and the failure of the handler', async () => {
    const observed: string[] = [];
    setHandlerLogCollector((inner) => async (event, context) => {
      try {
        const result = await inner(event, context);
        observed.push('resolved');
        return result;
      } catch (error) {
        observed.push('rejected');
        throw error;
      }
    });

    const ok = applyLogCollector(async () => 'ok');
    const fails = applyLogCollector(async () => {
      throw new Error('boom');
    });

    await expect(ok(undefined, createMockContext())).resolves.toBe('ok');
    await expect(fails(undefined, createMockContext())).rejects.toThrow('boom');
    expect(observed).toEqual(['resolved', 'rejected']);
  });
});

/**
 * The seam exists so `withRuntimeLogCollector` (loggers) can wrap the factories
 * (handlers) without either module importing the other. Both halves compile in
 * isolation; these tests are what prove they actually fit together.
 */
describe('wired to withRuntimeLogCollector', () => {
  const emitted: string[] = [];

  // The collector owns the sink during an invocation (it is how it captures the lines),
  // so the destination is configured through its `output` option, not `setLogSink`.
  const collector: HandlerWrapper<unknown, unknown> = (handler) =>
    withRuntimeLogCollector(handler, {
      output: (line) => {
        emitted.push(line);
      },
    });

  beforeEach(() => {
    emitted.length = 0;
    setHandlerLogCollector(collector);
  });

  const levelsOf = (): string[] =>
    emitted.map((line) => (JSON.parse(line) as { level: string }).level);

  const messagesOf = (): string[] =>
    emitted.map((line) => (JSON.parse(line) as { msg?: string }).msg ?? '');

  it('drops the buffered context of a successful invocation', async () => {
    const handler = createApiGatewayHandlerV2({
      execute: async () => {
        getLogger().info({ step: 'loading' }, 'internal detail');
        return { body: { ok: true } };
      },
    });

    const response = await handler(createMockEventV2({ path: '/ok' }), buildMockContext());

    expect(response.statusCode).toBe(200);
    // The entry log and the debug line were buffered, and the invocation succeeded, so
    // nothing reached the sink: this is the whole point of the collector.
    expect(emitted).toEqual([]);
  });

  it('releases the buffered context when the invocation fails', async () => {
    const handler = createApiGatewayHandlerV2({
      execute: async () => {
        getLogger().info({ step: 'loading' }, 'internal detail');
        throw new NotFound('User not found');
      },
    });

    const response = await handler(createMockEventV2({ path: '/missing' }), buildMockContext());

    expect(response.statusCode).toBe(404);
    // The context that was held back is emitted before the line that released it.
    expect(messagesOf()).toContain('internal detail');
    expect(levelsOf()).toContain('ERROR');
    expect(messagesOf().indexOf('internal detail')).toBeLessThan(levelsOf().lastIndexOf('ERROR'));
  });

  it('applies a collector registered after the handler was created', async () => {
    resetHandlerLogCollector();

    const handler = createApiGatewayHandlerV2({
      execute: async () => {
        getLogger().info({ step: 'loading' }, 'internal detail');
        return { body: { ok: true } };
      },
    });

    // Registered only now: the seam resolves per invocation, so bootstrap order between
    // the consumer's `setHandlerLogCollector` call and its handler modules cannot matter.
    setHandlerLogCollector(collector);

    await handler(createMockEventV2({ path: '/ok' }), buildMockContext());

    expect(emitted).toEqual([]);
  });
});
