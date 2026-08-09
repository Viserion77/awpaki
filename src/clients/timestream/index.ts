import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query';
import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Timestream splits its API in two endpoints, so the override cascade has three levels:
// the operation specific variable, then the shared AWS_ENDPOINT_URL_TIMESTREAM, then the
// global AWS_ENDPOINT_URL (appended by resolveEndpoint).
const queryClient = new TimestreamQueryClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_QUERY', 'AWS_ENDPOINT_URL_TIMESTREAM'),
});

const writeClient = new TimestreamWriteClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_WRITE', 'AWS_ENDPOINT_URL_TIMESTREAM'),
});

/**
 * Runs a Timestream send call with the retry policy of the package.
 *
 * @param send - Thunk that performs the actual `client.send(command)` call
 * @param retryOptions - Optional retry configuration merged over {@link defaultRetryOptions}
 * @returns Promise with the command result
 */
async function executeWithRetry<T>(
  send: () => Promise<unknown>,
  retryOptions?: RetryOptions
): Promise<T> {
  const options = { ...defaultRetryOptions, ...retryOptions };

  return retry(
    async () => {
      const result = await send();
      return result as T;
    },
    {
      retries: options.retries,
      minTimeout: options.minTimeout,
      maxTimeout: options.maxTimeout,
    }
  );
}

/**
 * Timestream Query client with automatic retry logic.
 *
 * Import from awpaki/clients/timestream when you need Timestream Query or Write.
 *
 * @example
 * ```typescript
 * import { timestreamQueryClient } from 'awpaki/clients/timestream';
 * import { QueryCommand } from '@aws-sdk/client-timestream-query';
 *
 * const result = await timestreamQueryClient.execute(
 *   new QueryCommand({ QueryString: 'SELECT * FROM "db"."table" LIMIT 10' })
 * );
 *
 * // With custom retry options
 * const retried = await timestreamQueryClient.execute(
 *   new QueryCommand({ QueryString: 'SELECT 1' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const timestreamQueryClient = {
  /**
   * Executes a Timestream Query command with automatic retry logic.
   *
   * @param command - Timestream Query command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return executeWithRetry<T>(() => queryClient.send(command), retryOptions);
  },
};

/**
 * Timestream Write client with automatic retry logic.
 *
 * Import from awpaki/clients/timestream when you need Timestream Query or Write.
 *
 * @example
 * ```typescript
 * import { timestreamWriteClient } from 'awpaki/clients/timestream';
 * import { WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
 *
 * const result = await timestreamWriteClient.execute(
 *   new WriteRecordsCommand({
 *     DatabaseName: 'db',
 *     TableName: 'table',
 *     Records: [{ MeasureName: 'cpu', MeasureValue: '42', Time: `${Date.now()}` }],
 *   })
 * );
 * ```
 */
export const timestreamWriteClient = {
  /**
   * Executes a Timestream Write command with automatic retry logic.
   *
   * @param command - Timestream Write command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return executeWithRetry<T>(() => writeClient.send(command), retryOptions);
  },
};
