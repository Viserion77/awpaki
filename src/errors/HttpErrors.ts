import { HttpError } from './HttpError';
import { HttpStatus } from './HttpStatus';

// Re-export HttpStatus for convenience
export { HttpStatus };

/**
 * 400 Bad Request
 * Used when the request is malformed or contains invalid data
 * 
 * @example
 * ```typescript
 * throw new BadRequest('Invalid JSON format');
 * throw new BadRequest('Missing required field', { field: 'email' });
 * ```
 */
export class BadRequest extends HttpError {
  constructor(
    message: string = 'Bad Request',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.BAD_REQUEST, data, headers);
  }
}

/**
 * 401 Unauthorized
 * Used when authentication is required but not provided or invalid
 * 
 * @example
 * ```typescript
 * throw new Unauthorized('Invalid credentials');
 * throw new Unauthorized('Token expired');
 * ```
 */
export class Unauthorized extends HttpError {
  constructor(
    message: string = 'Unauthorized',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.UNAUTHORIZED, data, headers);
  }
}

/**
 * 403 Forbidden
 * Used when the user is authenticated but doesn't have permission
 * 
 * @example
 * ```typescript
 * throw new Forbidden('Access denied');
 * throw new Forbidden('Insufficient permissions');
 * ```
 */
export class Forbidden extends HttpError {
  constructor(
    message: string = 'Forbidden',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.FORBIDDEN, data, headers);
  }
}

/**
 * 404 Not Found
 * Used when a resource cannot be found
 * 
 * @example
 * ```typescript
 * throw new NotFound('User not found');
 * throw new NotFound('Resource not found', { resourceId: '123' });
 * ```
 */
export class NotFound extends HttpError {
  constructor(
    message: string = 'Not Found',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.NOT_FOUND, data, headers);
  }
}

/**
 * 409 Conflict
 * Used when the request conflicts with the current state
 * 
 * @example
 * ```typescript
 * throw new Conflict('Email already exists');
 * throw new Conflict('Resource already exists', { id: '123' });
 * ```
 */
export class Conflict extends HttpError {
  constructor(
    message: string = 'Conflict',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.CONFLICT, data, headers);
  }
}

/**
 * 412 Precondition Failed
 * Used when a precondition given in the request evaluated to false
 * 
 * @example
 * ```typescript
 * throw new PreconditionFailed('ETag mismatch');
 * ```
 */
export class PreconditionFailed extends HttpError {
  constructor(
    message: string = 'Precondition Failed',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.PRECONDITION_FAILED, data, headers);
  }
}

/**
 * 422 Unprocessable Entity
 * Used for validation errors
 * 
 * @example
 * ```typescript
 * throw new UnprocessableEntity('Validation failed');
 * throw new UnprocessableEntity('Validation failed', { errors: {...} });
 * ```
 */
export class UnprocessableEntity extends HttpError {
  constructor(
    message: string = 'Unprocessable Entity',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, data, headers);
  }
}

/**
 * 429 Too Many Requests
 * Used when rate limiting is applied
 * 
 * @example
 * ```typescript
 * throw new TooManyRequests('Rate limit exceeded');
 * ```
 */
export class TooManyRequests extends HttpError {
  constructor(
    message: string = 'Too Many Requests',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, data, headers);
  }
}

/**
 * 500 Internal Server Error
 * Used for unexpected server errors
 * 
 * @example
 * ```typescript
 * throw new InternalServerError('Database connection failed');
 * throw new InternalServerError('An unexpected error occurred');
 * ```
 */
export class InternalServerError extends HttpError {
  constructor(
    message: string = 'Internal Server Error',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, data, headers);
  }
}

/**
 * 501 Not Implemented
 * Used when the server does not support the functionality required to fulfill the request
 * 
 * @example
 * ```typescript
 * throw new NotImplemented('This feature is not yet implemented');
 * throw new NotImplemented('HTTP method not supported');
 * ```
 */
export class NotImplemented extends HttpError {
  constructor(
    message: string = 'Not Implemented',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.NOT_IMPLEMENTED, data, headers);
  }
}

/**
 * 502 Bad Gateway
 * Used when an integration/external service fails
 * 
 * @example
 * ```typescript
 * throw new BadGateway('Payment processing failed', { integration: 'Stripe API' });
 * throw new BadGateway('External service unavailable', { integration: 'AWS S3' });
 * ```
 */
export class BadGateway extends HttpError {
  constructor(
    message: string = 'Bad Gateway',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.BAD_GATEWAY, data, headers);
  }
}

/**
 * 503 Service Unavailable
 * Used when the service is temporarily unavailable
 * 
 * @example
 * ```typescript
 * throw new ServiceUnavailable('Service under maintenance');
 * ```
 */
export class ServiceUnavailable extends HttpError {
  constructor(
    message: string = 'Service Unavailable',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, data, headers);
  }
}

/**
 * Maps HTTP status codes to their corresponding error classes
 * Used for dynamic error instantiation based on status codes
 */
export const HTTP_ERROR_MAP: Record<number, any> = {
  [HttpStatus.BAD_REQUEST]: BadRequest,
  [HttpStatus.UNAUTHORIZED]: Unauthorized,
  [HttpStatus.FORBIDDEN]: Forbidden,
  [HttpStatus.NOT_FOUND]: NotFound,
  [HttpStatus.CONFLICT]: Conflict,
  [HttpStatus.PRECONDITION_FAILED]: PreconditionFailed,
  [HttpStatus.UNPROCESSABLE_ENTITY]: UnprocessableEntity,
  [HttpStatus.TOO_MANY_REQUESTS]: TooManyRequests,
  [HttpStatus.INTERNAL_SERVER_ERROR]: InternalServerError,
  [HttpStatus.NOT_IMPLEMENTED]: NotImplemented,
  [HttpStatus.BAD_GATEWAY]: BadGateway,
  [HttpStatus.SERVICE_UNAVAILABLE]: ServiceUnavailable,
};

/**
 * Creates an HTTP error instance based on status code
 * Falls back to NotImplemented (501) for unmapped status codes
 * 
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param data - Additional error data
 * @param headers - Response headers
 * @returns Instance of the appropriate HttpError subclass
 * 
 * @example
 * ```typescript
 * const error = createHttpError(404, 'User not found');
 * // Returns: NotFound instance
 * 
 * const error = createHttpError(999, 'Custom error');
 * // Returns: NotImplemented (501) instance
 * ```
 */
export function createHttpError(
  statusCode: number,
  message: string,
  data?: Record<string, any>,
  headers?: Record<string, string | boolean | number>
): HttpError {
  const ErrorClass = HTTP_ERROR_MAP[statusCode];
  
  // If status code not mapped, use NotImplemented (501)
  if (!ErrorClass) {
    return new NotImplemented(message || 'Not Implemented', data, headers);
  }
  
  return new ErrorClass(message, data, headers);
}

