import type { Context, Handler } from 'aws-lambda';
import {
  getLogLevel,
  getLogger,
  resetLogLevel,
  resetLogSink,
  resetLogger,
  setLogSink,
  setLogger,
} from './logger.js';
import type { Logger } from './logger.js';
import {
  DEFAULT_MAX_BUFFERED_LINES,
  DEFAULT_PRE_TIMEOUT_MARGIN_MS,
  TRACKING_LOG_MESSAGE,
  addTrackingKey,
  withRuntimeLogCollector,
} from './runtime-log-collector.js';

/** Lines captured from process.stdout, already without the trailing newline. */
let lines: string[] = [];
let stdoutSpy: jest.SpyInstance;

beforeEach(() => {
  lines = [];
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    lines.push(String(chunk).replace(/\n$/, ''));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  resetLogLevel();
  resetLogger();
  resetLogSink();
  jest.useRealTimers();
});

/** Captured lines parsed as records. */
const records = (): Record<string, any>[] => lines.map((line) => JSON.parse(line));

/** `msg` of every captured line, in order. */
const messages = (): (string | undefined)[] => records().map((record) => record.msg);

/** `level` of every captured line, in order. */
const levels = (): string[] => records().map((record) => record.level);

/**
 * Minimal Lambda context: only the fields the collector actually reads.
 */
const createContext = (remainingMs = 30_000, awsRequestId = 'req-1'): Context =>
  ({
    awsRequestId,
    functionName: 'fn',
    getRemainingTimeInMillis: (): number => remainingMs,
  }) as unknown as Context;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Promise resolved from the outside, used to hold an invocation open while the fake
 * timers advance.
 */
const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('withRuntimeLogCollector — wrapping contract', () => {
  it('rejects a handler that is not a function', () => {
    expect(() => withRuntimeLogCollector(undefined as unknown as () => void)).toThrow(TypeError);
    expect(() => withRuntimeLogCollector('handler' as unknown as () => void)).toThrow(
      /expects a handler function/
    );
  });

  it('forwards event, context and callback and resolves with the handler result', async () => {
    const handler = jest.fn(async () => ({ statusCode: 200 }));
    const wrapped = withRuntimeLogCollector(handler);
    const context = createContext();
    const callback = jest.fn();

    await expect(wrapped({ id: 1 }, context, callback)).resolves.toEqual({ statusCode: 200 });
    expect(handler).toHaveBeenCalledWith({ id: 1 }, context, callback);
  });

  it('accepts the usual handler shapes and stays a drop-in for the aws-lambda Handler type', async () => {
    // Typed with a required context, which is how a Lambda handler is normally written.
    const withContext = withRuntimeLogCollector(
      async (event: { id: number }, context: Context) => `${event.id}-${context.awsRequestId}`
    );
    await expect(withContext({ id: 1 }, createContext(30_000, 'req-x'))).resolves.toBe('1-req-x');

    // Event only: a queue handler invoked directly, without a context.
    const eventOnly = withRuntimeLogCollector(async (event: { id: number }) => event.id);
    await expect(eventOnly({ id: 2 })).resolves.toBe(2);

    // Compile-time assertion: the wrapped handler can be exported as a Lambda handler.
    const asLambdaHandler: Handler<{ id: number }, string> = withContext;
    expect(typeof asLambdaHandler).toBe('function');
  });

  it('supports a synchronous handler', async () => {
    const wrapped = withRuntimeLogCollector(() => 'sync');

    await expect(wrapped({})).resolves.toBe('sync');
  });

  it('rejects with the original error instance', async () => {
    const failure = new Error('boom');
    const wrapped = withRuntimeLogCollector(async () => {
      throw failure;
    });

    await expect(wrapped({})).rejects.toBe(failure);
  });
});

