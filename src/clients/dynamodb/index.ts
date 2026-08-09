import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize DynamoDB client from environment variables
const client = new DynamoDBClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_DYNAMODB'),
});

const docClient = DynamoDBDocumentClient.from(client);

/**
 * DynamoDB client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { dynamodbClient } from 'awpaki/clients/dynamodb';
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
 * const retried = await dynamodbClient.execute(
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
