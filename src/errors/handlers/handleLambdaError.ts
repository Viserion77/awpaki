/**
 * Per-trigger error handlers that turn an {@link HttpError} into the response shape
 * each Lambda integration expects, and re-throw everything else.
 *
 * Every handler reports through {@link getLogger} instead of `console.error`. The
 * `console` methods bypass the logger sink entirely, so any per-invocation buffering
 * installed with `setLogSink` would drop precisely the error line — the one that
 * matters. Going through the logger also keeps the record shape uniform: the thrown
 * value is normalized by {@link toErrorLog}, so an `Error` keeps its stack while any
 * other value lands under `err`, and CloudWatch Logs Insights can query one field.
 *
 * @module errors/handlers/handleLambdaError
 */
import { getLogger, toErrorLog } from '../../loggers/logger.js';
import type { ErrorBodyShaper } from '../http/errorBody.js';
import { HttpError } from '../http/HttpError.js';

/**
 * API Gateway error response format
 */
export interface ApiGatewayErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * API Gateway V2 error response format
 */
export interface ApiGatewayErrorResponseV2 {
  statusCode: number;
  headers: Record<string, string | boolean | number>;
  body: string;
  cookies?: string[];
}

/**
 * Generic Lambda error response for non-HTTP triggers
 */
export interface GenericLambdaErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  data?: unknown;
}

/**
 * Handles errors in API Gateway Lambda functions
 *
 * If error is HttpError: returns formatted API Gateway response
 * Otherwise: re-throws the error
 *
 * @param error - The error that occurred
 * @returns API Gateway response format
 * @throws Re-throws error if not HttpError
 *
 * @example
 * ```typescript
 * export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
 *   logApiGatewayEvent(event, context);
 *   try {
 *     const params = extractEventParams(schema, event);
 *     // ... your code
 *     return { statusCode: 200, body: JSON.stringify({ success: true }) };
 *   } catch (error) {
 *     return handleApiGatewayError(error);
 *   }
 * };
 * ```
 */
export function handleApiGatewayError(
  error: unknown,
  shaper?: ErrorBodyShaper
): ApiGatewayErrorResponse | never {
  if (error instanceof HttpError) {
    getLogger().error(toErrorLog(error), 'API Gateway HttpError');
    const response = error.toApiGatewayResponse(undefined, shaper);
    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string>,
      body: response.body,
    };
  }

  getLogger().error(toErrorLog(error), 'API Gateway Unknown Error');
  throw error;
}

/**
 * Handles errors in API Gateway V2 (HTTP API) Lambda functions
 *
 * If error is HttpError: returns formatted API Gateway V2 response
 * Otherwise: re-throws the error
 *
 * @param error - The error that occurred
 * @param cookies - Optional cookies to set in the response
 * @returns API Gateway V2 response format
 * @throws Re-throws error if not HttpError
 *
 * @example
 * ```typescript
 * export const handler = async (event: APIGatewayProxyEventV2, context: Context) => {
 *   logApiGatewayEventV2(event, context);
 *   try {
 *     const params = extractEventParams(schema, event);
 *     // ... your code
 *     return { statusCode: 200, body: JSON.stringify({ success: true }) };
 *   } catch (error) {
 *     return handleApiGatewayErrorV2(error);
 *   }
 * };
 * ```
 */
export function handleApiGatewayErrorV2(
  error: unknown,
  cookies?: string[],
  shaper?: ErrorBodyShaper
): ApiGatewayErrorResponseV2 | never {
  if (error instanceof HttpError) {
    getLogger().error(toErrorLog(error), 'API Gateway V2 HttpError');
    const response = error.toApiGatewayResponseV2(undefined, cookies, shaper);
    // `APIGatewayProxyStructuredResultV2` declares every field optional, so the three
    // values below are filled in with real defaults instead of non-null assertions:
    // a subclass overriding `toApiGatewayResponseV2` may legitimately return a
    // partial response, and `ApiGatewayErrorResponseV2` promises them to be present.
    return {
      statusCode: response.statusCode ?? error.statusCode,
      headers: (response.headers ?? {}) as Record<string, string | boolean | number>,
      body: response.body ?? '',
      ...(response.cookies && { cookies: response.cookies }),
    };
  }

  getLogger().error(toErrorLog(error), 'API Gateway V2 Unknown Error');
  throw error;
}

/**
 * Error handler for triggers whose caller reads the **returned value**.
 *
 * If error is HttpError: returns structured error response
 * Otherwise: re-throws the error (allows Lambda retry logic)
 *
 * Use it for a direct `Invoke` (which is what {@link handleInvokeError} names), or for a
 * custom integration that inspects the payload it gets back.
 *
 * ⚠️ **Not for asynchronous triggers or pollers.** EventBridge, S3 and SNS invoke
 * asynchronously: Lambda discards the return value and branches only on resolve-vs-reject, so
 * returning a structured error marks the invocation as successful — no async retries, no
 * on-failure destination, no DLQ. SQS and DynamoDB Streams are worse still: a resolved promise
 * means the message is deleted or the shard checkpoint advances, and the event is gone for
 * good. Those triggers need {@link rethrowLambdaError}.
 *
 * @param error - The error that occurred
 * @returns Generic error response format
 * @throws Re-throws error if not HttpError (for retry logic)
 *
 * @example
 * ```typescript
 * export const handler = async (event: InvokePayload, context: Context) => {
 *   try {
 *     // ... your code
 *   } catch (error) {
 *     return handleGenericError(error);
 *   }
 * };
 * ```
 */
