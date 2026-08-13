import { getLogger, resetLogger, setLogger } from '../../loggers/logger.js';
import type { Logger } from '../../loggers/logger.js';
import {
  codeErrorBodyShaper,
  getErrorBodyShaper,
  resetErrorBodyShaper,
  serializeErrorBody,
  setErrorBodyShaper,
} from './errorBody.js';
import { HttpError } from './HttpError.js';
import { BadRequest, NotFound, UnprocessableEntity } from './HttpErrors.js';
import { HttpStatus } from './HttpStatus.js';

describe('error body shaper', () => {
  afterEach(() => {
    resetErrorBodyShaper();
    resetLogger();
  });

  describe('registry', () => {
    it('starts empty, so the built-in body is what ships', () => {
      expect(getErrorBodyShaper()).toBeUndefined();
      expect(new NotFound('User abc not found').toApiGatewayResponseV2().body).toBe(
        JSON.stringify({ message: 'User abc not found' })
      );
    });

    it('rejects a non-function instead of failing on the first error response', () => {
      expect(() => setErrorBodyShaper('nope' as never)).toThrow(TypeError);
    });

    it('is restored by reset', () => {
      setErrorBodyShaper(() => ({ error: 'x' }));
      resetErrorBodyShaper();
      expect(getErrorBodyShaper()).toBeUndefined();
    });
  });

  describe('resolution', () => {
    // Handlers are built at module scope, before a consumer's bootstrap runs, so a shaper
    // registered afterwards still has to govern them.
    it('resolves per response, not when the error is constructed', () => {
      const error = new NotFound('User abc not found');

      setErrorBodyShaper(codeErrorBodyShaper);

      expect(error.toApiGatewayResponseV2().body).toBe(JSON.stringify({ error: 'not_found' }));
    });

    it('lets a per-call shaper win over the registered one', () => {
      setErrorBodyShaper(() => ({ registered: true }));

      const body = new NotFound('gone').toApiGatewayResponseV2(undefined, undefined, () => ({
        perCall: true,
      }));

      expect(body.body).toBe(JSON.stringify({ perCall: true }));
    });

    it('applies to both payload formats and tells them apart', () => {
      setErrorBodyShaper((_error, context) => ({ target: context.target }));

      expect(new NotFound().toApiGatewayResponse().body).toBe(
        JSON.stringify({ target: 'apiGateway' })
      );
      expect(new NotFound().toApiGatewayResponseV2().body).toBe(
        JSON.stringify({ target: 'apiGatewayV2' })
      );
    });
  });

  describe('context', () => {
    it('hands over the default body, so a shaper can add to it instead of replacing it', () => {
      setErrorBodyShaper((error, context) => ({ ...context.defaultBody, error: error.code }));

      const body = new UnprocessableEntity('Email is required', {
        errors: { 'body.email': [422, 'Email is required'] },
      }).toApiGatewayResponseV2().body;

      expect(JSON.parse(body!)).toEqual({
        message: 'Email is required',
        data: { errors: { 'body.email': [422, 'Email is required'] } },
        error: 'unprocessable_entity',
      });
    });

    it('passes a string through as an already serialized body', () => {
      setErrorBodyShaper(() => '<error code="not_found"/>');

      expect(new NotFound().toApiGatewayResponseV2().body).toBe('<error code="not_found"/>');
    });
  });

  describe('failure', () => {
    // A shaper runs inside the last catch of the invocation: if its failure escaped, the
    // HttpError would be replaced by an unhandled 5xx and the status the caller was owed
    // would be lost.
    it('falls back to the default body when the shaper throws', () => {
      const warn = jest.fn();
      setLogger({ info: jest.fn(), debug: jest.fn(), warn, error: jest.fn() } as Logger);
      setErrorBodyShaper(() => {
        throw new Error('shaper is broken');
      });

      const response = new NotFound('User abc not found').toApiGatewayResponseV2();

      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.body).toBe(JSON.stringify({ message: 'User abc not found' }));
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'not_found', statusCode: 404 }),
        expect.stringContaining('shaper failed')
      );
    });

    it('falls back when the shaper returns something JSON cannot serialize', () => {
      setLogger({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as Logger);
      setErrorBodyShaper(() => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return circular;
      });

      expect(new BadRequest('bad').toApiGatewayResponseV2().body).toBe(
        JSON.stringify({ message: 'bad' })
      );
      expect(getLogger().warn).toBeDefined();
    });
  });

  describe('codeErrorBodyShaper', () => {
    it('answers with the code alone', () => {
      expect(codeErrorBodyShaper(new NotFound('User abc not found'))).toEqual({
        error: 'not_found',
      });
    });

    it('keeps a custom code over the status-derived default', () => {
      expect(codeErrorBodyShaper(new NotFound({ code: 'user_not_found' }))).toEqual({
        error: 'user_not_found',
      });
    });

    it('carries data, so a per-field validation map survives the contract', () => {
      const error = new UnprocessableEntity('invalid', { errors: { 'body.email': 'required' } });

      expect(codeErrorBodyShaper(error)).toEqual({
        error: 'unprocessable_entity',
        data: { errors: { 'body.email': 'required' } },
      });
    });
  });

  describe('serializeErrorBody', () => {
    it('serializes the default body when nothing is registered', () => {
      expect(
        serializeErrorBody(new HttpError('boom', 500), {
          target: 'apiGateway',
          defaultBody: { message: 'boom' },
        })
      ).toBe(JSON.stringify({ message: 'boom' }));
    });
  });
});
