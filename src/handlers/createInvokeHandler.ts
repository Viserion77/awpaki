/**
 * Handler factory for Lambda-to-Lambda invocations (`Invoke`, no HTTP in front).
 *
 * The payload of a direct invoke has no fixed shape: some callers send the parameters
 * flat (`{ userId: '1' }`), others forward an API-Gateway-like envelope
 * (`{ body: '{"userId":"1"}' }`) because the same business function is also exposed
 * as a route. {@link normalizeInvokePayload} accepts both and produces a single
 * canonical record, so one schema serves every caller.
 *
 * @module handlers/createInvokeHandler
 */

import type { Context } from 'aws-lambda';
import { BadRequest, handleGenericError } from '../errors';
import type { GenericLambdaErrorResponse } from '../errors';
import { extractEventParams } from '../extractors';
import type { EventSchema } from '../extractors';
import { getLogger } from '../loggers';
import type { LogConfig } from '../loggers';
import { applyLogCollector } from './logCollector';
import type { HandlerWrapper, LambdaHandler } from './logCollector';

/**
 * Everything `execute` and `authorize` receive.
 *
 * @template TParams - Shape produced by the schema
 */
export interface InvokeHandlerInput<TParams> {
  /** Parameters extracted and validated by {@link extractEventParams} */
  params: TParams;
  /** Payload after {@link normalizeInvokePayload} */
  payload: Record<string, unknown>;
  /** Payload exactly as the caller sent it */
  rawPayload: unknown;
  /** Lambda context */
  context: Context;
}

/**
 * Configuration of {@link createInvokeHandler}.
 *
 * @template TParams - Shape produced by the schema
 * @template TResult - Value resolved back to the calling Lambda
 */
export interface CreateInvokeHandlerOptions<TParams, TResult> {
  /** Schema handed to {@link extractEventParams}; omit when the function takes no input */
  schema?: EventSchema;
  /** Business function — its return value is the invoke response, untouched */
  execute: (input: InvokeHandlerInput<TParams>) => TResult | Promise<TResult>;
  /**
   * Authorization hook, run after the schema. Throw `Unauthorized` (401) or
   * `Forbidden` (403) to reject; return normally to allow.
   */
  authorize?: (input: InvokeHandlerInput<TParams>) => void | Promise<void>;
  /** Extra data merged into the entry log record */
  logConfig?: LogConfig;
  /** Per-handler log collector, taking precedence over the globally registered one */
  logCollector?: HandlerWrapper<unknown, TResult | GenericLambdaErrorResponse>;
}

/**
 * Checks for a plain object — arrays and `null` are not valid payload envelopes.
 *
 * @param value - Value to inspect
 * @returns True when the value is a non-null, non-array object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a JSON string coming from a payload, reporting failures as `BadRequest`.
 *
 * @param value - JSON text
 * @param label - Name used in the error message
 * @returns Parsed value, or undefined when the text is empty
 * @throws {BadRequest} When the text is not valid JSON
 */
