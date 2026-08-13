/**
 * Shared type definitions for the AWS clients.
 *
 * This module is intentionally free of any runtime code and of any `@aws-sdk/*`
 * import, so it can be consumed by non-client code (such as `src/constants/`)
 * without pulling in the optional AWS peer dependencies.
 */

/**
 * Options for retry configuration
 */
export interface RetryOptions {
  /**
   * Maximum number of retries (default: 3)
   */
  retries?: number;
  /**
   * Minimum timeout between retries in milliseconds (default: 1000)
   */
  minTimeout?: number;
  /**
   * Maximum timeout between retries in milliseconds (default: 3000)
   */
  maxTimeout?: number;
  /**
   * Growth of the backoff between attempts (default: 2)
   */
  factor?: number;
  /**
   * Backoff shape (default: `'full'`).
   *
   * `'full'` waits a random slice of the computed delay, so invocations that were throttled
   * together do not all come back at the same instant. `'legacy'` waits the full computed
   * delay, which is what `async-retry` did.
   */
  jitter?: 'full' | 'legacy';
  /**
   * Replaces the built-in decision about which errors are worth another attempt.
   *
   * The default only retries throttling, transport failures and 5xx — never a deterministic
   * answer such as `ConditionalCheckFailedException`. Override it for a service whose error
   * names the classifier does not know.
   */
  shouldRetry?: (error: unknown) => boolean;
  /**
   * Gives up once this much time has elapsed since the first attempt, however many retries
   * are left. Useful when the caller has a deadline of its own (an API Gateway budget).
   */
  maxElapsedMs?: number;
  /**
   * Stops retrying when aborted. The in-flight attempt is not cancelled — that is the SDK's
   * own `abortSignal` — but no further one is started.
   */
  signal?: { aborted: boolean };
}
