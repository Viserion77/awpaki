import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { GetSecretValueCommandOutput } from '@aws-sdk/client-secrets-manager';
import { resolveEndpoint, resolveRegion } from '../../environment/index.js';
import { BadRequest, NotFound, UnprocessableEntity } from '../../errors/index.js';
import { getLogger, toErrorLog } from '../../loggers/logger.js';
import { createLazyClient } from '../lazyClient.js';
import { withRetry } from '../retry/withRetry.js';
import type { AwsCommand, CommandOutput, RetryOptions } from '../index.types.js';

// Built on first use, not at import: the region and endpoint are then read from the
// environment the caller actually has, and a test can swap them with `resetAwsClients()`.
const lazyClient = createLazyClient(
  () =>
    new SecretsManagerClient({
      region: resolveRegion(),
      endpoint: resolveEndpoint('AWS_ENDPOINT_URL_SECRETS_MANAGER'),
    })
);

/**
 * Static AWS credentials stored in a secret.
 *
 * The shape is exactly the one `lambdaClient.invokeLambda({ credentials })` expects, which
 * is what closes the cross-account path: read the secret, hand the result over, done.
 */
export interface SecretAwsCredentials {
  /** AWS access key id */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Session token, present only for temporary (STS) credentials */
  sessionToken?: string;
}

/** Credential fields that must be present, as non-empty strings, in the secret JSON */
const REQUIRED_CREDENTIAL_FIELDS = ['accessKeyId', 'secretAccessKey'] as const;

/**
 * Checks whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Value to inspect
 * @returns True when the value can be read as a record
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Detects the Secrets Manager "secret does not exist" failure, by name rather than by
 * `instanceof`, so it also matches errors deserialized by another copy of the SDK.
 *
 * @param error - Value caught while reading the secret
 * @returns True when the secret does not exist
 */
function isResourceNotFound(error: unknown): boolean {
  if (!isPlainRecord(error)) return false;

  return error.name === 'ResourceNotFoundException' || error.__type === 'ResourceNotFoundException';
}

/**
 * Checks that a record holds a non-empty string under a key.
 *
 * @param record - Record to inspect
 * @param field - Key to read
 * @returns True when the field is a non-empty string
 */
function hasNonEmptyString(record: Record<string, unknown>, field: string): boolean {
  return typeof record[field] === 'string' && (record[field] as string).trim() !== '';
}

/**
 * Sends a command with automatic retry logic, sharing the configuration of
 * {@link secretsManagerClient.execute} without going through the exported object (which
 * cannot reference itself from inside its own initializer).
 *
 * @param command - Secrets Manager command to send
 * @param retryOptions - Optional retry configuration
 * @returns Promise with the command result
 */
async function sendWithRetry<T>(command: any, retryOptions?: RetryOptions): Promise<T> {
  return withRetry(
    { service: 'secretsmanager', command: command?.constructor?.name },
    () => lazyClient.get().send(command) as Promise<T>,
    retryOptions
  );
}

