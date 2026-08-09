import { readFileSync } from 'fs';
import { join } from 'path';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  handleApiGatewayError,
  handleApiGatewayErrorV2,
  handleGenericError,
  handleSqsError,
  handleSnsError,
  handleEventBridgeError,
  handleS3Error,
  handleDynamoDBStreamError,
  handleAppSyncError,
} from './handleLambdaError';
import { resetLogSink, resetLogger, setLogSink, setLogger } from '../../loggers/logger';
import type { Logger } from '../../loggers/logger';
import { HttpError } from '../http/HttpError';
import { BadRequest, NotFound, InternalServerError } from '../http/HttpErrors';
import { HttpStatus } from '../http/HttpStatus';

/**
 * Serialized lines captured from the logger sink.
 *
 * Going through {@link setLogSink} (instead of spying on `console`) is the point of
 * the handlers using `getLogger()`: a per-invocation buffer must be able to see the
 * error line.
 */
let logLines: string[] = [];

/** Parses every captured line. */
const records = (): Record<string, any>[] => logLines.map((line) => JSON.parse(line));

/** Last record written through the sink, already parsed. */
const lastRecord = (): Record<string, any> => records()[logLines.length - 1];

beforeEach(() => {
  logLines = [];
  setLogSink((line) => logLines.push(line));
});

