import { getLogger, resetLogSink, setLogSink, toErrorLog } from '../../loggers/logger.js';
import { HttpError } from './HttpError.js';
import { BadGateway, Conflict, NotFound, createHttpError } from './HttpErrors.js';
import { HttpStatus } from './HttpStatus.js';

/**
 * Serializes an error through the real logger, which is the only path that flattens an
 * `Error` into a record — `JSON.stringify` on its own sees no non-enumerable property.
 *
 * @param error - Error to log
 * @returns The emitted JSON line
 */
function loggedLine(error: unknown): string {
  const lines: string[] = [];
  setLogSink((line) => lines.push(line));
  getLogger().error(toErrorLog(error), 'failed');
  resetLogSink();

  return lines.join('');
}

describe('HttpError init object', () => {
  describe('code', () => {
    it('defaults to the conventional code for the status', () => {
      expect(new NotFound('gone').code).toBe('not_found');
      expect(new Conflict().code).toBe('conflict');
      expect(new HttpError('boom', HttpStatus.SERVICE_UNAVAILABLE).code).toBe(
        'service_unavailable'
      );
    });

    // Deriving from `constructor.name` would break under esbuild, which mangles class
    // identifiers unless `--keep-names` is set; a value clients switch on cannot depend on
    // an identifier surviving minification.
    it('does not depend on the class name', () => {
      class Renamed extends NotFound {}
      Object.defineProperty(Renamed, 'name', { value: 'e' });

      expect(new Renamed('gone').code).toBe('not_found');
    });

    it('falls back to http_<status> for a status with no conventional code', () => {
      expect(new HttpError('teapot', 418).code).toBe('http_418');
    });

    it('is overridden by the init form', () => {
      const error = new NotFound({ code: 'user_not_found', message: 'User 42 is gone' });

      expect(error.code).toBe('user_not_found');
      expect(error.message).toBe('User 42 is gone');
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('is overridden by the positional options argument', () => {
      expect(new NotFound('gone', undefined, undefined, { code: 'user_not_found' }).code).toBe(
        'user_not_found'
      );
    });

    it('stays out of the default response body', () => {
      const body = new NotFound({
        code: 'user_not_found',
        message: 'gone',
      }).toApiGatewayResponseV2().body;

      expect(JSON.parse(body!)).toEqual({ message: 'gone' });
    });

    it('is reported by toGenericResponse, whose caller reads the payload', () => {
      expect(new NotFound({ code: 'user_not_found', message: 'gone' }).toGenericResponse()).toEqual(
        {
          error: 'NotFound',
          code: 'user_not_found',
          message: 'gone',
          statusCode: 404,
          data: undefined,
        }
      );
    });
  });

  describe('constructor shapes', () => {
    it('keeps the positional form working unchanged', () => {
      const error = new HttpError('boom', 500, { id: '1' }, { 'X-Trace': 'abc' });

      expect(error.message).toBe('boom');
      expect(error.statusCode).toBe(500);
      expect(error.data).toEqual({ id: '1' });
      expect(error.headers).toEqual({ 'X-Trace': 'abc' });
    });

    it('accepts an init object on the base class', () => {
      const error = new HttpError({ statusCode: 502, message: 'boom', data: { id: '1' } });

      expect(error.statusCode).toBe(502);
      expect(error.message).toBe('boom');
      expect(error.data).toEqual({ id: '1' });
    });

    it('keeps each subclass default message when the init object omits it', () => {
      expect(new NotFound({ code: 'user_not_found' }).message).toBe('Not Found');
      expect(new Conflict({}).message).toBe('Conflict');
    });

    it('keeps the subclass status even if the init object tries to carry another one', () => {
      const error = new NotFound({ statusCode: 500 } as never);

      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('cause', () => {
    it('is attached non-enumerably, like a native one', () => {
      const cause = new SyntaxError('bad json');
      const error = new HttpError('boom', 400, undefined, undefined, { cause });

      expect((error as Error & { cause?: unknown }).cause).toBe(cause);
      expect(Object.keys(error)).not.toContain('cause');
    });

    it('reaches the log record', () => {
      const cause = new SyntaxError('bad json');
      const error = new HttpError('boom', 400, undefined, undefined, { cause });

      expect(loggedLine(error)).toContain('bad json');
    });
  });

  describe('diagnostics', () => {
    const secrets = { trace: ['at /var/task/index.js:1'], rawPayload: '{"internal":true}' };

    it('never reaches a response body', () => {
      const error = new BadGateway({ message: 'downstream failed', diagnostics: secrets });

      expect(error.toApiGatewayResponse().body).not.toContain('/var/task');
      expect(error.toApiGatewayResponseV2().body).not.toContain('/var/task');
      expect(JSON.stringify(error.toGenericResponse())).not.toContain('/var/task');
    });

    it('is not enumerable, so a spread or a generic walk cannot pick it up', () => {
      const error = new BadGateway({ message: 'downstream failed', diagnostics: secrets });

      expect(Object.keys(error)).not.toContain('diagnostics');
      expect(JSON.stringify({ ...error })).not.toContain('/var/task');
    });

    it('does reach the log record, which is the whole point', () => {
      const error = new BadGateway({ message: 'downstream failed', diagnostics: secrets });

      expect(loggedLine(error)).toContain('/var/task');
    });

    it('is threaded by createHttpError', () => {
      const error = createHttpError(409, 'conflict', undefined, undefined, {
        code: 'sku_retired',
        diagnostics: secrets,
      });

      expect(error.code).toBe('sku_retired');
      expect(error.diagnostics).toEqual(secrets);
      expect(error.toApiGatewayResponse().body).not.toContain('/var/task');
    });
  });
});
