import { readFileSync } from 'fs';
import { join } from 'path';
import {
  defaultLogger,
  getLogger,
  resetLogSink,
  resetLogger,
  setLogSink,
  setLogger,
  toErrorLog,
} from './logger';
import type { Logger } from './logger';

/** Lines captured from process.stdout during a test. */
let stdoutLines: string[] = [];
let stdoutSpy: jest.SpyInstance;

const originalLogFormat = process.env.AWS_LAMBDA_LOG_FORMAT;

/**
 * Parses the JSON payload of a captured stdout line.
 */
const parseLine = (line: string): Record<string, any> => JSON.parse(line.replace(/\n$/, ''));

/** Last record written to stdout, already parsed. */
const lastRecord = (): Record<string, any> => parseLine(stdoutLines[stdoutLines.length - 1]);

beforeEach(() => {
  stdoutLines = [];
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    stdoutLines.push(String(chunk));
    return true;
  });
  delete process.env.AWS_LAMBDA_LOG_FORMAT;
});

afterEach(() => {
  stdoutSpy.mockRestore();
  resetLogger();
  resetLogSink();
  if (originalLogFormat === undefined) {
    delete process.env.AWS_LAMBDA_LOG_FORMAT;
  } else {
    process.env.AWS_LAMBDA_LOG_FORMAT = originalLogFormat;
  }
});

describe('getLogger / default logger', () => {
  it('returns the default logger when nothing was configured', () => {
    expect(getLogger()).toBe(defaultLogger);
  });

  it('writes a single JSON line to process.stdout', () => {
    getLogger().info({ requestId: 'req-1' }, 'handler start');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const raw = stdoutLines[0];
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trimEnd()).not.toContain('\n');

    const record = parseLine(raw);
    expect(record).toMatchObject({
      level: 'INFO',
      msg: 'handler start',
      requestId: 'req-1',
    });
  });

  it('never uses console.* (Advanced Logging Controls would double wrap the record)', () => {
    const consoleSpies = (['info', 'debug', 'warn', 'error', 'log'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {})
    );

    getLogger().info({ a: 1 }, 'a');
    getLogger().debug({ a: 1 }, 'a');
    getLogger().warn({ a: 1 }, 'a');
    getLogger().error({ a: 1 }, 'a');

    consoleSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
    expect(stdoutLines).toHaveLength(4);
  });

  it('emits the uppercase AWS applicationLogLevel label for each method', () => {
    defaultLogger.info({}, 'i');
    defaultLogger.debug({}, 'd');
    defaultLogger.warn({}, 'w');
    defaultLogger.error({}, 'e');

    expect(stdoutLines.map((line) => parseLine(line).level)).toEqual([
      'INFO',
      'DEBUG',
      'WARN',
      'ERROR',
    ]);
  });

  it('omits msg when it is not provided', () => {
    defaultLogger.info({ orderId: 42 });

    const record = lastRecord();
    expect(record).toEqual(expect.objectContaining({ level: 'INFO', orderId: 42 }));
    expect('msg' in record).toBe(false);
  });

  it('spreads object properties as top-level fields (indexable in Logs Insights)', () => {
    defaultLogger.info({ userId: 'u-1', nested: { count: 2 }, list: [1, 2] }, 'done');

    expect(lastRecord()).toMatchObject({
      level: 'INFO',
      msg: 'done',
      userId: 'u-1',
      nested: { count: 2 },
      list: [1, 2],
    });
  });

  it('ignores null and undefined payloads', () => {
    defaultLogger.info(null, 'null payload');
    defaultLogger.warn(undefined, 'undefined payload');

    expect(parseLine(stdoutLines[0])).toEqual(
      expect.objectContaining({ level: 'INFO', msg: 'null payload' })
    );
    expect(Object.keys(parseLine(stdoutLines[1])).sort()).toEqual(['level', 'msg', 'time']);
  });

  it('places arrays and primitives under data instead of spreading them', () => {
    defaultLogger.info(['a', 'b'], 'array payload');
    expect(lastRecord()).toMatchObject({ level: 'INFO', msg: 'array payload', data: ['a', 'b'] });

    defaultLogger.info('plain string');
    expect(lastRecord()).toMatchObject({ level: 'INFO', data: 'plain string' });

    defaultLogger.info(7);
    expect(lastRecord()).toMatchObject({ level: 'INFO', data: 7 });

    defaultLogger.info(false);
    expect(lastRecord()).toMatchObject({ level: 'INFO', data: false });
  });
});

