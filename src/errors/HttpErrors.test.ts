import {
  HttpError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  PreconditionFailed,
  UnprocessableEntity,
  TooManyRequests,
  InternalServerError,
  BadGateway,
  ServiceUnavailable,
} from './index';

describe('HttpError', () => {
  describe('HttpError base class', () => {
    it('should create error with message and status code', () => {
      const error = new HttpError('Test error', 418);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(418);
      expect(error.name).toBe('HttpError');
    });

    it('should support additional data', () => {
      const data = { field: 'email', reason: 'invalid' };
      const error = new HttpError('Test error', 400, data);
      
      expect(error.data).toEqual(data);
    });

    it('should support custom headers', () => {
      const headers = { 'X-Custom': 'value' };
      const error = new HttpError('Test error', 400, undefined, headers);
      
      expect(error.headers).toEqual(headers);
    });

    it('should generate string representation', () => {
      const error = new HttpError('Test error', 400);
      const str = error.toString();
      
      expect(str).toContain('HttpError');
      expect(str).toContain('Test error');
    });

    it('should generate Lambda response', () => {
      const error = new HttpError('Test error', 400);
      const response = error.toLambdaResponse();
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe(JSON.stringify({ message: 'Test error' }));
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include data in Lambda response', () => {
      const data = { field: 'email' };
      const error = new HttpError('Test error', 400, data);
      const response = error.toLambdaResponse();
      
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(data);
    });

    it('should merge headers in Lambda response', () => {
      const error = new HttpError('Test error', 400, undefined, { 'X-Custom': 'value' });
      const response = error.toLambdaResponse({ 'X-Extra': 'extra' });
      
      expect(response.headers).toHaveProperty('X-Custom', 'value');
      expect(response.headers).toHaveProperty('X-Extra', 'extra');
    });
  });

  describe('BadRequest', () => {
    it('should create 400 error', () => {
      const error = new BadRequest('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('BadRequest');
    });

    it('should use default message', () => {
      const error = new BadRequest();
      
      expect(error.message).toBe('Bad Request');
    });
  });

  describe('Unauthorized', () => {
    it('should create 401 error', () => {
      const error = new Unauthorized('Invalid token');
      
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid token');
    });

    it('should use default message', () => {
      const error = new Unauthorized();
      
      expect(error.message).toBe('Unauthorized');
    });
  });

  describe('Forbidden', () => {
    it('should create 403 error', () => {
      const error = new Forbidden('Access denied');
      
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });
  });

  describe('NotFound', () => {
    it('should create 404 error', () => {
      const error = new NotFound('Resource not found');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
    });
  });

  describe('Conflict', () => {
    it('should create 409 error', () => {
      const error = new Conflict('Email already exists');
      
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Email already exists');
    });
  });

  describe('PreconditionFailed', () => {
    it('should create 412 error', () => {
      const error = new PreconditionFailed('ETag mismatch');
      
      expect(error.statusCode).toBe(412);
      expect(error.message).toBe('ETag mismatch');
    });
  });

  describe('UnprocessableEntity', () => {
    it('should create 422 error', () => {
      const errors = { email: 'Invalid format', age: 'Must be positive' };
      const error = new UnprocessableEntity('Validation failed', errors);
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Validation failed');
      expect(error.errors).toEqual(errors);
    });

    it('should use first error as message when message not provided', () => {
      const errors = { email: 'Invalid format', age: 'Must be positive' };
      const error = new UnprocessableEntity(undefined, errors);
      
      expect(error.message).toBe('Invalid format');
      expect(error.errors).toEqual(errors);
    });

    it('should use default message when no message or errors', () => {
      const error = new UnprocessableEntity();
      
      expect(error.message).toBe('Validation Error');
      expect(error.errors).toBeUndefined();
    });

    it('should include errors in Lambda response', () => {
      const errors = { email: 'Invalid format', age: 'Must be positive' };
      const error = new UnprocessableEntity('Validation failed', errors);
      const response = error.toLambdaResponse();
      
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toEqual(errors);
    });

    it('should work with single error', () => {
      const error = new UnprocessableEntity('Single validation error');
      const response = error.toLambdaResponse();
      
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Single validation error');
      expect(body.errors).toBeUndefined();
    });
  });

  describe('TooManyRequests', () => {
    it('should create 429 error', () => {
      const error = new TooManyRequests('Rate limit exceeded');
      
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
    });
  });

  describe('InternalServerError', () => {
    it('should create 500 error', () => {
      const error = new InternalServerError('Database error');
      
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database error');
    });

    it('should use default message', () => {
      const error = new InternalServerError();
      
      expect(error.message).toBe('Internal Server Error');
    });
  });

  describe('BadGateway', () => {
    it('should create 502 error with integration name', () => {
      const error = new BadGateway('Stripe API');
      
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe('Could not integrate with Stripe API');
    });

    it('should use custom error message', () => {
      const error = new BadGateway('AWS S3', 'Upload failed');
      
      expect(error.message).toBe('Upload failed');
    });
  });

  describe('ServiceUnavailable', () => {
    it('should create 503 error', () => {
      const error = new ServiceUnavailable('Maintenance in progress');
      
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Maintenance in progress');
    });
  });

  describe('instanceof checks', () => {
    it('should work with instanceof HttpError', () => {
      const error = new BadRequest('Test');
      
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof BadRequest).toBe(true);
    });

    it('should work with Error base class', () => {
      const error = new NotFound('Test');
      
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Lambda integration', () => {
    it('should work in try-catch Lambda handler pattern', () => {
      try {
        throw new BadRequest('Invalid input');
      } catch (error) {
        if (error instanceof HttpError) {
          const response = error.toLambdaResponse();
          expect(response.statusCode).toBe(400);
        }
      }
    });
  });
});
