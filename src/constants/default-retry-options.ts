import type { RetryOptions } from '../clients/index.types';

/**
 * Default retry configuration shared by every AWS client of this package.
 *
 * Clients merge it with the caller options (`{ ...defaultRetryOptions, ...retryOptions }`),
 * so partial overrides keep the defaults for the fields that were not provided.
 *
 * @example
 * ```typescript
 * import { defaultRetryOptions } from 'awpaki/constants';
 *
 * defaultRetryOptions.retries; // 3
 * defaultRetryOptions.minTimeout; // 1000
 * defaultRetryOptions.maxTimeout; // 3000
 *
 * // Typical merge performed by the clients
 * const options = { ...defaultRetryOptions, ...{ retries: 5 } };
 * // => { retries: 5, minTimeout: 1000, maxTimeout: 3000 }
 * ```
 */
export const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};
