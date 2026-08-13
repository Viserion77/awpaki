/**
 * The retry loop shared by every AWS client of the package.
 *
 * It replaces `async-retry`, which was an optional peer dependency whose absence killed a
 * per-service subpath import with a bare `MODULE_NOT_FOUND`, and which had no way to say
 * "this error will never succeed" — the clients passed no `bail`, so every deterministic
 * failure was retried to exhaustion. Both problems disappear with forty lines and no
 * dependency.
 *
 * @module clients/retry/withRetry
 */

import { defaultRetryOptions } from '../../constants/default-retry-options.js';
import { getLogger } from '../../loggers/logger.js';
import type { RetryOptions } from '../index.types.js';
import { isRetryableError } from './isRetryableError.js';

/** What the caller is doing, for the warning emitted before each sleep. */
export interface RetryContext {
  /** AWS service being called, e.g. `dynamodb` */
  service: string;
  /** Command class name, when the caller can supply one */
  command?: string;
}

/**
 * Sleeps, without keeping the event loop alive longer than the sleep itself.
 *
 * The timer is deliberately **not** `unref`ed: an unreferenced timer lets Lambda freeze the
 * container mid-backoff and thaw it during the *next* invocation, so the retry would land
 * inside a different request.
 *
 * @param ms - Milliseconds to wait
 * @returns A promise resolved after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Computes the wait before an attempt, with full jitter.
 *
 * Full jitter (`random(0, capped)`) rather than the fixed exponential envelope `async-retry`
 * used: when a throttled table releases, every retrying invocation with the same envelope
 * comes back at the same instant and throttles again. It is also what the AWS SDK's own delay
 * decider does.
 *
 * @param attempt - Zero-based attempt index that just failed
 * @param options - Merged retry options
 * @returns Milliseconds to wait
 */
function backoffMs(
  attempt: number,
  options: Required<Pick<RetryOptions, 'minTimeout' | 'maxTimeout'>> & {
    factor: number;
    jitter: 'full' | 'legacy';
  }
): number {
  const exponential = options.minTimeout * Math.pow(options.factor, attempt);
  const capped = Math.min(exponential, options.maxTimeout);

  return options.jitter === 'full' ? Math.floor(Math.random() * capped) : capped;
}

/**
 * Runs an AWS call, retrying only failures that could plausibly succeed on another attempt.
 *
 * @template T - Result of the call
 * @param context - Service and command, for the retry warnings
 * @param send - Performs one attempt
 * @param retryOptions - Overrides of {@link defaultRetryOptions}
 * @returns The result of the first successful attempt
 * @throws The last error when the attempts are exhausted, or immediately for a deterministic one
 *
 * @example
 * ```typescript
 * await withRetry({ service: 'dynamodb' }, () => docClient.send(command));
 * ```
 */
export async function withRetry<T>(
  context: RetryContext,
  send: () => Promise<T>,
  retryOptions?: RetryOptions
): Promise<T> {
  const options = { ...defaultRetryOptions, ...retryOptions };
  const retries = options.retries ?? 3;
  const minTimeout = options.minTimeout ?? 1000;
  const maxTimeout = options.maxTimeout ?? 3000;
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? 'full';
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const startedAt = Date.now();

  let attempt = 0;

  for (;;) {
    try {
      return await send();
    } catch (error) {
      const isLastAttempt = attempt >= retries;
      const outOfTime =
        options.maxElapsedMs !== undefined && Date.now() - startedAt >= options.maxElapsedMs;

      if (isLastAttempt || outOfTime || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = backoffMs(attempt, { minTimeout, maxTimeout, factor, jitter });

      // The error object itself is never logged here: `ConditionalCheckFailedException`
      // carries the item that failed the condition and `TransactionCanceledException` carries
      // one per reason, i.e. customer rows.
      getLogger().warn(
        {
          service: context.service,
          command: context.command,
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          delayMs,
          errorName: (error as { name?: unknown })?.name,
          statusCode: (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
            ?.httpStatusCode,
        },
        `Retrying ${context.service} call after a retryable failure`
      );

      await sleep(delayMs);

      if (options.signal?.aborted) {
        throw error;
      }

      attempt += 1;
    }
  }
}
