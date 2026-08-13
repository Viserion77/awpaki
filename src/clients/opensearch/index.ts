import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new OpenSearchClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_OPENSEARCH'),
    })
);

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
    return withRetry(
      { service: 'opensearch', command: command?.constructor?.name },
      () => lazyClient.get().send(command) as Promise<T>,
      retryOptions
    );
  },
};
