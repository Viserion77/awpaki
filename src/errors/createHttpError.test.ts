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
} from './HttpErrors';
import { HttpError } from './HttpError';

describe('HTTP_ERROR_MAP', () => {
  it('should map all standard HTTP error codes', () => {
    expect(HTTP_ERROR_MAP[400]).toBe(BadRequest);
    expect(HTTP_ERROR_MAP[401]).toBe(Unauthorized);
    expect(HTTP_ERROR_MAP[403]).toBe(Forbidden);
    expect(HTTP_ERROR_MAP[404]).toBe(NotFound);
    expect(HTTP_ERROR_MAP[409]).toBe(Conflict);
    expect(HTTP_ERROR_MAP[412]).toBe(PreconditionFailed);
    expect(HTTP_ERROR_MAP[422]).toBe(UnprocessableEntity);
    expect(HTTP_ERROR_MAP[429]).toBe(TooManyRequests);
    expect(HTTP_ERROR_MAP[500]).toBe(InternalServerError);
    expect(HTTP_ERROR_MAP[501]).toBe(NotImplemented);
    expect(HTTP_ERROR_MAP[502]).toBe(BadGateway);
    expect(HTTP_ERROR_MAP[503]).toBe(ServiceUnavailable);
  });

  it('should have 12 mapped status codes', () => {
    expect(Object.keys(HTTP_ERROR_MAP)).toHaveLength(12);
  });
});

describe('createHttpError', () => {
  describe('mapped status codes', () => {
    it('should create BadRequest (400)', () => {
      const error = createHttpError(400, 'Invalid input');
      expect(error).toBeInstanceOf(BadRequest);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
    });

    it('should create Unauthorized (401)', () => {
      const error = createHttpError(401, 'Token expired');
      expect(error).toBeInstanceOf(Unauthorized);
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Token expired');
    });

    it('should create Forbidden (403)', () => {
      const error = createHttpError(403, 'Access denied');
      expect(error).toBeInstanceOf(Forbidden);
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    it('should create NotFound (404)', () => {
      const error = createHttpError(404, 'User not found');
      expect(error).toBeInstanceOf(NotFound);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
    });

    it('should create Conflict (409)', () => {
      const error = createHttpError(409, 'Email already exists');
      expect(error).toBeInstanceOf(Conflict);
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Email already exists');
    });

    it('should create PreconditionFailed (412)', () => {
      const error = createHttpError(412, 'ETag mismatch');
      expect(error).toBeInstanceOf(PreconditionFailed);
      expect(error.statusCode).toBe(412);
      expect(error.message).toBe('ETag mismatch');
    });

    it('should create UnprocessableEntity (422)', () => {
      const error = createHttpError(422, 'Validation failed');
      expect(error).toBeInstanceOf(UnprocessableEntity);
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Validation failed');
    });

    it('should create TooManyRequests (429)', () => {
      const error = createHttpError(429, 'Rate limit exceeded');
      expect(error).toBeInstanceOf(TooManyRequests);
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should create InternalServerError (500)', () => {
      const error = createHttpError(500, 'Database error');
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database error');
    });

    it('should create NotImplemented (501)', () => {
      const error = createHttpError(501, 'Feature not available');
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(501);
      expect(error.message).toBe('Feature not available');
    });

    it('should create BadGateway (502)', () => {
      const error = createHttpError(502, 'Payment service failed');
      expect(error).toBeInstanceOf(BadGateway);
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe('Payment service failed');
    });

    it('should create ServiceUnavailable (503)', () => {
      const error = createHttpError(503, 'Maintenance mode');
      expect(error).toBeInstanceOf(ServiceUnavailable);
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Maintenance mode');
    });
  });

  describe('with additional data', () => {
    it('should pass data object to error', () => {
      const data = { field: 'email', value: 'invalid' };
      const error = createHttpError(400, 'Invalid email', data);
      
      expect(error.data).toEqual(data);
      expect(error.statusCode).toBe(400);
    });

    it('should pass headers to error', () => {
      const headers = { 'X-Custom': 'value', 'Retry-After': 120 };
      const error = createHttpError(429, 'Rate limited', undefined, headers);
      
      expect(error.headers).toEqual(headers);
      expect(error.statusCode).toBe(429);
    });

    it('should pass both data and headers', () => {
      const data = { errors: { name: 'required' } };
      const headers = { 'X-Request-Id': 'abc123' };
      const error = createHttpError(422, 'Validation failed', data, headers);
      
      expect(error.data).toEqual(data);
      expect(error.headers).toEqual(headers);
    });
  });

  describe('unmapped status codes', () => {
    it('should fallback to NotImplemented for 999', () => {
      const error = createHttpError(999, 'Unknown error');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(501);
      expect(error.message).toBe('Unknown error');
    });

    it('should fallback to NotImplemented for 201', () => {
      const error = createHttpError(201, 'This is not an error status');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(501);
    });

    it('should fallback to NotImplemented for 0', () => {
      const error = createHttpError(0, 'Invalid status');
      
      expect(error).toBeInstanceOf(NotImplemented);
      expect(error.statusCode).toBe(501);
    });
  });

  describe('Lambda response integration', () => {
    it('should generate proper Lambda response', () => {
      const error = createHttpError(404, 'User not found', { userId: 123 });
      const response = error.toLambdaResponse();
      
      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('User not found');
      
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User not found');
      expect(body.data).toEqual({ userId: 123 });
    });

    it('should include custom headers in Lambda response', () => {
      const headers = { 'X-Custom': 'value' };
      const error = createHttpError(401, 'Token expired', undefined, headers);
      const response = error.toLambdaResponse();
      
      expect(response.headers).toMatchObject(headers);
    });
  });

  describe('error chaining', () => {
    it('should work in try-catch blocks', () => {
      try {
        throw createHttpError(404, 'Resource not found');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFound);
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(404);
      }
    });

    it('should be catchable as Error', () => {
      try {
        throw createHttpError(500, 'Server error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Server error');
      }
    });
  });
});
