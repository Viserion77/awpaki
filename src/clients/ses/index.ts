import { SESClient } from '@aws-sdk/client-ses';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize SES client from environment variables
const client = new SESClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SES'),
});

/**
 * SES client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/ses when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { sesClient } from 'awpaki/clients/ses';
 * import { SendEmailCommand } from '@aws-sdk/client-ses';
 *
 * const command = new SendEmailCommand({
 *   Source: 'noreply@example.com',
 *   Destination: { ToAddresses: ['user@example.com'] },
 *   Message: {
 *     Subject: { Data: 'Hello' },
 *     Body: { Text: { Data: 'Hello from awpaki' } },
 *   },
 * });
 *
 * const result = await sesClient.execute(command);
 *
 * // With custom retry options
 * const retried = await sesClient.execute(command, { retries: 5 });
 * ```
 */
export const sesClient = {
  /**
   * Executes a SES command with automatic retry logic.
   *
   * @param command - SES command to execute
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
