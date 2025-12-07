import { HttpError } from './HttpError';

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
    super(message, 400, data, headers);
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
    super(message, 401, data, headers);
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
    super(message, 403, data, headers);
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
    super(message, 404, data, headers);
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
    super(message, 409, data, headers);
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
    super(message, 412, data, headers);
  }
}

/**
 * 422 Unprocessable Entity
 * Used for validation errors with support for multiple error messages
 * 
 * @example
 * ```typescript
 * // Single error
 * throw new UnprocessableEntity('Validation failed');
 * 
 * // Multiple errors
 * throw new UnprocessableEntity('Validation failed', {
 *   email: 'Invalid email format',
 *   age: 'Must be 18 or older',
 *   password: 'Must be at least 8 characters'
 * });
 * ```
 */
export class UnprocessableEntity extends HttpError {
  public readonly errors?: Record<string, string>;

  constructor(
    message?: string,
    errors?: Record<string, string>,
    headers?: Record<string, string | boolean | number>
  ) {
    // If errors object is provided, use first error as message
    const errorMessage = message || (errors ? Object.values(errors)[0] : 'Validation Error');
    super(errorMessage, 422, errors ? { errors } : undefined, headers);
    this.errors = errors;
  }

  /**
   * Override toLambdaResponse to include errors in response body
   */
  public toLambdaResponse(additionalHeaders?: Record<string, string | boolean | number>): import('aws-lambda').APIGatewayProxyResult {
    const responseBody: any = { message: this.message };
    
    if (this.errors) {
      responseBody.errors = this.errors;
    }
    
    if (this.data && Object.keys(this.data).length > 0 && !this.errors) {
      responseBody.data = this.data;
    }

    return {
      statusCode: this.statusCode,
      body: JSON.stringify(responseBody),
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...additionalHeaders,
      },
    };
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
 * 502 Bad Gateway
 * Used when an integration/external service fails
 * 
 * @example
 * ```typescript
 * throw new BadGateway('Stripe API', 'Payment processing failed');
 * throw new BadGateway('AWS S3');
 * ```
 */
export class BadGateway extends HttpError {
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
    super(message, 503, data, headers);
  }
}

