import { S3Client } from '@aws-sdk/client-s3';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new S3Client({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_S3'),
    })
);

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
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return withRetry(
      { service: 's3', command: command?.constructor?.name },
      () => lazyClient.get().send(command as never) as Promise<CommandOutput<C>>,
      retryOptions
    );
  },
};