/**
 * Secrets Manager client with automatic retry logic.
 *
 * Import this client directly from awpaki/clients/secretsmanager when you want
 * to install only this service's optional peer dependencies.
 *
 * @example
 * ```typescript
 * import { secretsManagerClient } from 'awpaki/clients/secretsmanager';
 * import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
 *
 * const result = await secretsManagerClient.execute(
 *   new GetSecretValueCommand({ SecretId: 'my-secret' })
 * );
 *
 * // With custom retry options
 * const retried = await secretsManagerClient.execute(
 *   new GetSecretValueCommand({ SecretId: 'my-secret' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const secretsManagerClient = {
  /**
   * Executes a Secrets Manager command with automatic retry logic.
   *
   * @param command - Secrets Manager command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<C extends AwsCommand>(
    command: C,
    retryOptions?: RetryOptions
  ): Promise<CommandOutput<C>> {
    return sendWithRetry<CommandOutput<C>>(command, retryOptions);
  },

  /**
   * Reads a secret whose `SecretString` is a JSON
   * `{ accessKeyId, secretAccessKey, sessionToken? }` and returns it in the exact shape
   * `lambdaClient.invokeLambda({ credentials })` expects.
   *
   * Every failure mode gets a clear, typed error instead of a `TypeError` further down the
   * call stack: a missing secret becomes {@link NotFound}, and a secret that exists but
   * cannot be used as credentials (binary payload, malformed JSON, missing fields) becomes
   * {@link UnprocessableEntity}. Nothing read from the secret is ever logged.
   *
   * Note that the underlying `GetSecretValue` call is retried like every other command of
   * this client — pass `{ retries: 0 }` when a missing secret is an expected, fast path.
   *
   * @param secretId - Name or ARN of the secret holding the credentials
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the credentials read from the secret
   * @throws {BadRequest} When `secretId` is missing or empty
   * @throws {NotFound} When the secret does not exist
   * @throws {UnprocessableEntity} When the secret has no `SecretString`, is not valid JSON,
   *   is not a JSON object, or misses `accessKeyId` / `secretAccessKey`
   *
   * @example
   * ```typescript
   * import { secretsManagerClient } from 'awpaki/clients/secretsmanager';
   * import { lambdaClient } from 'awpaki/clients/lambda';
   *
   * const credentials = await secretsManagerClient.getCredentialsFromSecret(
   *   'arn:aws:secretsmanager:us-east-1:111122223333:secret:partner-account'
   * );
   *
   * await lambdaClient.invokeLambda({
   *   functionName: 'arn:aws:lambda:us-east-1:111122223333:function:partner-api',
   *   path: '/ping',
   *   credentials,
   * });
   * ```
   */
  async getCredentialsFromSecret(
    secretId: string,
    retryOptions?: RetryOptions
  ): Promise<SecretAwsCredentials> {
    if (typeof secretId !== 'string' || secretId.trim() === '') {
      throw new BadRequest('getCredentialsFromSecret requires a non-empty secret name or ARN');
    }

    let output: GetSecretValueCommandOutput;

    try {
      output = await sendWithRetry<GetSecretValueCommandOutput>(
        new GetSecretValueCommand({ SecretId: secretId }),
        retryOptions
      );
    } catch (error) {
      if (isResourceNotFound(error)) {
        getLogger().error(toErrorLog(error), `Secret not found: ${secretId}`);
        throw new NotFound(`Secret not found: ${secretId}`, { secretId });
      }

      throw error;
    }

    const secretString = output?.SecretString;

    if (typeof secretString !== 'string' || secretString.trim() === '') {
      throw new UnprocessableEntity(
        `Secret ${secretId} has no SecretString: binary secrets are not supported as credentials`,
        { secretId, hasSecretBinary: Boolean(output?.SecretBinary) }
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(secretString) as unknown;
    } catch {
      // The parse error message can quote the secret value, so it is deliberately dropped.
      throw new UnprocessableEntity(`Secret ${secretId} is not valid JSON`, { secretId });
    }

    if (!isPlainRecord(parsed)) {
      throw new UnprocessableEntity(`Secret ${secretId} is not a JSON object`, { secretId });
    }

    const missingFields = REQUIRED_CREDENTIAL_FIELDS.filter(
      (field) => !hasNonEmptyString(parsed, field)
    );

    if (missingFields.length > 0) {
      throw new UnprocessableEntity(
        `Secret ${secretId} is missing the credential field(s): ${missingFields.join(', ')}`,
        { secretId, missingFields }
      );
    }

    const credentials: SecretAwsCredentials = {
      accessKeyId: parsed.accessKeyId as string,
      secretAccessKey: parsed.secretAccessKey as string,
    };

    if (hasNonEmptyString(parsed, 'sessionToken')) {
      credentials.sessionToken = parsed.sessionToken as string;
    }

    // Only the identifier is logged: the credentials themselves never reach the logs.
    getLogger().debug(
      { secretId, hasSessionToken: Boolean(credentials.sessionToken) },
      'Loaded AWS credentials from secret'
    );

    return credentials;
  },
};
