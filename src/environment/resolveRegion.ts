import { readFirstEnv } from './readFirstEnv.js';

/**
 * Environment variables inspected by {@link resolveRegion}, highest precedence first.
 */
const REGION_ENV_VARS = ['AWS_REGION', 'AWS_DEFAULT_REGION'];

/**
 * Resolves the AWS region from the environment.
 *
 * Precedence: `AWS_REGION` → `AWS_DEFAULT_REGION`. `AWS_REGION` is the variable the Lambda
 * runtime injects automatically; `AWS_DEFAULT_REGION` is the CLI/SDK convention and covers
 * local runs, containers and test harnesses.
 *
 * A variable set to the empty string (`''`) counts as **absent** and the lookup falls through
 * to the next one — the same semantics as the `||` chains this function replaces. When no
 * variable is set, `undefined` is returned so the AWS SDK can apply its own region resolution
 * chain (shared config file, IMDS, …) instead of receiving a bogus empty region.
 *
 * @returns {string | undefined} The resolved region, or `undefined` when none is configured
 *
 * @example
 * ```typescript
 * process.env.AWS_REGION = 'us-east-1';
 * resolveRegion(); // 'us-east-1'
 * ```
 *
 * @example
 * ```typescript
 * // Empty values fall through to the next variable
 * process.env.AWS_REGION = '';
 * process.env.AWS_DEFAULT_REGION = 'sa-east-1';
 * resolveRegion(); // 'sa-east-1'
 * ```
 *
 * @example
 * ```typescript
 * // Typical usage when building an AWS SDK client
 * const client = new S3Client({ region: resolveRegion() });
 * ```
 */
export function resolveRegion(): string | undefined {
  return readFirstEnv(...REGION_ENV_VARS);
}
