/**
 * Reads `process.env` for each variable name, in order, and returns the value of the
 * first one that is set to a non-empty string.
 *
 * An environment variable set to the empty string (`''`) is treated as **absent** and the
 * lookup falls through to the next name. This mirrors the `process.env.A || process.env.B`
 * chains that were previously inlined in every AWS client, so migrating to this helper does
 * not change behaviour. Values are never trimmed: a whitespace-only value such as `'   '` is
 * a legitimate value and short-circuits the chain, exactly as `||` would.
 *
 * Internal helper: it is intentionally not re-exported from the `environment` barrel.
 *
 * @param {...string} names - Environment variable names, highest precedence first
 * @returns {string | undefined} The first non-empty value found, or `undefined` when none is set
 *
 * @example
 * ```typescript
 * process.env.PRIMARY = '';
 * process.env.FALLBACK = 'https://localhost:4566';
 *
 * readFirstEnv('PRIMARY', 'FALLBACK'); // 'https://localhost:4566'
 * readFirstEnv('MISSING_A', 'MISSING_B'); // undefined
 * readFirstEnv(); // undefined
 * ```
 */
export function readFirstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];

    if (value) {
      return value;
    }
  }

  return undefined;
}
