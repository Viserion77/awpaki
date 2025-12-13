import {
  HttpStatus,
  HttpErrorStatus,
  isValidHttpStatus,
  isValidHttpErrorStatus,
  getHttpStatusName,
} from './HttpStatus';

describe('HttpStatus', () => {
  describe('enum values', () => {
    it('should have correct 2xx status codes', () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.NO_CONTENT).toBe(204);
    });

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

    it('should have all standard HTTP status codes', () => {
      const values = Object.values(HttpStatus).filter(v => typeof v === 'number');
      expect(values.length).toBeGreaterThan(40); // Should have many status codes
    });
  });

  describe('HttpErrorStatus', () => {
    it('should have only error status codes', () => {
      expect(HttpErrorStatus.BAD_REQUEST).toBe(400);
      expect(HttpErrorStatus.NOT_FOUND).toBe(404);
      expect(HttpErrorStatus.INTERNAL_SERVER_ERROR).toBe(500);
    });

    it('should reference HttpStatus values (no duplication)', () => {
      // HttpErrorStatus values are references to HttpStatus
      expect(HttpErrorStatus.BAD_REQUEST).toBe(HttpStatus.BAD_REQUEST);
      expect(HttpErrorStatus.NOT_FOUND).toBe(HttpStatus.NOT_FOUND);
      expect(HttpErrorStatus.INTERNAL_SERVER_ERROR).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should have 12 total error status codes', () => {
      const values = Object.values(HttpErrorStatus);
      expect(values).toHaveLength(12);
    });
  });

  describe('isValidHttpStatus', () => {
    it('should return true for all HTTP status codes', () => {
      expect(isValidHttpStatus(200)).toBe(true);
      expect(isValidHttpStatus(201)).toBe(true);
      expect(isValidHttpStatus(404)).toBe(true);
      expect(isValidHttpStatus(500)).toBe(true);
    });

    it('should return false for unmapped status codes', () => {
      expect(isValidHttpStatus(999)).toBe(false);
      expect(isValidHttpStatus(0)).toBe(false);
      expect(isValidHttpStatus(600)).toBe(false);
    });

    it('should work with HttpStatus enum', () => {
      expect(isValidHttpStatus(HttpStatus.OK)).toBe(true);
      expect(isValidHttpStatus(HttpStatus.NOT_FOUND)).toBe(true);
      expect(isValidHttpStatus(HttpStatus.BAD_REQUEST)).toBe(true);
    });
  });

  describe('isValidHttpErrorStatus', () => {
    it('should return true for mapped error status codes', () => {
      expect(isValidHttpErrorStatus(400)).toBe(true);
      expect(isValidHttpErrorStatus(401)).toBe(true);
      expect(isValidHttpErrorStatus(404)).toBe(true);
      expect(isValidHttpErrorStatus(422)).toBe(true);
      expect(isValidHttpErrorStatus(500)).toBe(true);
      expect(isValidHttpErrorStatus(502)).toBe(true);
    });

    it('should return false for success codes and unmapped errors', () => {
      expect(isValidHttpErrorStatus(200)).toBe(false);
      expect(isValidHttpErrorStatus(201)).toBe(false);
      expect(isValidHttpErrorStatus(418)).toBe(false); // Not mapped in HttpErrorStatus
      expect(isValidHttpErrorStatus(999)).toBe(false);
    });

    it('should work with HttpErrorStatus enum', () => {
      expect(isValidHttpErrorStatus(HttpErrorStatus.NOT_FOUND)).toBe(true);
      expect(isValidHttpErrorStatus(HttpErrorStatus.BAD_REQUEST)).toBe(true);
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
