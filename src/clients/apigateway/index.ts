import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new APIGatewayClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_API_GATEWAY'),
    })
);

/**
 * API Gateway client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/apigateway when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { apiGatewayClient } from 'awpaki/clients/apigateway';
 * import { GetRestApisCommand } from '@aws-sdk/client-api-gateway';
 *
 * const result = await apiGatewayClient.execute(new GetRestApisCommand({}));
 *
 * // With custom retry options
 * const retried = await apiGatewayClient.execute(new GetRestApisCommand({}), { retries: 5 });
 * ```
 */
export const apiGatewayClient = {
  /**
   * Executes an API Gateway command with automatic retry logic.
   *
   * @param command - API Gateway command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return withRetry(
      { service: 'apigateway', command: command?.constructor?.name },
      () => lazyClient.get().send(command as never) as Promise<CommandOutput<C>>,
      retryOptions
    );
  },
};
