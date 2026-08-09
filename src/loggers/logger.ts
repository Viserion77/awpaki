/**
 * Pluggable logging abstraction used by every awpaki helper.
 *
 * The default implementation writes **one line of JSON per log record directly to
 * `process.stdout`** — it never touches `console.*`. Under Lambda Advanced Logging
 * Controls (`AWS_LAMBDA_LOG_FORMAT=JSON`) the `console` methods are wrapped by the
 * runtime and the emitted record ends up nested inside another JSON envelope, which
 * breaks field indexing in CloudWatch Logs Insights. Writing to `stdout` is the
 * channel the platform reads in both `Text` and `JSON` modes.
 *
 * Two independent extension points are available:
 *
 * - {@link setLogger} replaces the whole logger (pino, Powertools, Winston, ...).
 * - {@link setLogSink} keeps the default formatting but redirects the already
 *   serialized line, which is the hook used by the runtime log collector.
 *
 * The module has **zero dependencies** and intentionally imports nothing (no
 * `node:async_hooks`, no AWS SDK) so it stays a cheap entry point for cold starts.
 *
 * @module loggers/logger
 */

/**
 * Log levels supported by {@link Logger}.
 */
export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

/**
 * Textual level label emitted in the `level` field. Matches the AWS
 * `applicationLogLevel` names, so Lambda Advanced Logging Controls can filter on it.
 */
export type LogLevelLabel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

/**
 * Minimal logger contract.
 *
 * Every method takes the **object first** and the message second (the pino
 * convention). The object-first order is deliberate: it is what produces JSON with
 * top-level, field-indexable properties in CloudWatch Logs Insights, instead of data
 * buried inside an interpolated string.
 */
export interface Logger {
  /**
   * Logs at INFO level.
   *
   * @param obj - Structured data merged into the log record
   * @param msg - Optional human readable message
   */
  info(obj: unknown, msg?: string): void;

  /**
   * Logs at DEBUG level.
   *
   * @param obj - Structured data merged into the log record
   * @param msg - Optional human readable message
   */
  debug(obj: unknown, msg?: string): void;

  /**
   * Logs at WARN level.
   *
   * @param obj - Structured data merged into the log record
   * @param msg - Optional human readable message
   */
  warn(obj: unknown, msg?: string): void;

  /**
   * Logs at ERROR level.
   *
   * @param obj - Structured data merged into the log record
   * @param msg - Optional human readable message
   */
  error(obj: unknown, msg?: string): void;
}

/**
 * Destination for an already serialized log line (without the trailing newline).
 */
export type LogSink = (line: string) => void;

/**
 * Value returned by {@link toErrorLog}: the `Error` itself, or any other value
 * wrapped under the `err` key.
 */
export type ErrorLog = Error | { err: unknown };

const LEVEL_LABELS: Record<LogLevel, LogLevelLabel> = {
  info: 'INFO',
  debug: 'DEBUG',
  warn: 'WARN',
  error: 'ERROR',
};

/**
 * Detects `Error` instances, including objects coming from another realm (vm
 * context, worker) where `instanceof Error` is false.
 *
 * @param value - Value to inspect
 * @returns True when the value behaves like an `Error`
 */
function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      Object.prototype.toString.call(value) === '[object Error]')
  );
}

/**
 * Converts an `Error` into a plain object preserving `name`, `message`, `stack`,
 * any extra own enumerable property (`statusCode`, `code`, ...) and `cause`
 * (which is own but non-enumerable in V8, so it needs explicit handling).
 *
 * @param error - Error to flatten
 * @returns Plain serializable representation of the error
 */
function errorToPlainObject(error: Error): Record<string, unknown> {
  const plain: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  for (const key of Object.keys(error)) {
    if (!(key in plain)) {
      plain[key] = (error as unknown as Record<string, unknown>)[key];
    }
  }

  const { cause } = error as Error & { cause?: unknown };
  if (cause !== undefined) {
    plain.cause = cause;
  }

  return plain;
}

/**
 * Serializes a record to a single JSON line. A logger must never throw, so this
 * handles errors, circular references, BigInt, symbols and functions, and falls back
 * to a minimal line when serialization still fails.
 *
 * @param record - Record to serialize
 * @returns Single line JSON string (no trailing newline)
 */
function safeStringify(record: Record<string, unknown>): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(record, function replacer(_key: string, value: unknown): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      if (isError(value)) return errorToPlainObject(value);
    }

    return value;
  });
}

/**
 * Normalizes the first logger argument into the properties merged in the log record.
 *
 * - `Error` (or error-like) becomes `{ err: <error> }`, keeping the stack.
 * - Plain objects are spread as top-level fields.
 * - Arrays and primitives are placed under `data`, since spreading them would
 *   produce meaningless numeric keys.
 * - `null` / `undefined` contribute nothing.
 *
 * @param obj - Value passed as the first logger argument
 * @returns Properties to merge into the record, or undefined when there is nothing
 */
function toRecordFields(obj: unknown): Record<string, unknown> | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (isError(obj)) return { err: obj };
  if (Array.isArray(obj)) return { data: obj };
  if (typeof obj === 'object') return { ...(obj as Record<string, unknown>) };
  return { data: obj };
}

let sink: LogSink | undefined;

/**
 * Writes a serialized line through the configured sink, falling back to
 * `process.stdout` when no sink is installed.
 *
 * @param line - Already serialized single line JSON
 */
function writeLine(line: string): void {
  if (sink) {
    sink(line);
    return;
  }
  process.stdout.write(`${line}\n`);
}

