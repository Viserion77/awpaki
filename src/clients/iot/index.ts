import { IoTClient } from '@aws-sdk/client-iot';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize IoT Core client from environment variables
const client = new IoTClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_IOT'),
});

/**
 * IoT Core client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/iot when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { iotClient } from 'awpaki/clients/iot';
 * import { ListThingsCommand } from '@aws-sdk/client-iot';
 *
 * const result = await iotClient.execute(new ListThingsCommand({}));
 *
 * // With custom retry options
 * const retried = await iotClient.execute(new ListThingsCommand({}), { retries: 5 });
 * ```
 */
export const iotClient = {
  /**
   * Executes a IoT Core command with automatic retry logic.
   *
   * @param command - IoT Core command to execute
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
