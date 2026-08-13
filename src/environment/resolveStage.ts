import { readFirstEnv } from './readFirstEnv.js';

/**
 * Stage used by {@link resolveStage} when neither `STAGE` nor `NODE_ENV` is set.
 */
export const DEFAULT_STAGE = 'dev';

/**
 * Environment variables inspected by {@link resolveStage}, highest precedence first.
 */
const STAGE_ENV_VARS = ['STAGE', 'NODE_ENV'];

/**
 * Options of {@link resolveStage}.
 */
export interface ResolveStageOptions {
  /**
   * Consult `NODE_ENV` when `STAGE` is absent. Defaults to `true`, which is the historical
   * behaviour.
   *
   * `NODE_ENV` is not a deployment stage: bundlers force it to `production` regardless of
   * which stage is being deployed, Jest forces it to `test`, and Lambda never sets `STAGE` on
   * its own — so a plain esbuild-built function reports the stage `'production'` even when it
   * is the dev deployment, and the same call inside a test reports `'test'`. Pass `false` for
   * a deployment where only `STAGE` is meaningful.
   */
  allowNodeEnv?: boolean;

  /**
   * Stage returned when nothing is configured. Defaults to {@link DEFAULT_STAGE}.
   */
  defaultStage?: string;
}

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
 * @param options - Whether `NODE_ENV` may be consulted, and the fallback stage
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
 *
 * @example
 * ```typescript
 * // Only STAGE is meaningful here: NODE_ENV is whatever the bundler or the test runner set
 * process.env.NODE_ENV = 'production';
 * resolveStage({ allowNodeEnv: false, defaultStage: 'local' }); // 'local'
 * ```
 */
export function resolveStage(options: ResolveStageOptions = {}): string {
  const names = options.allowNodeEnv === false ? STAGE_ENV_VARS.slice(0, 1) : STAGE_ENV_VARS;

  return readFirstEnv(...names) ?? options.defaultStage ?? DEFAULT_STAGE;
}
