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
}