describe('happy path', () => {
  it('drops every buffered context line when the invocation succeeds', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({ step: 1 }, 'first');
      getLogger().debug({ step: 2 }, 'second');
      getLogger().info({ step: 3 }, 'third');
      return 'ok';
    });

    await expect(wrapped({}, createContext())).resolves.toBe('ok');
    expect(lines).toHaveLength(0);
  });

  it('does not leak the buffer into the next invocation', async () => {
    const wrapped = withRuntimeLogCollector(async (event: { fail: boolean }) => {
      getLogger().info({}, `run-${String(event.fail)}`);
      if (event.fail) throw new Error('boom');
      return 'ok';
    });

    await wrapped({ fail: false });
    await expect(wrapped({ fail: true })).rejects.toThrow('boom');

    expect(messages()).toEqual(['run-true']);
  });

  it('keeps one buffer per concurrent invocation', async () => {
    const slowA = createDeferred<void>();
    const slowB = createDeferred<void>();
    const wrapped = withRuntimeLogCollector(
      async (event: { name: string; wait: Promise<void>; fail: boolean }) => {
        getLogger().info({}, `${event.name}-start`);
        await event.wait;
        getLogger().info({}, `${event.name}-end`);
        if (event.fail) throw new Error(`${event.name} failed`);
        return event.name;
      }
    );

    const invocationA = wrapped({ name: 'a', wait: slowA.promise, fail: true });
    const invocationB = wrapped({ name: 'b', wait: slowB.promise, fail: false });

    slowB.resolve();
    await expect(invocationB).resolves.toBe('b');
    expect(lines).toHaveLength(0);

    slowA.resolve();
    await expect(invocationA).rejects.toThrow('a failed');
    expect(messages()).toEqual(['a-start', 'a-end']);
  });

  it('buffers lines produced after an await, inside the same async context', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'before await');
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      getLogger().info({}, 'after await');
      throw new Error('boom');
    });

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(messages()).toEqual(['before await', 'after await']);
  });
});

describe('release on error', () => {
  it('releases the whole buffer, in order, when the handler throws', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({ step: 1 }, 'first');
      getLogger().debug({ step: 2 }, 'second');
      getLogger().info({ step: 3 }, 'third');
      throw new Error('boom');
    });

    await expect(wrapped({}, createContext())).rejects.toThrow('boom');

    expect(messages()).toEqual(['first', 'second', 'third']);
    expect(levels()).toEqual(['INFO', 'DEBUG', 'INFO']);
    expect(records()[0]).toMatchObject({ step: 1 });
  });

  it('releases the buffer as soon as an ERROR record is logged, even without throwing', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'context');
      getLogger().error({}, 'recovered failure');
      getLogger().info({}, 'after');
      return 'ok';
    });

    await expect(wrapped({})).resolves.toBe('ok');
    expect(messages()).toEqual(['context', 'recovered failure', 'after']);
  });

  it('emits nothing extra when the released buffer is empty', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      throw new Error('boom');
    });

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(lines).toHaveLength(0);
  });
});

describe('warn as a fixed pass-through band', () => {
  it('emits WARN immediately without releasing the buffer (releaseOn: error)', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'context');
      getLogger().warn({}, 'heads up');
      expect(messages()).toEqual(['heads up']);
      return 'ok';
    });

    await expect(wrapped({})).resolves.toBe('ok');
    expect(messages()).toEqual(['heads up']);
  });

  it('releases the buffer before the WARN line when releaseOn is warn', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'context');
        getLogger().warn({}, 'heads up');
        getLogger().info({}, 'after');
        return 'ok';
      },
      { releaseOn: 'warn' }
    );

    await expect(wrapped({})).resolves.toBe('ok');
    expect(messages()).toEqual(['context', 'heads up', 'after']);
  });

  it('keeps WARN immediate and the buffer intact until the throw (releaseOn: error)', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'first');
      getLogger().warn({}, 'heads up');
      getLogger().info({}, 'second');
      throw new Error('boom');
    });

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(messages()).toEqual(['heads up', 'first', 'second']);
  });

  it('falls back to the error level when releaseOn carries an unknown value', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'context');
        getLogger().warn({}, 'heads up');
        return 'ok';
      },
      { releaseOn: 'info' as unknown as 'warn' }
    );

    await wrapped({});
    expect(messages()).toEqual(['heads up']);
  });
});

