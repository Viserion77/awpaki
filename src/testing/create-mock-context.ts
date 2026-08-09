/**
 * Builder for a plausible Lambda `Context`.
 *
 * Handlers read `context.awsRequestId` for correlation, `context.functionName` for log
 * identifiers and `context.getRemainingTimeInMillis()` to decide whether there is still budget
 * to flush buffered work before the timeout. Hand written fixtures usually stop at the first
 * two and blow up on the third, so this builder always provides all of them and lets the
 * remaining time be pinned to a value — or driven by a function, when the test needs the
 * budget to shrink between calls.
 *
 * Like the event builders, it reads no environment variable and generates no random value.
 *
 * @module testing/create-mock-context
 */

import type { Context } from 'aws-lambda';

/** Function name used unless `functionName` overrides it. */
export const MOCK_FUNCTION_NAME = 'mock-function';

/** Region used to build `invokedFunctionArn`. Never read from the environment. */
export const MOCK_CONTEXT_REGION = 'us-east-1';

/** AWS account id used to build `invokedFunctionArn`. */
export const MOCK_CONTEXT_ACCOUNT_ID = '123456789012';

/** Invocation id used unless `awsRequestId` overrides it. Fixed, so assertions stay stable. */
export const MOCK_AWS_REQUEST_ID = '11111111-2222-4333-8444-555555555555';

/** Value returned by `getRemainingTimeInMillis()` unless overridden. */
export const MOCK_REMAINING_TIME_IN_MILLIS = 30_000;

/**
 * Overrides accepted by {@link createMockContext}: any `Context` field, plus a friendlier
 * `getRemainingTimeInMillis` that also accepts a fixed number of milliseconds.
 */
export interface MockContextOverrides extends Partial<Omit<Context, 'getRemainingTimeInMillis'>> {
  /**
   * Remaining time budget. A number is returned as is on every call; a function is used as the
   * implementation, which is how a shrinking budget (or a timeout) gets simulated.
   */
  getRemainingTimeInMillis?: number | (() => number);
}

/**
 * Builds a plausible Lambda `Context`.
 *
 * `invokedFunctionArn` and `logGroupName` are derived from the resolved `functionName`, so
 * overriding the name alone keeps the whole context coherent; passing them explicitly still
 * wins. Every call returns a fresh object, and the deprecated `done` / `fail` / `succeed`
 * callbacks are present as no-ops so a handler that touches them does not crash.
 *
 * @param overrides - Fields to replace in the default context
 * @returns A complete Lambda `Context`
 *
 * @example
 * ```typescript
 * const context = createMockContext();
 * context.getRemainingTimeInMillis(); // 30000
 * ```
 *
 * @example
 * ```typescript
 * // Pin the budget so the code under test takes the "not enough time left" branch
 * const context = createMockContext({ functionName: 'orders-api', getRemainingTimeInMillis: 200 });
 * context.invokedFunctionArn; // 'arn:aws:lambda:us-east-1:123456789012:function:orders-api'
 * ```
 *
 * @example
 * ```typescript
 * // Budget that shrinks on every call
 * let remaining = 3_000;
 * const context = createMockContext({ getRemainingTimeInMillis: () => (remaining -= 1_000) });
 * ```
 */
export function createMockContext(overrides: MockContextOverrides = {}): Context {
  const { getRemainingTimeInMillis, ...rest } = overrides;

  const functionName = rest.functionName ?? MOCK_FUNCTION_NAME;

  let remaining: () => number;

  if (typeof getRemainingTimeInMillis === 'function') {
    remaining = getRemainingTimeInMillis;
  } else {
    const fixed = getRemainingTimeInMillis ?? MOCK_REMAINING_TIME_IN_MILLIS;
    remaining = (): number => fixed;
  }

  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName,
    functionVersion: '$LATEST',
    invokedFunctionArn: `arn:aws:lambda:${MOCK_CONTEXT_REGION}:${MOCK_CONTEXT_ACCOUNT_ID}:function:${functionName}`,
    memoryLimitInMB: '128',
    awsRequestId: MOCK_AWS_REQUEST_ID,
    logGroupName: `/aws/lambda/${functionName}`,
    logStreamName: `2026/08/08/[$LATEST]${MOCK_AWS_REQUEST_ID.replace(/-/g, '')}`,
    done: (): void => undefined,
    fail: (): void => undefined,
    succeed: (): void => undefined,
    ...rest,
    getRemainingTimeInMillis: remaining,
  };
}
