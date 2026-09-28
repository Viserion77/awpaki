/**
 * Handler factory for API Gateway HTTP APIs (payload format 2.0).
 *
 * The factory owns the whole skeleton of a Lambda handler so the consumer only
 * declares a schema and a business function. The pipeline runs, in this exact order:
 *
 * 1. per-invocation log buffer ({@link applyLogCollector}, outermost layer)
 * 2. {@link logApiGatewayEventV2}
 * 3. the API key gate
 * 4. {@link extractEventParams}
 * 5. the `authorize` hook
 * 6. `execute`
 * 7. JSON serialization of the response
 * 8. a single `catch` delegating to {@link handleApiGatewayErrorV2}
 *
 * @module handlers/createApiGatewayHandlerV2
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { HttpStatus, Unauthorized, handleApiGatewayErrorV2 } from '../errors/index.js';
import type { ErrorBodyShaper, HttpErrorStatusType } from '../errors/index.js';
import { extractEventParams } from '../extractors/index.js';
import type { EventSchema } from '../extractors/index.js';
import { logApiGatewayEventV2 } from '../loggers/index.js';
import type { LogConfig } from '../loggers/index.js';
import { applyLogCollector } from './logCollector.js';
import type { HandlerWrapper, LambdaHandler } from './logCollector.js';

/** Header value types accepted by API Gateway payload format 2.0. */
export type ApiGatewayHeaderValue = string | number | boolean;

/**
 * Everything `execute` and `authorize` receive: the validated parameters plus the
 * untouched event and context, for the cases the schema cannot express.
 *
 * @template TParams - Shape produced by the schema
 */
export interface ApiGatewayHandlerV2Input<TParams> {
  /** Parameters extracted and validated by {@link extractEventParams} */
  params: TParams;
  /** Raw API Gateway V2 event */
  event: APIGatewayProxyEventV2;
  /** Lambda context */
  context: Context;
}

/**
 * What `execute` may return. Every field is optional: returning nothing at all is a
 * `204 No Content`.
 *
 * @template TBody - Type of the payload placed in the response body
 */
export interface ApiGatewayHandlerV2Response<TBody = unknown> {
  /** Status code for this response, overriding the factory default */
  statusCode?: number;
  /** Payload — JSON serialized unless it already is a string. Omit for 204 */
  body?: TBody;
  /** Headers merged over the defaults (case-insensitive) */
  headers?: Record<string, ApiGatewayHeaderValue>;
  /** `Set-Cookie` values, which payload format 2.0 carries in its own field */
  cookies?: string[];
  /** Marks `body` as base64, for binary responses */
  isBase64Encoded?: boolean;
}

/**
 * Configuration of {@link createApiGatewayHandlerV2}.
 *
 * @template TParams - Shape produced by the schema
 * @template TBody - Type of the payload placed in the response body
 */
export interface CreateApiGatewayHandlerV2Options<TParams, TBody> {
  /** Schema handed to {@link extractEventParams}; omit when the route takes no input */
  schema?: EventSchema;
  /** Business function — the only part that is not boilerplate */
  execute: (
    input: ApiGatewayHandlerV2Input<TParams>
  ) =>
    | ApiGatewayHandlerV2Response<TBody>
    | void
    | Promise<ApiGatewayHandlerV2Response<TBody> | void>;
  /**
   * Authorization hook, run after the schema and the API key gate. Throw
   * `Unauthorized` (401) or `Forbidden` (403) to reject; return normally to allow.
   * Use it for the tenant, group or domain checks a schema cannot express.
   */
  authorize?: (input: ApiGatewayHandlerV2Input<TParams>) => void | Promise<void>;
  /**
   * Expected API key. The gate is enabled by the **presence of this property**, never
   * by its value — see {@link createApiGatewayHandlerV2} for why.
   */
  checkApiKey?: string | undefined;
  /** Header carrying the API key. Defaults to `x-api-key` (matched case-insensitively) */
  apiKeyHeader?: string;
  /** Status code used when `execute` returns a body without one. Defaults to 200 */
  statusCode?: number;
  /** Headers added to every successful response, over the `Content-Type` default */
  headers?: Record<string, ApiGatewayHeaderValue>;
  /** Extra data merged into the entry log record */
  logConfig?: LogConfig;
  /** Per-handler log collector, taking precedence over the globally registered one */
  logCollector?: HandlerWrapper<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2>;
  /**
   * Runs the API key gate **before** the schema, so an unauthenticated caller gets a bare 401.
   *
   * With the schema first — the order this factory shipped with — one malformed request from a
   * caller with no key comes back with the full per-field error map keyed by schema path,
   * which is a complete description of the route's inputs, and every decoder has already run
   * on attacker-controlled values. Defaults to `true`; set it to `false` for the previous
   * order, where a request that is both unauthenticated and malformed reports both.
   */
  checkApiKeyBeforeSchema?: boolean;
  /** Shaper for the error body of this handler, overriding the registered one */
  errorBodyShaper?: ErrorBodyShaper;
  /** Status used for a schema failure with no `statusCodeError` of its own. Defaults to 422 */
  validationStatusCode?: HttpErrorStatusType;
  /** `code` carried by a schema failure, for clients that branch on one */
  validationErrorCode?: string;
}