function parseJson(value: string, label: string): unknown {
  if (value.trim() === '') return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new BadRequest(
      `Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Normalizes an invoke payload into a single record that both schema styles can read.
 *
 * Accepted inputs:
 *
 * - `undefined` / `null` — becomes `{}`
 * - a JSON string — parsed first, then normalized as below
 * - `{ userId: '1' }` — kept as is
 * - `{ body: '{"userId":"1"}' }` or `{ body: { userId: '1' } }` — `body` is parsed and
 *   its fields are **also lifted to the root**, so `{ userId: {...} }` and
 *   `{ body: { userId: {...} } }` are both valid schemas for the same caller
 *
 * A body that is not an object after parsing (array, number, string) stays available
 * under `body` only, since lifting it to the root would produce numeric keys.
 *
 * @param payload - Payload received by the handler
 * @returns Canonical record handed to {@link extractEventParams}
 * @throws {BadRequest} When the payload, or its `body`, is not valid JSON, or when the
 *                      payload is not an object
 *
 * @example
 * ```typescript
 * normalizeInvokePayload({ userId: '1' });
 * // { userId: '1' }
 *
 * normalizeInvokePayload({ body: '{"userId":"1"}', stage: 'dev' });
 * // { stage: 'dev', userId: '1', body: { userId: '1' } }
 * ```
 */
export function normalizeInvokePayload(payload: unknown): Record<string, unknown> {
  const raw = typeof payload === 'string' ? parseJson(payload, 'invoke payload') : payload;

  if (raw === undefined || raw === null) return {};

  if (!isPlainObject(raw)) {
    throw new BadRequest('Invoke payload must be a JSON object');
  }

  if (!('body' in raw)) {
    return { ...raw };
  }

  const body = typeof raw.body === 'string' ? parseJson(raw.body, 'invoke payload body') : raw.body;

  if (isPlainObject(body)) {
    return { ...raw, ...body, body };
  }

  return { ...raw, body };
}

/**
 * Builds a Lambda handler for direct invocations around a schema and a business
 * function.
 *
 * The pipeline mirrors {@link createApiGatewayHandlerV2}: per-invocation log buffer,
 * entry log, payload normalization, {@link extractEventParams}, `authorize`,
 * `execute`, single `catch`. There is no response serialization — the value returned
 * by `execute` is the invoke response, so the calling Lambda gets real objects instead
 * of a JSON string.
 *
 * Errors follow the convention of {@link handleGenericError}: an `HttpError` becomes
 * the structured `{ error, message, statusCode, data }` envelope so the caller can
 * branch on `statusCode`, while any other error is re-thrown and fails the invocation
 * (which is what keeps Lambda retries and DLQs working).
 *
 * @template TParams - Shape produced by the schema
 * @template TResult - Value resolved back to the calling Lambda
 * @param options - Schema, business function and optional authorization hook
 * @returns An async Lambda handler accepting either payload shape
 * @throws TypeError if `execute` is not a function
 *
 * @example
 * ```typescript
 * export const handler = createInvokeHandler({
 *   schema: { userId: { label: 'User ID', required: true } },
 *   execute: async ({ params }) => getUser(params.userId),
 * });
 *
 * // both calls reach the same handler:
 * // { userId: '1' }
 * // { body: '{"userId":"1"}' }
 * ```
 */
export function createInvokeHandler<TParams = Record<string, unknown>, TResult = unknown>(
  options: CreateInvokeHandlerOptions<TParams, TResult>
): LambdaHandler<unknown, TResult | GenericLambdaErrorResponse> {
  if (typeof options?.execute !== 'function') {
    throw new TypeError('createInvokeHandler expects an `execute` function');
  }

  const handler: LambdaHandler<unknown, TResult | GenericLambdaErrorResponse> = async (
    rawPayload: unknown,
    context: Context
  ): Promise<TResult | GenericLambdaErrorResponse> => {
    try {
      const payload = normalizeInvokePayload(rawPayload);

      getLogger().info(
        {
          requestId: context?.awsRequestId,
          functionName: context?.functionName,
          functionVersion: context?.functionVersion,
          payloadKeys: Object.keys(payload),
          ...(options.logConfig?.additionalData ?? {}),
        },
        `Entry Invoke ${context?.functionName}:${context?.awsRequestId}`
      );
      getLogger().debug(
        payload,
        `Invoke Payload ${context?.functionName}:${context?.awsRequestId}`
      );

      const params = extractEventParams<TParams>(options.schema ?? {}, payload);
      const input: InvokeHandlerInput<TParams> = { params, payload, rawPayload, context };

      if (options.authorize) {
        await options.authorize(input);
      }

      return await options.execute(input);
    } catch (error) {
      return handleGenericError(error);
    }
  };

  return applyLogCollector(handler, options.logCollector);
}
