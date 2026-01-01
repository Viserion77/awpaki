import { LambdaClient } from '@aws-sdk/client-lambda';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

// Initialize Lambda client from environment variables
const client = new LambdaClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_LAMBDA || process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * Lambda client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { lambdaClient } from 'awpaki/clients';
 * import { InvokeCommand } from '@aws-sdk/client-lambda';
 *
 * const result = await lambdaClient.execute(
 *   new InvokeCommand({
 *     FunctionName: 'my-function',
 *     Payload: JSON.stringify({ key: 'value' }),
 *   })
 * );
 *
 * // With custom retry options
 * const result = await lambdaClient.execute(
 *   new InvokeCommand({ FunctionName: 'my-function', Payload: '...' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const lambdaClient = {
  /**
   * Executes a Lambda command with automatic retry logic
   *
   * @param command - Lambda command to execute
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
