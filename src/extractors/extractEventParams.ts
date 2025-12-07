import { APIGatewayProxyEvent } from 'aws-lambda';
import { Unauthorized, UnprocessableEntity } from '../errors';

/**
 * Configuration for a single parameter extraction
 */
export interface ParameterConfig {
  /** Human-readable label for the parameter */
  label: string;
  /** Whether the parameter is required */
  required?: boolean;
  /** HTTP status code to return on error (default: 400, or 401 for unauthorized) */
  statusCodeError?: number;
  /** Custom error message when parameter is not found */
  notFoundError?: string;
  /** Expected type for validation */
  expectedType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
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
 * Schema definition for event parameter extraction
 * Supports nested paths like: { body: { user: { email: { ... } } } }
 */
export interface EventSchema {
  [key: string]: Record<string, ParameterConfig> | EventSchema;
}

/**
 * Extracts and validates parameters from AWS Lambda events with comprehensive validation
 * 
 * @template T - The expected return type
 * @param schema - Schema defining parameters to extract and their validation rules
 * @param event - AWS Lambda event (APIGatewayProxyEvent, SQS, SNS, DynamoDB, S3, or custom)
 * @returns Extracted and validated parameters
 * @throws {UnprocessableEntity} When validation fails (multiple errors collected)
 * @throws {Unauthorized} When a 401 error is configured
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
 *       statusCodeError: 401,
 *       notFoundError: 'Authorization header required'
 *     }
 *   }
 * };
 * ```
 */
export function extractEventParams<T = Record<string, unknown>>(
  schema: EventSchema,
  event:
    | APIGatewayProxyEvent
    | Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  let firstErrorStatusCode = 400;

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
      errors['body'] = 'Invalid JSON in request body';
      firstErrorStatusCode = 400;
    }
  }

  /**
   * Recursively processes schema and extracts parameters
   */
  const processSchema = (schemaObj: EventSchema, pathPrefix = '') => {
    Object.entries(schemaObj).forEach(([key, value]) => {
      if (isParameterConfig(value)) {
        const fullKey = pathPrefix ? `${pathPrefix}.${key}` : key;
        const paramValue = getNestedValue(eventData, fullKey, value.caseInsensitive);

        // Check if parameter is missing
        if (paramValue === undefined || paramValue === null) {
          if (value.required) {
            const statusCode = value.statusCodeError || 400;
            const errorMessage = value.notFoundError || `${value.label} is required`;
            
            if (Object.keys(errors).length === 0) {
              firstErrorStatusCode = statusCode;
            }
            
            errors[fullKey] = errorMessage;
            return;
          }
          
          if (value.default !== undefined) {
            result[key] = value.default;
            return;
          }
          
          return;
        }

        // Validate expected type
        if (value.expectedType) {
          const isValid =
            value.expectedType === 'array'
              ? Array.isArray(paramValue)
              : typeof paramValue === value.expectedType;

          if (!isValid) {
            const statusCode = value.statusCodeError || 400;
            const errorMessage =
              value.wrongTypeMessage || `${value.label} must be of type ${value.expectedType}`;
            
            if (Object.keys(errors).length === 0) {
              firstErrorStatusCode = statusCode;
            }
            
            errors[fullKey] = errorMessage;
            return;
          }
        }

        // Apply decoder if provided
        let finalValue: unknown = paramValue;
        
        if (value.decoder) {
          try {
            finalValue = value.decoder(paramValue);
          } catch (decoderError) {
            const statusCode = value.statusCodeError || 400;
            const errorMessage = value.wrongTypeMessage || `${value.label} has invalid format`;
            
            if (Object.keys(errors).length === 0) {
              firstErrorStatusCode = statusCode;
            }
            
            errors[fullKey] = errorMessage;
            return;
          }
        }
        
        result[key] = finalValue;
      } else if (value && typeof value === 'object') {
        // Recursively process nested schema
        const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        processSchema(value as EventSchema, newPath);
      }
    });
  };

  // Process the schema
  processSchema(schema);

  // If there are validation errors, throw appropriate error
  if (Object.keys(errors).length > 0) {
    if (firstErrorStatusCode === 401) {
      throw new Unauthorized(Object.values(errors)[0]);
    } else {
      throw new UnprocessableEntity(Object.values(errors)[0], errors);
    }
  }

  return result as T;
}