describe('pre-timeout flush', () => {
  it('flushes the buffer 2s before the deadline reported by the context', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<string>();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'before');
      return slow.promise;
    });

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    expect(lines).toHaveLength(0);

    // 10s remaining - 2s of margin = flush at 8s.
    await jest.advanceTimersByTimeAsync(7_999);
    expect(lines).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(messages()).toEqual(['before']);

    slow.resolve('done');
    await expect(invocation).resolves.toBe('done');
    expect(messages()).toEqual(['before']);
  });

  it('exposes the 2s margin as the default', () => {
    expect(DEFAULT_PRE_TIMEOUT_MARGIN_MS).toBe(2000);
  });

  it('honours a custom preTimeoutMarginMs', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<string>();
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'before');
        return slow.promise;
      },
      { preTimeoutMarginMs: 5_000 }
    );

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(4_999);
    expect(lines).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(messages()).toEqual(['before']);

    slow.resolve('done');
    await invocation;
  });

  it('lets lines logged after the flush go straight through', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<string>();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'before');
      await slow.promise;
      getLogger().info({}, 'after');
      return 'ok';
    });

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(messages()).toEqual(['before']);

    slow.resolve('go');
    await invocation;
    expect(messages()).toEqual(['before', 'after']);
  });

  it('clears the timer in the finally so the invocation is not held open', async () => {
    jest.useFakeTimers();
    const wrapped = withRuntimeLogCollector(async () => 'ok');

    await wrapped({}, createContext(30_000));

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when the handler throws', async () => {
    jest.useFakeTimers();
    const wrapped = withRuntimeLogCollector(async () => {
      throw new Error('boom');
    });

    await expect(wrapped({}, createContext(30_000))).rejects.toThrow('boom');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not buffer at all when the remaining budget is already inside the margin', async () => {
    jest.useFakeTimers();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'immediate');
      expect(messages()).toEqual(['immediate']);
      return 'ok';
    });

    await wrapped({}, createContext(1_000));
    expect(jest.getTimerCount()).toBe(0);
    expect(messages()).toEqual(['immediate']);
  });

  it('ignores a context whose getRemainingTimeInMillis throws', async () => {
    jest.useFakeTimers();
    const context = {
      awsRequestId: 'req-throw',
      getRemainingTimeInMillis: (): number => {
        throw new Error('no deadline here');
      },
    } as unknown as Context;

    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'buffered');
      expect(jest.getTimerCount()).toBe(0);
      throw new Error('boom');
    });

    await expect(wrapped({}, context)).rejects.toThrow('boom');
    expect(messages()).toEqual(['buffered']);
  });

  it('ignores a context that does not report a numeric deadline', async () => {
    jest.useFakeTimers();
    const context = {
      awsRequestId: 'req-nan',
      getRemainingTimeInMillis: (): number => NaN,
    } as unknown as Context;

    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'buffered');
      expect(jest.getTimerCount()).toBe(0);
      throw new Error('boom');
    });

    await expect(wrapped({}, context)).rejects.toThrow('boom');
    expect(messages()).toEqual(['buffered']);
  });
});

describe('flush idempotency', () => {
  it('does not duplicate lines when the timer fires and the handler then throws', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<void>();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'first');
      getLogger().info({}, 'second');
      await slow.promise;
      throw new Error('boom');
    });

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(messages()).toEqual(['first', 'second']);

    slow.resolve();
    await expect(invocation).rejects.toThrow('boom');
    expect(messages()).toEqual(['first', 'second']);
  });

  it('does not duplicate lines when the timer fires and the handler then succeeds', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<void>();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'only once');
      await slow.promise;
      return 'ok';
    });

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8_000);

    slow.resolve();
    await expect(invocation).resolves.toBe('ok');
    expect(messages()).toEqual(['only once']);
  });
});

describe('optional context', () => {
  it('works without a context and still buffers and releases', async () => {
    jest.useFakeTimers();
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'buffered');
      expect(jest.getTimerCount()).toBe(0);
      throw new Error('boom');
    });

    await expect(wrapped({ Records: [] })).rejects.toThrow('boom');
    expect(messages()).toEqual(['buffered']);
  });

  it('works with a context missing getRemainingTimeInMillis', async () => {
    jest.useFakeTimers();
    const context = { awsRequestId: 'req-partial' } as unknown as Context;
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'buffered');
      expect(jest.getTimerCount()).toBe(0);
      return 'ok';
    });

    await expect(wrapped({}, context)).resolves.toBe('ok');
    expect(lines).toHaveLength(0);
  });
});

