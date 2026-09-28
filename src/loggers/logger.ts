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

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Level emitted when nothing is configured.
 *
 * INFO, matching the AWS default, because DEBUG is where the expensive and sensitive records
 * live: full request headers, whole message bodies, complete DynamoDB images. Filtering used
 * to be delegated entirely to Lambda Advanced Logging Controls, which meant no filtering at
 * all outside Lambda, in `Text` mode, or in any test run.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Environment variables consulted for the threshold, highest precedence first.
 *
 * `AWS_LAMBDA_LOG_LEVEL` is in the middle because Lambda sets it from the function's
 * `applicationLogLevel`: honouring it means the platform setting and the library agree by
 * default, and `AWPAKI_LOG_LEVEL` exists to disagree deliberately (a consumer using
 * `withRuntimeLogCollector` wants DEBUG produced and *buffered*, not dropped).
 */
const LEVEL_ENV_VARS = ['AWPAKI_LOG_LEVEL', 'AWS_LAMBDA_LOG_LEVEL', 'LOG_LEVEL'] as const;

let threshold: LogLevel | undefined;

/**
 * Reads the active threshold, preferring a level set in code over the environment.
 *
 * Resolved per record rather than cached: `emit` already reads `AWS_LAMBDA_LOG_FORMAT` per
 * call, a Lambda container can be reused across configuration changes, and a cached value
 * would make the level unsettable from a test that assigns `process.env` in its body.
 *
 * @returns The lowest level that is emitted
 */
function resolveThreshold(): LogLevel {
  if (threshold !== undefined) {
    return threshold;
  }

  for (const name of LEVEL_ENV_VARS) {
    const value = process.env[name]?.trim().toLowerCase();
    if (value && value in LEVEL_SEVERITY) {
      return value as LogLevel;
    }
  }

  return DEFAULT_LOG_LEVEL;
}

/**
 * Sets the lowest level the default logger emits, overriding the environment.
 *
 * @param level - Lowest level to emit
 * @returns Nothing
 * @throws TypeError if the value is not one of the four levels
 *
 * @example
 * ```typescript
 * import { setLogLevel } from 'awpaki/loggers';
 *
 * setLogLevel('debug');
 * ```
 */
export function setLogLevel(level: LogLevel): void {
  if (!(level in LEVEL_SEVERITY)) {
    throw new TypeError(
      `setLogLevel expects one of ${Object.keys(LEVEL_SEVERITY).join(', ')}, received ${JSON.stringify(level)}`
    );
  }
  threshold = level;
}

/**
 * Returns the level in force: the one set in code, else the environment, else INFO.
 *
 * @returns The active threshold
 */
export function getLogLevel(): LogLevel {
  return resolveThreshold();
}

/**
 * Clears a level set in code, restoring the environment lookup. Mainly for tests.
 *
 * @returns Nothing
 */
export function resetLogLevel(): void {
  threshold = undefined;
}

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

  // `HttpError.diagnostics` is non-enumerable for the same reason `cause` is: it must never
  // be picked up by a generic walk and end up in a response body. That also hides it from the
  // loop above, so the one place it *is* wanted — the log — has to ask for it by name.
  const { diagnostics } = error as Error & { diagnostics?: unknown };
  if (diagnostics !== undefined) {
    plain.diagnostics = diagnostics;
  }

  return plain;
}

/** Value written in place of a redacted one. */
const REDACTED = '[REDACTED]';

/**
 * Key names whose value never belongs in a log line.
 *
 * Chosen to be exact names rather than patterns, in both casings the AWS ecosystem produces:
 * a header map arrives lower-cased from API Gateway, a decoded JWT or an SDK response does
 * not. `token` is deliberately absent — a pagination or idempotency token is not a secret,
 * and redacting it by default would hide ordinary data; the named token keys are listed
 * instead.
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'cookies',
  'Cookies',
  'set-cookie',
  'Set-Cookie',
  'password',
  'Password',
  'passwd',
  'secret',
  'Secret',
  'pepper',
  'apikey',
  'apiKey',
  'ApiKey',
  'api_key',
  'x-api-key',
  'X-Api-Key',
  'X-API-Key',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'sessionToken',
  'session_token',
  'client_secret',
  'clientSecret',
  'privateKey',
  'private_key',
  'credentials',
  'Credentials',
  'SecretAccessKey',
  'secretAccessKey',
  'SessionToken',
];

let redactKeys = new Set<string>(DEFAULT_REDACT_KEYS);

/**
 * Checks a key against the redaction list.
 *
 * @param key - Property name being serialized
 * @returns True when the value must not be written
 */
