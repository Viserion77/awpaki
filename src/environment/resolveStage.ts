import { readFirstEnv } from './readFirstEnv';

/**
 * Stage used by {@link resolveStage} when neither `STAGE` nor `NODE_ENV` is set.
 */
export const DEFAULT_STAGE = 'dev';

/**
 * Environment variables inspected by {@link resolveStage}, highest precedence first.
 */
const STAGE_ENV_VARS = ['STAGE', 'NODE_ENV'];

/**
 * Resolves the deployment stage from the environment.
 *
 * Precedence: `STAGE` → `NODE_ENV` → {@link DEFAULT_STAGE}. `STAGE` wins because it is the
 * variable deployment tooling (Serverless Framework, SAM, CDK) sets to name the environment,
 * while `NODE_ENV` is frequently forced to `production` by bundlers and runtimes regardless of
 * which stage is actually being deployed.
 *
 * A variable set to the empty string (`''`) counts as **absent** and the lookup falls through
 * to the next candidate — the same semantics as the `||` chains used across the clients.
 * Unlike {@link resolveRegion} and {@link resolveEndpoint}, this function always returns a
 * string: there is no meaningful "no stage" state, so callers never need a null check.
 *
 * @returns {string} The resolved stage, or `DEFAULT_STAGE` when nothing is configured
 *
 * @example
 * ```typescript
 * process.env.STAGE = 'prod';
 * resolveStage(); // 'prod'
 * ```
 *
 * @example
 * ```typescript
 * // STAGE wins over NODE_ENV
 * process.env.STAGE = 'staging';
 * process.env.NODE_ENV = 'production';
 * resolveStage(); // 'staging'
 * ```
 *
 * @example
 * ```typescript
 * // Nothing configured falls back to the default
 * resolveStage(); // 'dev'
 * ```
 */
export function resolveStage(): string {
  return readFirstEnv(...STAGE_ENV_VARS) ?? DEFAULT_STAGE;
}
