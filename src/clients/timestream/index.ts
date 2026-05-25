import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query';
import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint:
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_QUERY ||
    process.env.AWS_ENDPOINT_URL_TIMESTREAM ||
    process.env.AWS_ENDPOINT_URL,
});

const writeClient = new TimestreamWriteClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint:
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_WRITE ||
    process.env.AWS_ENDPOINT_URL_TIMESTREAM ||
    process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

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
 */
export const timestreamQueryClient = {
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return executeWithRetry<T>(() => queryClient.send(command), retryOptions);
  },
};

/**
 * Timestream Write client with automatic retry logic.
 *
 * Import from awpaki/clients/timestream when you need Timestream Query or Write.
 */
export const timestreamWriteClient = {
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return executeWithRetry<T>(() => writeClient.send(command), retryOptions);
  },
};
