import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new CloudWatchClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_CLOUDWATCH'),
    })
);

/**
 * CloudWatch client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/cloudwatch when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { cloudWatchClient } from 'awpaki/clients/cloudwatch';
 * import { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
 *
 * const command = new PutMetricDataCommand({
 *   Namespace: 'MyApp',
 *   MetricData: [{ MetricName: 'Orders', Value: 1 }],
 * });
 *
 * const result = await cloudWatchClient.execute(command);
 *
 * // With custom retry options
 * const retried = await cloudWatchClient.execute(command, { retries: 5 });
 * ```
 */
export const cloudWatchClient = {
  /**
   * Executes a CloudWatch command with automatic retry logic.
   *
   * @param command - CloudWatch command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return withRetry(
      { service: 'cloudwatch', command: command?.constructor?.name },
      () => lazyClient.get().send(command) as Promise<T>,
      retryOptions
    );
  },
};
