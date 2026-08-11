/**
 * Optional seam between the handler factories and a per-invocation log buffer.
 *
 * Every factory in `src/handlers` wraps the handler it returns with
 * {@link applyLogCollector}, which is the **outermost layer** of the pipeline — it
 * runs before the entry-point logger and stays around the `catch`, so a buffering
 * wrapper sees every line the invocation produces, including the error one.
 *
 * The wrapper itself is **not** implemented here. `src/loggers/runtime-log-collector`
 * is the intended provider of `withRuntimeLogCollector`, but the factories
 * must not depend on it: a handler must keep working when no collector is installed
 * (cold path, unit tests, consumers that ship their own buffering). So the collector
 * is a plain function reference, registered once with {@link setHandlerLogCollector}
 * and resolved **per invocation** — a collector installed after the handler was
 * created still applies, which matters because handlers are usually built at module
 * scope, before the consumer's bootstrap code runs.
 *
 * @module handlers/logCollector
 */

import type { Context } from 'aws-lambda';

/**
 * Shape of an AWS Lambda handler as the factories build it: always async, always
 * receiving the event and the context.
 *
 * @template TEvent - Event type delivered by the trigger
 * @template TResult - Value the handler resolves with
 */
export type LambdaHandler<TEvent, TResult> = (event: TEvent, context: Context) => Promise<TResult>;

/**
 * Function that takes a handler and returns an equivalent handler with extra
 * behaviour around it (log buffering, tracing, metrics, ...).
 *
 * @template TEvent - Event type delivered by the trigger
 * @template TResult - Value the handler resolves with
 */
export type HandlerWrapper<TEvent, TResult> = (
  handler: LambdaHandler<TEvent, TResult>
) => LambdaHandler<TEvent, TResult>;

/**
 * Internal storage type: the registered wrapper is used with every event/result
 * combination, so it is kept in its most permissive form and narrowed on use.
 */
type AnyHandlerWrapper = HandlerWrapper<any, any>;

let registeredCollector: AnyHandlerWrapper | undefined;

/**
 * Registers the wrapper applied around every handler built by the factories.
 *
 * Call it once, during bootstrap, with `withRuntimeLogCollector` (or any equivalent
 * wrapper). A per-handler `logCollector` option always wins over this global default.
 *
 * @param wrapper - Function that receives a handler and returns the wrapped handler
 * @returns Nothing
 * @throws TypeError if `wrapper` is not a function
 *
 * @example
 * ```typescript
 * import { setHandlerLogCollector } from 'awpaki/handlers';
 * import { withRuntimeLogCollector } from 'awpaki/loggers';
 *
 * setHandlerLogCollector(withRuntimeLogCollector);
 * ```
 */
export function setHandlerLogCollector(wrapper: AnyHandlerWrapper): void {
  if (typeof wrapper !== 'function') {
    throw new TypeError('setHandlerLogCollector expects a function');
  }
  registeredCollector = wrapper;
}

/**
 * Removes the wrapper installed by {@link setHandlerLogCollector}, so handlers run
 * unwrapped again. Mainly useful in tests.
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * afterEach(() => resetHandlerLogCollector());
 * ```
 */
export function resetHandlerLogCollector(): void {
  registeredCollector = undefined;
}

/**
 * Returns the wrapper currently registered, or `undefined` when handlers run
 * unwrapped.
 *
 * @returns The registered wrapper, or undefined
 *
 * @example
 * ```typescript
 * if (!getHandlerLogCollector()) {
 *   console.warn('no per-invocation log buffer installed');
 * }
 * ```
 */
export function getHandlerLogCollector(): AnyHandlerWrapper | undefined {
  return registeredCollector;
}

/**
 * Wraps a handler with the collector in effect **at invocation time**: the
 * per-handler `override` when provided, otherwise whatever
 * {@link setHandlerLogCollector} registered, otherwise nothing at all.
 *
 * @template TEvent - Event type delivered by the trigger
 * @template TResult - Value the handler resolves with
 * @param handler - Handler to wrap
 * @param override - Wrapper for this handler only, taking precedence over the global one
 * @returns A handler that resolves the wrapper on every invocation
 *
 * @example
 * ```typescript
 * const handler = applyLogCollector(async (event, context) => doWork(event, context));
 * ```
 */
export function applyLogCollector<TEvent, TResult>(
  handler: LambdaHandler<TEvent, TResult>,
  override?: HandlerWrapper<TEvent, TResult>
): LambdaHandler<TEvent, TResult> {
  return (event: TEvent, context: Context): Promise<TResult> => {
    const wrapper =
      override ?? (registeredCollector as HandlerWrapper<TEvent, TResult> | undefined);

    if (!wrapper) {
      return handler(event, context);
    }

    return wrapper(handler)(event, context);
  };
}
