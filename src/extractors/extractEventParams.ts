import { APIGatewayProxyEvent, AppSyncResolverEvent } from 'aws-lambda';
import { createHttpError, HttpStatus } from '../errors';

/**
 * Valid parameter types for validation
 */
export enum ParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
}

/**
 * Configuration for a single parameter extraction
 */
export interface ParameterConfig {
  /** Human-readable label for the parameter */
  label: string;
  /** Whether the parameter is required */
  required?: boolean;
  /** HTTP status code to return on error (use HttpStatus enum) */
  statusCodeError?: HttpStatus;
  /** Custom error message when parameter is not found */
  notFoundError?: string;
  /** Expected type for validation (use ParameterType enum) */
  expectedType?: ParameterType;
  /** Custom error message when type is wrong */
  wrongTypeMessage?: string;
  /** Default value if parameter is not provided */
  default?: unknown;
  /** Whether to perform case-insensitive matching */
  caseInsensitive?: boolean;
  /** Custom decoder/transformer function */
  decoder?: (value: unknown) => unknown;
}

/**
 * Recursive type for schema values - allows ParameterConfig or nested schemas
 */
export type SchemaValue = ParameterConfig | { [key: string]: SchemaValue };

/**
 * Schema definition for event parameter extraction
 * Supports nested paths like: { body: { user: { email: { ... } } } }
 * Also supports mixed levels: { identity: { sub: {...}, claims: { email: {...} } } }
 */
export interface EventSchema {
  [key: string]: SchemaValue;
}

/**
 * Extracts and validates parameters from AWS Lambda events with comprehensive validation
 * 
 * @template T - The expected return type
 * @param schema - Schema defining parameters to extract and their validation rules
 * @param event - AWS Lambda event (APIGatewayProxyEvent, SQS, SNS, DynamoDB, S3, or custom)
 * @returns Extracted and validated parameters
 * @throws {HttpError} Appropriate HTTP error based on statusCodeError (use HttpStatus enum)
 *                     - HttpStatus.BAD_REQUEST (400): BadRequest
 *                     - HttpStatus.UNAUTHORIZED (401): Unauthorized
 *                     - HttpStatus.NOT_FOUND (404): NotFound
 *                     - HttpStatus.UNPROCESSABLE_ENTITY (422): UnprocessableEntity (default)
 *                     - Falls back to HttpStatus.NOT_IMPLEMENTED (501) for unmapped codes
 * 
 * @example
 * ```typescript
 * // Extract from API Gateway event
 * const schema = {
 *   pathParameters: {
 *     id: {
 *       label: 'User ID',
 *       required: true,
 *       expectedType: 'string'
 *     }
 *   },
 *   body: {
 *     email: {
 *       label: 'Email',
 *       required: true,
 *       expectedType: 'string'
 *     },
 *     age: {
 *       label: 'Age',
 *       expectedType: 'number',
 *       default: 18
 *     }
 *   }
 * };
 * 
 * const params = extractEventParams<{
 *   id: string;
 *   email: string;
 *   age: number;
 * }>(schema, event);
 * ```
 * 
 * @example
 * ```typescript
 * // With custom decoder
 * const schema = {
 *   queryStringParameters: {
 *     date: {
 *       label: 'Date',
 *       required: true,
 *       decoder: (value) => new Date(value as string)
 *     }
 *   }
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Case insensitive headers
 * const schema = {
 *   headers: {
 *     authorization: {
 *       label: 'Authorization',
 *       required: true,
 *       caseInsensitive: true,
 *       statusCodeError: HttpStatus.UNAUTHORIZED,
 *       notFoundError: 'Authorization header required'
 *     }
 *   }
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // AppSync resolver with identity claims
 * const schema = {
 *   arguments: {
 *     id: {
 *       label: 'User ID',
 *       required: true,
 *       expectedType: ParameterType.STRING
 *     }
 *   },
 *   identity: {
 *     sub: {
 *       label: 'User Sub',
 *       required: true
 *     },
 *     claims: {
 *       email: {
 *         label: 'Email from claims',
 *         required: true
 *       }
 *     }
 *   }
 * };
 * 
 * const params = extractEventParams(schema, event);
 * // params.id, params.sub, params.email
 * ```
 */
