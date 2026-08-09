/**
 * Value accepted for a template variable.
 *
 * `undefined` (or a missing key) keeps the placeholder untouched; `null` renders as an empty
 * string; every other value goes through `String(value)`.
 */
export type DynamicVariableValue = string | number | boolean | bigint | null | undefined;

/**
 * Map of variable name to value consumed by {@link dynamicVariableSwitcher}.
 */
export type DynamicVariables = Record<string, DynamicVariableValue>;

/**
 * Default placeholder pattern: `{{VAR}}`, tolerating inner spaces (`{{ VAR }}`).
 *
 * The variable name is capture group 1 and accepts letters, digits, `_`, `.` and `-`, so
 * `{{user.name}}` and `{{trace-id}}` work out of the box.
 */
export const DEFAULT_VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Interpolates `{{VAR}}` placeholders in a template string.
 *
 * Built for the templates that live in configuration rather than in code — SES e-mail bodies,
 * SNS/IoT message payloads, Step Functions inputs — where the text comes from DynamoDB, S3 or
 * an environment variable and only the values are known at runtime.
 *
 * Behaviour:
 * - Every occurrence is replaced, not only the first one.
 * - A placeholder whose variable is **missing** or `undefined` is left untouched. Rendering
 *   `undefined` into an e-mail body is worse than shipping the raw placeholder, which is
 *   obvious in a test and in a log.
 * - `null` renders as an empty string — it is an explicit "there is no value here".
 * - Only own enumerable keys are read, so `{{constructor}}` and `{{__proto__}}` cannot pull
 *   anything from the prototype chain.
 * - The `pattern` may be replaced. When it has no `g` flag, a global copy is used so that all
 *   occurrences are still replaced. When it has no capture group, the whole match is used as
 *   the variable name.
 *
 * @param template - Template string containing the placeholders
 * @param variables - Values by variable name
 * @param pattern - Placeholder pattern; defaults to {@link DEFAULT_VARIABLE_PATTERN}
 * @returns The interpolated string; the input template is never mutated
 *
 * @example
 * ```typescript
 * dynamicVariableSwitcher('Hello {{NAME}}, your order {{ORDER_ID}} is ready.', {
 *   NAME: 'Ana',
 *   ORDER_ID: 42,
 * });
 * // → 'Hello Ana, your order 42 is ready.'
 * ```
 *
 * @example
 * ```typescript
 * // Unknown variables survive untouched, so the gap is visible instead of printing "undefined"
 * dynamicVariableSwitcher('Hi {{NAME}} from {{CITY}}', { NAME: 'Ana' });
 * // → 'Hi Ana from {{CITY}}'
 * ```
 *
 * @example
 * ```typescript
 * // Custom pattern: ${VAR}
 * dynamicVariableSwitcher('bucket=${BUCKET}', { BUCKET: 'my-bucket' }, /\$\{(\w+)\}/g);
 * // → 'bucket=my-bucket'
 * ```
 */
export function dynamicVariableSwitcher(
  template: string,
  variables: DynamicVariables,
  pattern: RegExp = DEFAULT_VARIABLE_PATTERN
): string {
  if (template.length === 0) {
    return template;
  }

  const globalPattern = pattern.flags.includes('g')
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);

  return template.replace(globalPattern, (match: string, ...args: unknown[]): string => {
    const captured = args[0];
    const name = (typeof captured === 'string' ? captured : match).trim();

    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      return match;
    }

    const value = variables[name];

    if (value === undefined) {
      return match;
    }

    if (value === null) {
      return '';
    }

    return String(value);
  });
}
