/**
 * Tells a local run from a real AWS one.
 *
 * The signal is the presence of `AWS_ENDPOINT_URL`: pointing the SDK at an emulator
 * (LocalStack, DynamoDB Local, serverless-offline) is the one thing every local setup must do
 * and no deployed function ever does. Stage names cannot answer this — `dev` is a deployed
 * stage in most accounts — and `NODE_ENV` answers a different question entirely.
 *
 * Read directly rather than through {@link resolveEndpoint} so a future change to that
 * cascade cannot silently change what "local" means.
 *
 * @returns `true` when an endpoint override is configured
 *
 * @example
 * ```typescript
 * import { isLocalEnvironment } from 'awpaki/environment';
 *
 * if (isLocalEnvironment()) {
 *   setLogLevel('debug');
 * }
 * ```
 */
export function isLocalEnvironment(): boolean {
  return (process.env.AWS_ENDPOINT_URL ?? '').trim() !== '';
}
