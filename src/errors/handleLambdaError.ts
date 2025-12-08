import { APIGatewayProxyResult } from 'aws-lambda';
import { HttpError } from './HttpError';

/**
 * API Gateway error response format
 */
export interface ApiGatewayErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
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
export function handleApiGatewayError(error: unknown): ApiGatewayErrorResponse | never {
  if (error instanceof HttpError) {
    const response = error.toApiGatewayResponse();
    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string>,
      body: response.body,
    };
  }
  throw error;
}

/**
 * Generic error handler for non-HTTP Lambda triggers
 * 
 * If error is HttpError: returns structured error response
 * Otherwise: re-throws the error (allows Lambda retry logic)
 * 
 * Use this for SQS, SNS, EventBridge, S3, DynamoDB Streams, and other non-HTTP triggers
 * 
 * @param error - The error that occurred
 * @returns Generic error response format
 * @throws Re-throws error if not HttpError (for retry logic)
 * 
 * @example
 * ```typescript
 * export const handler = async (event: SQSEvent, context: Context) => {
 *   logSqsEvent(event, context);
 *   try {
 *     // ... process records
 *   } catch (error) {
 *     return handleGenericError(error);
 *   }
 * };
 * ```
 */
export function handleGenericError(error: unknown): GenericLambdaErrorResponse | never {
  if (error instanceof HttpError) {
    return error.toGenericResponse();
  }
  throw error;
}

/**
 * Alias for handleGenericError - for SQS Lambda functions
 * @see handleGenericError
 */
export const handleSqsError = handleGenericError;

/**
 * Alias for handleGenericError - for SNS Lambda functions
 * @see handleGenericError
 */
export const handleSnsError = handleGenericError;

/**
 * Alias for handleGenericError - for EventBridge Lambda functions
 * @see handleGenericError
 */
export const handleEventBridgeError = handleGenericError;

/**
 * Alias for handleGenericError - for S3 Lambda functions
 * @see handleGenericError
 */
export const handleS3Error = handleGenericError;

/**
 * Alias for handleGenericError - for DynamoDB Stream Lambda functions
 * @see handleGenericError
 */
export const handleDynamoDBStreamError = handleGenericError;
