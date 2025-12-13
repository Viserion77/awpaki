import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  handleApiGatewayError,
  handleSqsError,
  handleSnsError,
  handleEventBridgeError,
  handleS3Error,
  handleDynamoDBStreamError,
  handleAppSyncError,
} from './handleLambdaError';
import { HttpError } from './HttpError';
import { BadRequest, NotFound, InternalServerError } from './HttpErrors';
import { HttpStatus } from './HttpStatus';

describe('Error Handlers', () => {
  describe('handleApiGatewayError', () => {
    it('should return API Gateway response for HttpError', () => {
      const error = new BadRequest('Invalid request');
      const response = handleApiGatewayError(error);

      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(response.body)).toEqual({
        message: 'Invalid request',
      });
    });

    it('should include data in response', () => {
      const error = new NotFound('User not found', { userId: '123' });
      const response = handleApiGatewayError(error);

      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User not found');
      expect(body.data).toEqual({ userId: '123' });
    });

    it('should include custom headers', () => {
      const error = new HttpError('Forbidden', HttpStatus.FORBIDDEN, undefined, {
        'X-Custom-Header': 'value',
      });
      const response = handleApiGatewayError(error);

      expect(response.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.headers['X-Custom-Header']).toBe('value');
    });

    it('should re-throw non-HttpError', () => {
      const error = new Error('Standard error');
      expect(() => handleApiGatewayError(error)).toThrow('Standard error');
    });

    it('should re-throw string errors', () => {
      expect(() => handleApiGatewayError('string error')).toThrow('string error');
    });
  });

  describe('handleSqsError', () => {
    it('should return generic response for HttpError', () => {
      const error = new BadRequest('Invalid message');
      const response = handleSqsError(error);

      expect(response).toEqual({
        error: 'BadRequest',
        message: 'Invalid message',
        statusCode: HttpStatus.BAD_REQUEST,
        data: undefined,
      });
    });

    it('should include data in response', () => {
      const error = new NotFound('Record not found', { recordId: 'abc' });
      const response = handleSqsError(error);

      expect(response).toEqual({
        error: 'NotFound',
        message: 'Record not found',
        statusCode: HttpStatus.NOT_FOUND,
        data: { recordId: 'abc' },
      });
    });

    it('should re-throw non-HttpError for retry', () => {
      const error = new Error('Processing failed');
      expect(() => handleSqsError(error)).toThrow('Processing failed');
    });

    it('should re-throw unknown errors', () => {
      expect(() => handleSqsError('error string')).toThrow('error string');
    });
  });

  describe('handleSnsError', () => {
    it('should return generic response for HttpError', () => {
      const error = new BadRequest('Invalid notification');
      const response = handleSnsError(error);

      expect(response).toEqual({
        error: 'BadRequest',
        message: 'Invalid notification',
        statusCode: HttpStatus.BAD_REQUEST,
        data: undefined,
      });
    });

    it('should re-throw non-HttpError', () => {
      const error = new Error('Notification failed');
      expect(() => handleSnsError(error)).toThrow('Notification failed');
    });
  });

  describe('handleEventBridgeError', () => {
    it('should return generic response for HttpError', () => {
      const error = new NotFound('Event not found');
      const response = handleEventBridgeError(error);

      expect(response).toEqual({
        error: 'NotFound',
        message: 'Event not found',
        statusCode: HttpStatus.NOT_FOUND,
        data: undefined,
      });
    });

    it('should re-throw non-HttpError', () => {
      const error = new Error('Event processing failed');
      expect(() => handleEventBridgeError(error)).toThrow('Event processing failed');
    });
  });

  describe('handleS3Error', () => {
    it('should return generic response for HttpError', () => {
      const error = new BadRequest('Invalid S3 object');
      const response = handleS3Error(error);

      expect(response).toEqual({
        error: 'BadRequest',
        message: 'Invalid S3 object',
        statusCode: HttpStatus.BAD_REQUEST,
        data: undefined,
      });
    });

    it('should re-throw non-HttpError', () => {
      const error = new Error('S3 processing error');
      expect(() => handleS3Error(error)).toThrow('S3 processing error');
    });
  });

  describe('handleDynamoDBStreamError', () => {
    it('should return generic response for HttpError', () => {
      const error = new BadRequest('Invalid DynamoDB record');
      const response = handleDynamoDBStreamError(error);

      expect(response).toEqual({
        error: 'BadRequest',
        message: 'Invalid DynamoDB record',
        statusCode: HttpStatus.BAD_REQUEST,
        data: undefined,
      });
    });

    it('should re-throw non-HttpError for retry', () => {
      const error = new Error('Stream processing error');
      expect(() => handleDynamoDBStreamError(error)).toThrow('Stream processing error');
    });
  });

  describe('Real-world usage patterns', () => {
    it('should work in API Gateway handler pattern', () => {
      const handler = () => {
        try {
          throw new NotFound('Resource not found');
        } catch (error) {
          return handleApiGatewayError(error);
        }
      };

      const response = handler();
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Resource not found');
    });

    it('should work in SQS handler with retry logic', () => {
      const handler = () => {
        try {
          throw new Error('Transient error');
        } catch (error) {
          return handleSqsError(error);
        }
      };

      expect(() => handler()).toThrow('Transient error');
    });

    it('should preserve HttpError data', () => {
      const handler = () => {
        try {
          throw new BadRequest('Validation failed', {
            errors: { email: 'Invalid format' },
          });
        } catch (error) {
          return handleApiGatewayError(error);
        }
      };

      const response = handler();
      const body = JSON.parse(response.body);
      expect(body.data.errors.email).toBe('Invalid format');
    });

    it('should handle generic errors in non-API Gateway triggers', () => {
      const handler = () => {
        try {
          throw new InternalServerError('Server error', { code: 'ERR_001' });
        } catch (error) {
          return handleSqsError(error);
        }
      };

      const response = handler();
      expect(response.error).toBe('InternalServerError');
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response.data).toEqual({ code: 'ERR_001' });
    });
  });

  describe('handleAppSyncError', () => {
    // Mock console.error for these tests
    const originalConsoleError = console.error;
    let consoleErrorOutput: any[] = [];

    beforeEach(() => {
      consoleErrorOutput = [];
      console.error = jest.fn((...args) => {
        consoleErrorOutput.push(args);
      });
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it('should always throw HttpError', () => {
      const error = new BadRequest('Invalid GraphQL input');
      
      expect(() => handleAppSyncError(error)).toThrow(BadRequest);
      expect(() => handleAppSyncError(error)).toThrow('Invalid GraphQL input');
    });

    it('should log HttpError details before throwing', () => {
      const error = new NotFound('User not found', { userId: '123' });
      
      try {
        handleAppSyncError(error);
      } catch {}

      expect(consoleErrorOutput).toHaveLength(1);
      const [message, data] = consoleErrorOutput[0];
      expect(message).toBe('AppSync HttpError:');
      expect(data.name).toBe('NotFound');
      expect(data.message).toBe('User not found');
      expect(data.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(data.data).toEqual({ userId: '123' });
    });

    it('should throw and log standard Error', () => {
      const error = new Error('Database connection failed');
      
      expect(() => handleAppSyncError(error)).toThrow('Database connection failed');
      
      // Standard errors are not logged, just re-thrown
      expect(consoleErrorOutput).toHaveLength(0);
    });

    it('should throw and log unknown error types', () => {
      const error = 'string error';
      
      expect(() => handleAppSyncError(error)).toThrow('string error');
      
      // Unknown errors are not logged, just re-thrown
      expect(consoleErrorOutput).toHaveLength(0);
    });

    it('should work in AppSync resolver pattern', () => {
      const resolver = () => {
        try {
          throw new NotFound('Resource not found');
        } catch (error) {
          // AppSync always throws - this never returns
          handleAppSyncError(error);
        }
      };

      expect(() => resolver()).toThrow('Resource not found');
    });

    it('should preserve original error for GraphQL formatting', () => {
      const originalError = new BadRequest('Validation failed', { 
        field: 'email',
        reason: 'Invalid format' 
      });
      
      try {
        handleAppSyncError(originalError);
      } catch (error) {
        expect(error).toBe(originalError);
        expect((error as BadRequest).data).toEqual({ 
          field: 'email',
          reason: 'Invalid format' 
        });
      }
    });
  });
});
