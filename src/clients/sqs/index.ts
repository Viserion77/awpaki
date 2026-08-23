import { SQSClient } from '@aws-sdk/client-sqs';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new SQSClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SQS'),
    })
);

/**
 * SQS client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { sqsClient } from 'awpaki/clients/sqs';
 * import { SendMessageCommand } from '@aws-sdk/client-sqs';
 *
 * const result = await sqsClient.execute(
 *   new SendMessageCommand({
 *     QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue',
 *     MessageBody: JSON.stringify({ key: 'value' }),
 *   })
 * );
 *
 * // With custom retry options
 * const retried = await sqsClient.execute(
 *   new SendMessageCommand({ QueueUrl: '...', MessageBody: '...' }),
 *   { retries: 5, maxTimeout: 5000 }
 * );
 * ```
 */
export const sqsClient = {
  /**
   * Executes an SQS command with automatic retry logic
   *
   * @param command - SQS command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return withRetry(
      { service: 'sqs', command: command?.constructor?.name },
      () => lazyClient.get().send(command as never) as Promise<CommandOutput<C>>,
      retryOptions
    );
  },
};
