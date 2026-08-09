import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize OpenSearch client from environment variables
const client = new OpenSearchClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_OPENSEARCH'),
});

/**
 * OpenSearch client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/opensearch when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { openSearchClient } from 'awpaki/clients/opensearch';
 * import { ListDomainNamesCommand } from '@aws-sdk/client-opensearch';
 *
 * const result = await openSearchClient.execute(new ListDomainNamesCommand({}));
 *
 * // With custom retry options
 * const retried = await openSearchClient.execute(new ListDomainNamesCommand({}), { retries: 5 });
 * ```
 */
export const openSearchClient = {
  /**
   * Executes a OpenSearch command with automatic retry logic.
   *
   * @param command - OpenSearch command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    const options = { ...defaultRetryOptions, ...retryOptions };

    return retry(
      async () => {
        const result = await client.send(command);
        return result as T;
      },
      {
        retries: options.retries,
        minTimeout: options.minTimeout,
        maxTimeout: options.maxTimeout,
      }
    );
  },
};