afterEach(() => {
  resetLogSink();
  resetLogger();
});

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

    it('should log the HttpError through the logger sink, keeping the stack', () => {
      const error = new NotFound('User not found', { userId: '123' });
      handleApiGatewayError(error);

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.level).toBe('ERROR');
      expect(record.msg).toBe('API Gateway HttpError');
      expect(record.err.name).toBe('NotFound');
      expect(record.err.message).toBe('User not found');
      expect(record.err.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(record.err.data).toEqual({ userId: '123' });
      expect(typeof record.err.stack).toBe('string');
    });

    it('should log unknown errors before re-throwing', () => {
      const error = new Error('Standard error');
      expect(() => handleApiGatewayError(error)).toThrow('Standard error');

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.msg).toBe('API Gateway Unknown Error');
      expect(record.err.message).toBe('Standard error');
      expect(typeof record.err.stack).toBe('string');
    });

    it('should wrap non-error thrown values under err', () => {
      expect(() => handleApiGatewayError('string error')).toThrow('string error');

      expect(lastRecord().err).toBe('string error');
    });
  });

  describe('handleApiGatewayErrorV2', () => {
    it('should return API Gateway V2 response for HttpError', () => {
      const error = new BadRequest('Invalid request');
      const response = handleApiGatewayErrorV2(error);

      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(response.body)).toEqual({
        message: 'Invalid request',
      });
    });

    it('should include data in response', () => {
      const error = new NotFound('User not found', { userId: '123' });
      const response = handleApiGatewayErrorV2(error);

      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User not found');
      expect(body.data).toEqual({ userId: '123' });
    });

    it('should include custom headers', () => {
      const error = new HttpError('Forbidden', HttpStatus.FORBIDDEN, undefined, {
        'X-Custom-Header': 'value',
      });
      const response = handleApiGatewayErrorV2(error);

      expect(response.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.headers['X-Custom-Header']).toBe('value');
    });

    it('should include cookies when provided', () => {
      const error = new BadRequest('Invalid request');
      const cookies = ['session=; Max-Age=0'];
      const response = handleApiGatewayErrorV2(error, cookies);

      expect(response.cookies).toEqual(cookies);
    });

    it('should not include cookies when not provided', () => {
      const error = new BadRequest('Invalid request');
      const response = handleApiGatewayErrorV2(error);

      expect(response.cookies).toBeUndefined();
    });

    it('should re-throw non-HttpError', () => {
      const error = new Error('Standard error');
      expect(() => handleApiGatewayErrorV2(error)).toThrow('Standard error');
    });

    it('should re-throw string errors', () => {
      expect(() => handleApiGatewayErrorV2('string error')).toThrow('string error');
    });

    it('should log the HttpError through the logger sink', () => {
      const error = new NotFound('User not found', { userId: '123' });
      handleApiGatewayErrorV2(error);

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.level).toBe('ERROR');
      expect(record.msg).toBe('API Gateway V2 HttpError');
      expect(record.err.name).toBe('NotFound');
      expect(record.err.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(record.err.data).toEqual({ userId: '123' });
    });

    it('should log unknown errors before re-throwing', () => {
      expect(() => handleApiGatewayErrorV2({ weird: true })).toThrow();

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.msg).toBe('API Gateway V2 Unknown Error');
      expect(record.err).toEqual({ weird: true });
    });
  });

  describe('handleApiGatewayErrorV2 with partial responses (no non-null assertions)', () => {
    /** Subclass returning an empty V2 response, which the base type allows. */
    class EmptyResponseError extends HttpError {
      public override toApiGatewayResponseV2(): APIGatewayProxyStructuredResultV2 {
        return {};
      }
    }

    /** Subclass filling only the status code. */
    class StatusOnlyError extends HttpError {
      public override toApiGatewayResponseV2(): APIGatewayProxyStructuredResultV2 {
        return { statusCode: HttpStatus.SERVICE_UNAVAILABLE };
      }
    }

    /** Subclass filling only the body. */
    class BodyOnlyError extends HttpError {
      public override toApiGatewayResponseV2(): APIGatewayProxyStructuredResultV2 {
        return { body: '{"custom":true}' };
      }
    }

    it('should fall back to the error statusCode, empty headers and empty body', () => {
      const error = new EmptyResponseError('Nothing filled', HttpStatus.NOT_FOUND);
      const response = handleApiGatewayErrorV2(error);

      expect(response).toEqual({
        statusCode: HttpStatus.NOT_FOUND,
        headers: {},
        body: '',
      });
    });

    it('should keep the statusCode provided by the subclass and default the rest', () => {
      const error = new StatusOnlyError('Only status', HttpStatus.BAD_REQUEST);
      const response = handleApiGatewayErrorV2(error);

      expect(response.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(response.headers).toEqual({});
      expect(response.body).toBe('');
    });

    it('should keep the body provided by the subclass and default the rest', () => {
      const error = new BodyOnlyError('Only body', HttpStatus.CONFLICT);
      const response = handleApiGatewayErrorV2(error);

      expect(response.statusCode).toBe(HttpStatus.CONFLICT);
      expect(response.headers).toEqual({});
      expect(response.body).toBe('{"custom":true}');
    });

    it('should never leak undefined into the response contract', () => {
      const error = new EmptyResponseError('Nothing filled', HttpStatus.INTERNAL_SERVER_ERROR);
      const response = handleApiGatewayErrorV2(error, ['session=; Max-Age=0']);

      expect(response.statusCode).toBeDefined();
      expect(response.headers).toBeDefined();
      expect(response.body).toBeDefined();
      // The subclass ignores the cookies argument, so the key must stay absent
      expect('cookies' in response).toBe(false);
    });

    it('should still log the subclass error', () => {
      const error = new EmptyResponseError('Nothing filled', HttpStatus.NOT_FOUND);
      handleApiGatewayErrorV2(error);

      const record = lastRecord();
      expect(record.msg).toBe('API Gateway V2 HttpError');
      expect(record.err.name).toBe('EmptyResponseError');
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
    it('should always throw HttpError', () => {
      const error = new BadRequest('Invalid GraphQL input');

      expect(() => handleAppSyncError(error)).toThrow(BadRequest);
      expect(() => handleAppSyncError(error)).toThrow('Invalid GraphQL input');
    });

    it('should log HttpError details before throwing', () => {
      const error = new NotFound('User not found', { userId: '123' });

      expect(() => handleAppSyncError(error)).toThrow(NotFound);

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.level).toBe('ERROR');
      expect(record.msg).toBe('AppSync HttpError');
      expect(record.err.name).toBe('NotFound');
      expect(record.err.message).toBe('User not found');
      expect(record.err.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(record.err.data).toEqual({ userId: '123' });
      expect(typeof record.err.stack).toBe('string');
    });

    it('should throw standard Error without logging', () => {
      const error = new Error('Database connection failed');

      expect(() => handleAppSyncError(error)).toThrow('Database connection failed');

      // Standard errors are not logged, just re-thrown
      expect(logLines).toHaveLength(0);
    });

    it('should throw unknown error types without logging', () => {
      const error = 'string error';

      expect(() => handleAppSyncError(error)).toThrow('string error');

      // Unknown errors are not logged, just re-thrown
      expect(logLines).toHaveLength(0);
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
        reason: 'Invalid format',
      });

      try {
        handleAppSyncError(originalError);
      } catch (error) {
        expect(error).toBe(originalError);
        expect((error as BadRequest).data).toEqual({
          field: 'email',
          reason: 'Invalid format',
        });
      }
    });
  });

  describe('handleGenericError logging', () => {
    it('should log the HttpError through the logger sink', () => {
      const error = new BadRequest('Invalid message', { recordId: 'abc' });
      handleGenericError(error);

      expect(logLines).toHaveLength(1);
      const record = lastRecord();
      expect(record.level).toBe('ERROR');
      expect(record.msg).toBe('Lambda HttpError');
      expect(record.err.name).toBe('BadRequest');
      expect(record.err.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(record.err.data).toEqual({ recordId: 'abc' });
    });

    it('should log unknown errors before re-throwing for retry', () => {
      const error = new Error('Processing failed');
      expect(() => handleGenericError(error)).toThrow('Processing failed');

      expect(lastRecord().msg).toBe('Lambda Unknown Error');
      expect(lastRecord().err.message).toBe('Processing failed');
    });

    it('should log through the aliases as well', () => {
      handleSqsError(new BadRequest('sqs'));
      handleSnsError(new BadRequest('sns'));
      handleEventBridgeError(new BadRequest('eventbridge'));
      handleS3Error(new BadRequest('s3'));
      handleDynamoDBStreamError(new BadRequest('ddb'));

      expect(logLines).toHaveLength(5);
      expect(records().map((record) => record.err.message)).toEqual([
        'sqs',
        'sns',
        'eventbridge',
        's3',
        'ddb',
      ]);
    });

    it('should keep logging when null is thrown', () => {
      expect(() => handleGenericError(null)).toThrow();

      const record = lastRecord();
      expect(record.msg).toBe('Lambda Unknown Error');
      expect(record.err).toBeNull();
    });
  });

  describe('logger integration', () => {
    it('should route through a logger installed with setLogger, object first', () => {
      const calls: Array<[unknown, string | undefined]> = [];
      const customLogger: Logger = {
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: (obj: unknown, msg?: string) => {
          calls.push([obj, msg]);
        },
      };
      setLogger(customLogger);

      const error = new NotFound('Resource not found');
      handleApiGatewayError(error);

      expect(calls).toHaveLength(1);
      const [obj, msg] = calls[0];
      // The Error instance goes through untouched, so the custom logger keeps the stack
      expect(obj).toBe(error);
      expect(msg).toBe('API Gateway HttpError');
      // Nothing reached the default sink, because the whole logger was replaced
      expect(logLines).toHaveLength(0);
    });

    it('should send every handler line to the sink so a per-invocation buffer sees it', () => {
      handleApiGatewayError(new BadRequest('api'));
      handleApiGatewayErrorV2(new BadRequest('api v2'));
      handleGenericError(new BadRequest('generic'));
      expect(() => handleAppSyncError(new BadRequest('appsync'))).toThrow();

      expect(records().map((record) => record.msg)).toEqual([
        'API Gateway HttpError',
        'API Gateway V2 HttpError',
        'Lambda HttpError',
        'AppSync HttpError',
      ]);
    });
  });

  describe('source guarantees', () => {
    const code = readFileSync(join(__dirname, 'handleLambdaError.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    it('never calls console, so no log line escapes the sink', () => {
      expect(code).not.toMatch(/console\s*\.\s*\w+/);
    });

    it('does not silence the compiler with non-null assertions on the V2 response', () => {
      expect(code).not.toMatch(/response\s*\.\s*\w+\s*!/);
    });
  });
});
