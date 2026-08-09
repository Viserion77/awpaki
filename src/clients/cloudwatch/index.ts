import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize CloudWatch client from environment variables
const client = new CloudWatchClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_CLOUDWATCH'),
});

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
