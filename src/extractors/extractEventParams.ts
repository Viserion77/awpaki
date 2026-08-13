import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  AppSyncResolverEvent,
} from 'aws-lambda';
import { createHttpError, HttpStatus } from '../errors/index.js';
import type { HttpErrorStatusType } from '../errors/index.js';

/**
 * Events {@link extractEventParams} knows how to read.
 *
 * The named shapes are listed explicitly because `APIGatewayProxyEventV2` (and the other
 * `aws-lambda` interfaces) have no index signature, so they are *not* assignable to
 * `Record<string, unknown>` — accepting only the record form would reject a payload 2.0
 * event with TS2345. `Record<string, unknown>` stays in the union for SQS/SNS/S3/DynamoDB
 * records and for the plain objects that `createInvokeHandler` normalises.
 */
export type LambdaEventLike =
  | APIGatewayProxyEvent
  | APIGatewayProxyEventV2
  | AppSyncResolverEvent<any, any>
  | Record<string, unknown>;

/**
 * Valid parameter types for validation
 *
 * `OBJECT` and `ARRAY` are mutually exclusive: an array never satisfies `OBJECT`,
 * and a plain object never satisfies `ARRAY`.
 */
export enum ParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  /** Plain object only — arrays and `null` are rejected */
  OBJECT = 'object',
  /** Array only — plain objects are rejected */
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
 * Options of {@link extractEventParams}.
 */
export interface ExtractEventParamsOptions {
  /**
   * Status used for a field that fails validation and declares no `statusCodeError` of its
   * own. Defaults to `422 Unprocessable Entity`.
   *
   * Set it once — on the factory, usually — for an API whose contract answers `400` to every
   * malformed request, instead of repeating `statusCodeError` on every field.
   */
  validationStatusCode?: HttpErrorStatusType;

  /**
   * `code` carried by the thrown error, for a service whose clients branch on a stable code
   * rather than on prose. Defaults to the code derived from the status.
   */
  validationErrorCode?: string;
}

/**
 * Statuses that must win over a numerically higher one when a request fails several checks.
 *
 * `Math.max` picks 422 over 401, so adding an unrelated body field to a schema silently
 * downgraded a missing `Authorization` header to a validation error — losing the status the
 * caller needed and hiding the failure from anything alerting on 401 rates. Authentication
 * and authorization come first because they describe *who is asking* rather than *what was
 * sent*, and a caller who is not allowed in learns nothing from a field-level complaint.
 */
const STATUS_PRIORITY: readonly number[] = [
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
];

/**
 * Picks the status to answer with when several fields failed.
 *
 * @param statusCodes - Status of every recorded failure
 * @returns The most severe status
 */
function mostSevereStatus(statusCodes: number[]): number {
  const prioritised = STATUS_PRIORITY.find((candidate) => statusCodes.includes(candidate));

  return prioritised ?? Math.max(...statusCodes);
}

/**
 * Fails when two schema entries would write to the same key of the result.
 *
 * Extraction flattens onto the **leaf** name (`body.tenantId` becomes `params.tenantId`) while
 * errors are keyed by the full path, so two branches declaring the same leaf used to collide
 * silently, last declaration winning. With `pathParameters.tenantId` and `body.tenantId` in
 * one schema that hands `execute` the attacker-controlled value in place of the verified one.
 *
 * A broken schema is a programming error, not a bad request: `TypeError` fails the invocation
 * with a 5xx on the first call in any environment, instead of becoming a 4xx that monitoring
 * treats as the caller's fault.
 *
 * @param claimedBy - Leaf names already written, mapped to the path that claimed them
 * @param key - Leaf name about to be written
 * @param fullKey - Full path of the entry writing it
 * @returns Nothing
 * @throws TypeError when the leaf name is already taken
 */
function assertLeafIsUnclaimed(claimedBy: Map<string, string>, key: string, fullKey: string): void {
  const previous = claimedBy.get(key);

  if (previous !== undefined && previous !== fullKey) {
    throw new TypeError(
      `extractEventParams: schema entries '${previous}' and '${fullKey}' both extract to ` +
        `'${key}'. Extraction is flat, so one would silently overwrite the other — rename ` +
        'one of them, or read it from the raw event.'
    );
  }

  claimedBy.set(key, fullKey);
}

/** Keys that only ever appear in a {@link ParameterConfig}, never in a nested schema. */
const CONFIG_ONLY_KEYS = [
  'required',
  'expectedType',
  'decoder',
  'default',
  'statusCodeError',
  'notFoundError',
  'wrongTypeMessage',
  'caseInsensitive',
] as const;

/**
 * Fails when a node that is being walked as a nested schema looks like a parameter config.
 *
 * `label` is the sole discriminator, so a config that omits it is walked as a group of nested
 * parameters — the field is never extracted and never validated, `required: true` included,
 * and the handler receives `undefined` for something the schema declares mandatory.
 *
 * @param node - Schema node about to be walked as a nested schema
 * @param path - Path of the node, for the message
 * @returns Nothing
 * @throws TypeError when the node carries parameter-config keys
 */
