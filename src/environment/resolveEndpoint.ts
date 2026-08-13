import { readFirstEnv } from './readFirstEnv.js';

/**
 * Global endpoint override, always the last candidate of any {@link resolveEndpoint} lookup.
 */
const GLOBAL_ENDPOINT_ENV_VAR = 'AWS_ENDPOINT_URL';

/**
 * Resolves the endpoint override for an AWS service from the environment.
 *
 * The service-specific variables are inspected in the exact order they are given and
 * `AWS_ENDPOINT_URL` is always appended as the final fallback, so the caller never has to
 * repeat it. This is what makes multi-level cascades possible: Timestream, for instance,
 * needs `AWS_ENDPOINT_URL_TIMESTREAM_QUERY` → `AWS_ENDPOINT_URL_TIMESTREAM` →
 * `AWS_ENDPOINT_URL`, which is expressed by passing the two service variables in order.
 *
 * A variable set to the empty string (`''`) counts as **absent** and the lookup falls through
 * to the next candidate — the same semantics as the `||` chains this function replaces.
 * When nothing is configured, `undefined` is returned so the AWS SDK keeps using its default
 * regional endpoint instead of receiving an empty string.
 *
 * @param {...string} serviceEnvVars - Service-specific variable names, highest precedence
 *   first. May be omitted to read the global override only.
 * @returns {string | undefined} The resolved endpoint, or `undefined` when none is configured
 *
 * @example
 * ```typescript
 * // Two-level cascade: AWS_ENDPOINT_URL_S3 -> AWS_ENDPOINT_URL
 * const client = new S3Client({
 *   region: resolveRegion(),
 *   endpoint: resolveEndpoint('AWS_ENDPOINT_URL_S3'),
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Three-level cascade used by Timestream
 * resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_QUERY', 'AWS_ENDPOINT_URL_TIMESTREAM');
 * resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_WRITE', 'AWS_ENDPOINT_URL_TIMESTREAM');
 * ```
 *
 * @example
 * ```typescript
 * // No service variable: reads only the global override
 * process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
 * resolveEndpoint(); // 'http://localhost:4566'
 * ```
 */
export function resolveEndpoint(...serviceEnvVars: string[]): string | undefined {
  return readFirstEnv(...serviceEnvVars, GLOBAL_ENDPOINT_ENV_VAR);
}
