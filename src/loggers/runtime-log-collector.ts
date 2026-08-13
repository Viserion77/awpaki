/**
 * Per-invocation log buffer for AWS Lambda.
 *
 * {@link withRuntimeLogCollector} wraps a handler as the **outermost** layer and keeps
 * every log line produced during the invocation in memory instead of shipping it to
 * CloudWatch. The buffer is released — whole, in order — only when the invocation goes
 * wrong. On the happy path the context lines are dropped, which is where the cost of
 * CloudWatch Logs (ingestion + retention) actually comes from, without losing any
 * observability when it matters.
 *
 * The pieces that make it safe in a real Lambda:
 *
 * - the buffer lives in an `AsyncLocalStorage` store, so concurrent invocations in the
 *   same container (and any `await` chain inside one) never mix their lines;
 * - `WARN` is a fixed pass-through band: it is emitted immediately, never buffered;
 * - a **pre-timeout flush** scheduled `preTimeoutMarginMs` (2s by default) before the
 *   deadline reported by `context.getRemainingTimeInMillis()` makes the buffered lines
 *   survive a Lambda **timeout**, which is exactly the case where `finally` never runs;
 * - the flush is idempotent, so the timer and the `finally` never duplicate a line, and
 *   the timer is cleared in the `finally` so the invocation is not held open by it;
 * - `context` is optional: queue handlers invoked directly (offline, unit tests) work
 *   the same way, only without the pre-timeout timer.
 *
 * On top of the buffer, an **attribution line** can be emitted per invocation: always,
 * outside the buffer, one line per tracking key — see {@link RuntimeLogCollectorOptions.trackingKey}
 * and {@link addTrackingKey}. It is what makes per-tenant cost/usage maps possible while
 * the rest of the invocation stays silent.
 *
 * The collector installs its own sink through `setLogSink`, so it only sees lines
 * produced by the built-in logger. A logger installed with `setLogger` owns its output
 * and is left untouched.
 *
 * @module loggers/runtime-log-collector
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Callback, Context } from 'aws-lambda';
import { getLogger, setLogLevel, setLogSink, toErrorLog } from './logger.js';
import type { LogLevel, LogSink } from './logger.js';

/**
 * How long before the Lambda deadline the buffer is flushed, in milliseconds.
 *
 * Two seconds is enough for the platform to ship the lines to CloudWatch before the
 * runtime is killed, and short enough not to defeat the buffering on a normal request.
 */
export const DEFAULT_PRE_TIMEOUT_MARGIN_MS = 2000;

/**
 * `msg` of the attribution line emitted for each tracking key. Stable on purpose: it is
 * the field a CloudWatch Logs Insights query filters on.
 */
export const TRACKING_LOG_MESSAGE = 'invocation tracking';

/**
 * Default ceiling on the number of lines held per invocation.
 *
 * A thousand lines is far more context than any failure needs to be diagnosed, and at a
 * typical ~1 KB a line it bounds the buffer at about a megabyte — negligible against the
 * smallest Lambda memory setting, where an unbounded buffer over a large batch is not.
 */
export const DEFAULT_MAX_BUFFERED_LINES = 1000;

/**
 * Level that releases the buffered lines when a log record of that severity is emitted.
 *
 * - `'error'` (default) — only an `ERROR` record (or a thrown handler) opens the buffer.
 * - `'warn'` — a `WARN` record already opens it.
 */
export type ReleaseLevel = 'warn' | 'error';

/**
 * Attribution key emitted once per invocation, outside the buffer.
 */
export interface TrackingKeyOptions<TEvent = unknown> {
  /**
   * Extracts the attribution key from the event (tenant id, customer id, product,
   * ...). Called once, before the handler runs, outside the buffer. Returning
   * `undefined` or an empty string falls back to {@link TrackingKeyOptions.fallbackKey}.
   * It must not throw; if it does, the error is logged as a `WARN` and the fallback is
   * used.
   */
  resolveKey?: (event: TEvent, context?: Context) => string | undefined;

  /**
   * Key used when no other key was collected during the invocation — the "unattributed"
   * bucket. When omitted, an invocation without keys emits no tracking line at all.
   */
  fallbackKey?: string;
}

/**
 * Options of {@link withRuntimeLogCollector}.
 */