export function extractEventParams<T = Record<string, unknown>>(
  schema: EventSchema,
  event:
    | APIGatewayProxyEvent
    | AppSyncResolverEvent<any, any>
    | Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  const errors: Record<string, [number, string]> = {};
  const errorStatusCodes: Record<string, number> = {};

  /**
   * Recursively gets nested value from object using dot notation
   */
  const getNestedValue = (
    obj: Record<string, unknown>,
    path: string,
    caseInsensitive = false
  ): unknown => {
    return path.split('.').reduce<unknown>((acc, part) => {
      if (!acc || typeof acc !== 'object') return acc;
      const accObj = acc as Record<string, unknown>;
      
      if (caseInsensitive) {
        const key = Object.keys(accObj).find(k => k.toLowerCase() === part.toLowerCase());
        return key ? accObj[key] : undefined;
      }
      
      return accObj[part];
    }, obj);
  };

  /**
   * Type guard to check if object is a ParameterConfig
   */
  const isParameterConfig = (obj: unknown): obj is ParameterConfig => {
    return obj !== null && typeof obj === 'object' && 'label' in obj;
  };

  // Prepare event data - parse body if it's a string
  const eventData: Record<string, unknown> = { ...event } as Record<string, unknown>;
  
  if ('body' in event && typeof event.body === 'string') {
    try {
      eventData.body = JSON.parse(event.body) as unknown;
    } catch (parseError) {
      errors['body'] = [HttpStatus.BAD_REQUEST, 'Invalid JSON in request body'];
      errorStatusCodes['body'] = HttpStatus.BAD_REQUEST;
    }
  }

  /**
   * Recursively processes schema and extracts parameters
   */
  const processSchema = (schemaObj: EventSchema, pathPrefix = '') => {
    for (const [key, value] of Object.entries(schemaObj)) {
      
      if (isParameterConfig(value)) {
        const fullKey = pathPrefix ? `${pathPrefix}.${key}` : key;
        const paramValue = getNestedValue(eventData, fullKey, value.caseInsensitive);

        // Check if parameter is missing
        if (paramValue === undefined || paramValue === null) {
          if (value.required) {
            const statusCode = value.statusCodeError || HttpStatus.UNPROCESSABLE_ENTITY;
            const errorMessage = value.notFoundError || `${value.label} is required`;
            
            errors[fullKey] = [statusCode, errorMessage];
            errorStatusCodes[fullKey] = statusCode;
            continue;
          }
          
          if (value.default !== undefined) {
            result[key] = value.default;
            continue;
          }
          
          continue;
        }

        // Validate expected type
        if (value.expectedType) {
          const isValid =
            value.expectedType === ParameterType.ARRAY
              ? Array.isArray(paramValue)
              : typeof paramValue === value.expectedType;

          if (!isValid) {
            const statusCode = value.statusCodeError || HttpStatus.UNPROCESSABLE_ENTITY;
            const errorMessage =
              value.wrongTypeMessage || `${value.label} must be of type ${value.expectedType}`;
            
            errors[fullKey] = [statusCode, errorMessage];
            errorStatusCodes[fullKey] = statusCode;
            continue;
          }
        }

        // Apply decoder if provided
        let finalValue: unknown = paramValue;
        
        if (value.decoder) {
          try {
            finalValue = value.decoder(paramValue);
          } catch (decoderError) {
            const statusCode = value.statusCodeError || HttpStatus.UNPROCESSABLE_ENTITY;
            const errorMessage = value.wrongTypeMessage || `${value.label} has invalid format`;
            
            errors[fullKey] = [statusCode, errorMessage];
            errorStatusCodes[fullKey] = statusCode;
            continue;
          }
        }
        
        result[key] = finalValue;
      } else if (value && typeof value === 'object') {
        // Recursively process nested schema
        const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        processSchema(value as EventSchema, newPath);
      }
    }
  };

  // Process the schema
  processSchema(schema);

  // If there are validation errors, throw appropriate error
  if (Object.keys(errors).length > 0) {
    const errorCount = Object.keys(errors).length;
    const statusCodes = Object.values(errorStatusCodes);
    const uniqueStatusCodes = [...new Set(statusCodes)];
    
    // Single error - use its status code and message
    if (errorCount === 1) {
      const statusCode = statusCodes[0];
      const [, errorMessage] = Object.values(errors)[0];
      
      throw createHttpError(statusCode, errorMessage, { errors });
    }
    
    // Multiple errors - use highest status code
    const highestStatusCode = Math.max(...statusCodes);
    
    // Check if all errors have the same status code
    if (uniqueStatusCodes.length === 1) {
      const statusCode = uniqueStatusCodes[0];
      const message = `Multiple validation errors (${errorCount} errors, status ${statusCode})`;
      
      throw createHttpError(statusCode, message, { errors });
    }
    
    // Multiple different status codes - group by status
    const errorsByStatus: Record<number, string[]> = {};
    Object.entries(errorStatusCodes).forEach(([key, statusCode]) => {
      if (!errorsByStatus[statusCode]) {
        errorsByStatus[statusCode] = [];
      }
      errorsByStatus[statusCode].push(`${key}: ${errors[key][1]}`);
    });
    
    const statusSummary = Object.entries(errorsByStatus)
      .map(([code, errs]) => `${errs.length}×${code}`)
      .join(', ');
    
    const message = `Multiple validation errors (${statusSummary})`;
    
    throw createHttpError(highestStatusCode, message, { errors });
  }

  return result as T;
}