const DEFAULT_API_KEY_HEADER = 'x-api-key';

/**
 * Merges header maps so that a later source **replaces** an earlier header with the
 * same name regardless of casing.
 *
 * A plain spread would keep `Content-Type` and `content-type` as two distinct keys
 * and API Gateway would emit both, so the promise that "extra headers override the
 * default" needs the case-insensitive pass.
 *
 * @param sources - Header maps, from lowest to highest precedence
 * @returns A single header map with one entry per header name
 */
function mergeHeaders(
  ...sources: (Record<string, ApiGatewayHeaderValue> | undefined)[]
): Record<string, ApiGatewayHeaderValue> {
  const merged: Record<string, ApiGatewayHeaderValue> = {};
  const keyByLowerCase = new Map<string, string>();

  for (const source of sources) {
    if (!source) continue;

    for (const [key, value] of Object.entries(source)) {
      const lowerCased = key.toLowerCase();
      const previousKey = keyByLowerCase.get(lowerCased);

      if (previousKey !== undefined && previousKey !== key) {
        delete merged[previousKey];
      }

      keyByLowerCase.set(lowerCased, key);
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Reads a header case-insensitively — API Gateway V2 lower-cases header names, but
 * hand-written events and local invocations do not always follow.
 *
 * @param headers - Header map from the event
 * @param name - Header name to look for
 * @returns The header value, or undefined when absent
 */
function readHeader(
  headers: APIGatewayProxyEventV2['headers'] | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;

  const lowerCased = name.toLowerCase();
  const match = Object.keys(headers).find((key) => key.toLowerCase() === lowerCased);

  return match === undefined ? undefined : headers[match];
}

/**
 * Enforces the API key gate.
 *
 * Detection is by **presence of the property**, so a misconfigured secret is a loud
 * failure instead of a silently disabled gate.
 *
 * @param options - Factory options, inspected with the `in` operator
 * @param event - Event whose headers carry the key
 * @returns Nothing
 * @throws Error when the property is present but does not hold a usable key (5xx)
 * @throws {Unauthorized} When the request key is missing or does not match (401)
 */
function assertApiKey<TParams, TBody>(
  options: CreateApiGatewayHandlerV2Options<TParams, TBody>,
  event: APIGatewayProxyEventV2
): void {
  if (!('checkApiKey' in options)) return;

  const expected = options.checkApiKey;

  // Deliberately NOT `if (options.checkApiKey)`: `checkApiKey: process.env.API_KEY`
  // with an unset variable must fail loudly (unhandled Error -> 5xx) instead of
  // turning the gate off, which is what a truthiness check would do.
  if (typeof expected !== 'string' || expected.trim() === '') {
    throw new Error(
      "createApiGatewayHandlerV2: 'checkApiKey' was provided but holds " +
        `${expected === undefined ? 'undefined' : JSON.stringify(expected)} instead of a non-empty ` +
        'string. The API key gate is enabled by the presence of the option, so this is a ' +
        'misconfiguration (a missing environment variable, most likely) and never a way to ' +
        'disable the gate. Remove the option entirely to run the route without an API key.'
    );
  }

  const headerName = options.apiKeyHeader ?? DEFAULT_API_KEY_HEADER;
  const provided = readHeader(event.headers, headerName);

  if (provided !== expected) {
    throw new Unauthorized('Invalid API key');
  }
}

/**
 * Turns what `execute` returned into an API Gateway V2 response.
 *
 * @template TBody - Type of the payload placed in the response body
 * @template TParams - Shape produced by the schema
 * @param result - Value returned by `execute` (already defaulted to an object)
 * @param options - Factory options providing the default status and headers
 * @returns Structured response ready to be returned from the Lambda
 */
function toResponse<TParams, TBody>(
  result: ApiGatewayHandlerV2Response<TBody>,
  options: CreateApiGatewayHandlerV2Options<TParams, TBody>
): APIGatewayProxyStructuredResultV2 {
  const { statusCode, body, headers, cookies, isBase64Encoded } = result;

  // No body means no representation: 204 must not advertise a Content-Type, so the
  // default header is not even built here.
  if (body === undefined) {
    const emptyResponse: APIGatewayProxyStructuredResultV2 = {
      statusCode: statusCode ?? HttpStatus.NO_CONTENT,
    };

    const mergedHeaders = mergeHeaders(options.headers, headers);
    if (Object.keys(mergedHeaders).length > 0) {
      emptyResponse.headers = mergedHeaders;
    }

    if (cookies && cookies.length > 0) {
      emptyResponse.cookies = cookies;
    }

    return emptyResponse;
  }

  // A string is assumed to be already serialized (CSV, XML, a pre-rendered JSON
  // document); anything else goes through JSON.stringify.
  const serialized = typeof body === 'string' ? body : (JSON.stringify(body) ?? '');

  const response: APIGatewayProxyStructuredResultV2 = {
    statusCode: statusCode ?? options.statusCode ?? HttpStatus.OK,
    headers: mergeHeaders({ 'Content-Type': 'application/json' }, options.headers, headers),
    body: serialized,
  };

  if (cookies && cookies.length > 0) {
    response.cookies = cookies;
  }

  if (isBase64Encoded !== undefined) {
    response.isBase64Encoded = isBase64Encoded;
  }

  return response;
}

/**
 * Builds an API Gateway V2 (HTTP API) Lambda handler around a schema and a business
 * function, so a route is written without repeating the log/extract/gate/catch
 * skeleton.
 *
 * Response rules:
 *
 * - `execute` returning nothing, or a result without `body`, produces
 *   **204 No Content with no `Content-Type`**.
 * - a `body` is JSON serialized (strings are passed through untouched) and answered
 *   with `result.statusCode ?? options.statusCode ?? 200`.
 * - headers from `options.headers` and then from the result **override** the
 *   `Content-Type` default, matching header names case-insensitively.
 * - any `HttpError` — from the schema, from a gate or from `execute` — becomes the
 *   matching HTTP response through {@link handleApiGatewayErrorV2}; anything else is
 *   re-thrown so the invocation fails and API Gateway answers 5xx.
 *
 * Security note on `checkApiKey`: the gate is enabled by the **presence of the
 * property**, never by its value. `checkApiKey: process.env.API_KEY` with an unset
 * variable throws (5xx) instead of quietly letting every request through, which is
 * exactly what `if (options.checkApiKey)` would do. Omit the property to run without
 * the gate.
 *
 * @template TParams - Shape produced by the schema
 * @template TBody - Type of the payload placed in the response body
 * @param options - Schema, business function, gates and response defaults
 * @returns An async Lambda handler for API Gateway payload format 2.0
 * @throws TypeError if `execute` is not a function
 *
 * @example
 * ```typescript
 * export const handler = createApiGatewayHandlerV2({
 *   schema: {
 *     pathParameters: { id: { label: 'User ID', required: true } },
 *   },
 *   checkApiKey: process.env.API_KEY,
 *   authorize: ({ params, event }) => {
 *     if (!event.headers.authorization) throw new Unauthorized('Token required');
 *   },
 *   execute: async ({ params }) => ({ body: await getUser(params.id) }),
 * });
 * ```
 *
 * @example
 * ```typescript
 * // 204 No Content: no body, no Content-Type
 * export const handler = createApiGatewayHandlerV2({
 *   schema: { pathParameters: { id: { label: 'User ID', required: true } } },
 *   execute: async ({ params }) => {
 *     await deleteUser(params.id);
 *   },
 * });
 * ```
 */
export function createApiGatewayHandlerV2<TParams = Record<string, unknown>, TBody = unknown>(
  options: CreateApiGatewayHandlerV2Options<TParams, TBody>
): LambdaHandler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2> {
  if (typeof options?.execute !== 'function') {
    throw new TypeError('createApiGatewayHandlerV2 expects an `execute` function');
  }

  const handler: LambdaHandler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2> = async (
    event: APIGatewayProxyEventV2,
    context: Context
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      logApiGatewayEventV2(event, context, options.logConfig);

      // The gate runs first by default: a caller with no key must not be handed the route's
      // schema, one field at a time, in the error map — nor have its decoders run on their
      // input. The entry log stays ahead of both, so an unauthenticated attempt is still
      // recorded.
      if (options.checkApiKeyBeforeSchema !== false) {
        assertApiKey(options, event);
      }

      const params = extractEventParams<TParams>(options.schema ?? {}, event, {
        validationStatusCode: options.validationStatusCode,
        validationErrorCode: options.validationErrorCode,
      });

      const input: ApiGatewayHandlerV2Input<TParams> = { params, event, context };

      if (options.checkApiKeyBeforeSchema === false) {
        assertApiKey(options, event);
      }

      if (options.authorize) {
        await options.authorize(input);
      }

      const result = (await options.execute(input)) ?? {};

      return toResponse(result, options);
    } catch (error) {
      return handleApiGatewayErrorV2(error, undefined, options.errorBodyShaper);
    }
  };

  return applyLogCollector(handler, options.logCollector);
}
