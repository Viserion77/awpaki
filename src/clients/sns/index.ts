import { SNSClient } from '@aws-sdk/client-sns';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

// Initialize SNS client from environment variables
const client = new SNSClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_SNS || process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * SNS client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { snsClient } from 'awpaki/clients';
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
 * const result = await snsClient.execute(
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
