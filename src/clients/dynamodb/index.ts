import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import retry from 'async-retry';

/**
 * Options for retry configuration
 */
export interface RetryOptions {
  /**
   * Maximum number of retries (default: 3)
   */
  retries?: number;
  /**
   * Minimum timeout between retries in milliseconds (default: 1000)
   */
  minTimeout?: number;
  /**
   * Maximum timeout between retries in milliseconds (default: 3000)
   */
  maxTimeout?: number;
}

// Initialize DynamoDB client from environment variables
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL,
});

const docClient = DynamoDBDocumentClient.from(client);

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * DynamoDB client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { dynamodbClient } from 'awpaki/clients';
 * import { GetCommand } from '@aws-sdk/lib-dynamodb';
 *
 * const result = await dynamodbClient.execute(
 *   new GetCommand({
 *     TableName: 'Users',
 *     Key: { id: '123' },
 *   })
 * );
 *
 * // With custom retry options
 * const result = await dynamodbClient.execute(
 *   new GetCommand({ TableName: 'Users', Key: { id: '123' } }),
 *   { retries: 5, minTimeout: 500 }
 * );
 * ```
 */
export const dynamodbClient = {
  /**
   * Executes a DynamoDB command with automatic retry logic
   *
   * @param command - DynamoDB command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    const options = { ...defaultRetryOptions, ...retryOptions };

    return retry(
      async () => {
        const result = await docClient.send(command);
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
