import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import retry from 'async-retry';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion } from '../../environment';
import type { RetryOptions } from '../index.types';

// Initialize API Gateway client from environment variables
const client = new APIGatewayClient({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_API_GATEWAY'),
});

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
   * Executes a API Gateway command with automatic retry logic.
   *
   * @param command - API Gateway command to execute
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
