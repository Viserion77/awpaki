/**
 * HTTP Status Codes Enum
 * Provides type-safe constants for HTTP status codes
 * 
 * @example
 * ```typescript
 * import { HttpStatus } from 'awpaki';
 * 
 * // Use in schema
 * const schema = {
 *   body: {
 *     email: {
 *       label: 'Email',
 *       required: true,
 *       statusCodeError: HttpStatus.BAD_REQUEST  // 400
 *     }
 *   }
 * };
 * 
 * // Use with createHttpError
 * throw createHttpError(HttpStatus.NOT_FOUND, 'User not found');
 * 
 * // Type-safe validation
 * const isClientError = (code: HttpStatus) => code >= 400 && code < 500;
 * ```
 */
export enum HttpStatus {
  // 4xx Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PRECONDITION_FAILED = 412,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  
  // 5xx Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Type guard to check if a number is a valid mapped HTTP status code
 * 
 * @param code - Status code to validate
 * @returns True if the code is mapped in HttpStatus enum
 * 
 * @example
 * ```typescript
 * isValidHttpStatus(404); // true
 * isValidHttpStatus(999); // false
 * ```
 */
export function isValidHttpStatus(code: number): code is HttpStatus {
  return Object.values(HttpStatus).includes(code as HttpStatus);
}

/**
 * Gets the error class name for a given status code
 * 
 * @param status - HTTP status code
 * @returns Error class name or undefined if not mapped
 * 
 * @example
 * ```typescript
 * getHttpStatusName(HttpStatus.NOT_FOUND); // "NotFound"
 * getHttpStatusName(404); // "NotFound"
 * getHttpStatusName(999); // undefined
 * ```
 */
export function getHttpStatusName(status: HttpStatus | number): string | undefined {
  const statusNames: Record<HttpStatus, string> = {
    [HttpStatus.BAD_REQUEST]: 'BadRequest',
    [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'NotFound',
    [HttpStatus.CONFLICT]: 'Conflict',
    [HttpStatus.PRECONDITION_FAILED]: 'PreconditionFailed',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'UnprocessableEntity',
    [HttpStatus.TOO_MANY_REQUESTS]: 'TooManyRequests',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'InternalServerError',
    [HttpStatus.NOT_IMPLEMENTED]: 'NotImplemented',
    [HttpStatus.BAD_GATEWAY]: 'BadGateway',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'ServiceUnavailable',
  };
  
  return statusNames[status as HttpStatus];
}