function assertNotAMisreadConfig(node: Record<string, unknown>, path: string): void {
  const configKeys = CONFIG_ONLY_KEYS.filter((key) => key in node);

  if (configKeys.length > 0) {
    throw new TypeError(
      `extractEventParams: '${path}' carries ${configKeys.join(', ')} but no 'label', so it ` +
        'is being read as a nested schema and never validated. Add a label to make it a ' +
        'parameter.'
    );
  }
}

/**
 * Extracts and validates parameters from AWS Lambda events with comprehensive validation
 *
 * @template T - The expected return type
 * @param schema - Schema defining parameters to extract and their validation rules
 * @param event - AWS Lambda event (APIGatewayProxyEvent, SQS, SNS, DynamoDB, S3, or custom)
 * @param options - Default status and code for validation failures
 * @returns Extracted and validated parameters
 * @throws {HttpError} Appropriate HTTP error based on statusCodeError (use HttpStatus enum)
 *                     - HttpStatus.BAD_REQUEST (400): BadRequest
 *                     - HttpStatus.UNAUTHORIZED (401): Unauthorized
 *                     - HttpStatus.NOT_FOUND (404): NotFound
 *                     - HttpStatus.UNPROCESSABLE_ENTITY (422): UnprocessableEntity (default)
 *                     - Falls back to HttpStatus.NOT_IMPLEMENTED (501) for unmapped codes
 * @throws {TypeError} When the schema itself is wrong: two entries extracting to the same
 *                     leaf name, or a parameter config with no `label`
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
  event: LambdaEventLike,
  options: ExtractEventParamsOptions = {}
): T {
  const result: Record<string, unknown> = {};
  const errors: Record<string, [number, string]> = {};
  const errorStatusCodes: Record<string, number> = {};
  // Full path of the schema entry that claimed each leaf name, so a second entry claiming the
  // same one is reported instead of silently overwriting it.
  const claimedBy = new Map<string, string>();
  const fallbackStatus = options.validationStatusCode ?? HttpStatus.UNPROCESSABLE_ENTITY;

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
        const key = Object.keys(accObj).find((k) => k.toLowerCase() === part.toLowerCase());
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
    } catch {
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
            const statusCode = value.statusCodeError ?? fallbackStatus;
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
          // `typeof` alone is not enough for structural types: `typeof [] === 'object'` and
          // `typeof null === 'object'`, so OBJECT and ARRAY need explicit, mutually exclusive checks.
          let isValid: boolean;

          if (value.expectedType === ParameterType.ARRAY) {
            isValid = Array.isArray(paramValue);
          } else if (value.expectedType === ParameterType.OBJECT) {
            isValid =
              typeof paramValue === 'object' && paramValue !== null && !Array.isArray(paramValue);
          } else {
            isValid = typeof paramValue === value.expectedType;
          }

          if (!isValid) {
            const statusCode = value.statusCodeError ?? fallbackStatus;
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
          } catch {
            const statusCode = value.statusCodeError ?? fallbackStatus;
            const errorMessage = value.wrongTypeMessage || `${value.label} has invalid format`;

            errors[fullKey] = [statusCode, errorMessage];
            errorStatusCodes[fullKey] = statusCode;
            continue;
          }
        }

        assertLeafIsUnclaimed(claimedBy, key, fullKey);
        result[key] = finalValue;
      } else if (value && typeof value === 'object') {
        assertNotAMisreadConfig(
          value as Record<string, unknown>,
          pathPrefix ? `${pathPrefix}.${key}` : key
        );

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

      throw createHttpError(statusCode, errorMessage, { errors }, undefined, {
        code: options.validationErrorCode,
      });
    }

    // Multiple errors - report the most severe, which is not the numerically highest.
    const highestStatusCode = mostSevereStatus(statusCodes);

    // Check if all errors have the same status code
    if (uniqueStatusCodes.length === 1) {
      const statusCode = uniqueStatusCodes[0];
      const message = `Multiple validation errors (${errorCount} errors, status ${statusCode})`;

      throw createHttpError(statusCode, message, { errors }, undefined, {
        code: options.validationErrorCode,
      });
    }

    // Multiple different status codes - group by status
    const errorsByStatus: Record<number, string[]> = {};
    for (const [key, statusCode] of Object.entries(errorStatusCodes)) {
      if (!errorsByStatus[statusCode]) {
        errorsByStatus[statusCode] = [];
      }
      errorsByStatus[statusCode].push(`${key}: ${errors[key][1]}`);
    }

    const statusSummary = Object.entries(errorsByStatus)
      .map(([code, errs]) => `${errs.length}×${code}`)
      .join(', ');

    const message = `Multiple validation errors (${statusSummary})`;

    throw createHttpError(highestStatusCode, message, { errors }, undefined, {
      code: options.validationErrorCode,
    });
  }

  return result as T;
}