export function handleGenericError(error: unknown): GenericLambdaErrorResponse | never {
  if (error instanceof HttpError) {
    getLogger().error(toErrorLog(error), 'Lambda HttpError');
    return error.toGenericResponse();
  }

  getLogger().error(toErrorLog(error), 'Lambda Unknown Error');
  throw error;
}

/**
 * Logs the error and always re-throws it — the correct handler for every trigger where
 * failure must be visible to the platform.
 *
 * For an asynchronous invocation (EventBridge, S3, SNS) rejecting is what triggers Lambda's
 * async retries, the on-failure destination and the DLQ. For a poller (SQS, DynamoDB Streams
 * without partial batch responses) it is what stops the message being deleted or the shard
 * checkpoint advancing past a record that was never processed. Returning a value instead —
 * which is what {@link handleGenericError} does for an `HttpError` — reports success for a
 * failed invocation, and the event is lost with a green dashboard.
 *
 * @param error - The error that occurred
 * @returns Never returns — always throws
 * @throws Always re-throws the error it was given
 *
 * @example
 * ```typescript
 * export const handler = async (event: EventBridgeEvent<string, Detail>, context: Context) => {
 *   logEventBridgeEvent(event, context);
 *   try {
 *     await process(event.detail);
 *   } catch (error) {
 *     rethrowLambdaError(error);
 *   }
 * };
 * ```
 */
export function rethrowLambdaError(error: unknown): never {
  getLogger().error(
    toErrorLog(error),
    error instanceof HttpError ? 'Lambda HttpError' : 'Lambda Unknown Error'
  );

  throw error;
}

/**
 * Alias for handleGenericError - for a Lambda invoked directly, whose caller reads the
 * returned payload.
 * @see handleGenericError
 */
export const handleInvokeError = handleGenericError;

/**
 * Alias for handleGenericError - for SQS Lambda functions
 *
 * @deprecated An SQS handler that returns instead of throwing tells the poller the batch
 * succeeded, so the message is deleted rather than retried. Use {@link rethrowLambdaError},
 * or `createSqsHandler`, which reports per-record failures.
 * @see handleGenericError
 */
export const handleSqsError = handleGenericError;

/**
 * Alias for handleGenericError - for SNS Lambda functions
 *
 * @deprecated SNS invokes asynchronously and discards the return value, so returning an error
 * marks the invocation successful and skips the retries and the DLQ. Use
 * {@link rethrowLambdaError}.
 * @see handleGenericError
 */
export const handleSnsError = handleGenericError;

/**
 * Alias for handleGenericError - for EventBridge Lambda functions
 *
 * @deprecated EventBridge invokes asynchronously and discards the return value, so returning
 * an error marks the invocation successful and skips the retries and the DLQ. Use
 * {@link rethrowLambdaError}.
 * @see handleGenericError
 */
export const handleEventBridgeError = handleGenericError;

/**
 * Alias for handleGenericError - for S3 Lambda functions
 *
 * @deprecated S3 invokes asynchronously and discards the return value, so returning an error
 * marks the invocation successful and skips the retries and the DLQ. Use
 * {@link rethrowLambdaError}.
 * @see handleGenericError
 */
export const handleS3Error = handleGenericError;

/**
 * Alias for handleGenericError - for DynamoDB Stream Lambda functions
 *
 * @deprecated Returning tells the poller the batch succeeded, so the shard checkpoint advances
 * past records that were never processed. Use {@link rethrowLambdaError}.
 * @see handleGenericError
 */
export const handleDynamoDBStreamError = handleGenericError;

/**
 * Handles errors in AppSync resolver Lambda functions
 *
 * AppSync expects errors to be thrown, not returned. This handler
 * logs the error and always re-throws it so AppSync can format it
 * properly in the GraphQL errors array.
 *
 * @param error - The error that occurred
 * @returns Never returns - always throws
 * @throws Always re-throws the error for AppSync to handle
 *
 * @example
 * ```typescript
 * export const resolver: AppSyncResolverHandler<Args, Result> = async (event, context) => {
 *   logAppSyncEvent(event, context);
 *   try {
 *     const params = extractEventParams(schema, { custom: event.arguments } as any);
 *     // ... your code
 *     return result;
 *   } catch (error) {
 *     return handleAppSyncError(error);
 *   }
 * };
 * ```
 */
export function handleAppSyncError(error: unknown): never {
  if (error instanceof HttpError) {
    getLogger().error(toErrorLog(error), 'AppSync HttpError');
  }

  // AppSync always expects errors to be thrown
  // It will format them in the GraphQL errors array
  throw error;
}
