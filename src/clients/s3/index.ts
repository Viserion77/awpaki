import { S3Client } from '@aws-sdk/client-s3';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

// Initialize S3 client from environment variables
const client = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * S3 client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { s3Client } from 'awpaki/clients';
 * import { GetObjectCommand } from '@aws-sdk/client-s3';
 *
 * const result = await s3Client.execute(
 *   new GetObjectCommand({
 *     Bucket: 'my-bucket',
 *     Key: 'path/to/file.json',
 *   })
 * );
 *
 * // With custom retry options
 * const result = await s3Client.execute(
 *   new GetObjectCommand({ Bucket: 'my-bucket', Key: 'file.json' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const s3Client = {
  /**
   * Executes an S3 command with automatic retry logic
   *
   * @param command - S3 command to execute
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
