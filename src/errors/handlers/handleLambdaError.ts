import { APIGatewayProxyResult } from 'aws-lambda';
import { HttpError } from '../http/HttpError';

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
    console.error('API Gateway HttpError:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      data: error.data,
    });
    const response = error.toApiGatewayResponse();
    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string>,
      body: response.body,
    };
  }
  
  console.error('API Gateway Unknown Error:', error);
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
    console.error('Lambda HttpError:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      data: error.data,
    });
    return error.toGenericResponse();
  }
  
  console.error('Lambda Unknown Error:', error);
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
    console.error('AppSync HttpError:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      data: error.data,
    });
  }
  
  // AppSync always expects errors to be thrown
  // It will format them in the GraphQL errors array
  throw error;
}