function isRedactedKey(key: string): boolean {
  return redactKeys.has(key);
}

/**
 * Replaces the redaction list entirely.
 *
 * @param keys - Key names to redact, matched exactly
 * @returns Nothing
 *
 * @example
 * ```typescript
 * import { setRedactKeys, DEFAULT_REDACT_KEYS } from 'awpaki/loggers';
 *
 * setRedactKeys([...DEFAULT_REDACT_KEYS, 'taxId', 'nationalId']);
 * ```
 */
export function setRedactKeys(keys: readonly string[]): void {
  redactKeys = new Set(keys);
}

/**
 * Adds key names to the redaction list, keeping the defaults.
 *
 * @param keys - Additional key names
 * @returns Nothing
 *
 * @example
 * ```typescript
 * addRedactKeys(['taxId', 'cardNumber']);
 * ```
 */
export function addRedactKeys(keys: readonly string[]): void {
  for (const key of keys) {
    redactKeys.add(key);
  }
}

/**
 * Returns the key names currently redacted.
 *
 * @returns The active list
 */
export function getRedactKeys(): string[] {
  return [...redactKeys];
}

/**
 * Restores {@link DEFAULT_REDACT_KEYS}. Mainly for tests.
 *
 * @returns Nothing
 */
export function resetRedactKeys(): void {
  redactKeys = new Set(DEFAULT_REDACT_KEYS);
}

/**
 * Serializes a record to a single JSON line. A logger must never throw, so this
 * handles errors, circular references, BigInt, symbols and functions, redacts the values of
 * sensitive key names, and falls back to a minimal line when serialization still fails.
 *
 * @param record - Record to serialize
 * @returns Single line JSON string (no trailing newline)
 */
function safeStringify(record: Record<string, unknown>): string {
  // An *ancestor* stack, not a visited set. A `WeakSet` of everything already serialized
  // reports `[Circular]` for a value merely referenced twice — `{ err, event }` sharing one
  // sub-object is the ordinary shape of an error log — which silently deleted data that was
  // perfectly serializable. Only a value that is its own ancestor is a real cycle.
  //
  // Each frame keeps two identities because an `Error` is replaced by a plain object on the
  // way out: `holder` is what `JSON.stringify` hands to the children as `this`, `original`
  // is what a cyclic reference further down will actually point at.
  const ancestors: Array<{ holder: unknown; original: unknown }> = [];

  return JSON.stringify(record, function replacer(key: string, value: unknown): unknown {
    // The root call has an empty key and `this` is the wrapper object, so the walk starts
    // clean; every later call unwinds the stack back to the holder of this key.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1]?.holder !== this) {
      ancestors.pop();
    }

    // Redaction rides the traversal `JSON.stringify` already performs: a separate cloning
    // pass would double the cost of every record. It matches key NAMES exactly (never
    // values, never substrings — `secretId` in the Secrets Manager client is not a secret),
    // and it protects the default logger only: `setLogger(pino())` owns its own output.
    if (key !== '' && isRedactedKey(key)) {
      return REDACTED;
    }

    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;

    if (typeof value === 'object' && value !== null) {
      if (ancestors.some((frame) => frame.original === value || frame.holder === value)) {
        return '[Circular]';
      }

      if (isError(value)) {
        const plain = errorToPlainObject(value);
        ancestors.push({ holder: plain, original: value });
        return plain;
      }

      ancestors.push({ holder: value, original: value });
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
  if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[resolveThreshold()]) {
    return;
  }

  // `level` must stay the FIRST key: the runtime log collector classifies an already
  // serialized line with `/^\{"level":"([A-Z]+)"/`, so moving it silently stops WARN and
  // ERROR from passing through the buffer.
  const record: Record<string, unknown> = { level: LEVEL_LABELS[level] };

  if (process.env.AWS_LAMBDA_LOG_FORMAT === 'JSON') {
    // Advanced Logging Controls assigns level INFO to any JSON record without a valid
    // RFC 3339 timestamp — and drops the `level` field while doing it. Omitting the stamp
    // "because the platform adds one" therefore defeated the very filtering it was
    // delegating to: every DEBUG record was reclassified as INFO and ingested.
    record.timestamp = new Date().toISOString();
  } else {
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
