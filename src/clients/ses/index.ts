import { SESClient } from '@aws-sdk/client-ses';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new SESClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SES'),
    })
);

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
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return withRetry(
      { service: 'ses', command: command?.constructor?.name },
      () => lazyClient.get().send(command as never) as Promise<CommandOutput<C>>,
      retryOptions
    );
  },
};
