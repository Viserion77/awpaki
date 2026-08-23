import { IoTClient } from '@aws-sdk/client-iot';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new IoTClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_IOT'),
    })
);

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
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return withRetry(
      { service: 'iot', command: command?.constructor?.name },
      () => lazyClient.get().send(command as never) as Promise<CommandOutput<C>>,
      retryOptions
    );
  },
};
