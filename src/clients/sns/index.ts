import { SNSClient } from '@aws-sdk/client-sns';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize SNS client from environment variables
const client = new SNSClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SNS'),
});

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
