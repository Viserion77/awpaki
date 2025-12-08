import {
  HttpStatus,
  isValidHttpStatus,
  getHttpStatusName,
} from './HttpStatus';

describe('HttpStatus', () => {
  describe('enum values', () => {
    it('should have correct 4xx status codes', () => {
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.UNAUTHORIZED).toBe(401);
      expect(HttpStatus.FORBIDDEN).toBe(403);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.CONFLICT).toBe(409);
      expect(HttpStatus.PRECONDITION_FAILED).toBe(412);
      expect(HttpStatus.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HttpStatus.TOO_MANY_REQUESTS).toBe(429);
    });

    it('should have correct 5xx status codes', () => {
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HttpStatus.NOT_IMPLEMENTED).toBe(501);
      expect(HttpStatus.BAD_GATEWAY).toBe(502);
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503);
    });

    it('should have 12 total status codes', () => {
      const values = Object.values(HttpStatus).filter(v => typeof v === 'number');
      expect(values).toHaveLength(12);
    });
  });

  describe('isValidHttpStatus', () => {
    it('should return true for mapped status codes', () => {
      expect(isValidHttpStatus(400)).toBe(true);
      expect(isValidHttpStatus(401)).toBe(true);
      expect(isValidHttpStatus(404)).toBe(true);
      expect(isValidHttpStatus(422)).toBe(true);
      expect(isValidHttpStatus(500)).toBe(true);
      expect(isValidHttpStatus(502)).toBe(true);
    });

    it('should return false for unmapped status codes', () => {
      expect(isValidHttpStatus(200)).toBe(false);
      expect(isValidHttpStatus(201)).toBe(false);
      expect(isValidHttpStatus(418)).toBe(false);
      expect(isValidHttpStatus(999)).toBe(false);
      expect(isValidHttpStatus(0)).toBe(false);
    });

    it('should work with HttpStatus enum', () => {
      expect(isValidHttpStatus(HttpStatus.NOT_FOUND)).toBe(true);
      expect(isValidHttpStatus(HttpStatus.BAD_REQUEST)).toBe(true);
    });
  });

  describe('getHttpStatusName', () => {
    it('should return correct names for status codes', () => {
      expect(getHttpStatusName(400)).toBe('BadRequest');
      expect(getHttpStatusName(401)).toBe('Unauthorized');
      expect(getHttpStatusName(404)).toBe('NotFound');
      expect(getHttpStatusName(422)).toBe('UnprocessableEntity');
      expect(getHttpStatusName(500)).toBe('InternalServerError');
      expect(getHttpStatusName(501)).toBe('NotImplemented');
      expect(getHttpStatusName(502)).toBe('BadGateway');
    });

    it('should work with HttpStatus enum', () => {
      expect(getHttpStatusName(HttpStatus.NOT_FOUND)).toBe('NotFound');
      expect(getHttpStatusName(HttpStatus.UNAUTHORIZED)).toBe('Unauthorized');
      expect(getHttpStatusName(HttpStatus.BAD_GATEWAY)).toBe('BadGateway');
    });

    it('should return undefined for unmapped codes', () => {
      expect(getHttpStatusName(200)).toBeUndefined();
      expect(getHttpStatusName(418)).toBeUndefined();
      expect(getHttpStatusName(999)).toBeUndefined();
    });
  });

  describe('usage examples', () => {
    it('should provide type safety', () => {
      const validStatus: HttpStatus = HttpStatus.BAD_REQUEST;
      expect(validStatus).toBe(400);
      
      const numericStatus = 404;
      if (isValidHttpStatus(numericStatus)) {
        const name = getHttpStatusName(numericStatus);
        expect(name).toBe('NotFound');
      }
    });

    it('should work in switch statements', () => {
      const getErrorType = (status: HttpStatus) => {
        switch (status) {
          case HttpStatus.BAD_REQUEST:
          case HttpStatus.UNPROCESSABLE_ENTITY:
            return 'validation';
          case HttpStatus.UNAUTHORIZED:
          case HttpStatus.FORBIDDEN:
            return 'auth';
          case HttpStatus.NOT_FOUND:
            return 'notfound';
          default:
            return 'other';
        }
      };
      
      expect(getErrorType(HttpStatus.BAD_REQUEST)).toBe('validation');
      expect(getErrorType(HttpStatus.UNAUTHORIZED)).toBe('auth');
      expect(getErrorType(HttpStatus.NOT_FOUND)).toBe('notfound');
    });
  });
});
