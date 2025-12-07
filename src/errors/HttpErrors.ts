import { HttpError } from './HttpError';

/**
 * 400 Bad Request Error
 * Used when the request is malformed or contains invalid data
 * 
 * @example
 * ```typescript
 * throw new BadRequestError('Invalid JSON format');
 * throw new BadRequestError('Missing required field', { field: 'email' });
 * ```
 */
export class BadRequestError extends HttpError {
  constructor(
    message: string = 'Bad Request',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 400, data, headers);
  }
}

/**
 * 401 Unauthorized Error
 * Used when authentication is required but not provided or invalid
 * 
 * @example
 * ```typescript
 * throw new UnauthorizedError('Invalid credentials');
 * throw new UnauthorizedError('Token expired');
 * ```
 */
export class UnauthorizedError extends HttpError {
  constructor(
    message: string = 'Unauthorized',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 401, data, headers);
  }
}

/**
 * 403 Forbidden Error
 * Used when the user is authenticated but doesn't have permission
 * 
 * @example
 * ```typescript
 * throw new ForbiddenError('Access denied');
 * throw new ForbiddenError('Insufficient permissions');
 * ```
 */
export class ForbiddenError extends HttpError {
  constructor(
    message: string = 'Forbidden',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 403, data, headers);
  }
}

/**
 * 404 Not Found Error
 * Used when a resource cannot be found
 * 
 * @example
 * ```typescript
 * throw new NotFoundError('User not found');
 * throw new NotFoundError('Resource not found', { resourceId: '123' });
 * ```
 */
export class NotFoundError extends HttpError {
  constructor(
    message: string = 'Not Found',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 404, data, headers);
  }
}

/**
 * 409 Conflict Error
 * Used when the request conflicts with the current state
 * 
 * @example
 * ```typescript
 * throw new ConflictError('Email already exists');
 * throw new ConflictError('Resource already exists', { id: '123' });
 * ```
 */
export class ConflictError extends HttpError {
  constructor(
    message: string = 'Conflict',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 409, data, headers);
  }
}

/**
 * 412 Precondition Failed Error
 * Used when a precondition given in the request evaluated to false
 * 
 * @example
 * ```typescript
 * throw new PreconditionFailedError('ETag mismatch');
 * ```
 */
export class PreconditionFailedError extends HttpError {
  constructor(
    message: string = 'Precondition Failed',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 412, data, headers);
  }
}

/**
 * 422 Unprocessable Entity Error
 * Used for validation errors
 * 
 * @example
 * ```typescript
 * throw new ValidationError('Validation failed', { 
 *   email: 'Invalid email format',
 *   age: 'Must be 18 or older'
 * });
 * ```
 */
export class ValidationError extends HttpError {
  constructor(
    message: string = 'Validation Error',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 422, data, headers);
  }
}

/**
 * 429 Too Many Requests Error
 * Used when rate limiting is applied
 * 
 * @example
 * ```typescript
 * throw new TooManyRequestsError('Rate limit exceeded');
 * ```
 */
export class TooManyRequestsError extends HttpError {
  constructor(
    message: string = 'Too Many Requests',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 429, data, headers);
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
    super(message, 500, data, headers);
  }
}

/**
 * 502 Bad Gateway Error
 * Used when an integration/external service fails
 * 
 * @example
 * ```typescript
 * throw new IntegrationError('Stripe API', 'Payment processing failed');
 * throw new IntegrationError('AWS S3');
 * ```
 */
export class IntegrationError extends HttpError {
  constructor(
    integration: string,
    errorMessage?: string,
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    const message = errorMessage ?? `Could not integrate with ${integration}`;
    super(message, 502, data, headers);
  }
}

/**
 * 503 Service Unavailable Error
 * Used when the service is temporarily unavailable
 * 
 * @example
 * ```typescript
 * throw new ServiceUnavailableError('Service under maintenance');
 * ```
 */
export class ServiceUnavailableError extends HttpError {
  constructor(
    message: string = 'Service Unavailable',
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>
  ) {
    super(message, 503, data, headers);
  }
}
