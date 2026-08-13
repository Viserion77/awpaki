import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { TranslateConfig } from '@aws-sdk/lib-dynamodb';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { RetryOptions } from '../index.types.js';

/**
 * Marshalling defaults of the document client.
 *
 * Only one flag is pinned, and it is pinned because the SDK is inconsistent without it: a
 * top-level attribute whose value is `undefined` is dropped silently, while the same value one
 * level down throws `Cannot convert undefined to an AttributeValue`. A field that TypeScript
 * declares optional therefore writes fine or crashes depending on where it sits in the item,
 * which is not a distinction anyone can design around.
 *
 * The other flags people reach for are left alone on purpose. `convertClassInstanceToMap` and
 * `wrapNumbers` already default to `false` in the SDK, and pinning `wrapNumbers` would only
 * look like a decision: it is the SDK's own default, and the number handling it implies (a
 * `bigint` above 2^53, which `JSON.stringify` then refuses) belongs to the caller, not here.
 */
const DEFAULT_TRANSLATE_CONFIG: TranslateConfig = {
  marshallOptions: { removeUndefinedValues: true },
};

let translateConfig: TranslateConfig = DEFAULT_TRANSLATE_CONFIG;

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new DynamoDBClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_DYNAMODB'),
    })
);

const lazyDocumentClient = createLazyClient(() =>
  DynamoDBDocumentClient.from(lazyClient.get(), translateConfig)
);

/**
 * Overrides the marshalling configuration of the document client.
 *
 * Call it during bootstrap, before the first command. The cached document client is dropped so
 * the next call rebuilds it with the new configuration.
 *
 * @param config - Translate configuration, shallow-merged over the defaults
 * @returns Nothing
 *
 * @example
 * ```typescript
 * import { configureDynamoDbClient } from 'awpaki/clients/dynamodb';
 *
 * configureDynamoDbClient({ unmarshallOptions: { wrapNumbers: true } });
 * ```
 */
export function configureDynamoDbClient(config: TranslateConfig): void {
  translateConfig = {
    ...DEFAULT_TRANSLATE_CONFIG,
    ...config,
    marshallOptions: { ...DEFAULT_TRANSLATE_CONFIG.marshallOptions, ...config.marshallOptions },
    unmarshallOptions: {
      ...DEFAULT_TRANSLATE_CONFIG.unmarshallOptions,
      ...config.unmarshallOptions,
    },
  };

  lazyDocumentClient.reset();
}

/**
 * Restores the built-in marshalling defaults. Mainly for tests.
 *
 * @returns Nothing
 */
export function resetDynamoDbConfig(): void {
  translateConfig = DEFAULT_TRANSLATE_CONFIG;
  lazyDocumentClient.reset();
}

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
   * A `ConditionalCheckFailedException` is **never** retried: it is the answer a conditional
   * write exists to produce, so it surfaces in milliseconds instead of after four attempts.
   *
   * @param command - DynamoDB command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    return withRetry(
      { service: 'dynamodb', command: command?.constructor?.name },
      () => lazyDocumentClient.get().send(command) as Promise<T>,
      retryOptions
    );
  },
};