describe('trackingKey', () => {
  it('emits one tracking line outside the buffer even on the happy path', async () => {
    const wrapped = withRuntimeLogCollector(
      async (event: { tenant: string }) => {
        getLogger().info({ tenant: event.tenant }, 'context line');
        return 'ok';
      },
      { trackingKey: { resolveKey: (event) => event.tenant } }
    );

    await wrapped({ tenant: 'tenant-a' }, createContext(30_000, 'req-9'));

    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      level: 'INFO',
      msg: TRACKING_LOG_MESSAGE,
      trackingKey: 'tenant-a',
      requestId: 'req-9',
    });
  });

  it('passes the event and the context to resolveKey', async () => {
    const resolveKey = jest.fn(() => 'k');
    const wrapped = withRuntimeLogCollector(async () => 'ok', { trackingKey: { resolveKey } });
    const context = createContext();

    await wrapped({ id: 7 }, context);

    expect(resolveKey).toHaveBeenCalledWith({ id: 7 }, context);
  });

  it('omits requestId when there is no context', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: { fallbackKey: 'untracked' },
    });

    await wrapped({});

    expect(records()[0]).toMatchObject({ trackingKey: 'untracked' });
    expect('requestId' in records()[0]).toBe(false);
  });

  it('uses fallbackKey when resolveKey returns undefined', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: { resolveKey: () => undefined, fallbackKey: 'untracked' },
    });

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['untracked']);
  });

  it('uses fallbackKey when resolveKey returns an empty string', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: { resolveKey: () => '   ', fallbackKey: 'untracked' },
    });

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['untracked']);
  });

  it('trims the resolved key', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: { resolveKey: () => '  tenant-b  ' },
    });

    await wrapped({});

    expect(records()[0].trackingKey).toBe('tenant-b');
  });

  it('emits nothing when neither a key nor a fallback is available', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: { resolveKey: () => undefined },
    });

    await wrapped({});

    expect(lines).toHaveLength(0);
  });

  it('emits nothing when trackingKey is not configured', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok');

    await wrapped({}, createContext());

    expect(lines).toHaveLength(0);
  });

  it('logs a WARN and falls back when resolveKey throws', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok', {
      trackingKey: {
        resolveKey: () => {
          throw new Error('bad event');
        },
        fallbackKey: 'untracked',
      },
    });

    await expect(wrapped({})).resolves.toBe('ok');

    expect(levels()).toEqual(['WARN', 'INFO']);
    expect(records()[0].err).toMatchObject({ message: 'bad event' });
    expect(records()[1]).toMatchObject({ msg: TRACKING_LOG_MESSAGE, trackingKey: 'untracked' });
  });

  it('emits the tracking line after the released buffer when the handler throws', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'context line');
        throw new Error('boom');
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    await expect(wrapped({})).rejects.toThrow('boom');

    expect(messages()).toEqual(['context line', TRACKING_LOG_MESSAGE]);
  });

  it('is emitted by the pre-timeout flush and not repeated afterwards', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<void>();
    const wrapped = withRuntimeLogCollector(
      async () => {
        await slow.promise;
        return 'ok';
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(records().map((record) => record.trackingKey)).toEqual(['untracked']);

    slow.resolve();
    await invocation;
    expect(records().map((record) => record.trackingKey)).toEqual(['untracked']);
  });
});