/**
 * Builds and writes the default JSON record `{ level, time?, msg?, ...obj }`.
 *
 * The `time` field is omitted when `AWS_LAMBDA_LOG_FORMAT === 'JSON'`, because the
 * platform already stamps every record in that mode and emitting it again would pay
 * for the field twice.
 *
 * @param level - Level of the record
 * @param obj - Structured data merged into the record
 * @param msg - Optional human readable message
 */
function emit(level: LogLevel, obj: unknown, msg?: string): void {
  const record: Record<string, unknown> = { level: LEVEL_LABELS[level] };

  if (process.env.AWS_LAMBDA_LOG_FORMAT !== 'JSON') {
    record.time = new Date().toISOString();
  }

  if (msg !== undefined) {
    record.msg = msg;
  }

  Object.assign(record, toRecordFields(obj));

  let line: string;
  try {
    line = safeStringify(record);
  } catch (error) {
    line = safeStringify({
      level: record.level,
      time: record.time,
      msg: record.msg,
      logError: `awpaki logger failed to serialize the record: ${
        isError(error) ? error.message : String(error)
      }`,
    });
  }

  writeLine(line);
}

/**
 * Default logger: one line of JSON per record written straight to `process.stdout`
 * (never `console.*`), routed through the sink installed by {@link setLogSink}.
 *
 * @example
 * ```typescript
 * defaultLogger.info({ requestId: 'abc' }, 'handler start');
 * // stdout: {"level":"INFO","time":"2026-08-08T12:00:00.000Z","msg":"handler start","requestId":"abc"}
 * ```
 */
export const defaultLogger: Logger = {
  info: (obj: unknown, msg?: string): void => emit('info', obj, msg),
  debug: (obj: unknown, msg?: string): void => emit('debug', obj, msg),
  warn: (obj: unknown, msg?: string): void => emit('warn', obj, msg),
  error: (obj: unknown, msg?: string): void => emit('error', obj, msg),
};

let currentLogger: Logger = defaultLogger;

/**
 * Checks that a value implements the four {@link Logger} methods.
 *
 * @param value - Value to inspect
 * @returns True when the value can be used as a logger
 */
function isLoggerLike(value: unknown): value is Logger {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (['info', 'debug', 'warn', 'error'] as const).every(
    (method) => typeof candidate[method] === 'function'
  );
}

/**
 * Replaces the logger used by every awpaki helper.
 *
 * Use it to plug pino, AWS Lambda Powertools, Winston or any adapter that satisfies
 * the {@link Logger} contract. A custom logger owns its own output, so
 * {@link setLogSink} does not apply to it.
 *
 * @param logger - Logger implementation with info/debug/warn/error methods
 * @returns Nothing
 * @throws TypeError if the value does not implement the four methods
 *
 * @example
 * ```typescript
 * import pino from 'pino';
 * import { setLogger } from 'awpaki/loggers';
 *
 * setLogger(pino());
 * ```
 */
export function setLogger(logger: Logger): void {
  if (!isLoggerLike(logger)) {
    throw new TypeError('setLogger expects an object with info, debug, warn and error methods');
  }
  currentLogger = logger;
}

/**
 * Returns the logger currently in use — the default stdout JSON logger unless
 * {@link setLogger} replaced it.
 *
 * @returns Active logger instance
 *
 * @example
 * ```typescript
 * import { getLogger } from 'awpaki/loggers';
 *
 * getLogger().info({ orderId: '42' }, 'order processed');
 * ```
 */
export function getLogger(): Logger {
  return currentLogger;
}

/**
 * Restores the built-in stdout JSON logger, discarding any {@link setLogger} call.
 * Mainly useful in tests.
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * afterEach(() => resetLogger());
 * ```
 */
export function resetLogger(): void {
  currentLogger = defaultLogger;
}

/**
 * Redirects the serialized line produced by the default logger.
 *
 * This is an indirection of **destination only**: formatting stays the same and the
 * sink receives the final single line JSON string without the trailing newline. It is
 * the hook the runtime log collector uses to buffer lines per invocation. When no sink
 * is installed the line goes to `process.stdout`.
 *
 * @param fn - Function receiving each serialized line
 * @returns Nothing
 * @throws TypeError if `fn` is not a function
 *
 * @example
 * ```typescript
 * const lines: string[] = [];
 * setLogSink((line) => lines.push(line));
 * getLogger().info({ userId: '1' }, 'buffered');
 * // lines[0] === '{"level":"INFO",...,"userId":"1"}'
 * ```
 */
export function setLogSink(fn: LogSink): void {
  if (typeof fn !== 'function') {
    throw new TypeError('setLogSink expects a function');
  }
  sink = fn;
}

/**
 * Removes the sink installed by {@link setLogSink}, sending lines back to
 * `process.stdout`.
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * afterEach(() => resetLogSink());
 * ```
 */
export function resetLogSink(): void {
  sink = undefined;
}

/**
 * Normalizes any thrown value into something the log serializer understands.
 *
 * An `Error` is returned untouched so the serializer can flatten `name`, `message`,
 * `stack` and extra properties; anything else (string, number, plain object, `null`)
 * is wrapped as `{ err: value }`. Either way the record ends up with a single `err`
 * field, which keeps CloudWatch Logs Insights queries uniform.
 *
 * @param value - Value caught in a `catch` block
 * @returns The error itself, or `{ err: value }` for non-errors
 *
 * @example
 * ```typescript
 * try {
 *   await doWork();
 * } catch (error) {
 *   getLogger().error(toErrorLog(error), 'work failed');
 * }
 * ```
 */
export function toErrorLog(value: unknown): ErrorLog {
  return isError(value) ? value : { err: value };
}
