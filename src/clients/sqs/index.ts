import { SQSClient } from '@aws-sdk/client-sqs';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize SQS client from environment variables
const client = new SQSClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SQS'),
});

/**
 * SQS client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { sqsClient } from 'awpaki/clients/sqs';
 * import { SendMessageCommand } from '@aws-sdk/client-sqs';
 *
 * const result = await sqsClient.execute(
 *   new SendMessageCommand({
 *     QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue',
 *     MessageBody: JSON.stringify({ key: 'value' }),
 *   })
 * );
 *
 * // With custom retry options
 * const retried = await sqsClient.execute(
 *   new SendMessageCommand({ QueueUrl: '...', MessageBody: '...' }),
 *   { retries: 5, maxTimeout: 5000 }
 * );
 * ```
 */
export const sqsClient = {
  /**
   * Executes an SQS command with automatic retry logic
   *
   * @param command - SQS command to execute
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
