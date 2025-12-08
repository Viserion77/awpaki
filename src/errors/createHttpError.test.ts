import {
  createHttpError,
  HTTP_ERROR_MAP,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  PreconditionFailed,
  UnprocessableEntity,
  TooManyRequests,
  InternalServerError,
  NotImplemented,
  BadGateway,
  ServiceUnavailable,
  HttpStatus,
} from './HttpErrors';
import { HttpError } from './HttpError';

describe('HTTP_ERROR_MAP', () => {
  it('should map all standard HTTP error codes', () => {
    expect(HTTP_ERROR_MAP[HttpStatus.BAD_REQUEST]).toBe(BadRequest);
    expect(HTTP_ERROR_MAP[HttpStatus.UNAUTHORIZED]).toBe(Unauthorized);
    expect(HTTP_ERROR_MAP[HttpStatus.FORBIDDEN]).toBe(Forbidden);
    expect(HTTP_ERROR_MAP[HttpStatus.NOT_FOUND]).toBe(NotFound);
    expect(HTTP_ERROR_MAP[HttpStatus.CONFLICT]).toBe(Conflict);
    expect(HTTP_ERROR_MAP[HttpStatus.PRECONDITION_FAILED]).toBe(PreconditionFailed);
    expect(HTTP_ERROR_MAP[HttpStatus.UNPROCESSABLE_ENTITY]).toBe(UnprocessableEntity);
    expect(HTTP_ERROR_MAP[HttpStatus.TOO_MANY_REQUESTS]).toBe(TooManyRequests);
    expect(HTTP_ERROR_MAP[HttpStatus.INTERNAL_SERVER_ERROR]).toBe(InternalServerError);
    expect(HTTP_ERROR_MAP[HttpStatus.NOT_IMPLEMENTED]).toBe(NotImplemented);
    expect(HTTP_ERROR_MAP[HttpStatus.BAD_GATEWAY]).toBe(BadGateway);
    expect(HTTP_ERROR_MAP[HttpStatus.SERVICE_UNAVAILABLE]).toBe(ServiceUnavailable);
  });

  it('should have 12 mapped status codes', () => {
    expect(Object.keys(HTTP_ERROR_MAP)).toHaveLength(12);
  });
});