export interface RuntimeLogCollectorOptions<TEvent = unknown> {
  /**
   * Severity that releases the buffer. Defaults to `'error'`. A thrown handler always
   * releases it, regardless of this setting.
   */
  releaseOn?: ReleaseLevel;

  /**
   * Enables the per-invocation attribution line. Omit it and no tracking line is
   * emitted unless the handler calls {@link addTrackingKey} explicitly.
   */
  trackingKey?: TrackingKeyOptions<TEvent>;

  /**
   * Milliseconds before the Lambda deadline at which the buffer is flushed. Defaults to
   * {@link DEFAULT_PRE_TIMEOUT_MARGIN_MS}. Ignored when there is no `context`.
   */
  preTimeoutMarginMs?: number;

  /**
   * Final destination of every line the collector lets through (pass-through, released
   * and tracking lines). Defaults to `process.stdout`, matching the built-in logger.
   * This is the supported way to keep an application-level transport working, since the
   * collector owns the sink installed with `setLogSink`.
   */
  output?: LogSink;

  /**
   * Level the default logger is set to while the collector is installed. Defaults to
   * `'debug'`.
   *
   * The logger's own threshold is INFO, which drops DEBUG before it is ever written — and
   * DEBUG is precisely what this collector exists to hold: buffered, free on a successful
   * invocation, released as context when one fails. Leaving the two defaults to fight would
   * give a buffer with nothing worth having in it. Applied once, when the handler is wrapped;
   * pass `'info'` to keep the gate closed, or set the level yourself afterwards.
   */
  logLevel?: LogLevel;

  /**
   * Maximum number of lines held in the buffer. Defaults to
   * {@link DEFAULT_MAX_BUFFERED_LINES}.
   *
   * The buffer used to be unbounded: a handler logging per item of a large batch retained
   * every line until the invocation ended, and a 10k-record batch at ~1 KB a line is ~20 MB
   * held in a function that may only have 128 MB — where an OOM kill emits nothing at all,
   * so the buffer meant to preserve diagnostics destroys them. On overflow the **oldest**
   * lines are dropped, since the ones nearest the failure explain it best, and the count is
   * reported when the buffer is released.
   */
  maxBufferedLines?: number;
}

/**
 * Handler shape accepted by {@link withRuntimeLogCollector}: the `Handler` signature of
 * `aws-lambda` restricted to handlers that return (or resolve with) the result, since a
 * callback-style handler has nothing for the collector to await. Declaring fewer
 * parameters is fine — `(event) => ...` and `(event, context) => ...` both fit.
 */
export type CollectableHandler<TEvent = unknown, TResult = unknown> = (
  event: TEvent,
  context: Context,
  callback: Callback<TResult>
) => TResult | Promise<TResult>;

/**
 * Handler returned by {@link withRuntimeLogCollector}: always async, callable without a
 * `context` (offline, unit tests) and assignable to the `Handler<TEvent, TResult>` type
 * of `aws-lambda`.
 */
export type CollectedHandler<TEvent = unknown, TResult = unknown> = (
  event: TEvent,
  context?: Context,
  callback?: Callback<TResult>
) => Promise<TResult>;

/** Mutable state of a single invocation, kept in the AsyncLocalStorage store. */
interface InvocationState {
  /** Lines held back until the buffer is released. */
  readonly buffer: string[];
  /** True once the buffer was released (or discarded): every next line passes through. */
  flushed: boolean;
  /** True while the collector itself is logging, so its own line is never buffered. */
  bypass: boolean;
  /** True once the tracking lines were written; later keys are then emitted eagerly. */
  trackingEmitted: boolean;
  readonly releaseOn: ReleaseLevel;
  /** Keys waiting for their tracking line. */
  readonly pendingKeys: Set<string>;
  /** Keys that already produced a tracking line, used to keep one line per key. */
  readonly emittedKeys: Set<string>;
  readonly fallbackKey: string | undefined;
  readonly output: LogSink;
  readonly context: Context | undefined;
  /** Ceiling on `buffer`, so a large batch cannot retain the whole invocation in memory. */
  readonly maxBufferedLines: number;
  /** Lines dropped to stay under the ceiling, reported when the buffer is released. */
  droppedLines: number;
}

const storage = new AsyncLocalStorage<InvocationState>();

/**
 * Matches the level of a line produced by the built-in logger.
 *
 * `level` is always the first field of the record, so the level is read without paying a
 * `JSON.parse` per line. A line that does not match carries no level the collector can
 * act on and is treated as context (buffered).
 */
