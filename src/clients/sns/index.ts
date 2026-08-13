import { SNSClient } from '@aws-sdk/client-sns';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new SNSClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SNS'),
    })
);

/**
 * SNS client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { snsClient } from 'awpaki/clients/sns';
 * import { PublishCommand } from '@aws-sdk/client-sns';
 *
 * const result = await snsClient.execute(
 *   new PublishCommand({
 *     TopicArn: 'arn:aws:sns:us-east-1:123456789012:MyTopic',
 *     Message: JSON.stringify({ key: 'value' }),
 *   })
 * );
 *
 * // With custom retry options
 * const retried = await snsClient.execute(
 *   new PublishCommand({ TopicArn: '...', Message: '...' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const snsClient = {
  /**
   * Executes an SNS command with automatic retry logic
   *
   * @param command - SNS command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return withRetry(
      { service: 'sns', command: command?.constructor?.name },
      () => lazyClient.get().send(command) as Promise<T>,
      retryOptions
    );
  },
};