describe('addTrackingKey', () => {
  it('emits one line per key of a multi-tenant batch', async () => {
    const wrapped = withRuntimeLogCollector(
      async (event: { records: { tenant: string }[] }) => {
        for (const record of event.records) {
          getLogger().info({ tenant: record.tenant }, 'processing');
          addTrackingKey(record.tenant);
        }
        return 'ok';
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    await wrapped({ records: [{ tenant: 'a' }, { tenant: 'b' }, { tenant: 'c' }] });

    expect(records()).toHaveLength(3);
    expect(records().map((record) => record.trackingKey)).toEqual(['a', 'b', 'c']);
    expect(records().every((record) => record.msg === TRACKING_LOG_MESSAGE)).toBe(true);
  });

  it('de-duplicates repeated keys', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        addTrackingKey('a');
        addTrackingKey('a');
        addTrackingKey(' a ');
        addTrackingKey('b');
        return 'ok';
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['a', 'b']);
  });

  it('combines the resolved key with the keys added during the invocation', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        addTrackingKey('tenant-b');
        return 'ok';
      },
      { trackingKey: { resolveKey: () => 'tenant-a', fallbackKey: 'untracked' } }
    );

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['tenant-a', 'tenant-b']);
  });

  it('suppresses the fallback line once a key was added', async () => {
    const wrapped = withRuntimeLogCollector(
      async () => {
        addTrackingKey('tenant-a');
        return 'ok';
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['tenant-a']);
  });

  it('works without any trackingKey option', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      addTrackingKey('explicit');
      return 'ok';
    });

    await wrapped({});

    expect(records().map((record) => record.trackingKey)).toEqual(['explicit']);
  });

  it('ignores empty and non-string keys', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      addTrackingKey('');
      addTrackingKey('   ');
      addTrackingKey(undefined as unknown as string);
      addTrackingKey(42 as unknown as string);
      return 'ok';
    });

    await wrapped({});

    expect(lines).toHaveLength(0);
  });

  it('is a no-op outside an invocation', () => {
    expect(() => addTrackingKey('orphan')).not.toThrow();
    expect(lines).toHaveLength(0);
  });

  it('emits immediately for keys added after the pre-timeout flush', async () => {
    jest.useFakeTimers();
    const slow = createDeferred<void>();
    const wrapped = withRuntimeLogCollector(
      async () => {
        addTrackingKey('early');
        await slow.promise;
        addTrackingKey('late');
        return 'ok';
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    const invocation = wrapped({}, createContext(10_000));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(records().map((record) => record.trackingKey)).toEqual(['early']);

    slow.resolve();
    await invocation;
    expect(records().map((record) => record.trackingKey)).toEqual(['early', 'late']);
  });

  it('keeps the tracking line out of the buffer even when the buffer is dropped', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'context line');
      addTrackingKey('tenant-a');
      getLogger().info({}, 'another context line');
      return 'ok';
    });

    await wrapped({});

    expect(messages()).toEqual([TRACKING_LOG_MESSAGE]);
  });
});

