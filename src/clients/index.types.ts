/**
 * Shared type definitions for the AWS clients.
 *
 * This module is intentionally free of any runtime code and of any `@aws-sdk/*`
 * import, so it can be consumed by non-client code (such as `src/constants/`)
 * without pulling in the optional AWS peer dependencies. The one import below is
 * `@smithy/types`, a types-only package that every AWS SDK client already depends
 * on and that this package declares as a direct dependency, so it resolves even
 * for a consumer that installed no service client at all.
 */
import type { CommandIO, GetOutputType, MetadataBearer } from '@smithy/types';

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

/**
 * Any AWS SDK command, reduced to what is needed to read its output type.
 *
 * `CommandIO` is the subset of the SDK's own `Command` that carries the input and output
 * types, which is exactly what a wrapper around `send` needs: it accepts every real command
 * of every service, and rejects an object that only looks like one.
 */
export type AwsCommand = CommandIO<any, MetadataBearer>;

/**
 * The output type the SDK's own `send` would produce for the command `C`.
 *
 * Used as the return type of every `execute`, so a call site keeps the typing it would have
 * had without the wrapper — `execute(new GetCommand(...))` infers `GetCommandOutput`, with no
 * annotation to write and none to get wrong.
 *
 * @template C - The command being executed
 */
export type CommandOutput<C> = GetOutputType<C>;