describe('AWS_LAMBDA_LOG_FORMAT handling', () => {
  it('includes an ISO time when the format is not JSON', () => {
    defaultLogger.info({ a: 1 }, 'text mode');

    const { time } = lastRecord();
    expect(typeof time).toBe('string');
    expect(new Date(time).toISOString()).toBe(time);
  });

  it('includes time when the format is explicitly Text', () => {
    process.env.AWS_LAMBDA_LOG_FORMAT = 'Text';
    defaultLogger.info({ a: 1 }, 'text mode');

    expect(lastRecord().time).toBeDefined();
  });

  it('omits its own time under Advanced Logging Controls (JSON), the platform stamps it', () => {
    process.env.AWS_LAMBDA_LOG_FORMAT = 'JSON';
    defaultLogger.error({ a: 1 }, 'json mode');

    const record = lastRecord();
    expect('time' in record).toBe(false);
    expect(record).toEqual({ level: 'ERROR', msg: 'json mode', a: 1 });
  });

  it('reads the env var on every call, not at module load', () => {
    defaultLogger.info({}, 'first');
    process.env.AWS_LAMBDA_LOG_FORMAT = 'JSON';
    defaultLogger.info({}, 'second');

    expect('time' in parseLine(stdoutLines[0])).toBe(true);
    expect('time' in parseLine(stdoutLines[1])).toBe(false);
  });
});

describe('error serialization', () => {
  it('flattens an Error payload under err keeping name, message and stack', () => {
    const error = new TypeError('boom');
    defaultLogger.error(error, 'failed');

    const { err } = lastRecord();
    expect(err.name).toBe('TypeError');
    expect(err.message).toBe('boom');
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('boom');
  });

  it('keeps extra own properties and the non-enumerable cause of an Error', () => {
    const cause = new Error('root cause');
    const error = Object.assign(new Error('wrapper', { cause }), { statusCode: 502 });
    defaultLogger.error(toErrorLog(error), 'failed');

    const { err } = lastRecord();
    expect(err.statusCode).toBe(502);
    expect(err.cause).toMatchObject({ name: 'Error', message: 'root cause' });
    expect(typeof err.cause.stack).toBe('string');
  });

  it('serializes Errors nested inside a plain object payload', () => {
    defaultLogger.error({ requestId: 'r-1', err: new Error('nested') }, 'failed');

    const record = lastRecord();
    expect(record.requestId).toBe('r-1');
    expect(record.err).toMatchObject({ name: 'Error', message: 'nested' });
  });

  it('does not blow up on circular references', () => {
    const payload: Record<string, unknown> = { id: 1 };
    payload.self = payload;

    expect(() => defaultLogger.info(payload, 'circular')).not.toThrow();
    // The payload is spread into a fresh record, so the first self is expanded once
    // and only the reference below it is cut — the important part is that it terminates.
    const record = lastRecord();
    expect(record.id).toBe(1);
    expect(record.self).toEqual({ id: 1, self: '[Circular]' });
  });

  it('cuts circular references inside nested objects', () => {
    const inner: Record<string, unknown> = { name: 'inner' };
    inner.self = inner;

    expect(() => defaultLogger.info({ inner }, 'nested circular')).not.toThrow();
    expect(lastRecord().inner).toEqual({ name: 'inner', self: '[Circular]' });
  });

  it('does not blow up on a self referencing error cause', () => {
    const error = new Error('loop') as Error & { cause?: unknown };
    error.cause = error;

    expect(() => defaultLogger.error(error, 'loop')).not.toThrow();
    expect(lastRecord().err.cause).toBe('[Circular]');
  });

  it('serializes bigint, symbol and function values instead of dropping them', () => {
    defaultLogger.info(
      { big: 9007199254740993n, sym: Symbol('tag'), fn: function work() {} },
      'exotic'
    );

    const record = lastRecord();
    expect(record.big).toBe('9007199254740993');
    expect(record.sym).toBe('Symbol(tag)');
    expect(record.fn).toBe('[Function: work]');
  });

  it('falls back to a minimal line when serialization throws', () => {
    const hostile = {
      toJSON() {
        throw new Error('cannot serialize');
      },
    };

    expect(() => defaultLogger.error({ hostile }, 'boom')).not.toThrow();
    const record = lastRecord();
    expect(record.level).toBe('ERROR');
    expect(record.msg).toBe('boom');
    expect(record.logError).toContain('cannot serialize');
  });
});