describe('createHttpError', () => {
  describe('mapped status codes', () => {
    it('should create BadRequest (400)', () => {
      const error = createHttpError(HttpStatus.BAD_REQUEST, 'Invalid input');
      expect(error).toBeInstanceOf(BadRequest);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe('Invalid input');
    });

    it('should create Unauthorized (401)', () => {
      const error = createHttpError(HttpStatus.UNAUTHORIZED, 'Token expired');
      expect(error).toBeInstanceOf(Unauthorized);
      expect(error.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.message).toBe('Token expired');
    });

    it('should create Forbidden (403)', () => {
      const error = createHttpError(HttpStatus.FORBIDDEN, 'Access denied');
      expect(error).toBeInstanceOf(Forbidden);
      expect(error.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(error.message).toBe('Access denied');
    });

    it('should create NotFound (404)', () => {
      const error = createHttpError(HttpStatus.NOT_FOUND, 'User not found');
      expect(error).toBeInstanceOf(NotFound);
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(error.message).toBe('User not found');
    });

    it('should create Conflict (409)', () => {
      const error = createHttpError(HttpStatus.CONFLICT, 'Email already exists');
      expect(error).toBeInstanceOf(Conflict);
      expect(error.statusCode).toBe(HttpStatus.CONFLICT);
      expect(error.message).toBe('Email already exists');
    });

    it('should create PreconditionFailed (412)', () => {
      const error = createHttpError(HttpStatus.PRECONDITION_FAILED, 'ETag mismatch');
      expect(error).toBeInstanceOf(PreconditionFailed);
      expect(error.statusCode).toBe(HttpStatus.PRECONDITION_FAILED);
      expect(error.message).toBe('ETag mismatch');
    });

    it('should create UnprocessableEntity (422)', () => {
      const error = createHttpError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed');
      expect(error).toBeInstanceOf(UnprocessableEntity);
      expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.message).toBe('Validation failed');
    });

    it('should create TooManyRequests (429)', () => {
      const error = createHttpError(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded');
      expect(error).toBeInstanceOf(TooManyRequests);
      expect(error.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should create InternalServerError (500)', () => {
      const error = createHttpError(HttpStatus.INTERNAL_SERVER_ERROR, 'Database error');
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(error.message).toBe('Database error');
    });

    it('should create NotImplemented (501)', () => {
      const error = createHttpError(HttpStatus.NOT_IMPLEMENTED, 'Feature not available');
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(HttpStatus.NOT_IMPLEMENTED);
      expect(error.message).toBe('Feature not available');
    });

    it('should create BadGateway (502)', () => {
      const error = createHttpError(HttpStatus.BAD_GATEWAY, 'Payment service failed');
      expect(error).toBeInstanceOf(BadGateway);
      expect(error.statusCode).toBe(HttpStatus.BAD_GATEWAY);
      expect(error.message).toBe('Payment service failed');
    });

    it('should create ServiceUnavailable (503)', () => {
      const error = createHttpError(HttpStatus.SERVICE_UNAVAILABLE, 'Maintenance mode');
      expect(error).toBeInstanceOf(ServiceUnavailable);
      expect(error.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.message).toBe('Maintenance mode');
    });
  });

  describe('with additional data', () => {
    it('should pass data object to error', () => {
      const data = { field: 'email', value: 'invalid' };
      const error = createHttpError(HttpStatus.BAD_REQUEST, 'Invalid email', data);
      
      expect(error.data).toEqual(data);
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should pass headers to error', () => {
      const headers = { 'X-Custom': 'value', 'Retry-After': 120 };
      const error = createHttpError(HttpStatus.TOO_MANY_REQUESTS, 'Rate limited', undefined, headers);
      
      expect(error.headers).toEqual(headers);
      expect(error.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('should pass both data and headers', () => {
      const data = { errors: { name: 'required' } };
      const headers = { 'X-Request-Id': 'abc123' };
      const error = createHttpError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', data, headers);
      
      expect(error.data).toEqual(data);
      expect(error.headers).toEqual(headers);
    });
  });

  describe('unmapped status codes', () => {
    it('should fallback to NotImplemented for 999', () => {
      const error = createHttpError(999, 'Unknown error');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(HttpStatus.NOT_IMPLEMENTED);
      expect(error.message).toBe('Unknown error');
    });

    it('should fallback to NotImplemented for 201', () => {
      const error = createHttpError(201, 'This is not an error status');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(HttpStatus.NOT_IMPLEMENTED);
    });

    it('should fallback to NotImplemented for 0', () => {
      const error = createHttpError(0, 'Invalid status');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(HttpStatus.NOT_IMPLEMENTED);
    });
  });

  describe('Lambda response integration', () => {
    it('should generate proper Lambda response', () => {
      const error = createHttpError(HttpStatus.NOT_FOUND, 'User not found', { userId: 123 });
      const response = error.toLambdaResponse();
      
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.body).toContain('User not found');
      
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User not found');
      expect(body.data).toEqual({ userId: 123 });
    });

    it('should include custom headers in Lambda response', () => {
      const headers = { 'X-Custom': 'value' };
      const error = createHttpError(HttpStatus.UNAUTHORIZED, 'Token expired', undefined, headers);
      const response = error.toLambdaResponse();
      
      expect(response.headers).toMatchObject(headers);
    });
  });

  describe('error chaining', () => {
    it('should work in try-catch blocks', () => {
      try {
        throw createHttpError(HttpStatus.NOT_FOUND, 'Resource not found');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFound);
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should be catchable as Error', () => {
      try {
        throw createHttpError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Server error');
      }
    });
  });
});
