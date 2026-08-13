import * as source from '../errors/http/HttpStatus.js';
import {
  HttpStatus,
  HttpErrorStatus,
  isValidHttpStatus,
  isValidHttpErrorStatus,
  getHttpStatusName,
  type HttpErrorStatusType,
} from './http-status.js';

describe('constants/http-status re-export', () => {
  it('exposes the same symbols as the source module', () => {
    expect(HttpStatus).toBe(source.HttpStatus);
    expect(HttpErrorStatus).toBe(source.HttpErrorStatus);
    expect(isValidHttpStatus).toBe(source.isValidHttpStatus);
    expect(isValidHttpErrorStatus).toBe(source.isValidHttpErrorStatus);
    expect(getHttpStatusName).toBe(source.getHttpStatusName);
  });

  it('does not add or drop runtime exports compared to the source module', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reExported = require('./http-status.js');

    expect(Object.keys(reExported).sort()).toEqual(Object.keys(source).sort());
  });

  it('keeps the enum values reachable through the constants path', () => {
    expect(HttpStatus.OK).toBe(200);
    expect(HttpStatus.NOT_FOUND).toBe(404);
    expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
    expect(HttpErrorStatus.BAD_REQUEST).toBe(400);
    expect(HttpErrorStatus.SERVICE_UNAVAILABLE).toBe(503);
  });

  it('keeps the guards behaving like the source ones', () => {
    expect(isValidHttpStatus(200)).toBe(true);
    expect(isValidHttpStatus(999)).toBe(false);
    expect(isValidHttpErrorStatus(404)).toBe(true);
    expect(isValidHttpErrorStatus(200)).toBe(false);
    expect(getHttpStatusName(HttpStatus.NOT_FOUND)).toBe('NotFound');
    expect(getHttpStatusName(200)).toBeUndefined();
  });

  it('re-exports the HttpErrorStatusType type', () => {
    const code: HttpErrorStatusType = HttpErrorStatus.CONFLICT;

    expect(code).toBe(409);
  });
});
