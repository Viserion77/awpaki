/**
 * Policy for the `$x-custom-metadata` block {@link HttpError} can attach to a response body.
 *
 * The block carries `functionName`, `executionEnv` and `logStreamName`, which turns "the API
 * returned 500" into a log stream you can open — genuinely useful, and the reason it was
 * added. What was wrong is that it shipped on **every** status with no way to turn it off:
 * the 401 from the API-key gate handed an unauthenticated caller the function name, the Node
 * runtime version (which narrows CVE targeting) and a live CloudWatch stream identifier,
 * before they had presented a credential.
 *
 * So the switch exists and the default is `never`. `server-errors` is the middle setting:
 * a 5xx is awpaki's own failure and the caller is being asked to report it, whereas a 4xx is
 * the caller's request being refused and answers nothing about the deployment.
 *
 * @module errors/http/infraMetadata
 */

/**
 * When the infrastructure metadata block is allowed into a response body.
 *
 * - `never` (default) — no response carries it.
 * - `server-errors` — only 5xx responses, where a caller is expected to quote it in a report.
 * - `always` — every error response, the pre-1.6 behaviour.
 */
export type InfraMetadataPolicy = 'never' | 'server-errors' | 'always';

/**
 * Environment variable read when no policy has been set in code, so the switch is reachable
 * from a deployment template without a rebuild.
 */
const POLICY_ENV_VAR = 'AWPAKI_ERROR_INFRA_METADATA';

const POLICIES: readonly InfraMetadataPolicy[] = ['never', 'server-errors', 'always'];

let policy: InfraMetadataPolicy | undefined;

/**
 * Sets whether error bodies may carry the infrastructure metadata block.
 *
 * Takes precedence over `AWPAKI_ERROR_INFRA_METADATA`.
 *
 * @param next - Policy to apply
 * @returns Nothing
 * @throws TypeError if the value is not one of the three policies
 *
 * @example
 * ```typescript
 * import { setInfraMetadataPolicy } from 'awpaki/errors';
 *
 * setInfraMetadataPolicy('server-errors');
 * ```
 */
export function setInfraMetadataPolicy(next: InfraMetadataPolicy): void {
  if (!POLICIES.includes(next)) {
    throw new TypeError(
      `setInfraMetadataPolicy expects one of ${POLICIES.join(', ')}, received ${JSON.stringify(next)}`
    );
  }
  policy = next;
}

/**
 * Returns the policy in force: the one set in code, else the environment variable, else
 * `never`.
 *
 * @returns The active policy
 */
export function getInfraMetadataPolicy(): InfraMetadataPolicy {
  if (policy !== undefined) {
    return policy;
  }

  const fromEnv = process.env[POLICY_ENV_VAR];
  return POLICIES.includes(fromEnv as InfraMetadataPolicy)
    ? (fromEnv as InfraMetadataPolicy)
    : 'never';
}

/**
 * Clears a policy set in code, restoring the environment-variable lookup. Mainly for tests.
 *
 * @returns Nothing
 */
export function resetInfraMetadataPolicy(): void {
  policy = undefined;
}

/**
 * Decides whether one response may carry the metadata block.
 *
 * Read at **serialization** time rather than at construction, so a policy set during
 * bootstrap governs errors thrown by modules that were imported before it ran.
 *
 * @param statusCode - Status of the response being built
 * @returns True when the block belongs in this body
 */
export function shouldIncludeInfraMetadata(statusCode: number): boolean {
  const active = getInfraMetadataPolicy();

  if (active === 'always') return true;
  if (active === 'server-errors') return statusCode >= 500;
  return false;
}
