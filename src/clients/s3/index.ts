import { S3Client } from '@aws-sdk/client-s3';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize S3 client from environment variables
const client = new S3Client({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_S3'),
});

/**
 * S3 client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { s3Client } from 'awpaki/clients/s3';
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
 * const retried = await s3Client.execute(
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
