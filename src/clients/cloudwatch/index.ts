import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

// Initialize CloudWatch client from environment variables
const client = new CloudWatchClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_CLOUDWATCH || process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * CloudWatch client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/cloudwatch when you want
 * to install only this service's optional peer dependencies.
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
