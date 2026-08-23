import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query';
import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Timestream splits its API in two endpoints, so the override cascade has three levels:
// the operation specific variable, then the shared AWS_ENDPOINT_URL_TIMESTREAM, then the
// global AWS_ENDPOINT_URL (appended by resolveEndpoint).
// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyQueryClient = createLazyClient(
  () =>
    new TimestreamQueryClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_QUERY', 'AWS_ENDPOINT_URL_TIMESTREAM'),
    })
);

const lazyWriteClient = createLazyClient(
  () =>
    new TimestreamWriteClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_WRITE', 'AWS_ENDPOINT_URL_TIMESTREAM'),
    })
);

/**
 * Runs a Timestream send call with the retry policy of the package.
 *
 * @param send - Thunk that performs the actual `client.send(command)` call
 * @param retryOptions - Optional retry configuration merged over {@link defaultRetryOptions}
 * @returns Promise with the command result
 */
async function executeWithRetry<T>(
  send: () => Promise<unknown>,
  retryOptions?: RetryOptions,
  command?: string
): Promise<T> {
  return withRetry({ service: 'timestream', command }, () => send() as Promise<T>, retryOptions);
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
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return executeWithRetry<CommandOutput<C>>(
      () => lazyQueryClient.get().send(command as never),
      retryOptions,
      command?.constructor?.name
    );
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
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return executeWithRetry<CommandOutput<C>>(
      () => lazyWriteClient.get().send(command as never),
      retryOptions,
      command?.constructor?.name
    );
  },
};