describe('sink ownership', () => {
  it('replaces a sink installed by the application', async () => {
    const applicationSink = jest.fn();
    setLogSink(applicationSink);

    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().warn({}, 'pass-through');
      return 'ok';
    });
    await wrapped({});

    expect(applicationSink).not.toHaveBeenCalled();
    expect(messages()).toEqual(['pass-through']);
  });

  it('reinstalls itself when the sink was reset between invocations', async () => {
    const wrapped = withRuntimeLogCollector(async () => {
      getLogger().info({}, 'buffered');
      throw new Error('boom');
    });

    await expect(wrapped({})).rejects.toThrow('boom');
    resetLogSink();
    lines = [];

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(messages()).toEqual(['buffered']);
  });

  it('sends lines logged outside an invocation straight to stdout', async () => {
    const wrapped = withRuntimeLogCollector(async () => 'ok');
    await wrapped({});

    getLogger().info({}, 'outside');

    expect(messages()).toEqual(['outside']);
  });

  it('routes released and tracking lines to options.output instead of stdout', async () => {
    const output = jest.fn();
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'buffered');
        getLogger().warn({}, 'immediate');
        throw new Error('boom');
      },
      { output, trackingKey: { fallbackKey: 'untracked' } }
    );

    await expect(wrapped({})).rejects.toThrow('boom');

    expect(lines).toHaveLength(0);
    const emitted = output.mock.calls.map(([line]) => JSON.parse(line as string).msg);
    expect(emitted).toEqual(['immediate', 'buffered', TRACKING_LOG_MESSAGE]);
  });

  it('survives an output that throws', async () => {
    const output = jest.fn(() => {
      throw new Error('transport down');
    });
    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({}, 'buffered');
        throw new Error('boom');
      },
      { output }
    );

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(output).toHaveBeenCalled();
  });

  it('does not intercept a logger installed with setLogger', async () => {
    const custom: Logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    setLogger(custom);

    const wrapped = withRuntimeLogCollector(
      async () => {
        getLogger().info({ a: 1 }, 'straight to the custom logger');
        throw new Error('boom');
      },
      { trackingKey: { fallbackKey: 'untracked' } }
    );

    await expect(wrapped({})).rejects.toThrow('boom');

    expect(custom.info).toHaveBeenCalledWith({ a: 1 }, 'straight to the custom logger');
    expect(custom.info).toHaveBeenCalledWith({ trackingKey: 'untracked' }, TRACKING_LOG_MESSAGE);
    expect(lines).toHaveLength(0);
  });

  it('keeps buffering under Advanced Logging Controls, where the record has no time field', async () => {
    process.env.AWS_LAMBDA_LOG_FORMAT = 'JSON';
    try {
      const wrapped = withRuntimeLogCollector(async () => {
        getLogger().info({}, 'buffered');
        getLogger().warn({}, 'immediate');
        throw new Error('boom');
      });

      await expect(wrapped({})).rejects.toThrow('boom');

      expect(messages()).toEqual(['immediate', 'buffered']);
      expect(records().every((record) => !('time' in record))).toBe(true);
    } finally {
      delete process.env.AWS_LAMBDA_LOG_FORMAT;
    }
  });

  // The logger gate defaults to INFO, which would drop DEBUG before the buffer ever saw it —
  // and DEBUG context released on failure is the entire point of the collector.
  describe('interaction with the logger level gate', () => {
    it('opens the gate to DEBUG when the handler is wrapped', () => {
      resetLogLevel();
      expect(getLogLevel()).toBe('info');

      withRuntimeLogCollector(async () => undefined);

      expect(getLogLevel()).toBe('debug');
    });

    it('buffers DEBUG lines and releases them on failure', async () => {
      const wrapped = withRuntimeLogCollector(async () => {
        getLogger().debug({ step: 1 }, 'debug context');
        throw new Error('boom');
      });

      await expect(wrapped({})).rejects.toThrow('boom');

      expect(messages()).toContain('debug context');
    });

    it('honours an explicit level instead', () => {
      withRuntimeLogCollector(async () => undefined, { logLevel: 'info' });

      expect(getLogLevel()).toBe('info');
    });
  });

  describe('buffer ceiling', () => {
    it('drops the oldest lines and keeps the ones nearest the failure', async () => {
      const wrapped = withRuntimeLogCollector(
        async () => {
          for (let index = 0; index < 5; index++) {
            getLogger().info({ index }, `line-${index}`);
          }
          throw new Error('boom');
        },
        { maxBufferedLines: 2 }
      );

      await expect(wrapped({})).rejects.toThrow('boom');

      expect(messages()).toEqual([
        'awpaki log buffer overflowed, oldest lines were dropped',
        'line-3',
        'line-4',
      ]);
    });

    it('reports how many lines were dropped, so the gap is never silent', async () => {
      const wrapped = withRuntimeLogCollector(
        async () => {
          for (let index = 0; index < 10; index++) {
            getLogger().info({ index }, `line-${index}`);
          }
          throw new Error('boom');
        },
        { maxBufferedLines: 3 }
      );

      await expect(wrapped({})).rejects.toThrow('boom');

      const overflow = records()[0];
      expect(overflow.level).toBe('WARN');
      expect(overflow.droppedLines).toBe(7);
      expect(overflow.maxBufferedLines).toBe(3);
    });

    it('says nothing when the buffer stayed under the ceiling', async () => {
      const wrapped = withRuntimeLogCollector(async () => {
        getLogger().info({}, 'only one');
        throw new Error('boom');
      });

      await expect(wrapped({})).rejects.toThrow('boom');

      expect(messages()).toEqual(['only one']);
    });

    it('defaults to DEFAULT_MAX_BUFFERED_LINES', async () => {
      const wrapped = withRuntimeLogCollector(async () => {
        for (let index = 0; index < DEFAULT_MAX_BUFFERED_LINES + 5; index++) {
          getLogger().info({ index }, `line-${index}`);
        }
        throw new Error('boom');
      });

      await expect(wrapped({})).rejects.toThrow('boom');

      expect(records()[0].droppedLines).toBe(5);
    });
  });
});
