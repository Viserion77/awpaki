import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import retry from 'async-retry';
import type { RetryOptions } from '../dynamodb/index';

// Initialize Secrets Manager client from environment variables
const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER || process.env.AWS_ENDPOINT_URL,
});

const defaultRetryOptions: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 3000,
};

/**
 * Secrets Manager client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/secretsmanager when you want
 * to install only this service's optional peer dependencies.
 */
export const secretsManagerClient = {
  /**
   * Executes a Secrets Manager command with automatic retry logic.
   *
   * @param command - Secrets Manager command to execute
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