const LEVEL_PREFIX = /^\{"level":"([A-Z]+)"/;

/**
 * Writes a line to `process.stdout`, the same channel the built-in logger uses.
 *
 * @param line - Already serialized single line JSON
 */
function writeToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Sends a line to the configured output, never letting the destination break the
 * invocation.
 *
 * @param state - Invocation state owning the output
 * @param line - Already serialized single line JSON
 */
function emitLine(state: InvocationState, line: string): void {
  try {
    state.output(line);
  } catch {
    // A logger must never take the handler down with it.
  }
}

/**
 * Releases every buffered line, in order, and switches the invocation to pass-through.
 * Idempotent: the pre-timeout timer and the `finally` can both call it.
 *
 * @param state - Invocation state to release
 */
function releaseBuffer(state: InvocationState): void {
  if (state.flushed) return;
  state.flushed = true;

  // A gap in the released context must never be silent: without this line the log reads as a
  // complete history of the invocation when it is in fact the tail of one.
  if (state.droppedLines > 0) {
    emitLine(
      state,
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        msg: 'awpaki log buffer overflowed, oldest lines were dropped',
        droppedLines: state.droppedLines,
        maxBufferedLines: state.maxBufferedLines,
      })
    );
  }

  for (const line of state.buffer) {
    emitLine(state, line);
  }
  state.buffer.length = 0;
}

/**
 * Adds a line to the buffer, dropping the oldest ones once the ceiling is reached.
 *
 * The lines nearest the failure are the ones that explain it, so the window slides forward
 * rather than refusing new lines.
 *
 * @param state - Invocation state owning the buffer
 * @param line - Already serialized single line JSON
 */
function bufferLine(state: InvocationState, line: string): void {
  state.buffer.push(line);

  while (state.buffer.length > state.maxBufferedLines) {
    state.buffer.shift();
    state.droppedLines += 1;
  }
}

/**
 * Writes one attribution line for a key, always outside the buffer.
 *
 * @param state - Invocation state
 * @param key - Attribution key
 */
function writeTrackingLine(state: InvocationState, key: string): void {
  state.emittedKeys.add(key);

  const record: Record<string, unknown> = { trackingKey: key };
  const requestId = state.context?.awsRequestId;
  if (requestId) record.requestId = requestId;

  state.bypass = true;
  try {
    getLogger().info(record, TRACKING_LOG_MESSAGE);
  } catch {
    // A logger must never take the handler down with it.
  } finally {
    state.bypass = false;
  }
}

/**
 * Emits one line per pending key — N keys of a multi-tenant batch produce N lines — or a
 * single fallback line when the invocation collected no key at all.
 *
 * @param state - Invocation state
 */
function emitTrackingLines(state: InvocationState): void {
  const keys = [...state.pendingKeys];
  state.pendingKeys.clear();
  state.trackingEmitted = true;

  if (keys.length === 0 && state.emittedKeys.size === 0 && state.fallbackKey !== undefined) {
    keys.push(state.fallbackKey);
  }

  for (const key of keys) {
    writeTrackingLine(state, key);
  }
}

/**
 * Full flush used by the pre-timeout timer: buffered lines first, attribution lines
 * after, so a timed out invocation still lands complete in CloudWatch.
 *
 * @param state - Invocation state
 */
function flushInvocation(state: InvocationState): void {
  releaseBuffer(state);
  emitTrackingLines(state);
}

/**
 * Normalizes a key: strings only, trimmed, empty ones rejected.
 *
 * @param key - Raw key
 * @returns Trimmed key, or undefined when it carries no value
 */