describe('setLogger / resetLogger', () => {
  const createFakeLogger = (): Logger => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });

  it('replaces the logger returned by getLogger and stops writing to stdout', () => {
    const fake = createFakeLogger();
    setLogger(fake);

    expect(getLogger()).toBe(fake);

    getLogger().info({ a: 1 }, 'info msg');
    getLogger().debug({ b: 2 }, 'debug msg');
    getLogger().warn({ c: 3 }, 'warn msg');
    getLogger().error({ d: 4 }, 'error msg');

    expect(fake.info).toHaveBeenCalledWith({ a: 1 }, 'info msg');
    expect(fake.debug).toHaveBeenCalledWith({ b: 2 }, 'debug msg');
    expect(fake.warn).toHaveBeenCalledWith({ c: 3 }, 'warn msg');
    expect(fake.error).toHaveBeenCalledWith({ d: 4 }, 'error msg');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('resetLogger restores the default stdout logger', () => {
    setLogger(createFakeLogger());
    resetLogger();

    expect(getLogger()).toBe(defaultLogger);
    getLogger().info({ a: 1 }, 'back to stdout');
    expect(lastRecord()).toMatchObject({ level: 'INFO', msg: 'back to stdout', a: 1 });
  });

  it('rejects values that do not implement the four methods', () => {
    expect(() => setLogger(null as unknown as Logger)).toThrow(TypeError);
    expect(() => setLogger('logger' as unknown as Logger)).toThrow(TypeError);
    expect(() => setLogger({ info: jest.fn() } as unknown as Logger)).toThrow(
      /info, debug, warn and error/
    );
    expect(getLogger()).toBe(defaultLogger);
  });
});

describe('setLogSink / resetLogSink', () => {
  it('intercepts the serialized line and bypasses stdout', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    defaultLogger.info({ userId: 'u-9' }, 'buffered');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('\n')).toBe(false);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: 'INFO',
      msg: 'buffered',
      userId: 'u-9',
    });
  });

  it('receives one line per log call, in order', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    defaultLogger.debug({}, 'first');
    defaultLogger.error({}, 'second');

    expect(lines.map((line) => JSON.parse(line).msg)).toEqual(['first', 'second']);
    expect(lines.map((line) => JSON.parse(line).level)).toEqual(['DEBUG', 'ERROR']);
  });

  it('replaces a previously installed sink', () => {
    const first: string[] = [];
    const second: string[] = [];
    setLogSink((line) => first.push(line));
    setLogSink((line) => second.push(line));

    defaultLogger.info({}, 'only second');

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('resetLogSink sends lines back to process.stdout', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    resetLogSink();

    defaultLogger.info({ a: 1 }, 'stdout again');

    expect(lines).toHaveLength(0);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(lastRecord()).toMatchObject({ msg: 'stdout again' });
  });

  it('rejects non-function sinks', () => {
    expect(() => setLogSink(undefined as unknown as (line: string) => void)).toThrow(TypeError);
    expect(() => setLogSink('sink' as unknown as (line: string) => void)).toThrow(/function/);

    defaultLogger.info({}, 'still stdout');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it('does not affect a logger installed through setLogger', () => {
    const lines: string[] = [];
    const fake: Logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    setLogSink((line) => lines.push(line));
    setLogger(fake);

    getLogger().info({ a: 1 }, 'custom');

    expect(fake.info).toHaveBeenCalledWith({ a: 1 }, 'custom');
    expect(lines).toHaveLength(0);
  });
});

describe('toErrorLog', () => {
  it('returns the same Error reference so the stack survives serialization', () => {
    const error = new Error('kaboom');
    expect(toErrorLog(error)).toBe(error);
  });

  it('returns subclasses of Error untouched', () => {
    class HttpishError extends Error {
      constructor(public statusCode: number) {
        super('http failed');
        this.name = 'HttpishError';
      }
    }
    const error = new HttpishError(404);

    expect(toErrorLog(error)).toBe(error);
  });

  it('wraps strings', () => {
    expect(toErrorLog('boom')).toEqual({ err: 'boom' });
  });

  it('wraps plain objects', () => {
    const value = { code: 'ETIMEDOUT', retryable: true };
    expect(toErrorLog(value)).toEqual({ err: value });
  });

  it('wraps null and undefined', () => {
    expect(toErrorLog(null)).toEqual({ err: null });
    expect(toErrorLog(undefined)).toEqual({ err: undefined });
  });

  it('wraps numbers, booleans and arrays', () => {
    expect(toErrorLog(500)).toEqual({ err: 500 });
    expect(toErrorLog(false)).toEqual({ err: false });
    expect(toErrorLog(['a'])).toEqual({ err: ['a'] });
  });

  it('produces a single err field in the record for both branches', () => {
    defaultLogger.error(toErrorLog(new Error('as error')), 'first');
    expect(lastRecord().err).toMatchObject({ message: 'as error' });

    defaultLogger.error(toErrorLog('as string'), 'second');
    expect(lastRecord().err).toBe('as string');
  });
});

describe('module weight', () => {
  // Source without comments: JSDoc mentions async_hooks and console on purpose.
  const code = readFileSync(join(__dirname, 'logger.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('imports nothing (no async_hooks, no AWS SDK) so it stays a cheap entry point', () => {
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).not.toContain('async_hooks');
    expect(code).not.toContain('@aws-sdk/');
  });

  it('does not call console at all', () => {
    expect(code).not.toMatch(/console\s*\.\s*\w+/);
  });
});