function normalizeKey(key: unknown): string | undefined {
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Runs `resolveKey` outside the buffer, turning a throw into a WARN instead of failing
 * the invocation.
 *
 * @param tracking - Tracking options, if any
 * @param event - Event received by the handler
 * @param context - Lambda context, when available
 * @returns Resolved key, or undefined
 */
function resolveInitialKey<TEvent>(
  tracking: TrackingKeyOptions<TEvent> | undefined,
  event: TEvent,
  context?: Context
): string | undefined {
  const resolve = tracking?.resolveKey;
  if (typeof resolve !== 'function') return undefined;

  try {
    return normalizeKey(resolve(event, context));
  } catch (error) {
    getLogger().warn(toErrorLog(error), 'awpaki runtime log collector: resolveKey threw');
    return undefined;
  }
}

/**
 * Sink installed in the logger: buffers context lines of the running invocation and lets
 * everything else straight through.
 *
 * @param line - Already serialized single line JSON
 */
const collectorSink: LogSink = (line: string): void => {
  const state = storage.getStore();
  if (!state) {
    writeToStdout(line);
    return;
  }

  if (state.bypass || state.flushed) {
    emitLine(state, line);
    return;
  }

  const level = LEVEL_PREFIX.exec(line)?.[1];
  if (level === 'ERROR' || level === 'WARN') {
    // WARN is a fixed pass-through band; whether it also opens the buffer depends on
    // releaseOn. An ERROR always opens it.
    if (level === 'ERROR' || state.releaseOn === 'warn') {
      releaseBuffer(state);
    }
    emitLine(state, line);
    return;
  }

  bufferLine(state, line);
};

/**
 * Schedules the pre-timeout flush from the deadline reported by the Lambda context.
 *
 * @param state - Invocation state
 * @param marginMs - Milliseconds before the deadline at which to flush
 * @param context - Lambda context, when available
 * @returns Timer handle to clear, or undefined when no timer was scheduled
 */
function schedulePreTimeoutFlush(
  state: InvocationState,
  marginMs: number,
  context?: Context
): ReturnType<typeof setTimeout> | undefined {
  if (!context || typeof context.getRemainingTimeInMillis !== 'function') return undefined;

  let remaining: number;
  try {
    remaining = context.getRemainingTimeInMillis();
  } catch {
    return undefined;
  }
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return undefined;

  const delay = remaining - marginMs;
  if (delay <= 0) {
    // The remaining budget is already inside the margin: buffering would very likely
    // lose the lines, so the invocation runs in pass-through from the start.
    flushInvocation(state);
    return undefined;
  }

  const timer = setTimeout(() => {
    try {
      flushInvocation(state);
    } catch {
      // Never turn a logging problem into an unhandled exception in the runtime.
    }
  }, delay);

  // The finally clears it anyway; unref keeps a directly invoked handler (offline, test)
  // from holding the process open if it does not.
  if (typeof timer.unref === 'function') timer.unref();

  return timer;
}

/**
 * Registers an extra attribution key for the running invocation.
 *
 * This is the multi-tenant batch case: a single SQS/Kinesis invocation carrying records
 * of N tenants calls it once per tenant and produces N tracking lines, all outside the
 * buffer. Keys are de-duplicated, so calling it twice with the same key still yields one
 * line.
 *
 * Outside an invocation wrapped by {@link withRuntimeLogCollector} it is a no-op, which
 * keeps business code that calls it safe to run in a plain unit test.
 *
 * @param key - Attribution key (tenant id, customer id, ...); ignored when empty or not a string
 * @returns Nothing
 *
 * @example
 * ```typescript
 * import { addTrackingKey, withRuntimeLogCollector } from 'awpaki/loggers';
 *
 * export const handler = withRuntimeLogCollector(async (event: SQSEvent) => {
 *   for (const record of event.Records) {
 *     const { tenantId } = JSON.parse(record.body);
 *     addTrackingKey(tenantId); // one tracking line per tenant of the batch
 *   }
 * });
 * ```
 */
export function addTrackingKey(key: string): void {
  const state = storage.getStore();
  if (!state) return;

  const normalized = normalizeKey(key);
  if (normalized === undefined || state.emittedKeys.has(normalized)) return;

  if (state.trackingEmitted) {
    // The tracking lines already went out (pre-timeout flush): emit this one right away
    // instead of holding it for a flush that will not happen again.
    writeTrackingLine(state, normalized);
    return;
  }

  state.pendingKeys.add(normalized);
}

/**
 * Wraps a Lambda handler with a per-invocation log buffer.
 *
 * Wrap the handler as the **outermost** layer, so every other middleware logs inside the
 * buffer. `INFO`/`DEBUG` lines are held in memory and dropped when the invocation
 * succeeds; they are released whole and in order when the handler throws, when a record
 * of {@link RuntimeLogCollectorOptions.releaseOn} severity is logged, or when the
 * pre-timeout flush fires 2s before the deadline (the Lambda timeout case, where
 * `finally` never runs). `WARN` and `ERROR` are always emitted immediately.
 *
 * The collector installs its own sink through `setLogSink`, replacing any sink the
 * application had installed; use {@link RuntimeLogCollectorOptions.output} to route the
 * lines somewhere other than `process.stdout`. A logger installed with `setLogger` owns
 * its output and is not intercepted.
 *
 * @param handler - Handler to wrap; receives the original `event`, `context` and `callback`
 * @param options - Buffer behaviour: release level, tracking key, pre-timeout margin, output
 * @returns Async handler with the same signature, resolving/rejecting exactly like the original
 * @throws TypeError if `handler` is not a function
 *
 * @example
 * ```typescript
 * import { getLogger, withRuntimeLogCollector } from 'awpaki/loggers';
 *
 * export const handler = withRuntimeLogCollector(
 *   async (event: APIGatewayProxyEventV2) => {
 *     getLogger().info({ path: event.rawPath }, 'request received'); // buffered
 *     return { statusCode: 200, body: '{}' };                        // buffer dropped
 *   },
 *   {
 *     releaseOn: 'error',
 *     trackingKey: {
 *       resolveKey: (event) => event.headers['x-tenant-id'],
 *       fallbackKey: 'untracked',
 *     },
 *   }
 * );
 * ```
 */
export function withRuntimeLogCollector<TEvent = unknown, TResult = unknown>(
  handler: CollectableHandler<TEvent, TResult>,
  options: RuntimeLogCollectorOptions<TEvent> = {}
): CollectedHandler<TEvent, TResult> {
  if (typeof handler !== 'function') {
    throw new TypeError('withRuntimeLogCollector expects a handler function');
  }

  const releaseOn: ReleaseLevel = options.releaseOn === 'warn' ? 'warn' : 'error';
  const marginMs =
    typeof options.preTimeoutMarginMs === 'number' &&
    Number.isFinite(options.preTimeoutMarginMs) &&
    options.preTimeoutMarginMs >= 0
      ? options.preTimeoutMarginMs
      : DEFAULT_PRE_TIMEOUT_MARGIN_MS;
  const output: LogSink = typeof options.output === 'function' ? options.output : writeToStdout;
  const fallbackKey = normalizeKey(options.trackingKey?.fallbackKey);
  const maxBufferedLines =
    typeof options.maxBufferedLines === 'number' &&
    Number.isFinite(options.maxBufferedLines) &&
    options.maxBufferedLines > 0
      ? Math.floor(options.maxBufferedLines)
      : DEFAULT_MAX_BUFFERED_LINES;

  // Wrapping a handler in the collector *is* the statement that verbose records are wanted
  // and paid for only on failure, so the logger's INFO gate would otherwise discard exactly
  // what the buffer exists to keep. Done once, at wrap time rather than per invocation: the
  // threshold is process-wide, and moving it inside the invocation would let two concurrent
  // ones fight over it.
  setLogLevel(options.logLevel ?? 'debug');

  return async (
    event: TEvent,
    context?: Context,
    callback?: Callback<TResult>
  ): Promise<TResult> => {
    // Done on every invocation instead of once: the collector must stay the destination
    // of the lines even if the application (or a test) touched the sink meanwhile.
    setLogSink(collectorSink);

    const state: InvocationState = {
      buffer: [],
      maxBufferedLines,
      droppedLines: 0,
      flushed: false,
      bypass: false,
      trackingEmitted: false,
      releaseOn,
      pendingKeys: new Set<string>(),
      emittedKeys: new Set<string>(),
      fallbackKey,
      output,
      context,
    };

    // Resolved outside the store so anything resolveKey logs is not buffered.
    const initialKey = resolveInitialKey(options.trackingKey, event, context);
    if (initialKey !== undefined) state.pendingKeys.add(initialKey);

    return storage.run(state, async (): Promise<TResult> => {
      const timer = schedulePreTimeoutFlush(state, marginMs, context);

      try {
        // The cast mirrors the runtime contract: Lambda always passes a context, and a
        // handler invoked directly without one simply receives undefined, exactly as it
        // would have without the collector in the middle.
        return await handler(event, context as Context, callback as Callback<TResult>);
      } catch (error) {
        releaseBuffer(state);
        throw error;
      } finally {
        // Without this the invocation stays alive until the timer resolves.
        if (timer) clearTimeout(timer);
        emitTrackingLines(state);
        state.flushed = true;
        state.buffer.length = 0;
      }
    });
  };
}
